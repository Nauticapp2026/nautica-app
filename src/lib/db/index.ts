import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Cliente con pooler (puerto 6543). Apto para entornos serverless.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
