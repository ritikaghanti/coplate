import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  AnalyzePlateRequestSchema,
  CreateMealRequestSchema,
  PizzaModePlanRequestSchema,
  CreateReservationRequestSchema,
  UpdateDietaryProfileSchema,
  DietaryProfileSchema,
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

// Single implicit user for the Phase-0 slice. Auth replaces this later.
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_BUDGET = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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

  /** Vision pipeline: photo -> validated, grounded macros + observability meta. */
  app.post("/analyze", async (request, reply) => {
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

  /** Save Room: reshape today's budget around a planned event. */
  app.post("/save-room/plan", async (request, reply) => {
    const parse = PizzaModePlanRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid request", details: parse.error.flatten() });
    }
    try {
      const profile = await loadProfile(DEMO_USER_ID);
      // Future: subtract calories already consumed today from DEFAULT_BUDGET.
      const plan = await buildSaveRoomPlan(parse.data, DEFAULT_BUDGET, profile);
      return plan;
    } catch (err) {
      request.log.error(err, "save-room plan failed");
      return reply.status(502).send({ error: "Could not build plan" });
    }
  });

  /** Get the user's dietary profile. */
  app.get("/profile", async () => {
    return loadProfile(DEMO_USER_ID);
  });

  /** Create or update the user's dietary profile (upsert). */
  app.put("/profile", async (request, reply) => {
    const parse = UpdateDietaryProfileSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid request", details: parse.error.flatten() });
    }
    const { dietType, allergies, dislikes } = parse.data;
    await db
      .insert(schema.dietaryProfiles)
      .values({ userId: DEMO_USER_ID, dietType, allergies, dislikes })
      .onConflictDoUpdate({
        target: schema.dietaryProfiles.userId,
        set: { dietType, allergies, dislikes, updatedAt: new Date() },
      });
    return parse.data;
  });

  /** Persist a confirmed meal. */
  app.post("/meals", async (request, reply) => {
    const parse = CreateMealRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid request", details: parse.error.flatten() });
    }
    const [row] = await db
      .insert(schema.meals)
      .values({
        userId: DEMO_USER_ID,
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

  /** Create or replace today's Save Room reservation. */
  app.post("/reservations", async (request, reply) => {
    const parse = CreateReservationRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid request", details: parse.error.flatten() });
    }
    const reserve = estimateEventMacros(parse.data.eventCalories);
    // One reservation per day: clear any existing one first.
    await db
      .delete(schema.reservations)
      .where(eq(schema.reservations.userId, DEMO_USER_ID));
    const [row] = await db
      .insert(schema.reservations)
      .values({
        userId: DEMO_USER_ID,
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

  /** Clear today's reservation. */
  app.delete("/reservations/today", async () => {
    await db
      .delete(schema.reservations)
      .where(eq(schema.reservations.userId, DEMO_USER_ID));
      return { cleared: true };
  });

  /** Today's rollup for the home screen — reservation-aware. */
  app.get("/summary/today", async () => {
    const rows = await db
      .select()
      .from(schema.meals)
      .where(and(eq(schema.meals.userId, DEMO_USER_ID), eq(schema.meals.loggedDate, todayStr())));

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
      .where(eq(schema.reservations.userId, DEMO_USER_ID));

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
