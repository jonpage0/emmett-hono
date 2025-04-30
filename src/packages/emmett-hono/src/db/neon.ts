import { dumbo } from '@event-driven-io/dumbo';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { Pool as PgPool, type PoolConfig as PgPoolConfig } from 'pg';

/** Options specific to the Node.js `pg.Pool` */
export type NodePgPoolOptions = Pick<
  PgPoolConfig,
  'max' | 'idleTimeoutMillis' | 'connectionTimeoutMillis'
>;

/** Default Node.js pool options, aligned with Neon recommendations */
const defaultNodePoolOptions: NodePgPoolOptions = {
  max: 5,
  idleTimeoutMillis: 5_000,
};

export function makeDumbo(
  connectionString: string,
  options?: {
    /** Override options for the Node.js `pg.Pool` */
    nodePoolOptions?: NodePgPoolOptions;
  },
) {
  // Detect Cloudflare Workers environment using user agent
  const isEdge =
    typeof navigator !== 'undefined' &&
    navigator.userAgent === 'Cloudflare-Workers';

  // Explicitly type the pool variable to satisfy the linter
  const pool: NeonPool | PgPool = isEdge
    ? new NeonPool({ connectionString }) // Edge/Workers
    : new PgPool({
        connectionString, // Node + pooled endpoint
        ...defaultNodePoolOptions,
        ...(options?.nodePoolOptions ?? {}),
      });

  // Pass both pool and connectionString to dumbo
  return dumbo({ pool, connectionString });
}
