import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getApplication } from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// Simple API for middleware verification ------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
function registerApi(app: Hono) {
  app.get('/ping', (c) => c.text('pong'));
  app.get('/error', () => {
    throw new Error('boom');
  });
}

// Helper to build app with varying options ----------------------------------
const buildApp = (opts: Partial<Parameters<typeof getApplication>[0]>) =>
  getApplication({
    apis: [registerApi],
    ...opts,
  });

// ─────────────────────────────────────────────────────────────────────────────
// Tests ----------------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────

describe('IV. Middleware & Application Configuration', () => {
  describe('CORS middleware', () => {
    let app: Hono;
    beforeEach(() => {
      app = buildApp({ enableCors: true });
    });

    it('adds Access‑Control‑Allow‑Origin header', async () => {
      const res = await app.request('/ping');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('ETag middleware', () => {
    let app: Hono;
    beforeEach(() => {
      app = buildApp({ enableETag: true, etagOptions: { weak: true } });
    });

    it('adds weak ETag header', async () => {
      const res = await app.request('/ping');
      const etag = res.headers.get('ETag');
      expect(etag).toMatch(/^W\//); // Should now pass
    });
  });

  describe('Global error handler (Problem Details)', () => {
    let app: Hono;
    beforeEach(() => {
      app = buildApp({});
    });

    it('transforms uncaught exceptions into 500 Problem Details', async () => {
      const res = await app.request('/error');
      expect(res.status).toBe(500);
      expect(res.headers.get('Content-Type')).toBe('application/problem+json');
      const body = (await res.json()) as {
        detail: string;
        [key: string]: unknown;
      };
      expect(body).toHaveProperty('detail', 'boom');
    });
  });

  describe('Logger middleware', () => {
    it('emits a log line (console.info) – smoke test', async () => {
      // Hono logger seems to use console.log, not console.info
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {}); // Changed back to spy on console.log
      const app = buildApp({ enableLogger: true });
      await app.request('/ping');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
