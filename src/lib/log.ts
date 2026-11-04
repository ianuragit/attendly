/** All console output from Attendly is prefixed so it is easy to filter in DevTools. */
const PREFIX = '[Attendly]';

export const log = {
  info: (...args: unknown[]): void => console.info(PREFIX, ...args),
  warn: (...args: unknown[]): void => console.warn(PREFIX, ...args),
  error: (...args: unknown[]): void => console.error(PREFIX, ...args),
};
