// Loaded first by the root layout. Native has no `localStorage` (used for small caches and offline queues)
// and only a partial URL / URLSearchParams.
import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
