// GWMB API on Cloudflare Workers: Better Auth (/api/auth), files on R2 (/storage), data on D1.
import { cors } from 'hono/cors';
import { createAuth, webOrigins } from './auth';
import { onError, router } from './http';
import { membership } from './routes/membership';
import { me } from './routes/me';
import { handleStorage } from './storage';

const app = router();
app.onError(onError);

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
app.route('/v1/membership', membership);

export default app;
