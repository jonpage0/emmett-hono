import assert from 'node:assert';
import { describe, it } from 'node:test';
import { getApplication } from '../application';

describe('Middleware Integration', () => {
  describe('CORS Middleware', () => {
    it('should apply default CORS headers when enabled', async () => {
      // Arrange
      const app = getApplication({
        apis: [], // Empty array as we don't need any APIs for this test
        enableCors: true,
      });

      app.get('/test-cors', (c) => c.text('CORS test'));

      // Act - Send options request for preflight
      // Using direct fetch request to the app
      const optionsResponse = await app.fetch(
        new Request('http://localhost/test-cors', {
          method: 'OPTIONS',
          headers: {
            Origin: 'http://example.com',
            'Access-Control-Request-Method': 'GET',
          },
        }),
      );

      // Assert
      assert.strictEqual(optionsResponse.status, 204);
      assert.strictEqual(
        optionsResponse.headers.get('Access-Control-Allow-Origin'),
        '*',
      );
      assert.ok(
        optionsResponse.headers
          .get('Access-Control-Allow-Methods')
          ?.includes('GET'),
      );
      assert.ok(optionsResponse.headers.get('Access-Control-Allow-Headers'));

      // Also test actual request
      const getResponse = await app.fetch(
        new Request('http://localhost/test-cors', {
          method: 'GET',
          headers: {
            Origin: 'http://example.com',
          },
        }),
      );

      assert.strictEqual(getResponse.status, 200);
      assert.strictEqual(
        getResponse.headers.get('Access-Control-Allow-Origin'),
        '*',
      );
    });

    it('should not apply CORS headers when disabled', async () => {
      // Arrange
      const app = getApplication({
        apis: [],
        enableCors: false, // Explicitly disable CORS
      });

      app.get('/test-cors', (c) => c.text('CORS test'));

      // Act - Send request with origin header
      const response = await app.fetch(
        new Request('http://localhost/test-cors', {
          method: 'GET',
          headers: {
            Origin: 'http://example.com',
          },
        }),
      );

      // Assert - No CORS headers should be present
      assert.strictEqual(response.status, 200);
      assert.strictEqual(
        response.headers.get('Access-Control-Allow-Origin'),
        null,
      );
    });
  });

  describe('ETag Middleware', () => {
    it('should add ETag header to GET responses when enabled', async () => {
      // Arrange
      const app = getApplication({
        apis: [],
        enableETag: true,
      });

      const responseText = 'Hello, ETag!';
      app.get('/test-etag', (c) => c.text(responseText));

      // Act
      const response = await app.fetch(
        new Request('http://localhost/test-etag', {
          method: 'GET',
        }),
      );

      // Assert
      assert.strictEqual(response.status, 200);
      const etag = response.headers.get('ETag');
      assert.ok(etag, 'ETag header should be present');
      assert.ok(etag?.startsWith('W/"'), 'ETag should be weak by default');

      // The content should be the same
      const responseBody = await response.text();
      assert.strictEqual(responseBody, responseText);
    });

    it('should not add ETag header when disabled', async () => {
      // Arrange
      const app = getApplication({
        apis: [],
        enableETag: false, // Explicitly disable ETag
      });

      app.get('/test-etag', (c) => c.text('Hello, ETag!'));

      // Act
      const response = await app.fetch(
        new Request('http://localhost/test-etag', {
          method: 'GET',
        }),
      );

      // Assert
      assert.strictEqual(response.status, 200);
      assert.strictEqual(
        response.headers.get('ETag'),
        null,
        'ETag header should not be present',
      );
    });

    it('should not add ETag header to responses that already have an ETag', async () => {
      // Arrange
      const app = getApplication({
        apis: [],
        enableETag: true,
      });

      const manualEtag = 'W/"manual-etag"';
      app.get('/test-etag-manual', (c) => {
        c.header('ETag', manualEtag);
        return c.text('Hello, Manual ETag!');
      });

      // Act
      const response = await app.fetch(
        new Request('http://localhost/test-etag-manual', {
          method: 'GET',
        }),
      );

      // Assert
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers.get('ETag'), manualEtag);
    });

    it('should not add ETag header to 204 No Content responses', async () => {
      // Arrange
      const app = getApplication({
        apis: [],
        enableETag: true,
      });

      app.get('/test-no-content', (c) => c.body(null, 204));

      // Act
      const response = await app.fetch(
        new Request('http://localhost/test-no-content', {
          method: 'GET',
        }),
      );

      // Assert
      assert.strictEqual(response.status, 204);
      assert.strictEqual(
        response.headers.get('ETag'),
        null,
        'ETag header should not be present on 204 responses',
      );
    });
  });

  describe('Logger Middleware', () => {
    it('should log requests when enabled', async () => {
      // Arrange - Create a mock logger
      const logs: string[] = [];
      const mockLogger = (message: string) => {
        logs.push(message);
      };

      // Create app with logger enabled
      const app = getApplication({
        apis: [],
        enableLogger: true,
        loggerOptions: {
          logger: mockLogger,
          // Use a simplified format for testing
          format: (info) =>
            `${info.method} ${info.url} ${info.status} ${info.time}ms`,
        },
      });

      // Add a test route
      app.get('/test-logger', (c) => c.text('Logger test'));

      // Act - Send a request
      const response = await app.fetch(
        new Request('http://localhost/test-logger', {
          method: 'GET',
        }),
      );

      // Assert
      assert.strictEqual(response.status, 200);

      // Should have logged exactly one message
      assert.strictEqual(logs.length, 1);

      // Log should contain method, URL, status, and timing
      const logParts = logs[0].split(' ');
      assert.strictEqual(logParts[0], 'GET');
      assert.strictEqual(logParts[1], 'http://localhost/test-logger');
      assert.strictEqual(logParts[2], '200');
      // Time should be a number followed by 'ms'
      assert.ok(logParts[3].endsWith('ms'));
    });

    it('should not log requests when disabled', async () => {
      // Arrange - Create a mock logger
      const logs: string[] = [];
      const mockLogger = (message: string) => {
        logs.push(message);
      };

      // Create app with logger explicitly disabled
      const app = getApplication({
        apis: [],
        enableLogger: false,
        loggerOptions: {
          logger: mockLogger,
        },
      });

      // Add a test route
      app.get('/test-logger', (c) => c.text('Logger test'));

      // Act - Send a request
      const response = await app.fetch(
        new Request('http://localhost/test-logger', {
          method: 'GET',
        }),
      );

      // Assert
      assert.strictEqual(response.status, 200);

      // Should not have logged any messages
      assert.strictEqual(logs.length, 0);
    });

    it('should allow custom log formatting', async () => {
      // Arrange - Create a mock logger
      const logs: string[] = [];
      const mockLogger = (message: string) => {
        logs.push(message);
      };

      // Create app with logger and custom format
      const app = getApplication({
        apis: [],
        enableLogger: true,
        loggerOptions: {
          logger: mockLogger,
          format: (info) => `CUSTOM ${info.method} ${info.status}`,
        },
      });

      // Add a test route
      app.get('/test-logger', (c) => c.text('Logger test'));

      // Act - Send a request
      const response = await app.fetch(
        new Request('http://localhost/test-logger', {
          method: 'GET',
        }),
      );

      // Assert
      assert.strictEqual(response.status, 200);

      // Should have exactly one log message
      assert.strictEqual(logs.length, 1);

      // Message should match our custom format
      assert.strictEqual(logs[0], 'CUSTOM GET 200');
    });

    it('should log errors when they occur', async () => {
      // Arrange - Create a mock logger
      const logs: string[] = [];
      const mockLogger = (message: string) => {
        logs.push(message);
      };

      // Create app with logger enabled
      const app = getApplication({
        apis: [],
        enableLogger: true,
        loggerOptions: {
          logger: mockLogger,
          format: (info) => `${info.method} ${info.status}`, // Simplified format
        },
      });

      // Add a route that throws an error
      app.get('/test-error', () => {
        throw new Error('Test error');
      });

      // Act - Send a request that will cause an error
      let errorResponse;
      try {
        await app.fetch(
          new Request('http://localhost/test-error', {
            method: 'GET',
          }),
        );
      } catch (error) {
        errorResponse = error;
      }

      // Assert - Should have logged the error request
      assert.strictEqual(logs.length, 1);

      // Status should be 500 for errors
      assert.strictEqual(logs[0], 'GET 500');
    });
  });
});
