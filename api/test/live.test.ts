import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, BASE, createUser } from './helpers';

type Message = { type: string; topic?: string; topics?: string[] };

/** Opens a WebSocket to /v1/live and collects messages. */
async function connect(query: string) {
  const res = await SELF.fetch(`${BASE}/v1/live?${query}`, { headers: { Upgrade: 'websocket' } });
  const ws = res.webSocket;
  if (!ws) return { status: res.status, messages: [] as Message[], next: async () => null as Message | null, close: () => {} };
  const messages: Message[] = [];
  const waiters: ((m: Message) => void)[] = [];
  ws.accept();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as Message;
    messages.push(message);
    waiters.splice(0).forEach((resolve) => resolve(message));
  });
  /** Resolves with the next message matching `match`, or null after a short wait. */
  const next = (match: (m: Message) => boolean = () => true, timeoutMs = 2000) => new Promise<Message | null>((resolve) => {
    const seen = messages.find(match);
    if (seen) { messages.splice(messages.indexOf(seen), 1); return resolve(seen); }
    const timer = setTimeout(() => resolve(null), timeoutMs);
    const check = (m: Message) => {
      if (match(m)) { clearTimeout(timer); messages.splice(messages.indexOf(m), 1); resolve(m); } else waiters.push(check);
    };
    waiters.push(check);
  });
  return { status: res.status, messages, next, close: () => ws.close() };
}

describe('realtime (/v1/live)', () => {
  it('accepts anonymous public subscriptions and drops unknown topics', async () => {
    const socket = await connect('topics=content,calendar,secrets');
    expect(socket.status).toBe(101);
    const ready = await socket.next((m) => m.type === 'ready');
    expect(ready?.topics).toEqual(['content', 'calendar']);
    socket.close();
  });

  it('rejects non-upgrade requests and expired or forged tickets', async () => {
    expect((await SELF.fetch(`${BASE}/v1/live?topics=content`)).status).toBe(400);
    expect((await connect('topics=content&ticket=someone.1.forged')).status).toBe(401);
  });

  it('broadcasts a content change to subscribers after an admin publishes', async () => {
    const admin = await createUser({ admin: true });
    const socket = await connect('topics=content');
    await socket.next((m) => m.type === 'ready');
    await api(admin, 'POST', '/v1/admin/content', {
      slug: `live-${crypto.randomUUID().slice(0, 8)}`, area: 'resources', content_type: 'page', title: 'Live test', access_level: 'open', status: 'draft', visible: true,
    });
    expect(await socket.next((m) => m.type === 'change' && m.topic === 'content')).not.toBeNull();
    socket.close();
  });

  it('sends a member’s own changes only to that member', async () => {
    const [owner, other] = [await createUser(), await createUser()];
    const ticketFor = async (u: typeof owner) => (await api<{ ticket: string }>(u, 'POST', '/v1/live/ticket')).body.ticket;
    const mine = await connect(`topics=notifications&ticket=${encodeURIComponent(await ticketFor(owner))}`);
    const theirs = await connect(`topics=calendar&ticket=${encodeURIComponent(await ticketFor(other))}`);
    expect((await mine.next((m) => m.type === 'ready'))?.topics).toEqual(['notifications', `user:${owner.id}`]);
    await theirs.next((m) => m.type === 'ready');
    await api(owner, 'POST', '/v1/notifications/read-all');
    expect(await mine.next((m) => m.type === 'change' && m.topic === 'notifications')).not.toBeNull();
    expect(await theirs.next((m) => m.type === 'change', 500)).toBeNull();
    mine.close();
    theirs.close();
  });

  it('does not publish failed writes', async () => {
    const user = await createUser();
    const socket = await connect('topics=content');
    await socket.next((m) => m.type === 'ready');
    expect((await api(user, 'POST', '/v1/admin/content', { slug: 'x' })).status).toBe(403);
    expect(await socket.next((m) => m.type === 'change', 500)).toBeNull();
    socket.close();
  });
});
