/** Opens (or focuses) the dashboard at a hash route such as "#/meetings/<id>". */
export async function openDashboard(hash = ''): Promise<void> {
  const url = chrome.runtime.getURL(`src/dashboard/index.html${hash}`);
  await chrome.tabs.create({ url });
}
