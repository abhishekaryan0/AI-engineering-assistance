if (typeof global !== 'undefined' && !global.DOMMatrix) {
  global.DOMMatrix = class DOMMatrix {
    constructor(init?: any) {
      // Minimal implementation for xlsx compatibility
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;
    }
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  } as any;
}

import express from 'express';
import path from 'path';
import helmet from 'helmet';
import apiRoutes from './routes/index';
import { env } from './config/config';
import cors from 'cors';
import { glossaryService } from './modules/glossary';

import { errorMiddleware } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { ensureAthenaSchema } from './modules/industrial-data/utils/athena-query';

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
  })
); // Security Headers

app.use(cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// app.use('/test-ui', express.static(path.join(__dirname, '../public')));

app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.url}`);
  next();
});

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.send('AI Agent Backend is Running 🚀');
});

app.use(errorMiddleware);

const server = app.listen(env.PORT, () => {
  logger.debug(`🚀 Server running on port ${env.PORT}`);
  logger.debug(`🧠 AI Model: ${env.AI_MODEL_NAME}`);
  glossaryService.initialize();
  // Pre-initialize Athena schema to speed up industrial-data APIs (Forcing refresh for new columns)
  ensureAthenaSchema(true).catch((err) => logger.warn('Background Athena init warning:', err));
});

server.setTimeout(600000);
