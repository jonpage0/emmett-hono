# @event-driven-io/emmett-hono

_Event-sourced HTTP helpers for **Hono** on **Cloudflare Workers** (and any Fetch-API runtime)._

`emmett-hono` gives you:

- A single **`getApplication()`** factory to bootstrap a Hono app with CORS, ETag, structured logging and RFC-7807 _Problem Details_.
- Thin, explicit **`sendCreated()`** / **`sendProblem()`** utilities that layer cleanly on top of Hono's native `c.json()/c.text()` helpers.
- A **`Legacy`** compatibility shim that mimics the classic `OK() | Created() | BadRequest()` helpers from `@event-driven-io/emmett-expressjs`, so large code-bases can migrate incrementally.

> **TL;DR** Use Hono's `c.json()` / `c.text()` for ordinary responses,  
> `sendCreated()` for **201 Created**, and `sendProblem()` for RFC-7807 error payloads.  
> Old code can temporarily call `Legacy.Created()` etc. while you refactor.  
> ⚠️ The **Legacy** helpers will be **removed in v1.0 (planned Q3 2025)** — add the ESLint rule below to keep new code clean.

---

## Table of contents

1. [Installation](#installation)
2. [Quick start](#quick-start)
3. [Modern response helpers](#modern-response-helpers)
4. [Legacy helpers (deprecated)](#legacy-helpers-deprecated)
5. [Migrating from Express](#migrating-from-express)
6. [Using Neon / PostgreSQL serverless](#using-neon--postgresql-serverless)
7. [Cloudflare Workers Integration](#cloudflare-workers-integration)
8. [Testing with Vitest](#testing-with-vitest)
9. [API reference](#api-reference)

---

## Installation&nbsp;💾

```bash
pnpm add @event-driven-io/emmett-hono hono zod @hono/zod-validator
```

`hono` and `zod` are **peer dependencies** so you stay on whatever versions your app already uses.

If using the Neon integration, you'll also need to install its driver:

```bash
pnpm add @neondatabase/serverless pg
```

`@neondatabase/serverless` is also a peer dependency, allowing you to manage its version or use an alternative Postgres driver if needed. `pg` is required by the Neon driver when running in Node.js environments for connection pooling.

---

## Quick start&nbsp;🚀

<!-- unchanged content omitted for brevity -->

---

## Modern response helpers&nbsp;📬

<!-- unchanged content omitted for brevity -->

---

## Legacy helpers (deprecated) 👴

<!-- unchanged content omitted for brevity -->

---

## Migrating from Express&nbsp;🛣️

<!-- unchanged content omitted for brevity -->

---

## Using Neon / PostgreSQL serverless&nbsp;🐘✨

> **New in 0.38** - first-class support for [Neon](https://neon.tech), the serverless Postgres built for edge runtimes.

### Why Neon?

- **HTTP-friendly driver** - works in Node **and** edge environments through `fetch` APIs.
- **Branch-per-feature** workflows and **instant roll-backs**.
- A [globally-distributed storage layer] so latency stays low for your users.

### 1 · Install the driver

```bash
pnpm add @neondatabase/serverless pg        # pg is required for pooled connections in Node
```

`@neondatabase/serverless` is zero-config on the edge. In traditional Node you still need `pg` (the driver `Pool` it re-exports under the hood).

### 2 · Get a connection string

Copy the **"Prisma / libpq"** string from the Neon dashboard. It looks like:

```
postgresql://user:password@my-project.neon.tech/db?sslmode=require
```

Save it as **`DATABASE_URL`** in your `.dev.vars`, CI secrets and Cloudflare Workers / Pages environment variables.  
Neon's `sslmode=require` flag enforces TLS everywhere 🚀.

### 3 · Create an event store

```ts
import { neonEventStore } from '@event-driven-io/emmett-hono';

const store = neonEventStore(process.env.DATABASE_URL!);
```

Under the hood `neonEventStore()` calls `makeDumbo()`, which picks the right pool at runtime:

```ts
// Edge → NeonPool (fetch-first, HTTP/2, no TCP!)
// Node → pg.Pool (reuse a handful of TCP sockets)
```

You rarely need to think about it - just pass the same URL in both places.

### 4 · Attach it to requests (optional)

If you prefer dependency-injection through Hono's context you can enable the ready-made middleware:

```ts
import { eventStoreMiddleware } from '@event-driven-io/emmett-hono';

app.use('*', eventStoreMiddleware()); // reads process.env.DATABASE_URL
```

### 5 · Pooling best-practices

- **Keep the pool small** in Node - Neon recommends ≤ 5 connections 📉.
  `makeDumbo()` uses `max: 5` by default. You can customize this and other `pg.Pool` options via the `nodePoolOptions` parameter in `neonEventStore()`.
- Use Neon's **"pooled"** connection string for Node functions to avoid connecting directly to the storage postgres.
- Edge environments (CF Workers / Vercel Functions) don't share TCP state - use the **direct** connection string there.

### 6 · Local development

`wrangler dev --local` spins up a Node process, so you'll be on `pg.Pool`. Make sure your URL ends with `?sslmode=require` - Node needs the extra hint, while Edge ignores it.

### 7 · Troubleshooting

| symptom                                  | likely cause                                           | fix                                 |
| ---------------------------------------- | ------------------------------------------------------ | ----------------------------------- |
| `ENOTFOUND .neon.tech`                   | wrong host segment (missing branch)                    | copy a fresh URL from the dashboard |
| `FATAL:  password authentication failed` | wrong `DATABASE_URL` value                             | double-check secrets & CI variables |
| `WRONG_WEAK_ETAG_FORMAT`                 | you passed a strong ETag where a weak one was expected | convert with `toWeakETag(version)`  |

---

## Cloudflare Workers Integration

This package provides helpers specifically designed for Hono applications running on Cloudflare Workers (or other Fetch API-based runtimes).

To use it, install it in your Hono project and utilize the `getApplication`, response helpers (`sendCreated`, `sendProblem`, etc.), and Neon integration (`neonEventStore`) as needed.

You will manage your Cloudflare deployment using Wrangler within your own project's setup. This package does not provide a pre-built worker entry point.

### Production observability

Cloudflare logs are easiest to query when they're JSON. The default Hono logger prints a simple string; consider using a JSON transport for better parsing in Log Push / Workers Analytics:

```ts
import { Hono } from 'hono';
import { logger } from 'hono/logger';

const app = new Hono();

app.use(
  '*',
  logger({
    transport: ({ method, path, status, elapsed }) =>
      console.log(
        JSON.stringify({ t: Date.now(), method, path, status, ms: elapsed }),
      ),
  }),
);

// ... rest of your app setup
```

---

## Testing with Vitest

```ts
// Example: src/myApi.spec.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { getApplication } from '@event-driven-io/emmett-hono';

// Assume your API registration logic is in './myApi'
import { registerMyApiRoutes } from './myApi';

const app = getApplication({ apis: [registerMyApiRoutes] });

describe('GET /ping', () => {
  it('responds pong', async () => {
    const res = await app.request('/ping');
    expect(await res.text()).toBe('pong');
  });
});
```

If your tests require full Worker APIs (e.g., KV, DO, `crypto.subtle`), run Vitest using the Cloudflare pool:

```bash
pnpm vitest --pool=cf-workers
```

---

## API reference

```ts
// application -----------------------------------------------------------
getApplication(options: ApplicationOptions): Hono

// utilities -------------------------------------------------------------
sendCreated(c, opts)
sendProblem(c, status, opts)
getETagFromIfMatch(req) → string | undefined

// legacy shim -----------------------------------------------------------
import { Legacy } from '@event-driven-io/emmett-hono';
Legacy.Created(...), Legacy.BadRequest(...), ...
```

Complete type definitions are generated in \*\*`dist/index.d.ts`
