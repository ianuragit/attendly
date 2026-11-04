import { log } from '../lib/log';

// Service worker entry. Message routing, badge updates and persistence are added in Phase 3/4.
chrome.runtime.onInstalled.addListener((details) => {
  log.info('installed', details.reason);
});
