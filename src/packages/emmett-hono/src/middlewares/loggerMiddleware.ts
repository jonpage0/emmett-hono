import type { Context, Next } from 'hono';
import { Hono } from 'hono';

/**
 * Logger middleware configuration
 */
export interface LoggerOptions {
  /**
   * Logger function to use for logging (defaults to console.log)
   */
  logger?: (message: string) => void;

  /**
   * Format function to customize log messages
   * @param info Request information
   * @returns Formatted log message
   */
  format?: (info: LogInfo) => string;

  /**
   * Log level for request/response timing
   * @default 'info'
   */
  timing?: 'info' | 'debug' | 'none';
}

/**
 * Log information object
 */
export interface LogInfo {
  /** Request method */
  method: string;

  /** Request URL */
  url: string;

  /** Response status code */
  status: number;

  /** Processing time in milliseconds */
  time: number;
}

// ANSI color codes for colorized console output
const colors = {
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

/**
 * Default logger options
 */
export const defaultLoggerOptions: LoggerOptions = {
  logger: console.log,
  format: (info: LogInfo) => {
    const { method, url, status, time } = info;

    // Colorize status code based on range
    let statusColor = colors.green; // 2xx
    if (status >= 400)
      statusColor = colors.red; // 4xx
    else if (status >= 300) statusColor = colors.yellow; // 3xx

    return `${colors.cyan}${method}${colors.reset} ${url} ${statusColor}${status}${colors.reset} - ${time}ms`;
  },
  timing: 'info',
};

/**
 * Logger middleware for request logging
 *
 * @param app Hono app instance
 * @param options Logger configuration options
 */
export const applyLogger = (app: Hono, options?: LoggerOptions): void => {
  const loggerOptions = { ...defaultLoggerOptions, ...options };

  app.use('*', async (c: Context, next: Next) => {
    const start = Date.now();
    const { method, url } = c.req;

    try {
      await next();

      // Skip logging if disabled
      if (loggerOptions.timing === 'none') return;

      const end = Date.now();
      const time = end - start;

      const status = c.res?.status || 0;

      const info: LogInfo = {
        method,
        url: url.toString(),
        status,
        time,
      };

      const message = loggerOptions.format!(info);
      loggerOptions.logger!(message);
    } catch (err) {
      // If an error occurred, still log the request but rethrow
      if (loggerOptions.timing !== 'none') {
        const end = Date.now();
        const time = end - start;

        const info: LogInfo = {
          method,
          url: url.toString(),
          status: 500, // Assume 500 for errors
          time,
        };

        const message = loggerOptions.format!(info);
        loggerOptions.logger!(message);
      }

      throw err;
    }
  });
};
