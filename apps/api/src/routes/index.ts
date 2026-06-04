import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  AnalyzePlateRequestSchema,
  CreateMealRequestSchema,
  PizzaModePlanRequestSchema,
  type DailySummary,
  type LoggedMeal,
  sumMacros,
  subtractMacros,
  roundMacros,
} from "@coplate/shared";
import { db, schema } from "../db/index.js";
import { analyzePlate } from "../lib/vision.js";
import { buildPizzaModePlan } from "../lib/pizzaMode.js";

// Single implicit user for the Phase-0 slice. Auth replaces this later.
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_BUDGET = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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

  /** Pizza Mode: reshape today's budget around a planned event. */
  app.post("/pizza-mode/plan", async (request, reply) => {
    const parse = PizzaModePlanRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid request", details: parse.error.flatten() });
    }
    try {
      // Future: subtract calories already consumed today from DEFAULT_BUDGET.
      const plan = await buildPizzaModePlan(parse.data, DEFAULT_BUDGET);
      return plan;
    } catch (err) {
      request.log.error(err, "pizza-mode plan failed");
      return reply.status(502).send({ error: "Could not build plan" });
    }
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
      })
      .returning();

    const meal: LoggedMeal = {
      id: row.id,
      logged_at: row.loggedAt.toISOString(),
      items: row.items,
      total: row.total,
    };
    return reply.status(201).send(meal);
  });

  /** Today's rollup for the home screen. */
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
    }));

    const consumed = roundMacros(sumMacros(meals.map((m) => m.total)));
    const summary: DailySummary = {
      date: todayStr(),
      budget: DEFAULT_BUDGET,
      consumed,
      remaining: roundMacros(subtractMacros(DEFAULT_BUDGET, consumed)),
      meals,
    };
    return summary;
  });
}
