import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { getApplication, Legacy, sendCreated } from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// Domain model & in‑memory store --------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
interface Todo {
  title: string;
  done: boolean;
  version: number;
}

const todos: Record<string, Todo> = {};

// Compute a weak ETag for a given object ------------------------------------
const toWeakETag = (v: number | string) => `W/"${v}"`;

// ─────────────────────────────────────────────────────────────────────────────
// API – list & read ----------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
function registerTodoQueries(app: Hono) {
  // LIST
  app.get('/todos', (c) => {
    const items = Object.entries(todos).map(([id, t]) => ({ id, ...t }));
    // naïve list‑level ETag: total count + max version -> "v{count}:{maxVersion}"
    const count = items.length;
    const maxVersion = Math.max(0, ...items.map((i) => i.version));
    const listTag = toWeakETag(`v${count}:${maxVersion}`);

    // Conditional GET handling
    if (c.req.header('if-none-match') === listTag) {
      return c.body(null, 304, { ETag: listTag });
    }

    const res = c.json(items);
    res.headers.set('ETag', listTag);
    return res;
  });

  // SINGLE
  app.get('/todos/:id', (c) => {
    const id = c.req.param('id');
    const todo = todos[id];
    if (!todo) return Legacy.NotFound({ problemDetails: 'todo not found' })(c);

    const tag = toWeakETag(todo.version);
    if (c.req.header('if-none-match') === tag) {
      return c.body(null, 304, { ETag: tag });
    }

    const res = c.json({ id, title: todo.title, done: todo.done });
    res.headers.set('ETag', tag);
    return res;
  });

  // COMMAND endpoint used only by tests to create data quickly --------------
  app.post('/todos', async (c) => {
    const body = await c.req.json<{ title: string }>();
    const id = crypto.randomUUID();
    todos[id] = { title: body.title, done: false, version: 1 };
    const res = sendCreated(c, { createdId: id });
    res.headers.set('ETag', toWeakETag(1));
    return res;
  });
}

// App builder ---------------------------------------------------------------
const buildApp = () =>
  getApplication({
    apis: [registerTodoQueries],
    enableETag: false, // we manage ETag manually here to keep logic transparent
  });

// Helper --------------------------------------------------------------------
async function createTodo(app: Hono, title: string): Promise<[string, string]> {
  const res = await app.request('/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const { id } = (await res.json()) as { id: string };
  return [id, res.headers.get('ETag')!];
}

/*async*/ function expectProblem(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(res.headers.get('Content-Type')).toBe('application/problem+json');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests ----------------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────

describe('V. Query Endpoints (Read Models)', () => {
  let app: Hono;

  beforeEach(() => {
    Object.keys(todos).forEach((k) => delete todos[k]);
    app = buildApp();
  });

  it('List Resources → 200 with array and list‑level ETag', async () => {
    const [idA] = await createTodo(app, 'A');
    const [idB] = await createTodo(app, 'B');

    const res = await app.request('/todos');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      id: string;
      title: string;
      done: boolean;
      version: number;
    }>;
    expect(body.length).toBe(2);
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: idA,
          title: 'A',
          done: false,
          version: 1,
        }),
        expect.objectContaining({
          id: idB,
          title: 'B',
          done: false,
          version: 1,
        }),
      ]),
    );
    expect(res.headers.get('ETag')).toMatch(/^W\//);
  });

  it('If‑None‑Match on /todos returns 304 Not Modified', async () => {
    await createTodo(app, 'Only');
    const first = await app.request('/todos');
    const tag = first.headers.get('ETag')!;

    const res = await app.request('/todos', {
      headers: { 'If-None-Match': tag },
    });
    expect(res.status).toBe(304);
  });

  it('Get single resource → 200, correct JSON, ETag header', async () => {
    const [id, tag] = await createTodo(app, 'Single');

    const res = await app.request(`/todos/${id}`);
    expect(res.status).toBe(200);
    const todo = (await res.json()) as {
      id: string;
      title: string;
      done: boolean;
    };
    expect(todo).toMatchObject({ id, title: 'Single', done: false });
    expect(res.headers.get('ETag')).toBe(tag);
  });

  it('If‑None‑Match on /todos/:id returns 304', async () => {
    const [id, tag] = await createTodo(app, 'Cache');

    const res = await app.request(`/todos/${id}`, {
      headers: { 'If-None-Match': tag },
    });
    expect(res.status).toBe(304);
  });

  it('Unknown ID → 404 Problem Details', async () => {
    const res = await app.request('/todos/does-not-exist');
    /*await*/ expectProblem(res, 404);
  });
});
