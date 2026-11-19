// Realtime change notifications from the API (`/v1/live`, a Cloudflare Durable Object).
// One shared WebSocket serves every subscriber in the app. Messages only name the topic that changed;
// subscribers refetch through the normal API. If the socket drops, it reconnects with backoff and every
// subscriber refreshes once to catch up. A slow safety refresh and a refresh on returning to the
// foreground cover anything missed while offline.
import { AppState } from 'react-native';

import { API_URL, apiFetch, authClient } from '@/lib/auth';

/** `admin` is only delivered to app admins; the server ignores it for everyone else. */
export type LiveTopic = 'content' | 'calendar' | 'marketplace' | 'notifications' | 'admin';

const SAFETY_REFRESH_MS = 5 * 60_000;
const PING_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;
const DEBOUNCE_MS = 400;

const listeners = new Map<LiveTopic, Set<() => void>>();
let socket: WebSocket | null = null;
let socketTopics = '';
let backoff = 1_000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let safetyTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let connecting = false;
const pending = new Map<LiveTopic, ReturnType<typeof setTimeout>>();

function topics() {
  return [...listeners.entries()].filter(([, set]) => set.size > 0).map(([topic]) => topic).sort();
}

/** Coalesces bursts of change messages into one refresh per topic. */
function notify(topic: LiveTopic) {
  const existing = pending.get(topic);
  if (existing) clearTimeout(existing);
  pending.set(topic, setTimeout(() => {
    pending.delete(topic);
    listeners.get(topic)?.forEach((listener) => listener());
  }, DEBOUNCE_MS));
}

function notifyAll() {
  topics().forEach(notify);
}

async function connectionUrl(wanted: string[]) {
  const params = new URLSearchParams({ topics: wanted.join(',') });
  // Signed-in users authenticate with a short-lived ticket (WebSockets cannot carry auth headers on web).
  const { data: session } = await authClient.getSession();
  if (session) {
    try {
      params.set('ticket', (await apiFetch<{ ticket: string }>('/v1/live/ticket', { method: 'POST' })).ticket);
    } catch { /* fall back to public topics only */ }
  }
  return `${API_URL.replace(/^http/, 'ws')}/v1/live?${params}`;
}

function clearTimers() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pingTimer) clearInterval(pingTimer);
  reconnectTimer = null;
  pingTimer = null;
}

function scheduleReconnect() {
  if (reconnectTimer || !topics().length) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; void open(); }, backoff);
  backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
}

async function open() {
  const wanted = topics();
  if (!wanted.length || connecting) return;
  connecting = true;
  let retry = false;
  try {
    const url = await connectionUrl(wanted);
    if (topics().join(',') !== wanted.join(',')) { retry = true; return; } // subscriptions changed while we waited
    const ws = new WebSocket(url);
    socket = ws;
    socketTopics = wanted.join(',');
    let wasConnected = false;
    ws.onopen = () => {
      wasConnected = true;
      backoff = 1_000;
      pingTimer = setInterval(() => { try { ws.send('ping'); } catch { /* closing */ } }, PING_MS);
      notifyAll(); // catch up on anything missed before or between connections
    };
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; topic?: LiveTopic };
        if (message.type === 'change' && message.topic) notify(message.topic);
      } catch { /* "pong" and other non-JSON frames */ }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      socketTopics = '';
      clearTimers();
      if (!wasConnected) backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      scheduleReconnect();
    };
    ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
  } catch {
    scheduleReconnect();
  } finally {
    connecting = false;
    if (retry) resetLive();
  }
}

let openTimer: ReturnType<typeof setTimeout> | null = null;

/** Reconnect with the current subscriptions and identity (e.g. after sign-in or sign-out).
 *  Calls within a short window are coalesced, so screens mounting together cause one connection. */
export function resetLive() {
  const current = socket;
  socket = null;
  socketTopics = '';
  clearTimers();
  backoff = 1_000;
  try { current?.close(); } catch { /* already closed */ }
  if (openTimer) clearTimeout(openTimer);
  openTimer = setTimeout(() => { openTimer = null; if (topics().length) void open(); }, 50);
}

function ensureRunning() {
  if (!safetyTimer) safetyTimer = setInterval(notifyAll, SAFETY_REFRESH_MS);
  if (!appStateSub) {
    appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      notifyAll();
      if (!socket) { backoff = 1_000; void open(); }
    });
  }
  if (socketTopics !== topics().join(',')) resetLive();
}

function stopIfIdle() {
  if (topics().length) { if (socketTopics !== topics().join(',')) resetLive(); return; }
  clearTimers();
  if (safetyTimer) clearInterval(safetyTimer);
  safetyTimer = null;
  appStateSub?.remove();
  appStateSub = null;
  const current = socket;
  socket = null;
  socketTopics = '';
  try { current?.close(); } catch { /* already closed */ }
}

/** Calls `onChange` whenever `topic` changes on the server. Returns an unsubscribe function. */
export function subscribeLive(topic: LiveTopic, onChange: () => void) {
  const set = listeners.get(topic) ?? new Set();
  set.add(onChange);
  listeners.set(topic, set);
  ensureRunning();
  return () => {
    set.delete(onChange);
    stopIfIdle();
  };
}
