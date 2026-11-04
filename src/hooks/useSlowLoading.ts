import { useEffect, useState } from 'react';

export function useSlowLoading(loading: boolean, delay = 4500) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) { const reset = setTimeout(() => setSlow(false), 0); return () => clearTimeout(reset); }
    const timer = setTimeout(() => setSlow(true), delay);
    return () => clearTimeout(timer);
  },[delay,loading]);
  return slow;
}
