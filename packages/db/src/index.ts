import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export * from './schema';

export const createDb = (url: string) => {
  const conn = postgres(url);
  const db = drizzle(conn, { schema });
  return db;
};

const DATABASE_URL = process.env.DATABASE_URL || '';
export const db = createDb(DATABASE_URL);

export type DB = ReturnType<typeof createDb>;
