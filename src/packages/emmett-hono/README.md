# @event-driven-io/emmett-hono

_Event‑sourced HTTP helpers for \***\*Hono\*\*** on \***\*Cloudflare Workers\*\*** (and any Fetch‑API runtime)._

`emmett-hono` gives you:

- A single **`getApplication()`** factory to bootstrap a Hono app with CORS, ETag, structured logging and RFC‑7807 _Problem Details_.
- Thin, explicit **`sendCreated()`\*\*** / \***\*`sendProblem()`** utilities that layer cleanly on top of Hono’s native `c.json()/c.text()` helpers.
- A **`Legacy`\*\*** compatibility shim\*\* that mimics the classic `OK() | Created() | BadRequest()` helpers from `@event-driven-io/emmett-expressjs`, so large code‑bases can migrate incrementally.

> **TL;DR** Use Hono’s `c.json()` / `c.text()` for ordinary responses,\
> `sendCreated()` for **201 Created**, and `sendProblem()` for RFC‑7807 error payloads.\
> Old code can temporarily call `Legacy.Created()` etc. while you refactor.
>
> ⚠️ The **Legacy** helpers will be **removed in v1.0 (planned Q3 2025)** — add the ESLint rule below to keep new code clean.

---

## Table of contents

1. [Installation](#installation)
2. [Quick start](#quick-start)
3. [Modern response helpers](#modern-response-helpers)
4. [Legacy helpers (deprecated)](#legacy-helpers-deprecated)
5. [Migrating from Express](#migrating-from-express)
6. [Cloudflare Workers deploy](#cloudflare-workers-deploy)
7. [Testing with Vitest](#testing-with-vitest)
8. [API reference](#api-reference)
9. [Changelog](#changelog)
10. [License](#license)

---

## Installation&#x20;

```bash
pnpm add @event-driven-io/emmett-hono hono zod @hono/zod-validator
```

`hono` and `zod` are **peer dependencies** so you stay on whatever versions your app already uses.

---

## Quick start&#x20;

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  getApplication,
  sendCreated,
  sendProblem,
  type AppType, // for client generation
} from '@event-driven-io/emmett-hono';

const todos: Record<string, { title: string; done: boolean }> = {};

const api = (app: Hono) => {
  app.get('/ping', (c) => c.text('pong'));

  const bodySchema = z.object({
    title: z.string(),
    done: z.boolean().optional(),
  });

  app.post('/todos', zValidator('json', bodySchema), (c) => {
    const todo = c.req.valid('json');
    const id = crypto.randomUUID();
    todos[id] = { ...todo, done: todo.done ?? false };
    return sendCreated(c, { createdId: id });
  });

  app.get('/todos/:id', (c) => {
    const id = c.req.param('id');
    const todo = todos[id];
    if (!todo) {
      return sendProblem(c, 404, { problemDetails: `Todo ${id} not found` });
    }
    return c.json(todo);
  });
};

export const app = getApplication({
  apis: [api],
  enableCors: true,
  enableETag: true,
  enableLogger: true,
});

export type AppType = typeof app; // ← handy for hono client generation

export default app; // Cloudflare Workers entry‑point
```

---

## Modern response helpers&#x20;

| use‑case           | Call                                                          |
| ------------------ | ------------------------------------------------------------- |
| **200 / 2xx** JSON | `return c.json(data)`   or  `c.text('ok')`                    |
| **201 Created**    | `return sendCreated(c, { createdId: '123' })`                 |
| RFC‑7807 errors    | `return sendProblem(c, 400, { problemDetails: 'Bad input' })` |

Under the hood these just construct a standard `Response` — no magic, no global mutable state.

---

## Legacy helpers (deprecated)&#x20;

If you still have code like this:

```ts
import { Legacy } from '@event-driven-io/emmett-hono';

app.post('/users', () => {
  // …
  return Legacy.Created({ createdId: 'u-42' })(c);
});
```

…it will keep working, but remember:

- They live in the namespaced export `Legacy.*` so you must **opt‑in** explicitly.
- They carry **`@deprecated`** in the type‑hints.
- They will vanish in **v1.0 (Q3 2025)**.

| Legacy helper             | Modern equivalent                 |
| ------------------------- | --------------------------------- |
| `Legacy.OK(opts)`         | `c.json(opts.body, 200, headers)` |
| `Legacy.Created(opts)`    | `sendCreated(c, opts)`            |
| `Legacy.BadRequest(opts)` | `sendProblem(c, 400, opts)`       |
| etc.                      |                                   |

---

## Migrating from Express&#x20;

1. **Replace the package**

   ```bash
   pnpm remove @event-driven-io/emmett-expressjs
   pnpm add @event-driven-io/emmett-hono
   ```

2. **Swap the router**

   ```diff
   - import { Router } from 'express';
   - const router = Router();
   + import { Hono } from 'hono';
   + const router = new Hono();
   ```

3. **Replace \*\***`req`\***\*/\*\***`res`\*\* with `c.req` and `c.json()` / `c.text()`.

4. **Change \*\***`on(handler)`\*\* wrappers to plain async `(c) => …`.

5. **Wrap old helpers** in `Legacy.*(opts)(c)` until you have time to refactor.

```bash
# ⚠️  Test on a feature branch first!
# Adds Legacy shim + `(c)` suffix in a very naïve way
rg -lE '\b(OK|Created|Accepted|NoContent|BadRequest|Forbidden|NotFound|Conflict|PreconditionFailed|HttpProblem)\('\ \
   src | xargs sed -i '' -E 's/\b(OK|Created|Accepted|NoContent|BadRequest|Forbidden|NotFound|Conflict|PreconditionFailed|HttpProblem)\(/Legacy.\1(/g'
# Then visit each diff by hand – context‑aware editors are still better than regex 🤘
```

Add an ESLint guard so no new files import `Legacy`:

```js
// .eslintrc.cjs
module.exports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@event-driven-io/emmett-hono',
            importNames: ['Legacy'],
            message:
              'The Legacy shim is deprecated. Use sendCreated / sendProblem or direct Hono helpers instead.',
          },
        ],
      },
    ],
  },
};
```

---

## Cloudflare Workers deploy&#x20;

`wrangler.toml` example:

```toml
name               = "emmett-hono-dev"
main               = "dist/worker.js"
compatibility_date = "2025-04-29"
```

```bash
pnpm build && wrangler deploy
```

### Production observability

Cloudflare logs are easiest to query when they’re JSON. The default logger prints a simple string; switch to:

```ts
app.use(
  '*',
  logger({
    transport: ({ method, path, status, elapsed }) =>
      console.log(
        JSON.stringify({ t: Date.now(), method, path, status, ms: elapsed }),
      ),
  }),
);
```

…and Log Push / Workers Analytics will parse the fields automatically.

---

## Testing with Vitest&#x20;

```ts
import { describe, it, expect } from 'vitest';
import { app } from '../src/worker';

describe('GET /ping', () => {
  it('responds pong', async () => {
    const res = await app.request('/ping');
    expect(await res.text()).toBe('pong');
  });
});
```

If you need full Worker APIs (e.g., `crypto.subtle`) run Vitest with the Cloudflare pool:

```bash
vitest --pool=cf-workers
```

---

## API reference&#x20;

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

Complete type definitions are generated in **`dist/index.d.ts`**.

---
