````md
# @event-driven-io/emmett-hono

_Event-sourced HTTP helpers for **Hono** on **Cloudflare Workers** (and any
Fetch-API runtime)._

`emmett-hono` gives you:

- A single **`getApplication()`** factory to bootstrap a Hono app with
  _Problem Details_, CORS, ETag, logging, etc.
- Thin, explicit **`sendCreated()` / `sendProblem()`** utilities that layer
  nicely on top of native Hono response helpers.
- A **`Legacy` compatibility shim** that mimics the classic
  `OK() | Created() | BadRequest()` helpers from
  `@event-driven-io/emmett-expressjs`, so large code-bases can migrate
  incrementally.

> **TL;DR** Use Hono's `c.json()/c.text()` for normal responses,
> `sendCreated()` for **201**, and `sendProblem()` for RFC-7807 errors.  
> Older code can temporarily call `Legacy.Created()` etc. while you refactor.

---

## Table of contents

1. [Installation](#installation)
2. [Quick start](#quick-start)
3. [Modern response helpers](#modern-response-helpers)
4. [Legacy helpers (deprecated)](#legacy-helpers-deprecated)
5. [Migrating from Express](#migrating-from-express)
6. [Cloudflare Workers deploy](#cloudflare-workers-deploy)
7. [Testing with Vitest](#testing-with-vitest)
8. [API reference](#api-reference)
9. [Changelog](#changelog)
10. [License](#license)

---

## Installation <a id="installation"></a>

```bash
pnpm add @event-driven-io/emmett-hono hono zod @hono/zod-validator
```

> `hono` and `zod` are peer dependencies so that you stay on whichever versions
> your app already uses.

---

## Quick start <a id="quick-start"></a>

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

export type AppType = typeof app; // <- handy for hono client generation

export default app; // Cloudflare Workers entry-point
```

---

## Modern response helpers <a id="modern-response-helpers"></a>

| use-case            | call                                                          |
| ------------------- | ------------------------------------------------------------- |
| **200 / 2xx** JSON  | `return c.json(data)` or `c.text('ok')`                       |
| **201 Created**     | `return sendCreated(c, { createdId: '123' })`                 |
| RFC-7807 **errors** | `return sendProblem(c, 400, { problemDetails: 'Bad input' })` |

Under the hood they just create a standard `Response`, so nothing magical is
hidden from you.

---

## Legacy helpers (deprecated) <a id="legacy-helpers-deprecated"></a>

If you still have code like this:

```ts
import { Legacy } from '@event-driven-io/emmett-hono';

app.post('/users', () => {
  // …
  return Legacy.Created({ createdId: 'u-42' })(c);
});
```

…it will keep working, but:

- They live in the namespaced export `Legacy.*` so you must opt-in explicitly.
- They are marked **`@deprecated`** in types and will be **removed in v1.0**.

| Legacy helper             | Modern equivalent                 |
| ------------------------- | --------------------------------- |
| `Legacy.OK(opts)`         | `c.json(opts.body, 200, headers)` |
| `Legacy.Created(opts)`    | `sendCreated(c, opts)`            |
| `Legacy.BadRequest(opts)` | `sendProblem(c, 400, opts)`       |
| etc.                      |                                   |

---

## Migrating from Express <a id="migrating-from-express"></a>

1. Replace `@event-driven-io/emmett-expressjs` with `@event-driven-io/emmett-hono`.
2. Change your route files:

   ```diff
   - import { Router } from 'express';
   - const router = Router();
   + import { Hono } from 'hono';
   + const router = new Hono();
   ```

3. Swap `req, res` for `c.req` / `c.*` helpers.
4. Convert `on(async (req) => …)` to a plain async `(c) => …` handler.
5. Gradually replace `Legacy.*` helpers with `sendCreated`, `sendProblem`, or
   direct `c.json()` calls.

---

## Cloudflare Workers deploy <a id="cloudflare-workers-deploy"></a>

A minimal `wrangler.toml` is included:

```toml
name               = "emmett-hono-dev"
main               = "dist/worker.js"
compatibility_date = "2025-04-29"
```

```bash
pnpm build && wrangler deploy
```

---

## Testing with Vitest <a id="testing-with-vitest"></a>

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

You can also run `vitest --pool=cf-workers` via
`@cloudflare/vitest-pool-workers` for tighter runtime fidelity.

---

## API reference <a id="api-reference"></a>

```ts
// application ---------------------------------------------------------------
getApplication(options: ApplicationOptions): Hono

// utilities -----------------------------------------------------------------
sendCreated(c, opts)
sendProblem(c, status, opts)

// legacy shim ---------------------------------------------------------------
import { Legacy } from 'emmett-hono';
Legacy.Created(...), Legacy.BadRequest(...), ...
```

Full type docs are generated in `dist/index.d.ts`.

## Usage

1.  **Install the package:**

    ```bash
    pnpm install @event-driven-io/emmett-hono
    ```

2.  **Create a Hono app instance using `getApplication`:**

    ```typescript
    // src/app.ts
    import { Hono } from 'hono';
    import { getApplication } from '@event-driven-io/emmett-hono';

    // Define your API routes (example)
    function registerMyApi(app: Hono) {
      app.get('/hello', (c) => c.text('Hello Emmett Hono!'));
    }

    // Configure and create the app
    const app = getApplication({
      apis: [registerMyApi],
      enableCors: true,
      enableETag: true,
      enableLogger: true,
      // Optional: map specific errors to problem details
      // mapError: (error, c) => { ... }
    });

    export default app;
    ```

3.  **Use built-in response helpers for standard HTTP responses:**

    ```typescript
    import {
      sendOK,
      sendCreated,
      sendNoContent,
      sendProblem,
      sendNotFound,
      // ... other helpers
    } from '@event-driven-io/emmett-hono';
    import type { Context } from 'hono';

    // Example: POST endpoint creating a resource
    async function handleCreateResource(c: Context) {
      const id = crypto.randomUUID();
      // ... logic to create resource ...

      return sendCreated(c, { createdId: id });
    }

    // Example: GET endpoint fetching a resource
    async function handleGetResource(c: Context) {
      const id = c.req.param('id');
      const resource = await getResourceById(id); // Your data fetching logic

      if (!resource) {
        return sendNotFound(c, {
          problemDetails: `Resource with id ${id} not found.`,
        });
      }

      return sendOK(c, { body: resource });
    }

    // Example: Handling an error with Problem Details
    async function handleSomethingThatMightFail(c: Context) {
      try {
        // ... risky operation ...
        return sendNoContent(c);
      } catch (error) {
        // Log the internal error
        console.error(error);
        // Send a generic 500 Problem Details response
        return sendProblem(c, 500, {
          problemDetails: 'An unexpected error occurred.',
        });
      }
    }
    ```

4.  **Integrate ETag checks for conditional requests:**

    ```typescript
    import {
      getETagFromIfMatch,
      isWeakETag,
      getWeakETagValue,
      toWeakETag,
      sendPreconditionFailed,
      sendOK,
      sendNoContent,
    } from '@event-driven-io/emmett-hono';
    import type { Context } from 'hono';

    async function handleUpdateResource(c: Context) {
      const expectedETag = getETagFromIfMatch(c.req);
      const currentVersion = await getCurrentResourceVersion(c.req.param('id')); // Fetch current version

      // Basic ETag check (assuming weak ETags with version numbers)
      if (
        !expectedETag ||
        !isWeakETag(expectedETag) ||
        getWeakETagValue(expectedETag) !== String(currentVersion)
      ) {
        return sendPreconditionFailed(c, { problemDetails: 'ETag mismatch' });
      }

      // ... perform update logic ...
      const nextVersion = currentVersion + 1;

      // Return 204 No Content with the new ETag
      return sendNoContent(c, { eTag: toWeakETag(nextVersion) });
    }
    ```

## Legacy Helpers (Deprecated)

For compatibility during migration from `@event-driven-io/emmett-expressjs`, a `Legacy` namespace is provided. **Avoid using these in new code.**

```typescript
import { Legacy } from '@event-driven-io/emmett-hono';
import type { Context } from 'hono';

// Old style:
app.post('/users', (c: Context) => Legacy.Created({ createdId: 'u-42' })(c));

// New style (preferred):
import { sendCreated } from '@event-driven-io/emmett-hono';
app.post('/users', (c: Context) => sendCreated(c, { createdId: 'u-42' }));
```

## Migration from `@event-driven-io/emmett-expressjs`

Follow this two-phase plan to migrate:

1.  **Install the Hono package:**

    ```bash
    pnpm add @event-driven-io/emmett-hono@latest # Or specific version
    ```

2.  **Introduce the `Legacy` compat layer:**

    - Replace Express helper imports:
      ```diff
      - import { Created, BadRequest } from '@event-driven-io/emmett-expressjs';
      + import { Legacy } from '@event-driven-io/emmett-hono';
      ```
    - Wrap each call with `Legacy` and add the curried `(c)`:

      ```diff
      - return Created({ createdId });
      + return Legacy.Created({ createdId })(c);

      // If using `on(handler)` style, it might look like:
      - on(async (command, metadata) => Created(...))
      + on(async (command, metadata) => (c: Context) => Legacy.Created(...)(c))
      ```

    - Use find/replace tools if needed (adjust regex for your specific helpers):
      ```bash
      # Example using ripgrep and sed
      rg -lE '\b(OK|Created|Accepted|NoContent|BadRequest|Forbidden|NotFound|Conflict|PreconditionFailed|HttpProblem)\(' \
         src | xargs sed -i 's/\b\(OK\|Created\|Accepted\|NoContent\|BadRequest\|Forbidden\|NotFound\|Conflict\|PreconditionFailed\|HttpProblem\)(\(.*\))/Legacy.\1(\2)(c)/g'
      # NOTE: This regex might need refinement, especially around handlers already using `(c) => ...`. Manual checks are advised.
      ```
    - Run tests to verify the shim works.

3.  **Adopt new utilities gradually:**

    - In _new_ code, use direct Hono methods (`c.text`, `c.json`) or the new `send*` helpers (`sendCreated`, `sendProblem`, etc.).
    - **Optional:** Add an ESLint rule to prevent new imports of `Legacy`:
      ```jsonc
      // .eslintrc.cjs
      module.exports = {
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  name: "@event-driven-io/emmett-hono",
                  importNames: ["Legacy"],
                  message:
                    "The Legacy shim is deprecated. Use direct Hono helpers (e.g., sendCreated, sendProblem) or c.json/c.text in new code.",
                },
              ],
            },
          ],
        },
      };
      ```

4.  **Refactor existing files opportunistically:**
    - When modifying a file, replace `Legacy.Helper(options)(c)` with `sendHelper(c, options)`.
    - Replace `Legacy.ProblemHelper(details)(c)` with `sendProblem(c, statusCode, { problemDetails: details })`.
    - Remove the `Legacy` import once the file is clean.
    - Continue until `Legacy` is no longer used.

## Contributing

Contributions are welcome! Please follow standard fork-and-pull-request workflows.

## License

(Specify your license here - e.g., MIT)

```

```
````
