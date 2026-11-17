// Loaded first by the root layout. Native has no `localStorage` (used for small caches and offline queues)
// and only a partial URL / URLSearchParams.
import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { Platform } from 'react-native';

type HeaderLike = { forEach: (cb: (value: unknown, key: string) => void) => void };

/** Headers as string pairs, whatever shape they arrive in. Non-text values are dropped. */
export function headerPairs(headers: unknown): [string, string][] {
  if (!headers) return [];
  const raw: [string, unknown][] = Array.isArray(headers)
    ? headers
    : typeof (headers as HeaderLike).forEach === 'function'
      ? (() => { const out: [string, unknown][] = []; (headers as HeaderLike).forEach((value, key) => out.push([key, value])); return out; })()
      : Object.entries(headers as Record<string, unknown>);
  return raw.filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).map(([key, value]) => [String(key), String(value)]);
}

// Expo SDK 57 replaces the global fetch with expo/fetch, whose native side only accepts string header pairs.
// A `Headers` object from another fetch polyfill is read as `[['map', {...}]]` and the request is rejected
// ("Cannot cast Map to String"). Normalise headers here, at the one place every request passes through.
if (Platform.OS !== 'web') {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    nativeFetch(input, init?.headers ? { ...init, headers: headerPairs(init.headers) } : init)) as typeof fetch;
}
