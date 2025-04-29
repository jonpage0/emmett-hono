import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getApplication, Legacy, sendCreated } from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// Domain‑specific types and event log ----------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
interface Todo {
  title: string;
}

type TodoCreated = { type: 'TodoCreated'; id: string; data: Todo };
const events: TodoCreated[] = [];
const append = (e: TodoCreated) => events.push(e);

const todos: Record<string, Todo> = {};

// ─────────────────────────────────────────────────────────────────────────────
// Schemas --------------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
const bodySchema = z.object({
  title: z.string(),
});

const paramSchema = z.object({
  id: z.string().uuid(),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// API under test -------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
function registerTodoApi(app: Hono) {
  // POST /todos – validated JSON body ---------------------------------------
  app.post(
    '/todos',
    validator('json', (value, c) => {
      const parsed = bodySchema.safeParse(value);
      if (!parsed.success) {
        return Legacy.BadRequest({
          problemDetails: JSON.stringify(parsed.error.flatten()),
        })(c);
      }
      return parsed.data;
    }),
    (c) => {
      const todo = c.req.valid('json');
      const id = crypto.randomUUID();
      todos[id] = todo;
      append({ type: 'TodoCreated', id, data: todo });
      return sendCreated(c, { createdId: id });
    },
  );

  // GET /todos/:id – validated param, optional query -------------------------
  app.get(
    '/todos/:id',
    validator('param', (value, c) => {
      const parsed = paramSchema.safeParse(value);
      if (!parsed.success) {
        return Legacy.BadRequest({
          problemDetails: JSON.stringify(parsed.error.flatten()),
        })(c);
      }
      return parsed.data;
    }),
    validator('query', (value, c) => {
      const parsed = querySchema.safeParse(value);
      if (!parsed.success) {
        return Legacy.BadRequest({
          problemDetails: JSON.stringify(parsed.error.flatten()),
        })(c);
      }
      return parsed.data;
    }),
    (c) => {
      const { id } = c.req.valid('param');
      const query = c.req.valid('query');
      console.log('Validated query:', query);
      const todo = todos[id];
      if (!todo) return Legacy.NotFound({ problemDetails: 'not found' })(c);
      return c.json(todo);
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Factory ----------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
const buildApp = () =>
  getApplication({
    apis: [registerTodoApi],
    // we keep the default problem‑details handler to get RFC‑7807 responses
  });

// Helper to assert Problem Details response ----------------------------------
// Define a simple interface for the expected problem details structure
interface ProblemDetails {
  detail: string;
  [key: string]: unknown; // Allow other properties
}

async function expectProblem(
  res: Response,
  status: number,
): Promise<ProblemDetails> {
  // Add return type
  expect(res.status).toBe(status);
  expect(res.headers.get('Content-Type')).toBe('application/problem+json');
  const problem = (await res.json()) as ProblemDetails; // Type assertion
  expect(problem).toHaveProperty('detail');
  return problem;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests ----------------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────

describe('II. Input Validation (zValidator)', () => {
  let app: Hono;

  beforeEach(() => {
    events.length = 0;
    Object.keys(todos).forEach((k) => delete todos[k]);
    app = buildApp();
  });

  it('Invalid JSON body → 400 Problem Details and no events', async () => {
    const res = await app.request('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wrong: true }), // missing title
    });

    await expectProblem(res, 400);
    expect(events.length).toBe(0);
  });

  it('Missing Content‑Type header → 400 Problem Details and no events', async () => {
    const res = await app.request('/todos', {
      method: 'POST',
      // no Content‑Type
      body: JSON.stringify({ title: 'foo' }),
    });

    await expectProblem(res, 400);
    expect(events.length).toBe(0);
  });

  it('Invalid path param (not UUID) → 400 Problem Details', async () => {
    const res = await app.request('/todos/not‑uuid');

    await expectProblem(res, 400);
  });

  it('Invalid query param (page not number) → 400 Problem Details', async () => {
    // First create a valid todo so :id passes param validation
    const create = await app.request('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'valid' }),
    });
    // Type the expected response from the create request
    const { createdId: id } = (await create.json()) as { createdId: string };

    const res = await app.request(`/todos/${id}?page=abc`);

    await expectProblem(res, 400);
  });
});
