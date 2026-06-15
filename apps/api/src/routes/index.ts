import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  AnalyzePlateRequestSchema,
  CreateMealRequestSchema,
  PizzaModePlanRequestSchema,
  CreateReservationRequestSchema,
  UpdateDietaryProfileSchema,
  DietaryProfileSchema,
  CredentialsSchema,
  BarcodeLookupRequestSchema,
  type DailySummary,
  type LoggedMeal,
  type DietaryProfile,
  sumMacros,
  subtractMacros,
  roundMacros,
  estimateEventMacros,
  ZERO_MACROS,
} from "@coplate/shared";
import { db, schema } from "../db/index.js";
import { analyzePlate } from "../lib/vision.js";
import { buildSaveRoomPlan } from "../lib/saveRoom.js";
import { hashPassword, verifyPassword, signToken, verifyToken } from "../lib/auth.js";
import { lookupBarcode, ProductNotFoundError, IncompleteNutritionError } from "../lib/openFoodFacts.js";

const DEFAULT_BUDGET = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pull the authenticated user id from the Bearer token. Returns the id, or
 * sends a 401 and returns null if the token is missing/invalid. Every
 * protected handler calls this first.
 */
function requireUser(request: FastifyRequest, reply: FastifyReply): string | null {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const userId = token ? verifyToken(token) : null;
  if (!userId) {
    reply.status(401).send({ error: "Not authenticated" });
    return null;
  }
  return userId;
}

