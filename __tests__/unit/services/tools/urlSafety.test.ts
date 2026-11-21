import { forceHttps, hostOf, isBlockedUrl } from '../../../../src/services/tools/urlSafety';

describe('which addresses the model may fetch', () => {
  test.each([
    'http://localhost/admin', 'http://127.0.0.1:8080/', 'http://10.0.0.5/', 'http://192.168.0.1/', 'http://172.16.0.1/', 'http://172.31.255.1/',
    'http://169.254.169.254/latest/meta-data', 'http://100.64.0.1/', 'http://0.0.0.0/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[fe80::1]/',
    'http://metadata.google.internal/', 'http://router/', 'http://nas.local/', 'http://printer.lan/',
  ])('refuses %s', (url) => expect(isBlockedUrl(url)).toBe(true));

  test.each([
    'http://user@127.0.0.1/', 'http://anything:pass@192.168.1.1/x', 'http://2130706433/', 'http://0x7f.0.0.1/', 'http://0177.0.0.1/', 'http://127.1/',
    'http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/', 'http://LOCALHOST./', 'http://192.168.0.1.:80/',
  ])('refuses a disguised address: %s', (url) => expect(isBlockedUrl(url)).toBe(true));

  test.each([
    'https://example.com/', 'http://8.8.8.8/', 'https://en.wikipedia.org/wiki/Water', 'https://172.32.0.1/', 'https://user@example.com:8443/path?q=1', 'http://[2606:4700::1111]/',
  ])('allows %s', (url) => expect(isBlockedUrl(url)).toBe(false));

  it('reads the host the way a browser does', () => {
    expect(hostOf('https://user:pw@Example.COM:8443/a?b#c')).toBe('example.com');
    expect(hostOf('http://[::1]:3000/')).toBe('::1');
    expect(hostOf('not a url')).toBeNull();
  });

  it('upgrades plain http to https and leaves https alone', () => {
    expect(forceHttps('http://example.com/a')).toBe('https://example.com/a');
    expect(forceHttps('https://example.com/a')).toBe('https://example.com/a');
  });
});
