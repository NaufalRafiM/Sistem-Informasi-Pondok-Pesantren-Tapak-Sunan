import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './server/db.ts';
import { apiRouter } from './server/routes.ts';

async function startServer() {
  initDatabase();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Aplikasi berjalan di balik reverse proxy (Cloud Run)
  app.set('trust proxy', 1);

  // Middleware keamanan: CORS, rate limit, validasi ukuran input
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { forwardedHeader: false },
    message: { error: 'Terlalu banyak permintaan. Mohon tunggu sebentar.' },
  });
  app.use('/api', apiLimiter);

  // File storage static serving (bukti bayar, foto, nota, surat dokter)
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // REST API routes
  app.use('/api', apiRouter);

  // API error handler
  app.use('/api', (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(400).json({ error: err.message || 'Terjadi kesalahan pada permintaan API.' });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Sistem Informasi Pondok Pesantren Tapak Sunan berjalan di http://0.0.0.0:${PORT}`);
  });
}

startServer();
