/** Minimal hash router: #/meetings, #/meetings/<id>, #/groups, #/groups/<id>, #/settings. */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'meetings' }
  | { name: 'meeting'; id: string }
  | { name: 'groups' }
  | { name: 'group'; id: string }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const decode = (part: string): string => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part; // malformed escape such as "%E0": use it verbatim rather than crash
    }
  };
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decode);
  const [section, id] = parts;
  if (section === 'meetings' && id) return { name: 'meeting', id };
  if (section === 'groups' && id) return { name: 'group', id };
  if (section === 'groups') return { name: 'groups' };
  if (section === 'settings') return { name: 'settings' };
  return { name: 'meetings' };
}

export function href(route: Route): string {
  switch (route.name) {
    case 'meetings':
      return '#/meetings';
    case 'meeting':
      return `#/meetings/${encodeURIComponent(route.id)}`;
    case 'groups':
      return '#/groups';
    case 'group':
      return `#/groups/${encodeURIComponent(route.id)}`;
    case 'settings':
      return '#/settings';
  }
}

export function navigate(route: Route): void {
  location.hash = href(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
