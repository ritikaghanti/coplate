import { pgTable, uuid, timestamp, jsonb, integer, date, text, boolean } from "drizzle-orm/pg-core";
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
  // When true, this meal counts against a Save Room reservation block rather
  // than the daytime budget.
  isEventMeal: boolean("is_event_meal").notNull().default(false),
});

/**
 * A Save Room reservation: a block of calories set aside for a planned event,
 * one per user per day. While it exists, the home screen subtracts it from the
 * daily budget to show a reduced daytime target.
 */
export const reservations = pgTable("reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  reservedDate: date("reserved_date").notNull(),
  venueLabel: text("venue_label").notNull(),
  eventTime: text("event_time").notNull(),
  reserve: jsonb("reserve").$type<Macros>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One dietary profile per user. A standard generated `id` is the primary key
 * (consistent with the other tables and avoids drizzle push PK-conflict edge
 * cases); `userId` is unique so each user has exactly one profile and upserts
 * key off it. This feeds every place the app *advises* food.
 */
export const dietaryProfiles = pgTable("dietary_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id),
  dietType: text("diet_type").notNull().default("none"),
  allergies: text("allergies").notNull().default(""),
  dislikes: text("dislikes").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});