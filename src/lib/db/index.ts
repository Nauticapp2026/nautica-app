import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// En desarrollo, cada recarga de código (HMR) volvía a ejecutar este módulo y abría un cliente
// NUEVO sin cerrar el anterior: con muchas ediciones se acumulaban conexiones en el pooler de
// Supabase (que es el MISMO que usa producción) hasta el tope (EMAXCONN) y a producción le
// fallaban las consultas. Por eso en desarrollo el cliente se guarda en `globalThis` y se
// reutiliza. En producción no cambia nada: cada instancia crea su cliente una sola vez.
const global_ = globalThis as unknown as { __pgClient?: ReturnType<typeof postgres> };
const esProduccion = process.env.NODE_ENV === 'production';

// Cliente con pooler (puerto 6543). Apto para entornos serverless.
const client =
  global_.__pgClient ??
  postgres(connectionString, { prepare: false, ...(esProduccion ? {} : { max: 5 }) });
if (!esProduccion) global_.__pgClient = client;

export const db = drizzle(client, { schema });
