// Main entry: export key functions, classes, and types for external usage.
export { getApplication } from './application';
export {
  on,
  OK,
  Created,
  Accepted,
  NoContent,
  HttpResponse,
  BadRequest,
  Forbidden,
  NotFound,
  Conflict,
  PreconditionFailed,
  HttpProblem,
} from './handler';
export { ProblemDocument, defaultErrorMapper } from './types';
export type {
  ApplicationOptions,
  EmmettHonoHandler,
  EmmettHonoResponse,
} from './types';
```

The **Emmett-Hono** package above provides:

- `getApplication(options)` to create a Hono app with configured middleware.
- Helper functions like `OK(), Created(), BadRequest(), HttpProblem()` to easily create route handlers that return appropriate HTTP responses (including JSON bodies and proper headers).
- Automatic integration with **Zod** via Hono’s `zValidator` middleware and support for generating a typed client using **Hono Stacks** (as shown in the example below).
- A global error handler (Problem Details RFC 7807) that can be toggled on/off and customized via `mapError`.

## Example Usage: Cloudflare Worker API

Below is an example of an API built using Emmett-Hono, demonstrating routes, Zod validation, and integration with Cloudflare Workers. This could be one of the monorepo packages (e.g., `packages/example-api`).

```ts
import { Hono, type ExecutionContext } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getApplication, on, OK, Created, NotFound, BadRequest } from 'emmett-hono';
import { options } from 'benchmark';
import { type Request, request } from 'express';
import { HttpProblem } from './handler';

// Define a Zod schema for a "Todo" item
const TodoSchema = z.object({
  title: z.string(),
  done: z.boolean().optional().default(false),
});
type Todo = z.infer<typeof TodoSchema>;

// In-memory store for example
const todos: Record<string, Todo> = {};

// Define API routes using Emmett-Hono:
const apiRoutes = (app: Hono) => {
  // Health check route (simple OK text)
  app.get('/ping', (c) => c.text('pong'));

  // Create a new Todo (validate JSON body with Zod)
  app.post('/todos',
    zValidator('json', TodoSchema),
    on((c) => {
      const todo: Todo = c.req.valid('json');  // validated body
      const id = crypto.randomUUID();          // generate an ID
      todos[id] = todo;
      // Return 201 Created with the new resource ID and Location header:
      return Created({ createdId: id })(c);
    })
  );

  // Get all todos
  app.get('/todos', on((c) => {
    return OK({ body: todos })(c);
  }));

  // Get a single Todo by ID
  app.get('/todos/:id', on((c) => {
    const id = c.req.param('id');
    const todo = todos[id];
    if (!todo) {
      // Return a 404 Not Found problem detail if not found
      return NotFound({ problemDetails: `Todo ${id} not found` })(c);
    }
    return OK({ body: todo })(c);
  }));

  // Delete a Todo by ID
  app.delete('/todos/:id', on((c) => {
    const id = c.req.param('id');
    if (!todos[id]) {
      return NotFound({ problemDetails: `Todo ${id} not found` })(c);
    }
    delete todos[id];
    // Return 204 No Content on successful deletion
    return c.body(null, 204);
  }));
};

// Create the Hono app using getApplication with desired middleware
const app = getApplication({
  apis: [apiRoutes],
  enableCors: true,
  enableETag: true,
  enableLogger: true,
  // Example custom error mapping: map Zod validation errors to 400 Bad Request
  mapError: (error) => {
    if (error instanceof z.ZodError) {
      return new (import('emmett-hono').ProblemDocument)({
        status: 400,
        detail: error.errors.map(e => e.message).join('; '),
        title: 'Bad Request',
      });
    }
    // otherwise, use default mapping (500 Internal Server Error)
    return undefined;
  },
});

// Export type for Hono Stacks (for client generation)
export type AppType = typeof app;

// Cloudflare Worker Fetch Handler
export default {
  fetch(request: Request, env: unknown, ctx: ExecutionContext):): Promise<Response> {
    return app.fetch(request, env, ctx);
  }
};