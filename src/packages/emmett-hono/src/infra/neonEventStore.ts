import type { PostgresEventStore } from '@event-driven-io/emmett-postgresql';
import { getPostgreSQLEventStore } from '@event-driven-io/emmett-postgresql';
import { makeDumbo, type NodePgPoolOptions } from '../db/neon';

/** Options for the PostgreSQL event store */
type PostgresEventStoreOptions = Omit<
  Parameters<typeof getPostgreSQLEventStore>[1],
  'connectionOptions'
>;

/**
 * Creates a PostgreSQL event store instance configured for Neon.
 *
 * This function utilizes `makeDumbo` to create a runtime-aware
 * Dumbo instance (using `pg.Pool` for Node or `@neondatabase/serverless` for Edge)
 * and passes it to `getPostgreSQLEventStore`.
 *
 * @param connectionString - The Neon database connection string.
 * @param options - Optional configuration, including Node.js pool options and event store options.
 * @returns An instance of `PostgresEventStore`.
 */
export function neonEventStore(
  connectionString: string,
  options?: {
    /** Options for the underlying Node.js `pg.Pool` (ignored in Edge environments). */
    nodePoolOptions?: NodePgPoolOptions;
    /** Options passed directly to `getPostgreSQLEventStore`. */
    eventStoreOptions?: PostgresEventStoreOptions;
  },
): PostgresEventStore {
  const db = makeDumbo(connectionString, {
    nodePoolOptions: options?.nodePoolOptions,
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return getPostgreSQLEventStore(connectionString, {
    ...(options?.eventStoreOptions ?? {}),
    connectionOptions: { dumbo: db }, // Assert Dumbo type
  }) as PostgresEventStore; // Assert final return type
}
