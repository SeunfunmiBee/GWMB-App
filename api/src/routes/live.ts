// WebSocket endpoint and connection tickets for realtime change notifications (see src/live.ts).
import { HttpError, requireUser, router } from '../http';
import { isAdmin } from '../identity';
import { allowedTopics, connect, issueTicket, readTicket } from '../live';

export const live = router();

/** A 60-second ticket that authenticates the next WebSocket connection as the caller. */
live.post('/ticket', requireUser, async (c) => c.json(await issueTicket(c.env, c.get('userId'))));

/** GET /v1/live?topics=content,calendar[&ticket=...] with `Upgrade: websocket`. Anonymous callers get public topics only. */
live.get('/', async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(400, 'Expected a WebSocket upgrade.');
  const ticket = c.req.query('ticket');
  const userId = ticket ? await readTicket(c.env, ticket) : null;
  if (ticket && !userId) throw new HttpError(401, 'This connection ticket has expired. Request a new one.');
  const admin = userId ? await isAdmin(c.env, { kind: 'user', id: userId, email: '' }) : false;
  const topics = allowedTopics(c.req.query('topics'), admin);
  return connect(c.env, c.req.raw, userId ? [...topics, `user:${userId}`] : topics);
});
