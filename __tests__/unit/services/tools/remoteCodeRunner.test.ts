jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(true),
  readDir: jest.fn().mockResolvedValue([
    {name:'main.py',isFile:()=>true},{name:'main.test.py',isFile:()=>true},
  ]),
  readFile: jest.fn().mockImplementation(async (p:string) =>
    p.endsWith('main.py') ? 'print(1+1)' : 'assert(1+1==2)'),
}));
jest.mock('../../../../src/atlasTools/deviceTools', () => ({
  workspaceDir: jest.fn().mockResolvedValue('/safe/Atlas'),
  confirm: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../../src/atlasTools/offGrid', () => ({ offGridOn: jest.fn().mockReturnValue(false) }));
import { offGridOn } from '../../../../src/atlasTools/offGrid';
import * as DT from '../../../../src/atlasTools/deviceTools';
import {
  pistonBaseUrl, pickRuntime, formatPistonResult, buildRunTestRemote,
} from '../../../../src/services/tools/remoteCodeRunner';
const oldFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ok:true,json:async()=>[
      {language:'python',version:'3.11.4',aliases:['py']},
    ]})
    .mockResolvedValueOnce({ok:true,json:async()=>({
      language:'python',version:'3.11.4',run:{stdout:'2\n',stderr:'',code:0,status:null},
    })})
    .mockResolvedValueOnce({ok:true,json:async()=>({
      language:'python',version:'3.11.4',run:{stdout:'',stderr:'',code:0,status:null},
    })}) as any;
  (offGridOn as jest.Mock).mockReturnValue(false);
  (DT.confirm as jest.Mock).mockResolvedValue(true);
});
afterAll(() => { global.fetch = oldFetch; });
describe('consented multi-language compiler backend', () => {
  it('accepts only public HTTPS server roots', () => {
    expect(pistonBaseUrl('https://coder.example.org/')).toBe('https://coder.example.org');
    for (const candidate of ['http://coder.example.org','https://localhost','https://192.168.0.1',
      'https://user:pass@coder.example.org','https://coder.example.org/evil',
      'https://coder.example.org:2000']) {
      expect(() => pistonBaseUrl(candidate)).toThrow();
    }
  });
  it('selects a known installed language and reports compile errors', () => {
    expect(pickRuntime([{language:'python',aliases:['py'],version:'3.11.4'}], 'py').language).toBe('python');
    expect(() => pickRuntime([], 'rust')).toThrow('no runtime');
    expect(formatPistonResult({language:'rust',version:'1.0',
      compile:{code:1,stderr:'syntax error'},run:{code:1}}, 'Build')).toContain('FAIL');
  });
  it('executes a program then its test entrypoint after one consent', async () => {
    const text = await buildRunTestRemote({
      project:'Demo', main:'main.py', test_entry:'main.test.py',
      runner_url:'https://coder.example.org', language:'python',
    });
    expect(DT.confirm).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://coder.example.org/api/v2/runtimes');
    const p = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(p.files[0].name).toBe('main.py');
    expect(p.compile_timeout).toBe(15000);
    expect(text).toContain('Test entrypoint');
  });
  it('sends no source when approval declined or Off-grid on', async () => {
    (DT.confirm as jest.Mock).mockResolvedValueOnce(false);
    await buildRunTestRemote({project:'Demo',main:'main.py',language:'python',runner_url:'https://coder.example.org'});
    expect(global.fetch).not.toHaveBeenCalled();
    (offGridOn as jest.Mock).mockReturnValueOnce(true);
    await buildRunTestRemote({project:'Demo',main:'main.py',language:'python',runner_url:'https://coder.example.org'});
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
