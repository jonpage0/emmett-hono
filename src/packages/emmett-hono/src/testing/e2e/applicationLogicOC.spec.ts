// src/testing/e2e/applicationLogicOC.spec.ts
import {
  ExpectedVersionConflictError,
  getInMemoryEventStore,
} from '@event-driven-io/emmett';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { getApplication } from '../../application';
import {
  ProblemDocument,
  type ErrorToProblemDetailsMapping,
} from '../../types';
import { ShoppingCartErrors } from '../decider/businessLogic';
import { shoppingCartApi } from '../hono-api/shoppingCartApi';

// Define the custom error mapping function
const mapCartsError: ErrorToProblemDetailsMapping = (error) => {
  if (error instanceof ExpectedVersionConflictError) {
    return new ProblemDocument({
      detail: error.message,
      title: 'Precondition Failed',
      status: 412, // Precondition Failed
    });
  }
  // Let the default handler manage other errors
  return undefined;
};

const buildApp = () => {
  const es = getInMemoryEventStore();
  return getApplication({
    apis: [shoppingCartApi(es)],
    enableETag: true,
    mapError: mapCartsError, // Provide the custom error mapping
  });
};

async function open(app: Hono, client = 'cli'): Promise<[string, string]> {
  const res = await app.request(`/clients/${client}/cart`, { method: 'POST' });
  const { id } = (await res.json()) as { id: string };
  return [id, res.headers.get('ETag')!];
}

describe('Hono e2e: optimistic-concurrency round-trip', () => {
  let app: Hono;
  beforeEach(() => (app = buildApp()));

  it('follows the same 6-step happy path as the Express suite', async () => {
    // 1 open
    const [id, r1] = await open(app);

    // 2 add item twice (expect 204 then 412)
    const addRequestDetails = {
      method: 'POST' as const,
      headers: { 'Content-Type': 'application/json', 'If-Match': r1 },
      body: JSON.stringify({ productId: '123', quantity: 2 }),
    };

    const firstAddResponse = await app.request(
      `/clients/cli/cart/${id}/items`,
      addRequestDetails,
    );
    expect(firstAddResponse.status).toBe(204);
    const r2 = firstAddResponse.headers.get('ETag'); // Capture ETag from the successful response
    expect(r2).toBeDefined(); // Ensure we got an ETag

    const secondAddResponse = await app.request(
      `/clients/cli/cart/${id}/items`,
      addRequestDetails, // Still using old ETag r1 here
    );
    expect(secondAddResponse.status).toBe(412);

    // 3 confirm using the ETag from the successful add
    const confirm = await app.request(`/clients/cli/cart/${id}/confirm`, {
      method: 'POST',
      headers: { 'If-Match': r2! }, // Use the correct ETag r2
    });
    expect(confirm.status).toBe(204); // Should now succeed
    const r3 = confirm.headers.get('ETag')!;

    // 4 cancel should now fail with 403
    const cancel = await app.request(`/clients/cli/cart/${id}`, {
      method: 'DELETE',
      headers: { 'If-Match': r3 },
    });
    expect(cancel.status).toBe(403);
    const body = (await cancel.json()) as ProblemDocument;
    expect(body.detail).toBe(ShoppingCartErrors.CART_IS_ALREADY_CLOSED);
  });
});
