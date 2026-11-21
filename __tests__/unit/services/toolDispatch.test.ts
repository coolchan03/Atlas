const mockDT = {
  listFiles: jest.fn(async (p?: string) => `listed ${p}`), readFile: jest.fn(async (p: string, o: number) => `read ${p} @${o}`), writeFile: jest.fn(async (p: string, b: string, a: boolean) => `wrote ${p} ${b.length} ${a}`),
  createWebPage: jest.fn(async (n: string, h: string) => `page ${n} ${h.length}`), openFile: jest.fn(async (p: string) => `opened ${p}`), calendarEvents: jest.fn(async (a: number, b: number) => `events ${a} ${b}`),
  addCalendarEvent: jest.fn(async (t: string, s: string) => `added ${t} ${s}`), draftMessage: jest.fn(async (k: string, b: string) => `draft ${k} ${b}`), rememberFact: jest.fn(async (f: string) => `remembered ${f}`),
  confirm: jest.fn(async () => true), lastFileRead: 0, __esModule: true,
};
const mockSearchWeb = jest.fn<Promise<unknown>, unknown[]>();
const mockSearchProject = jest.fn<Promise<unknown>, unknown[]>();
const mockSaveNote = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('../../../src/atlasTools/deviceTools', () => mockDT);
jest.mock('../../../src/study/studyTools', () => ({ runStudyTool: jest.fn(async (n: string) => `study ${n}`) }));
jest.mock('../../../src/atlasTools/offlineLibrary', () => ({ libraryToolAnswer: jest.fn(async (q: string) => `library ${q}`) }));
jest.mock('../../../src/services/tools/webSearchProviders', () => ({ searchWeb: (...a: unknown[]) => mockSearchWeb(...a) }));
jest.mock('../../../src/services/rag', () => ({ ragService: { searchProject: (...a: unknown[]) => mockSearchProject(...a), saveProjectNote: (...a: unknown[]) => mockSaveNote(...a) } }));
jest.mock('../../../src/schedule/createFromTool', () => ({ createScheduledTask: (a: unknown) => `scheduled ${JSON.stringify(a)}` }));
jest.mock('../../../src/atlasTools/offGridState', () => ({ NETWORK_TOOLS: ['web_search', 'read_url', 'find_image'], offGridOn: () => mockOffGrid }));
let mockOffGrid = false;

// Loaded after the mock objects above exist (an import would run first).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { executeToolCall, braveSearch, readPage } = require('../../../src/services/tools/handlers') as typeof import('../../../src/services/tools/handlers');

