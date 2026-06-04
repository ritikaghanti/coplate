import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/coplate";

// Hosted Postgres (Neon, Supabase) requires SSL; local dev usually doesn't.
// We detect it from the URL so the same code works in both places.
const needsSsl =
  connectionString.includes("sslmode=require") ||
  /\.(neon\.tech|supabase\.co|render\.com)/.test(connectionString);

const client = postgres(connectionString, {
  max: 5,
  ssl: needsSsl ? "require" : false,
});

export const db = drizzle(client, { schema });
export { schema };
