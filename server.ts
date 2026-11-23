import 'dotenv/config';
import http from 'http';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './server/createApiApp.ts';
import { ensureResolvedGeminiModel } from './server/geminiService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = createApiApp();
  const server = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Brainstine server listening on http://0.0.0.0:${PORT}`);
    void ensureResolvedGeminiModel().catch(() => {});
  });

  // Configure explicit Node HTTP timeouts suitable for streaming & multi-step AI responses
  server.requestTimeout = 180000;
  server.headersTimeout = 65000;
  server.keepAliveTimeout = 65000;
}

startServer().catch((err) => {
  console.error('Failed to start Brainstine server:', err);
  process.exit(1);
});
