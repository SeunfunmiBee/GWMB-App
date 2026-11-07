// Realtime change notifications over WebSockets (replaces Supabase realtime).
// One Durable Object holds every socket using the hibernation API, so idle connections cost nothing.
// Sockets are tagged with the topics they subscribed to, plus `user:<id>` for signed-in callers.
// Messages only say *what* changed ({ topic }); clients refetch through the normal API, so access rules
// are applied there and no data travels over the socket.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

export const PUBLIC_TOPICS = ['content', 'calendar', 'marketplace', 'notifications'] as const;
export type Topic = (typeof PUBLIC_TOPICS)[number];
const MAX_TOPICS = 8; // Cloudflare allows 10 tags per socket; one is reserved for the user tag.

export class LiveHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /** Upgrade a request the Worker has already authenticated; tags come from the Worker, not the client. */
  async fetch(request: Request): Promise<Response> {
    const tags = JSON.parse(request.headers.get('x-live-tags') ?? '[]') as string[];
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, tags);
    server.send(JSON.stringify({ type: 'ready', topics: tags }));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Tell every subscriber of these topics that something changed. */
  async broadcast(topics: string[]) {
    for (const topic of topics) this.send(this.ctx.getWebSockets(topic), topic);
  }

  /** Tell only these users' devices that these topics changed for them. */
  async notifyUsers(userIds: string[], topics: string[]) {
    for (const id of new Set(userIds)) {
      const sockets = this.ctx.getWebSockets(`user:${id}`);
      for (const topic of topics) this.send(sockets, topic);
    }
  }

  private send(sockets: WebSocket[], topic: string) {
    const message = JSON.stringify({ type: 'change', topic, at: Date.now() });
    for (const ws of sockets) {
      try { ws.send(message); } catch { /* socket already closing */ }
    }
  }

  async webSocketMessage() { /* clients only send pings, answered by the auto-response */ }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code, 'closing'); } catch { /* already closed */ }
  }
}

function hub(env: Env) {
  return env.LIVE.get(env.LIVE.idFromName('hub'));
}

/** Topics a client may subscribe to: known public topics only, deduplicated and capped. */
export function allowedTopics(requested: string | undefined) {
  const wanted = (requested ?? '').split(',').map((t) => t.trim()).filter((t): t is Topic => (PUBLIC_TOPICS as readonly string[]).includes(t));
  return [...new Set(wanted)].slice(0, MAX_TOPICS);
}

export function connect(env: Env, request: Request, tags: string[]) {
  const headers = new Headers(request.headers);
  headers.set('x-live-tags', JSON.stringify(tags));
  return hub(env).fetch(new Request(request.url, { headers }));
}

/** Fire-and-forget publish; realtime is best effort and must never fail the write that triggered it. */
export async function publish(env: Env, change: { broadcast?: string[]; users?: { ids: string[]; topics: string[] } }) {
  try {
    const stub = hub(env);
    if (change.broadcast?.length) await stub.broadcast(change.broadcast);
    if (change.users?.ids.length && change.users.topics.length) await stub.notifyUsers(change.users.ids, change.users.topics);
  } catch (error) {
    console.error('live publish failed', error);
  }
}

// ---------- short-lived connection tickets (browsers cannot send headers on a WebSocket) ----------

const TICKET_TTL_MS = 60_000;

async function sign(env: Env, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`live:${message}`)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function issueTicket(env: Env, userId: string) {
  const expires = Date.now() + TICKET_TTL_MS;
  return { ticket: `${userId}.${expires}.${await sign(env, `${userId}.${expires}`)}`, expiresAt: new Date(expires).toISOString() };
}

export async function readTicket(env: Env, ticket: string | undefined): Promise<string | null> {
  const [userId, expires, signature] = (ticket ?? '').split('.');
  if (!userId || !expires || !signature || Number(expires) < Date.now()) return null;
  const expected = await sign(env, `${userId}.${expires}`);
  const a = new TextEncoder().encode(signature);
  const b = new TextEncoder().encode(expected);
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b) ? userId : null;
}
