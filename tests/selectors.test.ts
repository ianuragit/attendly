// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findPeopleButton,
  isInCall,
  meetingCodeFromPath,
  readMeetingTitle,
  readParticipantCount,
  readPeoplePanel,
  readTiles,
} from '../src/content/selectors';
import { meetHtml } from './fixtures/meet-dom';

const set = (html: string) => {
  document.body.innerHTML = html;
};

beforeEach(() => set(''));

describe('meetingCodeFromPath', () => {
  it.each([
    ['/abc-defg-hij', 'abc-defg-hij'],
    ['/ABC-DEFG-HIJ', 'abc-defg-hij'],
    ['/abc-defg-hij/', 'abc-defg-hij'],
    ['/lookup/myclass', 'myclass'],
    ['/', null],
    ['/landing', null],
    ['/new', null],
  ])('%s → %s', (path, code) => {
    expect(meetingCodeFromPath(path)).toBe(code);
  });
});

describe('call presence', () => {
  it('detects the in-call UI by the call_end icon', () => {
    set(meetHtml({ tiles: [] }));
    expect(isInCall()).toBe(true);
  });
  it('is false in the lobby', () => {
    set(meetHtml({ tiles: [], inCall: false }));
    expect(isInCall()).toBe(false);
  });
  it('falls back to the aria-label', () => {
    set('<button aria-label="Leave call"></button>');
    expect(isInCall()).toBe(true);
  });
});

describe('readTiles', () => {
  it('reads names, avatars and the self marker', () => {
    set(
      meetHtml({
        tiles: [
          { name: 'Me Myself', self: true },
          { name: 'Ana Lima', avatar: 'https://lh3.googleusercontent.com/a/ana=s64' },
          { name: 'Ben (Presenting)' },
        ],
      }),
    );
    const { entries, overflow } = readTiles();
    expect(overflow).toBe(false);
    expect(entries).toEqual([
      { name: 'Me Myself', avatarUrl: null, isSelf: true },
      { name: 'Ana Lima', avatarUrl: 'https://lh3.googleusercontent.com/a/ana=s64', isSelf: false },
      { name: 'Ben', avatarUrl: null, isSelf: false },
    ]);
  });

  it('skips presentation tiles and flags the overflow tile', () => {
    set(meetHtml({ tiles: [{ name: 'Ana (Presentation)' }, { name: 'Ben' }], overflowOthers: 7 }));
    const { entries, overflow } = readTiles();
    expect(entries.map((e) => e.name)).toEqual(['Ben']);
    expect(overflow).toBe(true);
  });

  it('does not double count nested or repeated tiles', () => {
    set(
      '<div data-participant-id="a"><div data-participant-id="a"><span class="notranslate">Ana</span></div></div>' +
        '<div data-participant-id="a"><span class="notranslate">Ana</span></div>',
    );
    expect(readTiles().entries).toHaveLength(1);
  });
});

describe('People panel', () => {
  it('returns null when the panel is closed', () => {
    set(meetHtml({ tiles: [{ name: 'Ana' }] }));
    expect(readPeoplePanel()).toBeNull();
  });

  it('reads every row, including the self row', () => {
    set(
      meetHtml({
        tiles: [],
        panel: [{ name: 'Me', self: true }, { name: 'Ana' }, { name: 'Ben' }],
      }),
    );
    expect(readPeoplePanel()).toEqual([
      { name: 'Me', avatarUrl: null, isSelf: true },
      { name: 'Ana', avatarUrl: null, isSelf: false },
      { name: 'Ben', avatarUrl: null, isSelf: false },
    ]);
  });

  it('finds the list via data-participant-id when the aria-label is localised', () => {
    set(
      '<div role="list" aria-label="Teilnehmer"><div role="listitem" data-participant-id="1" aria-label="Ana"></div></div>',
    );
    expect(readPeoplePanel()?.map((e) => e.name)).toEqual(['Ana']);
  });
});

describe('People button and count', () => {
  it('finds the button and reads the badge count, ignoring the icon text', () => {
    set(meetHtml({ tiles: [], count: 23 }));
    expect(findPeopleButton()).not.toBeNull();
    expect(readParticipantCount()).toBe(23);
  });
  it('returns null when no count is shown', () => {
    set(meetHtml({ tiles: [] }));
    expect(readParticipantCount()).toBeNull();
  });
});

describe('readMeetingTitle', () => {
  it('prefers data-meeting-title', () => {
    set(meetHtml({ tiles: [], title: 'Physics 101' }));
    expect(readMeetingTitle(document, 'Meet - abc-defg-hij')).toBe('Physics 101');
  });
  it('falls back to document.title but ignores bare codes', () => {
    expect(readMeetingTitle(document, 'Meet – Weekly sync')).toBe('Weekly sync');
    expect(readMeetingTitle(document, 'Meet - abc-defg-hij')).toBeNull();
    expect(readMeetingTitle(document, 'Google Meet')).toBeNull();
  });
});
