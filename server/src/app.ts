import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

/**
 * Express application factory.
 * Sets up all middleware, routes, and error handling.
 * Separated from server.ts to enable testing without starting HTTP server.
 */
const app = express();

// ─── Security Middleware ────────────────────────────────────
app.use(helmet());                              // Security headers
app.use(cors({
  origin: config.env === 'development'
    ? [...new Set([config.cors.origin, 'http://localhost:5173', 'http://127.0.0.1:5173'])]
    : config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body Parsing ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));       // JSON bodies
app.use(express.urlencoded({ extended: true })); // Form data

// ─── Request Logging ────────────────────────────────────────
const morganFormat = config.env === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
}));

// ─── API Routes ─────────────────────────────────────────────
app.use('/api', routes);

// ─── Root Route ─────────────────────────────────────────────
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'SCMS API',
    version: '1.0.0',
    description: 'Enterprise Supply Chain Management System',
    docs: '/api/health',
  });
});

// ─── 404 Handler ────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${_req.method} ${_req.originalUrl}`,
  });
});

// ─── Global Error Handler (must be LAST) ────────────────────
app.use(errorHandler);

export default app;
