import { dumbo } from '@event-driven-io/dumbo';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';

export function makeDumbo(connectionString: string) {
  const isEdge = typeof fetch !== 'undefined' && !process?.versions?.node;

  // Explicitly type the pool variable to satisfy the linter
  const pool: NeonPool | PgPool = isEdge
    ? new NeonPool({ connectionString }) // Edge/Workers
    : new PgPool({
        connectionString, // Node + pooled endpoint
        max: 5,
        idleTimeoutMillis: 5_000,
      });

  // Pass both pool and connectionString to dumbo
  return dumbo({ pool, connectionString });
}
