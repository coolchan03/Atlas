jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    AtlasCodeRunner: {
      runJavascript: jest.fn().mockResolvedValue('{"ok":true,"logs":["5"],"tests":[{"name":"addition","passed":true}]}'),
    },
  },
}));
jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(true),
  readDir: jest.fn().mockResolvedValue([
    { name: 'utils.js', isFile: () => true, isDirectory: () => false },
    { name: 'index.js', isFile: () => true, isDirectory: () => false },
    { name: 'example.test.js', isFile: () => true, isDirectory: () => false },
  ]),
  readFile: jest.fn().mockImplementation(async (path: string) =>
    path.endsWith('utils.js') ? 'function add(a,b){return a+b}' :
    path.endsWith('index.js') ? 'console.log(add(2,3));' :
    'assert(add(2,3)===5);'),
}));
jest.mock('../../../../src/atlasTools/deviceTools', () => ({
  workspaceDir: jest.fn().mockResolvedValue('/safe/Atlas'),
  confirm: jest.fn().mockResolvedValue(true),
}));
import RNFS from 'react-native-fs';
import { NativeModules } from 'react-native';
import * as DT from '../../../../src/atlasTools/deviceTools';
import {
  codeProjectName, validatedTests, selectedJavascriptFiles, buildRunTestJavascript,
} from '../../../../src/services/tools/codeExecution';

describe('Atlas offline JavaScript code builder and runner', () => {
  beforeEach(() => jest.clearAllMocks());
  it('rejects malformed tests and normalizes project names', () => {
    expect(codeProjectName('Demo Project')).toBe('Demo-Project');
    expect(() => codeProjectName('@@@')).toThrow();
    expect(() => validatedTests('{}')).toThrow();
    expect(() => validatedTests('[{"name":"x","code":""}]')).toThrow();
  });
  it('sorts utility sources ahead of entrypoints and excludes test files', () => {
    const file = (name: string) => ({ name, isFile: () => true, isDirectory: () => false });
    expect(selectedJavascriptFiles([file('index.js'),file('alpha.test.js'),file('utils.js')]))
      .toEqual(['utils.js','index.js']);
  });
  it('builds dependency-free files then runs assertions after explicit approval', async () => {
    const answer = await buildRunTestJavascript('Demo Project');
    expect(RNFS.readFile).toHaveBeenCalledTimes(3);
    expect(DT.confirm).toHaveBeenCalledTimes(1);
    expect(NativeModules.AtlasCodeRunner.runJavascript).toHaveBeenCalledWith(
      expect.stringContaining('function add(a,b)'), expect.stringContaining('assert(add(2,3)===5)'),
    );
    expect(answer).toContain('1/1 passed');
    expect(answer).toContain('Console:');
  });
  it('never executes when user declines', async () => {
    (DT.confirm as jest.Mock).mockResolvedValueOnce(false);
    const answer = await buildRunTestJavascript('Demo');
    expect(answer).toContain('declined');
    expect(NativeModules.AtlasCodeRunner.runJavascript).not.toHaveBeenCalled();
  });
  it('refuses import/export module bundles instead of pretending to compile them', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce('export function add(a,b){return a+b}').mockResolvedValueOnce('');
    await expect(buildRunTestJavascript('Demo')).rejects.toThrow('cannot bundle');
    expect(NativeModules.AtlasCodeRunner.runJavascript).not.toHaveBeenCalled();
  });
});
