import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'http';
import { createApiApp } from '../server/createApiApp.ts';

const app = createApiApp();

function normalizeVercelApiUrl(req: IncomingMessage): void {
  const rawUrl = req.url || '/';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    if (parsed.searchParams.has('__apiPath')) {
      const apiPathRaw = parsed.searchParams.get('__apiPath') ?? '';
      parsed.searchParams.delete('__apiPath');
      const cleanPath = apiPathRaw.replace(/^\/+/, '');
      const nextPathname = cleanPath ? `/api/${cleanPath}` : '/api';
      const nextSearch = parsed.searchParams.toString();
      req.url = `${nextPathname}${nextSearch ? `?${nextSearch}` : ''}`;
    } else if (parsed.pathname === '/api/index' || parsed.pathname.startsWith('/api/index/')) {
      const rest = parsed.pathname.replace(/^\/api\/index\/?/, '');
      const nextPathname = rest ? `/api/${rest}` : '/api';
      const nextSearch = parsed.searchParams.toString();
      req.url = `${nextPathname}${nextSearch ? `?${nextSearch}` : ''}`;
    }
  } catch {
    // Keep original req.url if URL parsing fails
  }
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      normalizeVercelApiUrl(req);
      res.once('finish', () => resolve());
      res.once('close', () => resolve());
      res.once('error', (err) => reject(err));
      app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1], (err?: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    } catch (syncErr) {
      reject(syncErr);
    }
  });
}
