/*
  Additional edge‑case and runtime‑specific tests that close the last known
  coverage gaps: CORS pre‑flight, strong ETags, custom error mapping,
  disableProblemDetails, sendAccepted helper, notFound fall‑through, and a
  Cloudflare‑runtime smoke test (conditionally run only when cf‑workers pool
  is available – it is skipped in plain node).
*/
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { getApplication, ProblemDocument, sendAccepted } from '../index';

// ────────────────────────────────────────────────────────────────────────────
//  Test helpers
// ────────────────────────────────────────────────────────────────────────────
const buildApp = (opts: Partial<Parameters<typeof getApplication>[0]> = {}) =>
  getApplication({
    apis: [(app) => app.get('/ping', (c) => c.text('pong'))],
    ...opts,
  });

function expectProblem(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(res.headers.get('Content-Type')).toBe('application/problem+json');
}

// Type definition for global scope potentially having MINIFLARE
interface MaybeMiniflareGlobal {
  MINIFLARE?: unknown; // Use unknown for safety
}

// Skip wrapper for cf‑workers specific test if not in that environment
const itWorkers = (globalThis as MaybeMiniflareGlobal).MINIFLARE ? it : it.skip;

// ────────────────────────────────────────────────────────────────────────────
//  Tests
// ────────────────────────────────────────────────────────────────────────────

describe('Advanced coverage edge‑cases', () => {
  // 1. CORS pre‑flight -------------------------------------------------------
  it('OPTIONS pre‑flight returns 204 + Allow headers', async () => {
    const app = buildApp({ enableCors: true });
    const res = await app.request('/ping', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  // 2. Strong vs. weak ETag toggle ------------------------------------------
  describe('ETag strong/weak variants', () => {
    let weakApp: Hono;
    let strongApp: Hono;
    beforeEach(() => {
      weakApp = buildApp({ enableETag: true, etagOptions: { weak: true } });
      strongApp = buildApp({ enableETag: true, etagOptions: { weak: false } });
    });

    it('weak ETag starts with W/ prefix', async () => {
      const res = await weakApp.request('/ping');
      expect(res.headers.get('ETag')).toMatch(/^W\//);
    });

    it('strong ETag lacks W/ prefix and conditional GET works', async () => {
      const first = await strongApp.request('/ping');
      const tag = first.headers.get('ETag')!;
      expect(tag).toMatch(/^"/);

      const res = await strongApp.request('/ping', {
        headers: { 'If-None-Match': tag },
      });
      expect(res.status).toBe(304);
      expect(res.headers.get('ETag')).toBe(tag);
    });
  });

  // 3. notFound fall‑through -------------------------------------------------
  it('GET /__missing__ hits global notFound handler (404 Problem Details)', async () => {
    const app = buildApp({});
    const res = await app.request('/__missing__');
    expectProblem(res, 404);
  });

  // 4. Custom mapError -------------------------------------------------------
  it('mapError override returns custom ProblemDocument (418)', async () => {
    const app = getApplication({
      apis: [
        (app) =>
          app.get('/boom', () => {
            throw new Error('kettle');
          }),
      ],
      mapError: (err) =>
        new ProblemDocument({ status: 418, detail: (err as Error).message }),
    });
    const res = await app.request('/boom');
    expectProblem(res, 418);
  });

  // 5. disableProblemDetails -------------------------------------------------
  it('disableProblemDetails propagates raw 500', async () => {
    const app = getApplication({
      apis: [
        (a) =>
          a.get('/err', () => {
            throw new Error('hide');
          }),
      ],
      disableProblemDetails: true,
    });
    const res = await app.request('/err');
    // Hono default returns 500 with text/plain
    expect(res.status).toBe(500);
    expect(res.headers.get('Content-Type')).not.toBe(
      'application/problem+json',
    );
  });

  // 6. sendAccepted helper ---------------------------------------------------
  it('sendAccepted returns 202 with Location header', async () => {
    const app = getApplication({
      apis: [
        (a) =>
          a.post('/async', (c) => sendAccepted(c, { location: '/status/123' })),
      ],
    });

    const res = await app.request('/async', { method: 'POST' });
    expect(res.status).toBe(202);
    expect(res.headers.get('Location')).toBe('/status/123');
  });

  // 7. Cloudflare‑runtime smoke (cf‑workers pool) ---------------------------
  // Mark as concurrent to avoid blocking if Miniflare setup is slow
  itWorkers.concurrent('Workers runtime provides global crypto.subtle', () => {
    // crypto.subtle is only defined inside the Cloudflare pool environment
    expect(globalThis.crypto).toBeDefined();
    expect(globalThis.crypto.subtle).toBeDefined();
  });

  // 8. Performance budget ----------------------------------------------------
  // Note: Threshold is generous; mainly catches large regressions
  it('cold start + first request under 100ms', async () => {
    const { performance } = await import('node:perf_hooks'); // Dynamic import
    const app = buildApp({}); // Build app inside test for cold start
    const t0 = performance.now();
    const res = await app.request('/ping');
    const duration = performance.now() - t0;
    expect(res.status).toBe(200);
    expect(duration).toBeLessThan(100); // Generous threshold
    // console.log(`Cold start + ping took: ${duration.toFixed(2)} ms`);
  });
});
