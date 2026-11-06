// GWMB API on Cloudflare Workers: Better Auth (/api/auth), files on R2 (/storage), data on D1.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAuth, webOrigins } from './auth';
import type { Env } from './env';
import { me } from './routes/me';
import { handleStorage } from './storage';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const allowed = webOrigins(c.env);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    credentials: true,
    allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['authorization', 'content-type', 'x-upsert', 'range', 'if-none-match', 'expo-origin'],
    exposeHeaders: ['etag', 'content-length', 'content-range', 'accept-ranges', 'set-auth-token'],
  })(c, next);
});

app.get('/health', (c) => c.json({ ok: true }));
app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));
app.all('/storage/*', (c) => handleStorage(c.req.raw, c.env));
app.route('/v1/me', me);

export default app;
