import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema";

/**
 * Database client. The app must boot without a DATABASE_URL set (e.g. before
 * the Neon project exists), so `db` is null until the env var is present.
 * Callers should check `db` is non-null (or use the DAL helpers that do).
 */
const connectionString = process.env.DATABASE_URL;

export const client = connectionString
  ? postgres(connectionString, { max: 10, prepare: false, connect_timeout: 10 })
  : null;

export const db = client ? drizzle(client, { schema }) : null;
