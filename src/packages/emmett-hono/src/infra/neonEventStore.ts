import type { PostgresEventStore } from '@event-driven-io/emmett-postgresql';
import { getPostgreSQLEventStore } from '@event-driven-io/emmett-postgresql';
import { makeDumbo } from '../db/neon';

/**
 * Creates a PostgreSQL event store instance configured for Neon.
 *
 * This function utilizes `makeDumbo` to create a runtime-aware
 * Dumbo instance (using `pg.Pool` for Node or `@neondatabase/serverless` for Edge)
 * and passes it to `getPostgreSQLEventStore`.
 *
 * @param connectionString - The Neon database connection string.
 * @param options - Optional configuration for the PostgreSQL event store.
 * @returns An instance of `PostgresEventStore`.
 */
export function neonEventStore(
  connectionString: string,

  options?: Omit<
    Parameters<typeof getPostgreSQLEventStore>[1],
    'connectionOptions'
  >,
): PostgresEventStore {
  const db = makeDumbo(connectionString);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return getPostgreSQLEventStore(connectionString, {
    ...(options ?? {}),
    connectionOptions: { dumbo: db }, // Assert Dumbo type
  }) as PostgresEventStore; // Assert final return type
}
