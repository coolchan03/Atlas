import { sunTimes } from '../../../src/atlasTools/sun';
import { morseTimeline, toMorse } from '../../../src/atlasTools/morse';
import { DRILLS } from '../../../src/survival/drills';
import { expiringSoon, DEFAULT_CHECKLISTS } from '../../../src/atlasTools/checklists';
import { SURVIVAL_CHAPTERS } from '../../../src/survival/content';

describe('sun times', () => {
  it('matches known sunrise/sunset for New York on the June solstice (within 5 min)', () => {
    const t = sunTimes(new Date(2026, 5, 21, 12), 40.7128, -74.006);
    // NOAA: sunrise 09:25 UTC, sunset 00:31 UTC (next day).
    const rise = t.sunrise!.getUTCHours() * 60 + t.sunrise!.getUTCMinutes();
    expect(Math.abs(rise - (9 * 60 + 25))).toBeLessThanOrEqual(5);
    const set = (t.sunset!.getTime() - Date.UTC(2026, 5, 21)) / 60000;
    expect(Math.abs(set - (24 * 60 + 31))).toBeLessThanOrEqual(5);
  });
  it('reports polar day and night', () => {
    expect(sunTimes(new Date(2026, 5, 21, 12), 78, 15).polar).toBe('day');
    expect(sunTimes(new Date(2026, 11, 21, 12), 78, 15).polar).toBe('night');
  });
});

describe('morse', () => {
  it('encodes SOS', () => {
    expect(toMorse('SOS')).toBe('... --- ...');
    const t = morseTimeline('SOS', true);
    expect(t.filter((s) => s.on).map((s) => s.units)).toEqual([1, 1, 1, 3, 3, 3, 1, 1, 1]);
  });
});

describe('survival drills', () => {
  it('every choice leads to an existing node or the end, and every node has a good choice', () => {
    for (const d of DRILLS) {
      expect(d.nodes[d.start]).toBeTruthy();
      for (const node of Object.values(d.nodes)) {
        expect(node.choices.some((c) => c.good)).toBe(true);
        for (const c of node.choices) {
          if (c.next !== null) expect(d.nodes[c.next]).toBeTruthy();
          expect(c.card).toMatch(/^[A-Z]+\d+$/);
        }
      }
    }
  });
});

describe('checklists and picture quiz data', () => {
  it('finds expiring items', () => {
    const lists = [{ ...DEFAULT_CHECKLISTS[0], items: [{ id: 'x', text: 'Tablets', done: true, expires: '2026-10-20' }] }];
    expect(expiringSoon(lists, 30, Date.parse('2026-10-13'))).toHaveLength(1);
    expect(expiringSoon(lists, 3, Date.parse('2026-10-13'))).toHaveLength(0);
  });
  it('has Survival Manual figures with titles', () => {
    const re = /!\[Figure [\d-]+\\?\.\s*([^\]]+)\]\((fig[\d-]+\.png)\)/g;
    const n = SURVIVAL_CHAPTERS.reduce((k, ch) => k + [...ch.md.matchAll(re)].length, 0);
    expect(n).toBeGreaterThan(20);
  });
});
