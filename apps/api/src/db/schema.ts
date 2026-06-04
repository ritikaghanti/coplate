import { pgTable, uuid, timestamp, jsonb, integer, date, text } from "drizzle-orm/pg-core";
import type { FoodItem, Macros } from "@coplate/shared";

/**
 * For the Phase-0 slice we keep a single implicit user. The `users` table
 * exists so auth slots in later without a migration rewrite.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dailyGoals = pgTable("daily_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  // Stored as discrete columns so we can query/aggregate them in SQL later.
  calories: integer("calories").notNull(),
  proteinG: integer("protein_g").notNull(),
  carbsG: integer("carbs_g").notNull(),
  fatG: integer("fat_g").notNull(),
});

export const meals = pgTable("meals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  loggedAt: timestamp("logged_at", { withTimezone: true }).defaultNow().notNull(),
  loggedDate: date("logged_date").notNull(),
  // The itemized breakdown is semi-structured; jsonb keeps it flexible while
  // the typed `$type` annotation preserves end-to-end type safety.
  items: jsonb("items").$type<FoodItem[]>().notNull(),
  total: jsonb("total").$type<Macros>().notNull(),
});
