import type { IncomingMessage, ServerResponse } from 'http';
import { createApiApp } from '../server/createApiApp.ts';

const app = createApiApp();

function normalizeVercelApiUrl(req: IncomingMessage): void {
  const rawUrl = req.url || '/';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    if (parsed.pathname === '/api/index' || parsed.searchParams.has('__apiPath')) {
      const apiPathRaw = parsed.searchParams.get('__apiPath') ?? '';
      parsed.searchParams.delete('__apiPath');
      const cleanPath = apiPathRaw.replace(/^\/+/, '');
      const nextPathname = cleanPath ? `/api/${cleanPath}` : '/api';
      const nextSearch = parsed.searchParams.toString();
      req.url = `${nextPathname}${nextSearch ? `?${nextSearch}` : ''}`;
    }
  } catch {
    // Keep original req.url if URL parsing fails
  }
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  normalizeVercelApiUrl(req);
  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
