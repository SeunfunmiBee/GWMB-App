import 'expo-sqlite/localStorage/install';

const welcomeSeenKey = 'gwmb.welcome-seen.v1';

export function hasSeenWelcome() {
  try {
    return globalThis.localStorage?.getItem(welcomeSeenKey) === 'true';
  } catch {
    return false;
  }
}

export function completeWelcome() {
  try {
    globalThis.localStorage?.setItem(welcomeSeenKey, 'true');
  } catch {
    // A failed preference write should never block someone from entering the app.
  }
}
