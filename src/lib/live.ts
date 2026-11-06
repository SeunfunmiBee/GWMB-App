// Light polling that replaces Supabase realtime subscriptions: refresh on an interval
// and whenever the app returns to the foreground.
import { AppState } from 'react-native';

export const LIVE_REFRESH_MS = 60_000;

export function subscribeToRefresh(onChange: () => void, intervalMs = LIVE_REFRESH_MS) {
  const timer = setInterval(onChange, intervalMs);
  const appState = AppState.addEventListener('change', (state) => { if (state === 'active') onChange(); });
  return () => { clearInterval(timer); appState.remove(); };
}