const call = (name: string, args: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => executeToolCall({ id: '1', name, arguments: args, ...extra } as never);
const DeviceInfo = (require('react-native-device-info').default ?? require('react-native-device-info')) as Record<string, unknown>;
Object.assign(DeviceInfo, { getBrand: () => 'Acme', getModel: () => 'Phone 1', getSystemVersion: () => '16', getTotalMemory: async () => 8 * 1024 ** 3, getUsedMemory: async () => 3 * 1024 ** 3, getFreeDiskStorage: async () => 50 * 1024 ** 3, getTotalDiskCapacity: async () => 128 * 1024 ** 3, getBatteryLevel: async () => 0.5, isBatteryCharging: async () => true });
beforeEach(() => { mockOffGrid = false; mockDT.lastFileRead = 0; mockDT.confirm.mockResolvedValue(true); Object.values(mockDT).forEach((f) => typeof f === 'function' && (f as jest.Mock).mockClear?.()); mockSearchWeb.mockReset(); });

describe('every tool validates its arguments and routes to the right place', () => {
  it.each([
    ['web_search', 'query'], ['search_knowledge_base', 'query'], ['search_offline_library', 'query'], ['read_file', 'path'], ['write_file', 'path'], ['open_file', 'path'], ['remember', 'fact'], ['read_url', 'url'],
  ])('%s needs %s', async (name, param) => {
    const r = await call(name, {});
    expect(r.error).toMatch(new RegExp(`Missing required parameter: ${param}`));
  });
  it('update_project_document needs a name and content', async () => {
    expect((await call('update_project_document', { name: 'n' })).error).toMatch(/name and content/);
  });
  it('simple tools run and report their results', async () => {
    expect((await call('calculator', { expression: '2 + 3 * 4' })).content).toBe('2 + 3 * 4 = 14');
    expect((await call('calculator', { expression: 'alert(1)' })).error).toMatch(/Invalid expression/);
    expect((await call('calculator', { expression: '1/0' })).error).toMatch(/finite number/);
    for (const name of ['find_image', 'study_helpers', 'study_math', 'science_data']) expect((await call(name, { q: 1 })).content).toBe(`study ${name}`);
    expect((await call('search_offline_library', { query: 'water' })).content).toBe('library water');
    expect((await call('get_current_datetime', { timezone: 'Europe/Paris' })).content).toMatch(/Current date and time/);
    expect((await call('get_current_datetime', { timezone: 'Mars/Base' })).content).toMatch(/was invalid/);
    expect((await call('get_current_datetime', {})).content).toMatch(/Unix timestamp/);
    expect((await call('schedule_task', { name: 'x' })).content).toMatch(/^scheduled/);
    expect((await call('nope', {})).error).toMatch(/Unknown tool: nope/);
  });
  it('device info sections', async () => {
    for (const t of ['memory', 'storage', 'battery', 'all', undefined]) expect((await call('get_device_info', { info_type: t })).error).toBeUndefined();
  });
  it('file and calendar tools pass their arguments through', async () => {
    expect((await call('list_files', { path: 'docs' })).content).toBe('listed docs');
    expect((await call('read_file', { path: 'a.txt', offset: '5' })).content).toBe('read a.txt @5');
    expect((await call('read_file', { path: 'a.txt', offset: 'x' })).content).toBe('read a.txt @0');
    expect((await call('write_file', { path: 'a.txt', content: 'hello', append: 'true' })).content).toBe('wrote a.txt 5 true');
    expect((await call('write_file', { path: 'a.txt', content: '   ' })).content).toMatch(/Nothing was written/);
    expect((await call('write_file', { path: 'a.txt', content: 5 })).content).toMatch(/Nothing was written/);
    expect((await call('create_web_page', { name: 'Site', html: '<p>x</p>' })).content).toBe('page Site 8');
    expect((await call('create_web_page', {})).content).toBe('page site 0');
    expect((await call('open_file', { path: 'a.html' })).content).toBe('opened a.html');
    expect((await call('calendar_events', { days_ahead: '3', days_back: '2' })).content).toBe('events 3 2');
    expect((await call('calendar_events', { days_ahead: 'x', days_back: 'y' })).content).toBe('events 7 0');
    expect((await call('add_calendar_event', { title: 'Exam', start: '2026-12-01T10:00' })).content).toBe('added Exam 2026-12-01T10:00');
    expect((await call('add_calendar_event', {})).content).toBe('added Event ');
    expect((await call('remember', { fact: 'likes tea' })).content).toBe('remembered likes tea');
  });
  it('draft_message needs text unless it is a call', async () => {
    expect((await call('draft_message', { kind: 'email', body: '  ' })).error).toMatch(/body/);
    expect((await call('draft_message', { kind: 'call', to: '555' })).content).toBe('draft call ');
    expect((await call('draft_message', { body: 'hi' })).content).toBe('draft text hi');
  });
});

describe('web and knowledge tools', () => {
  it('web search: results, none, and every provider failing', async () => {
    mockSearchWeb.mockResolvedValueOnce({ results: [{ title: 'A', url: 'https://a.org', snippet: 's1' }, { title: 'B', snippet: 's2' }], provider: 'meta', notes: [] });
    expect((await call('web_search', { query: 'q' })).content).toMatch(/\[A\]\(https:\/\/a.org\)[\s\S]*2\. B/);
    mockSearchWeb.mockResolvedValueOnce({ results: [], provider: 'meta', notes: ['meta: no results'] });
    expect((await call('web_search', { query: 'q' })).content).toBe('No results found for "q".');
    mockSearchWeb.mockResolvedValueOnce({ results: [], provider: 'meta', notes: ['meta: offline'] });
    expect((await call('web_search', { query: 'q' })).error).toMatch(/Search failed/);
  });
  it('internet tools are off in off-grid mode, even when the model asks', async () => {
    mockOffGrid = true;
    expect((await call('web_search', { query: 'q' })).content).toMatch(/Off-grid mode is on/);
    expect((await call('read_url', { url: 'https://a.org' })).content).toMatch(/Off-grid mode is on/);
    expect((await call('calculator', { expression: '1+1' })).content).toBe('1+1 = 2');
  });
  it('knowledge base search needs a project', async () => {
    expect((await call('search_knowledge_base', { query: 'q' })).content).toMatch(/No project context/);
    mockSearchProject.mockResolvedValueOnce({ chunks: [] });
    expect((await call('search_knowledge_base', { query: 'leases' }, { context: { projectId: 'p' } })).content).toMatch(/No results found for "leases"/);
    mockSearchProject.mockResolvedValueOnce({ chunks: [{ name: 'Book', position: 0, content: 'A lease is a contract.' }, { name: 'Book', position: 1, content: 'Equity.' }] });
    expect((await call('search_knowledge_base', { query: 'leases' }, { context: { projectId: 'p' } })).content).toMatch(/\[1\] Book \(part 1\)[\s\S]*---[\s\S]*\[2\]/);
  });
  it('project documents are written only inside a project, append by default, replace on request, never after a cancel', async () => {
    expect((await call('update_project_document', { name: 'n', content: 'c' })).content).toMatch(/not in a project/);
    expect((await call('update_project_document', { name: 'n', content: 'c' }, { context: { projectId: 'p' } })).content).toMatch(/Added to the project document/);
    expect((await call('update_project_document', { name: 'n', content: 'c', mode: 'replace' }, { context: { projectId: 'p' } })).content).toMatch(/Rewrote/);
    expect(mockSaveNote).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'replace' }));
    const c = new AbortController(); c.abort();
    expect((await call('update_project_document', { name: 'n', content: 'c' }, { context: { projectId: 'p' }, signal: c.signal })).error).toMatch(/cancelled/);
  });
  it('read_url: blocked addresses, a confirmation after a file was read, and page text', async () => {
    expect((await call('read_url', { url: 'ftp://x' })).error).toMatch(/must start with http/);
    expect((await call('read_url', { url: 'http://192.168.0.1/admin' })).error).toMatch(/Blocked/);
    mockDT.lastFileRead = Date.now(); mockDT.confirm.mockResolvedValueOnce(false);
    expect((await call('read_url', { url: 'https://a.org/page' })).content).toMatch(/declined/);
    mockDT.lastFileRead = 0;
    const html = '<html><body><nav>menu</nav><article><h1>Title</h1><p>Hello <b>world</b></p><ul><li>one</li></ul><blockquote>quote</blockquote><h4>Small</h4><pre>code</pre></article></body></html>';
    (global as any).fetch = jest.fn(async () => ({ ok: true, url: 'https://a.org/page', text: async () => html }));
    const out = (await call('read_url', { url: ' "https://a.org/page" ' })).content;
    expect(out).toMatch(/## Title[\s\S]*Hello world[\s\S]*- one[\s\S]*> quote[\s\S]*### Small[\s\S]*`code`/); expect(out).not.toMatch(/menu/);
    (global as any).fetch = jest.fn(async () => ({ ok: true, url: 'https://a.org/p', text: async () => `<html><body><p>${'x'.repeat(5000)}</p></body></html>` }));
    expect((await call('read_url', { url: 'https://a.org/p' })).content).toMatch(/\[Content truncated\]/);
    (global as any).fetch = jest.fn(async () => ({ ok: true, url: 'https://a.org/e', text: async () => '<html><body></body></html>' }));
    expect((await call('read_url', { url: 'https://a.org/e' })).content).toMatch(/no readable content/);
    (global as any).fetch = jest.fn(async () => ({ ok: true, url: 'http://10.0.0.5/secret', text: async () => 'x' }));
    expect((await call('read_url', { url: 'https://a.org/r' })).error).toMatch(/redirected to a private/);
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found', url: 'https://a.org/x', text: async () => '' }));
    expect((await call('read_url', { url: 'https://a.org/x' })).error).toMatch(/HTTP 404/);
  });
  it('my_location says what it knows, with and without a fix and saved places', async () => {
    const maps = require('../../../src/atlasMaps/maps');
    maps.useMaps.setState({ lastFix: null, waypoints: [], imperial: true });
    expect((await call('my_location')).content).toMatch(/No GPS position yet/);
    maps.useMaps.setState({ waypoints: [{ id: 'w', name: 'Camp', lat: 10, lon: 10, createdAt: 1 }] });
    expect((await call('my_location')).content).toMatch(/Saved places: Camp/);
    maps.useMaps.setState({ lastFix: { lat: 48.85, lon: 2.35, accuracy: 5, altitude: 35, speed: 0, time: Date.now() - 120000 }, imperial: false });
    const metric = (await call('my_location')).content;
    expect(metric).toMatch(/Altitude: 35 m/); expect(metric).toMatch(/Camp: .* km/);
    maps.useMaps.setState({ imperial: true });
    expect((await call('my_location')).content).toMatch(/Altitude: 115 ft/);
  });
});

