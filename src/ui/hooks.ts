/** React hooks shared by the popup and dashboard. */
import { useEffect, useState } from 'react';
import { getSettings, onSettingsChanged } from '../lib/settings';
import { DEFAULT_SETTINGS, type Settings, type ThemeSetting } from '../lib/types';

/** Current settings, kept in sync with chrome.storage. `loaded` is false until first read. */
export function useSettings(): { settings: Settings; loaded: boolean } {
  const [state, setState] = useState<{ settings: Settings; loaded: boolean }>({
    settings: DEFAULT_SETTINGS,
    loaded: false,
  });
  useEffect(() => {
    let alive = true;
    void getSettings().then((settings) => alive && setState({ settings, loaded: true }));
    const off = onSettingsChanged((settings) => setState({ settings, loaded: true }));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return state;
}

/** Applies the theme setting by toggling the `dark` class on <html>. */
export function useApplyTheme(theme: ThemeSetting): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

/** A clock that re-renders every `intervalMs`. */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Runs `onChange` whenever the service worker reports that stored data changed. */
export function useDbChanges(onChange: () => void): void {
  useEffect(() => {
    const listener = (msg: unknown, sender: chrome.runtime.MessageSender) => {
      if (sender.id !== chrome.runtime.id) return;
      if (
        typeof msg === 'object' &&
        msg !== null &&
        (msg as { type?: unknown }).type === 'db:changed'
      ) {
        onChange();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [onChange]);
}
