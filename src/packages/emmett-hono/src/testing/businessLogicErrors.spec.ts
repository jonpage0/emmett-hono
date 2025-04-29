import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { getApplication, Legacy, sendCreated } from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// Types & in‑memory store ----------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
interface Todo {
  title: string;
  done: boolean;
}

type TodoCreated = { type: 'TodoCreated'; id: string; data: Todo };
type TodoCompleted = { type: 'TodoCompleted'; id: string };
const events: Array<TodoCreated | TodoCompleted> = [];

const todos: Record<string, Todo> = {};
const versions: Record<string, number> = {};

const append = (e: TodoCreated | TodoCompleted) => events.push(e);

// ─────────────────────────────────────────────────────────────────────────────
// Helper to build ETag -------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
const toETag = (v: number) => `"${v}"`;

// ─────────────────────────────────────────────────────────────────────────────
// API under test -------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
function registerTodoApi(app: Hono) {
  // CREATE -------------------------------------------------------------------
  app.post('/todos', async (c) => {
    const body = await c.req.json<{ title: string }>();
    const id = crypto.randomUUID();
    const todo: Todo = { title: body.title, done: false };
    todos[id] = todo;
    versions[id] = 1;
    append({ type: 'TodoCreated', id, data: todo });
    const res = sendCreated(c, { createdId: id });
    res.headers.set('ETag', toETag(1));
    return res;
  });

  // UPDATE (optimistic concurrency with If‑Match) ----------------------------
  app.put('/todos/:id', async (c) => {
    const id = c.req.param('id');
    const current = todos[id];
    if (!current)
      return Legacy.NotFound({ problemDetails: 'todo not found' })(c);

    const ifMatch = c.req.header('if-match');
    const expected = toETag(versions[id]!);
    if (ifMatch && ifMatch !== expected) {
      return Legacy.PreconditionFailed({ problemDetails: 'ETag mismatch' })(c);
    }

    const body = await c.req.json<{ title?: string }>();
    const nextTitle = body.title ?? current.title;
    if (nextTitle === current.title) {
      return Legacy.NoContent()(c); // nothing changed
    }

    current.title = nextTitle;
    versions[id]! += 1;
    append({ type: 'TodoCreated', id, data: { ...current } }); // treat as title updated event for simplicity
    const res = Legacy.NoContent()(c);
    res.headers.set('ETag', toETag(versions[id]!));
    return res;
  });

  // COMPLETE – business rule: cannot complete twice --------------------------
  app.put('/todos/:id/complete', (c) => {
    const id = c.req.param('id');
    const todo = todos[id];
    if (!todo) return Legacy.NotFound({ problemDetails: 'todo not found' })(c);
    if (todo.done) {
      return Legacy.Conflict({ problemDetails: 'todo already completed' })(c);
    }
    todo.done = true;
    versions[id]! += 1;
    append({ type: 'TodoCompleted', id });
    return Legacy.NoContent()(c);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test factory ---------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
const buildApp = () =>
  getApplication({
    apis: [registerTodoApi],
  });

// ─────────────────────────────────────────────────────────────────────────────
// Helper ---------------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
async function createTodo(
  app: Hono,
  title = 'Task',
): Promise<[string, string]> {
  const res = await app.request('/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const { id } = (await res.json()) as { id: string };
  const etag = res.headers.get('ETag')!;
  return [id, etag];
}

function expectProblem(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(res.headers.get('Content-Type')).toBe('application/problem+json');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests ----------------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────

describe('III. Business Logic & Event‑Sourcing Errors', () => {
  let app: Hono;

  beforeEach(() => {
    events.length = 0;
    Object.keys(todos).forEach((k) => delete todos[k]);
    Object.keys(versions).forEach((k) => delete versions[k]);
    app = buildApp();
  });

  it('Not Found → 404 Problem Details when resource missing', async () => {
    const res = await app.request('/todos/nonexistent');
    expectProblem(res, 404);
    expect(events.length).toBe(0);
  });

  it('Concurrency conflict → 412 Precondition Failed and no event appended', async () => {
    const [id] = await createTodo(app, 'Optimistic');

    const res = await app.request(`/todos/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': '"999"', // wrong version
      },
      body: JSON.stringify({ title: 'Updated' }),
    });

    expectProblem(res, 412);
    expect(events.length).toBe(1); // only the create event
  });

  it('Business rule violation → 409 Conflict on second complete and no duplicate event', async () => {
    const [id] = await createTodo(app, 'Finish this');

    // first complete – success
    const ok = await app.request(`/todos/${id}/complete`, { method: 'PUT' });
    expect(ok.status).toBe(204);
    const eventsAfterFirst = events.length;

    // second complete – should conflict
    const conflict = await app.request(`/todos/${id}/complete`, {
      method: 'PUT',
    });
    expectProblem(conflict, 409);
    expect(events.length).toBe(eventsAfterFirst); // no new event
  });
});
