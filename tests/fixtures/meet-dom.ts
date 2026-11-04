/**
 * Builds a DOM that mimics the parts of Google Meet's in-call UI Attendly reads. Shared by the
 * jsdom unit tests and the Playwright e2e fixture page. It reflects the hooks documented in
 * docs/meet-dom-notes.md, not a copy of Meet's markup.
 */
export interface FakePerson {
  name: string;
  avatar?: string;
  self?: boolean;
  id?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function tileHtml(p: FakePerson, i: number): string {
  const img = p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : '';
  const name = p.self
    ? `<div data-self-name="You">${esc(p.name)}</div>`
    : `<span class="notranslate">${esc(p.name)}</span>`;
  return `<div data-participant-id="spaces/x/devices/${p.id ?? i}">${img}<div class="name">${name}</div></div>`;
}

export function panelHtml(people: FakePerson[]): string {
  const rows = people
    .map(
      (p) =>
        `<div role="listitem" aria-label="${esc(p.name)}">` +
        (p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : '') +
        `<span class="notranslate">${esc(p.name)}</span>${p.self ? '<span>(You)</span>' : ''}</div>`,
    )
    .join('');
  return `<div role="list" aria-label="Participants">${rows}</div>`;
}

export function meetHtml(opts: {
  tiles: FakePerson[];
  panel?: FakePerson[] | null;
  overflowOthers?: number;
  count?: number;
  inCall?: boolean;
  title?: string;
}): string {
  const tiles = opts.tiles.map(tileHtml).join('');
  const overflow = opts.overflowOthers
    ? `<div data-participant-id="overflow"><span class="notranslate">${opts.overflowOthers} others</span></div>`
    : '';
  const controls =
    opts.inCall === false
      ? '<button><span>Join now</span></button>'
      : `<button aria-label="Leave call"><i class="google-material-icons">call_end</i></button>
       <button aria-label="Show everyone"><i class="google-material-icons">people</i><div>${opts.count ?? ''}</div></button>`;
  const title = opts.title
    ? `<div data-meeting-title="${esc(opts.title)}">${esc(opts.title)}</div>`
    : '';
  const panel = opts.panel ? panelHtml(opts.panel) : '';
  return `${title}<main><div class="grid">${tiles}${overflow}</div><aside>${panel}</aside><footer>${controls}</footer></main>`;
}
