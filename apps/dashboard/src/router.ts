import { useEffect, useState } from 'react';

/** Minimal hash router: "#/p/my-app/keys" → ["p", "my-app", "keys"]. */
export function useRoute(): string[] {
  const read = () =>
    location.hash
      .replace(/^#\/?/, '')
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const href = (...parts: string[]) => `#/${parts.map(encodeURIComponent).join('/')}`;

export function navigate(...parts: string[]) {
  location.hash = href(...parts);
}