describe('the built-in Brave page search', () => {
  const page = (html: string) => { (global as any).fetch = jest.fn(async () => ({ ok: true, text: async () => html })); };
  it('reads result blocks (title, snippet, entities) and caps them at five', async () => {
    const block = (i: number) => `class="result-wrapper"><a href="https://site${i}.org/p?a=1&amp;b=2"><span class="title">Title &amp; ${i} &#65; &#x42;</span></a><p class="snippet">A <b>snippet</b> for &quot;${i}&quot;</p></div>`;
    page(Array.from({ length: 7 }, (_, i) => block(i)).join(''));
    const out = await braveSearch('q');
    expect(out).toHaveLength(5); expect(out[0]).toMatchObject({ title: 'Title & 0 A B', url: 'https://site0.org/p?a=1&b=2', snippet: 'A snippet for "0"' });
  });
  it('falls back to plain links, and tolerates blocks with only one part', async () => {
    page('class="result-wrapper"><a href="https://only.org/x"><span>Only a title here</span></a></div>class="result-wrapper"><div>nothing</div>');
    expect((await braveSearch('q'))[0]).toMatchObject({ title: 'Only a title here', snippet: '(no snippet)' });
    page('<a href="https://search.brave.com/x">Brave own link here</a><a href="https://plain.org/a">A long enough link title</a><a href="https://plain.org/b">Brave sponsored link text</a>');
    const out = await braveSearch('q');
    expect(out).toEqual([{ title: 'A long enough link title', snippet: '', url: 'https://plain.org/a' }]);
    page('<html></html>'); expect(await braveSearch('q')).toEqual([]);
    page('class="result-wrapper"><a href="https://x.org"><span>Title</span></a><span class="snippet">span snippet</span>');
    expect((await braveSearch('q'))[0].snippet).toBe('span snippet');
  });
  it('readPage reads a page for the daily briefing', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: true, url: 'https://news.org/a', text: async () => '<html><body><main><p>Briefing text</p></main></body></html>' }));
    expect(await readPage('https://news.org/a', 100)).toBe('Briefing text');
  });
});
