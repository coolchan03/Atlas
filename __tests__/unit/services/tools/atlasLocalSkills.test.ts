jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(false),
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  readDir: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../../src/atlasTools/deviceTools', () => ({
  workspaceDir: jest.fn().mockResolvedValue('/safe/Atlas'),
  confirm: jest.fn().mockResolvedValue(true),
}));
import RNFS from 'react-native-fs';
import * as DT from '../../../../src/atlasTools/deviceTools';
import { skillSlug, saveLocalSkill, readLocalSkill, listLocalSkills } from '../../../../src/services/tools/localSkills';

describe('Atlas user-approved SKILL.md library', () => {
  beforeEach(() => jest.clearAllMocks());
  it('rejects names with traversal, paths or whitespace', () => {
    expect(skillSlug('Review-Notes')).toBe('review-notes');
    for (const bad of ['../evil', 'a/b', 'my skill', '.git', 'C:foo', '']) {
      expect(() => skillSlug(bad)).toThrow();
    }
  });
  it('requires approval and writes only a Markdown file under the skill folder', async () => {
    await saveLocalSkill('my-skill', '# Skill instructions\nRead the project first.');
    expect(DT.confirm).toHaveBeenCalled();
    expect(RNFS.mkdir).toHaveBeenCalledWith('/safe/Atlas/Skills/my-skill');
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      '/safe/Atlas/Skills/my-skill/SKILL.md', expect.any(String), 'utf8');
    expect(await listLocalSkills()).toContain('No skills');
    expect(await readLocalSkill('my-skill')).toContain('not installed');
  });
});
