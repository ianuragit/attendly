import type { ReactNode } from 'react';
import { useApplyTheme, useSettings } from '../ui/hooks';
import { DataProvider } from './data';
import { GroupDetailPage } from './pages/GroupDetailPage';
import { GroupsPage } from './pages/GroupsPage';
import { MeetingDetailPage } from './pages/MeetingDetailPage';
import { MeetingsPage } from './pages/MeetingsPage';
import { href, useRoute, type Route } from './router';

const NAV: { label: string; route: Route; match: Route['name'][] }[] = [
  { label: 'Meetings', route: { name: 'meetings' }, match: ['meetings', 'meeting'] },
  { label: 'Groups', route: { name: 'groups' }, match: ['groups', 'group'] },
  { label: 'Settings', route: { name: 'settings' }, match: ['settings'] },
];

export function App() {
  const { settings, loaded } = useSettings();
  useApplyTheme(settings.theme);
  const route = useRoute();

  let page: ReactNode;
  switch (route.name) {
    case 'meetings':
      page = <MeetingsPage settings={settings} />;
      break;
    case 'meeting':
      page = <MeetingDetailPage id={route.id} settings={settings} />;
      break;
    case 'groups':
      page = <GroupsPage />;
      break;
    case 'group':
      page = <GroupDetailPage id={route.id} settings={settings} />;
      break;
    default:
      page = <p className="text-slate-600 dark:text-slate-400">Coming soon.</p>;
  }

  return (
    <DataProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <a
          href="#main"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('main')?.focus();
          }}
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow dark:focus:bg-slate-800"
        >
          Skip to content
        </a>
        <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-6 py-3">
            <a
              href={href({ name: 'meetings' })}
              className="flex items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <img src="/icons/icon-32.png" alt="" width={24} height={24} />
              <span className="text-lg font-semibold">Attendly</span>
            </a>
            <nav aria-label="Main">
              <ul className="flex gap-1">
                {NAV.map((item) => {
                  const current = item.match.includes(route.name);
                  return (
                    <li key={item.label}>
                      <a
                        href={href(item.route)}
                        aria-current={current ? 'page' : undefined}
                        className={`block rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-500 ${
                          current
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        {item.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-8 focus:outline-none">
          {loaded ? page : null}
        </main>
      </div>
    </DataProvider>
  );
}
