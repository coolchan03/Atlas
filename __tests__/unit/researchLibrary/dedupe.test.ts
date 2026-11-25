import { installRealSqlite } from '../../harness/sqliteFake';
import { contentHash } from '../../../src/services/rag/convert';

describe('same content under another name', () => {
  it('is recognised by hash within a project, and not across projects', async () => {
    installRealSqlite();
    const { ragDatabase } = require('../../../src/services/rag/database');
    await ragDatabase.ensureReady();
    const h = contentHash('The same words.\nIn two files.');
    ragDatabase.insertDocument({ projectId: 'p1', name: 'a.txt', path: '/a', size: 10, contentHash: h });
    expect(ragDatabase.findNameByHash('p1', h)).toBe('a.txt');
    expect(ragDatabase.findNameByHash('p2', h)).toBeNull();
    expect(contentHash('The same words.\nIn two files!')).not.toBe(h);
  });
});
