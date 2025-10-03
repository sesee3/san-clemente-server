/**
 * Server entry point: Express app with security, logging, and routes mounting.
 *
 * Features:
 * - Security headers via helmet and sensible defaults
 * - CORS with configurable allowed origins (CORS_ORIGINS env)
 * - Request logging via morgan with request IDs
 * - JSON and URL-encoded parsers with configurable limits
 * - Health check endpoint
 * - Optional mounting of routers (auth, users, data) if present
 * - Centralized 404 and error handling
 * - Graceful shutdown on SIGINT/SIGTERM
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');

const pkg = (() => {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require('../package.json');
  } catch {
    return { name: 'server', version: '0.0.0' };
  }
})();

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT) || 3000;
const JSON_LIMIT = process.env.JSON_LIMIT || '1mb';
const URLENCODED_LIMIT = process.env.URLENCODED_LIMIT || '1mb';

const app = express();

// Trust proxy (if running behind a reverse proxy/load balancer)
app.set('trust proxy', 1);
// Disable X-Powered-By
app.disable("x-powered-by");
// Pretty-print JSON in non-production
if (NODE_ENV !== 'production') {
  app.set('json spaces', 2);
}

// Request ID middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Security middleware
app.use(
  helmet({
    // Typical API: disable CSP by default; configure explicitly if needed
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS
app.use(cors(buildCorsOptions(process.env.CORS_ORIGINS)));

// Body parsers
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: URLENCODED_LIMIT }));

// Logging
morgan.token('id', (req) => req.id);
const logFormat = NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(
  morgan(`${logFormat} :id`, {
    skip: () => NODE_ENV === 'test',
  })
);

// Lightweight responses for common noise
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.get('/robots.txt', (_req, res) =>
  res
    .type('text/plain')
    .send('User-agent: *\nDisallow:\n')
);

// Root and health endpoints
app.get('/', (_req, res) => {
  res.json({
    name: pkg.name,
    version: pkg.version,
    env: NODE_ENV,
    status: 'ok',
    docs: '/api/health',
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: pkg.name,
    version: pkg.version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: NODE_ENV,
  });
});

// Mount API routers (if present)
// Each router file is optional. If not found, mount is skipped gracefully.
mountIfPresent(app, '/api/auth', './routes/auth');
mountIfPresent(app, '/api/users', './routes/users');
mountIfPresent(app, '/api/data', './routes/data');

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Not Found',
      path: req.originalUrl,
      method: req.method,
      id: req.id,
    },
  });
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status =
    err.status ||
    err.statusCode ||
    (err.name === 'ValidationError' ? 400 : 500);

  const payload = {
    error: {
      message: err.message || 'Internal Server Error',
      code: err.code || undefined,
      id: req.id,
    },
  };

  if (NODE_ENV !== 'production') {
    payload.error.stack = err.stack;
  }

  // Log server-side
  // You could enhance by adopting a structured logger like pino/winston
  console.error(`[${req.id}] ${req.method} ${req.originalUrl} -> ${status}`);
  if (NODE_ENV !== 'production') {
    console.error(err);
  }

  res.status(status).json(payload);
});

// Start server (only if executed directly)
function start() {
  const server = app.listen(PORT, () => {
    console.log(
      `[server] ${pkg.name}@${pkg.version} listening on http://localhost:${PORT} (env=${NODE_ENV})`
    );
  });

  // Timeouts (tune if your endpoints may stream/long-run)
  server.setTimeout(120000); // 2 minutes
  server.keepAliveTimeout = 65000; // 65s (AWS ALB default is 60s)
  server.headersTimeout = 66000; // keepAliveTimeout + 1s

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`[server] Received ${signal}, shutting down gracefully...`);
    server.close((err) => {
      if (err) {
        console.error('[server] Error during shutdown:', err);
        process.exit(1);
      }
      console.log('[server] Closed out remaining connections');
      process.exit(0);
    });

    // Force close after timeout
    setTimeout(() => {
      console.warn('[server] Forcing shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

  return server;
}

// Utilities

function mountIfPresent(appInstance, basePath, modulePath) {
  const routerModule = tryRequire(modulePath);
  if (!routerModule) {
    if (NODE_ENV !== 'production') {
      console.log(`[routes] Skipping ${basePath}: ${modulePath} not found`);
    }
    return;
  }

  // Support default export or module.exports
  const router =
    (routerModule && routerModule.default) || routerModule || null;

  // Router can be a function (express.Router), an app, or an object with 'router'
  const candidate =
    typeof router === 'function'
      ? router
      : router && router.router
      ? router.router
      : null;

  if (!candidate) {
    console.warn(
      `[routes] ${modulePath} does not export a valid router, skipping`
    );
    return;
  }

  appInstance.use(basePath, candidate);
  console.log(`[routes] Mounted ${modulePath} at ${basePath}`);
}

function tryRequire(modulePath) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(modulePath);
  } catch (e) {
    if (
      e &&
      (e.code === 'MODULE_NOT_FOUND' ||
        (typeof e.message === 'string' &&
          e.message.includes(`Cannot find module '${modulePath}'`)))
    ) {
      return null;
    }
    // Re-throw unexpected errors (syntax/runtime in the router)
    throw e;
  }
}

// Export for testing
module.exports = { app, start };

// Auto-start if this file is run directly
if (require.main === module) {
  start();
}
