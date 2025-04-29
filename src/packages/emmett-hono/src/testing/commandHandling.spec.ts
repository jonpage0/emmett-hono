import type { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { getApplication } from '../index';

// Define specific types instead of using `any`
interface Todo {
  title: string;
}

type TodoCreated = { type: 'TodoCreated'; id: string; data: Todo };
type TodoUpdated = { type: 'TodoUpdated'; id: string; data: Todo };
type TodoDeleted = { type: 'TodoDeleted'; id: string };
type TodoEvent = TodoCreated | TodoUpdated | TodoDeleted;

// In‑memory event store & aggregate projection helpers
let events: TodoEvent[] = [];
const todos: Record<string, Todo> = {};

function append(event: TodoEvent) {
  events.push(event);
}

/**
 * Minimal API that exercises Create/Update/Delete command handlers.
 * The goal is to verify correct HTTP semantics and that events are appended.
 */
function registerTodoApi(app: Hono) {
  // CREATE ────────────────────────────────────────────────────────────────────
  app.post('/todos', async (c) => {
    const body = await c.req.json<Todo>();
    const id = crypto.randomUUID();
    todos[id] = body;
    append({ type: 'TodoCreated', id, data: body });

    const location = `${c.req.url}${c.req.url.endsWith('/') ? '' : '/'}${id}`;
    return c.json({ id }, 201, { Location: location });
  });

  // UPDATE ────────────────────────────────────────────────────────────────────
  app.put('/todos/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<Todo>();

    // Idempotency check – only append when actual state changes
    const previous = JSON.stringify(todos[id]);
    const next = JSON.stringify(body);
    if (previous === next) {
      return c.body(null, 204);
    }

    todos[id] = body;
    append({ type: 'TodoUpdated', id, data: body });
    return c.body(null, 204);
  });

  // DELETE ────────────────────────────────────────────────────────────────────
  app.delete('/todos/:id', (c) => {
    const id = c.req.param('id');
    delete todos[id];
    append({ type: 'TodoDeleted', id });
    return c.body(null, 204);
  });
}

// Helper that constructs a fresh application for each test case
function buildApp() {
  return getApplication({
    apis: [registerTodoApi],
    enableCors: false,
    disableProblemDetails: true,
  });
}

// Tests ───────────────────────────────────────────────────────────────────────

describe('I. Command Handling (Happy Paths)', () => {
  let app: Hono;
  let createdId: string;

  beforeEach(() => {
    events = [];
    for (const k of Object.keys(todos)) delete todos[k];
    app = buildApp();
  });

  it('Create (POST) should return 201 Created, set Location header, and append TodoCreated event', async () => {
    const res = await app.request('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Buy milk' } as Todo),
    });

    expect(res.status).toBe(201);
    const location = res.headers.get('Location');
    expect(location).toMatch(/\/todos\//);

    const body = (await res.json()) as { id: string };
    expect(body).toHaveProperty('id');
    createdId = body.id;

    // Event store assertions
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({ type: 'TodoCreated', id: createdId });
  });

  it('Update (PUT) should return 204 No Content and append TodoUpdated event', async () => {
    // Arrange – create first so we have a valid ID
    const createRes = await app.request('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Initial' } as Todo),
    });
    const { id } = (await createRes.json()) as { id: string };

    // Act – update
    const updateRes = await app.request(`/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated title' } as Todo),
    });

    // Assert
    expect(updateRes.status).toBe(204);
    expect(events.some((e) => e.type === 'TodoUpdated' && e.id === id)).toBe(
      true,
    );
  });

  it('Delete (DELETE) should return 204 No Content and append TodoDeleted event', async () => {
    // Arrange – create first so we have a valid ID
    const createRes = await app.request('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'To delete' } as Todo),
    });
    const { id } = (await createRes.json()) as { id: string };

    // Act – delete
    const deleteRes = await app.request(`/todos/${id}`, { method: 'DELETE' });

    // Assert
    expect(deleteRes.status).toBe(204);
    expect(events.some((e) => e.type === 'TodoDeleted' && e.id === id)).toBe(
      true,
    );
  });

  it('Idempotency – repeating identical PUT should not append duplicate events', async () => {
    // Arrange – create and then update once
    const createRes = await app.request('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Task' } as Todo),
    });
    const { id } = (await createRes.json()) as { id: string };

    const firstUpdate = await app.request(`/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Task updated' } as Todo),
    });
    expect(firstUpdate.status).toBe(204);
    const eventsAfterFirstUpdate = events.length;

    // Act – identical update (should be idempotent)
    const secondUpdate = await app.request(`/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Task updated' } as Todo),
    });

    // Assert – same status, but no new event
    expect(secondUpdate.status).toBe(204);
    expect(events.length).toBe(eventsAfterFirstUpdate);
  });
});
