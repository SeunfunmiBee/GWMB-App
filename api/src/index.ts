// GWMB API on Cloudflare Workers: Better Auth (/api/auth), files on R2 (/storage), data on D1.
import { cors } from 'hono/cors';
import { createAuth, webOrigins } from './auth';
import { onError, router } from './http';
import { adminCalendar, calendar } from './routes/calendar';
import { adminContent, content } from './routes/content';
import { events } from './routes/events';
import { learning } from './routes/learning';
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
app.route('/v1/content', content);
app.route('/v1/courses', learning);
app.route('/v1/events', events);
app.route('/v1/calendar', calendar);
app.route('/v1/admin/content', adminContent);
app.route('/v1/admin/calendar', adminCalendar);

export default app;
