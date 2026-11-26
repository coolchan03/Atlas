import { PHOTO_STYLES, photoStyleGuide, styleKeywords } from '../../src/skills/photoStyles';
import { SKILL_LIBRARY } from '../../src/skills/library';
import { RESOURCE_LIMITS } from '../../src/skills/parseSkill';
import { pickSkill, skillsNote } from '../../src/skills/selectSkills';
import { SKILL_CATEGORIES } from '../../src/skills/skillCategories';
import { PHOTO_MODES } from '../../src/photo/modes';
import type { Skill } from '../../src/skills/skillsStore';

const skills = (): Skill[] => SKILL_LIBRARY.map((s) => ({ ...s, enabled: true, addedAt: 0 }));
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

describe('photo styles', () => {
  it('describes every style fully: all parts written, a prompt line an image model can read, and something to avoid', () => {
    expect(PHOTO_STYLES.length).toBeGreaterThanOrEqual(16);
    for (const s of PHOTO_STYLES) {
      for (const part of [s.summary, s.look, s.colour, s.light, s.texture, s.composition, s.mood, s.fits, s.keywords, s.avoid]) expect(part.trim().length).toBeGreaterThan(20);
      expect(words(s.keywords)).toBeLessThan(40); // an image model reads a few dozen words, not paragraphs
      expect(s.look.length).toBeGreaterThan(120); // detailed, not a label
    }
    expect(new Set(PHOTO_STYLES.map((s) => s.id)).size).toBe(PHOTO_STYLES.length);
    for (const id of ['realistic', 'cartoon', 'anime']) expect(PHOTO_STYLES.map((s) => s.id)).toContain(id);
  });

  it('is a skill with the guide as its reference file, within what a skill may carry', () => {
    const skill = SKILL_LIBRARY.find((s) => s.name === 'photo-styles')!;
    expect(skill.resources).toHaveLength(1);
    expect(skill.resources![0].text).toBe(photoStyleGuide());
    expect(Buffer.byteLength(skill.resources![0].text)).toBeLessThan(RESOURCE_LIMITS.bytesEach);
    expect(SKILL_CATEGORIES.find((c) => c.names.includes('photo-styles'))?.id).toBe('pictures');
  });

  it('is picked for a question about a style, and a small model gets only that style\'s section', () => {
    const message = 'what does the anime style look like?';
    expect(pickSkill(message, skills())?.name).toBe('photo-styles');
    const note = skillsNote(message, skills(), 4096);
    expect(note).toContain('SKILL "photo-styles"');
    expect(note).toContain('[Anime]'); // every piece says which style it is about
    expect(note).not.toContain('[Pixel art]');
    expect(note).not.toContain('[Cartoon]');
    expect(note.length).toBeLessThan(2400); // body and the matching section fit a 4K-context model
  });

  it('is picked for the other common styles by their own words', () => {
    for (const [message, tag] of [['describe a realistic photograph style', '[Realistic photograph]'], ['explain the cartoon style in detail', '[Cartoon]'], ['what is pixel art style', '[Pixel art]']] as const) {
      expect(pickSkill(message, skills())?.name).toBe('photo-styles');
      expect(skillsNote(message, skills(), 4096)).toContain(tag);
    }
  });

  it('gives the Photo studio its looks from the same list', () => {
    const looks = PHOTO_MODES.find((m) => m.id === 'sketch')!.choices;
    expect(looks.map((c) => c.id)).toEqual(expect.arrayContaining(['realistic', 'anime', 'cartoon', 'watercolor']));
    for (const c of looks) { expect(c.style).toBe(styleKeywords(c.id)); expect(c.detail).toBeTruthy(); }
  });
});
