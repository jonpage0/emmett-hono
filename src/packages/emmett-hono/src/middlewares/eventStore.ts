import type { PostgresEventStore } from '@event-driven-io/emmett-postgresql';
import type { Context, Next } from 'hono';
import { neonEventStore } from '../infra/neonEventStore';

// Define the type for the Hono context variable
export type EventStoreEnv = {
  Variables: {
    eventStore: PostgresEventStore;
  };
};

/**
 * Hono middleware to attach a Neon-configured event store instance
 * to the request context.
 *
 * It uses `neonEventStore` to create the store, typically reading the
 * connection string from environment variables.
 *
 * @param createStore - Optional function to create the event store.
 *                      Defaults to `neonEventStore` using `process.env.DATABASE_URL`.
 * @returns Hono middleware function.
 */
export const eventStoreMiddleware = (
  createStore: () => PostgresEventStore = () => {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is not set. Cannot create event store.',
      );
    }

    return neonEventStore(connectionString) as PostgresEventStore;
  },
) => {
  const store = createStore();

  // Return the middleware function
  return async (c: Context, next: Next) => {
    c.set('eventStore', store);
    await next();
  };
};

/**
 * Utility function to close the event store gracefully.
 * This should be called during application shutdown.
 *
 * @param store - The event store instance to close.
 */
export const closeEventStore = async (
  store?: PostgresEventStore,
): Promise<void> => {
  if (store && typeof store.close === 'function') {
    await store.close();
  }
};