/** Load the user's dietary profile, defaulting to no-restriction if unset. */
async function loadProfile(userId: string): Promise<DietaryProfile> {
  const [row] = await db
    .select()
    .from(schema.dietaryProfiles)
    .where(eq(schema.dietaryProfiles.userId, userId));
  if (!row) return DietaryProfileSchema.parse({});
  return DietaryProfileSchema.parse({
    dietType: row.dietType,
    allergies: row.allergies,
    dislikes: row.dislikes,
  });
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true }));

  /** Sign up: create a user with a hashed password, return a token. */
  app.post("/auth/signup", async (request, reply) => {
    const parse = CredentialsSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid credentials", details: parse.error.flatten() });
    }
    const email = parse.data.email.toLowerCase();
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (existing) {
      return reply.status(409).send({ error: "An account with this email already exists" });
    }
    const passwordHash = await hashPassword(parse.data.password);
    const [user] = await db.insert(schema.users).values({ email, passwordHash }).returning();
    const token = signToken(user.id);
    return reply.status(201).send({ token, user: { id: user.id, email } });
  });

  /** Log in: verify password, return a token. */
  app.post("/auth/login", async (request, reply) => {
    const parse = CredentialsSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid credentials" });
    }
    const email = parse.data.email.toLowerCase();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    // Same generic error whether email is unknown or password is wrong — avoids
    // leaking which emails have accounts.
    if (!user || !user.passwordHash || !(await verifyPassword(parse.data.password, user.passwordHash))) {
      return reply.status(401).send({ error: "Incorrect email or password" });
    }
    const token = signToken(user.id);
    return reply.send({ token, user: { id: user.id, email } });
  });

  /** Vision pipeline: photo -> validated, grounded macros + observability meta. */
  app.post("/analyze", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const parse = AnalyzePlateRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid request", details: parse.error.flatten() });
    }
    try {
      const result = await analyzePlate(parse.data.image_base64, parse.data.media_type);
      request.log.info(
        { latency_ms: result.meta.latency_ms, retries: result.meta.retries, cost: result.meta.estimated_cost_usd },
        "analyze complete"
      );
      return result;
    } catch (err) {
      request.log.error(err, "analyze failed");
      return reply.status(502).send({ error: "Vision analysis failed" });
    }
  });

  /** Barcode lookup: resolve a scanned product against Open Food Facts. */
  app.post("/barcode", async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const parse = BarcodeLookupRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid request", details: parse.error.flatten() });
    }
    const started = Date.now();
    try {
      const product = await lookupBarcode(parse.data.barcode);
      const latency_ms = Date.now() - started;
      request.log.info({ barcode: parse.data.barcode, latency_ms }, "barcode lookup ok");
      return { product, meta: { source: "openfoodfacts" as const, latency_ms } };
    } catch (err) {
      if (err instanceof ProductNotFoundError) {
        return reply.status(404).send({ error: "We couldn't find that product. Try snapping a photo instead." });
      }
      if (err instanceof IncompleteNutritionError) {
        return reply.status(422).send({ error: "That product has no nutrition data on file. Try a photo instead." });
      }
      request.log.error(err, "barcode lookup failed");
      return reply.status(502).send({ error: "Barcode lookup failed" });
    }
  });

  /** Save Room: reshape today's budget around a planned event. */
  app.post("/save-room/plan", async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    const parse = PizzaModePlanRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid request", details: parse.error.flatten() });
    }
    try {
      const profile = await loadProfile(userId);
      // Future: subtract calories already consumed today from DEFAULT_BUDGET.
      const plan = await buildSaveRoomPlan(parse.data, DEFAULT_BUDGET, profile);
      return plan;
    } catch (err) {
      request.log.error(err, "save-room plan failed");
      return reply.status(502).send({ error: "Could not build plan" });
    }
  });

  /** Get the user's dietary profile. */
  app.get("/profile", async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    return loadProfile(userId);
  });

  /** Create or update the user's dietary profile (upsert). */
  app.put("/profile", async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    const parse = UpdateDietaryProfileSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid request", details: parse.error.flatten() });
    }
    const { dietType, allergies, dislikes } = parse.data;
    await db
      .insert(schema.dietaryProfiles)
      .values({ userId, dietType, allergies, dislikes })
      .onConflictDoUpdate({
        target: schema.dietaryProfiles.userId,
        set: { dietType, allergies, dislikes, updatedAt: new Date() },
      });
    return parse.data;
  });

  /** Persist a confirmed meal. */
  app.post("/meals", async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    const parse = CreateMealRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid request", details: parse.error.flatten() });
    }
    const [row] = await db
      .insert(schema.meals)
      .values({
        userId,
        loggedDate: todayStr(),
        items: parse.data.items,
        total: parse.data.total,
        isEventMeal: parse.data.is_event_meal,
      })
      .returning();

    const meal: LoggedMeal = {
      id: row.id,
      logged_at: row.loggedAt.toISOString(),
      items: row.items,
      total: row.total,
      is_event_meal: row.isEventMeal,
    };
    return reply.status(201).send(meal);
  });

  /** Delete one of the user's meals by id (scoped to the user). */
  app.delete<{ Params: { id: string } }>("/meals/:id", async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    const { id } = request.params;
    const deleted = await db
      .delete(schema.meals)
      .where(and(eq(schema.meals.id, id), eq(schema.meals.userId, userId)))
      .returning({ id: schema.meals.id });
    if (deleted.length === 0) {
      return reply.status(404).send({ error: "Meal not found" });
    }
    return { deleted: true };
  });

  /** Create or replace today's Save Room reservation. */
  app.post("/reservations", async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    const parse = CreateReservationRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid request", details: parse.error.flatten() });
    }
    const reserve = estimateEventMacros(parse.data.eventCalories);
    // One reservation per day: clear any existing one first.
    await db
      .delete(schema.reservations)
      .where(and(eq(schema.reservations.userId, userId), eq(schema.reservations.reservedDate, todayStr())));
    const [row] = await db
      .insert(schema.reservations)
      .values({
        userId,
        reservedDate: todayStr(),
        venueLabel: parse.data.venueLabel,
        eventTime: parse.data.eventTime,
        reserve,
      })
      .returning();
    return reply.status(201).send({
      id: row.id,
      venueLabel: row.venueLabel,
      eventTime: row.eventTime,
      reserve: roundMacros(row.reserve),
    });
  });

  /** Clear the user's reservation (date-independent so it always works). */
  app.delete("/reservations/today", async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    await db
      .delete(schema.reservations)
      .where(eq(schema.reservations.userId, userId));
    return { cleared: true };
  });

  /** Today's rollup for the home screen — reservation-aware. */
  app.get("/summary/today", async (request, reply) => {
    const userId = requireUser(request, reply);
    if (!userId) return;
    const rows = await db
      .select()
      .from(schema.meals)
      .where(and(eq(schema.meals.userId, userId), eq(schema.meals.loggedDate, todayStr())));

    const meals: LoggedMeal[] = rows.map((r) => ({
      id: r.id,
      logged_at: r.loggedAt.toISOString(),
      items: r.items,
      total: r.total,
      is_event_meal: r.isEventMeal,
    }));

    const [resRow] = await db
      .select()
      .from(schema.reservations)
      .where(and(eq(schema.reservations.userId, userId), eq(schema.reservations.reservedDate, todayStr())));

    const reservation = resRow
      ? { id: resRow.id, venueLabel: resRow.venueLabel, eventTime: resRow.eventTime, reserve: roundMacros(resRow.reserve) }
      : null;
    const reserveMacros = resRow ? resRow.reserve : ZERO_MACROS;

    const eventMeals = meals.filter((m) => m.is_event_meal);
    const daytimeMeals = meals.filter((m) => !m.is_event_meal);

    const consumed = sumMacros(meals.map((m) => m.total));
    const daytimeConsumed = sumMacros(daytimeMeals.map((m) => m.total));
    const eventConsumed = sumMacros(eventMeals.map((m) => m.total));
    const daytimeBudget = subtractMacros(DEFAULT_BUDGET, reserveMacros);

    const summary: DailySummary = {
      date: todayStr(),
      budget: DEFAULT_BUDGET,
      consumed: roundMacros(consumed),
      remaining: roundMacros(subtractMacros(DEFAULT_BUDGET, consumed)),
      reservation,
      daytimeBudget: roundMacros(daytimeBudget),
      daytimeConsumed: roundMacros(daytimeConsumed),
      daytimeRemaining: roundMacros(subtractMacros(daytimeBudget, daytimeConsumed)),
      eventConsumed: roundMacros(eventConsumed),
      meals,
    };
    return summary;
  });
}
