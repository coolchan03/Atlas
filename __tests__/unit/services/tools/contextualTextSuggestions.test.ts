jest.mock('react-native', () => ({ Platform: {OS: 'android'}, PermissionsAndroid: {}, NativeModules: {} }));
jest.mock('../../../../src/atlasTools/deviceTools', () => ({ confirm: jest.fn() }));
import { generateContactIdeas } from '../../../../src/services/tools/contextualTextSuggestions';
describe('contextual contact suggestions - never send', () => {
  const now = new Date('2026-10-22T12:00:00Z').getTime();
  it('suggests messages only for relevant actual calendar events', () => {
    const ideas = generateContactIdeas([
      {title: "Jordan's Birthday", begin: now + 86400000},
      {title: 'Tax preparation deadline', begin: now + 172800000},
      {title: 'Dinner with Taylor', begin: now + 259200000},
    ], {now, days: 7});
    expect(ideas).toHaveLength(2);
    expect(ideas[0].suggestedDraft).toContain('happy birthday');
    expect(ideas[1].suggestedDraft).toContain('checking');
  });
  it('filters by person and ignores past events', () => {
    const ideas = generateContactIdeas([
      {title: "Jordan's Birthday", begin: now + 86400000},
      {title: "Taylor's Birthday", begin: now + 86400000},
      {title: 'Dinner with Taylor', begin: now - 86400000},
    ], {now, person: 'Taylor'});
    expect(ideas).toHaveLength(1);
    expect(ideas[0].event).toContain('Taylor');
  });
  it('does not invent text opportunities from unrelated events', () => {
    expect(generateContactIdeas([{ title: 'Quarterly filing', begin: now + 86400000 }], {now})).toEqual([]);
  });
});
