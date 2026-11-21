import { LearningKnowledgeDb } from '../../src/learning/knowledgeDb';

/** A real SQLite engine in memory behind the knowledge ledger, so tests run the actual SQL. Each call is a fresh, empty database. */
export function memoryKnowledgeDb(): LearningKnowledgeDb {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  return new LearningKnowledgeDb(() => ({
    executeSync: (sql: string, params: Array<string | number | null> = []) => {
      const statement = db.prepare(sql);
      if (/^\s*(select|pragma\s+user_version\s*$)/i.test(sql)) return { rows: statement.all(...params) };
      const result = statement.run(...params);
      return { rows: [], insertId: Number(result.lastInsertRowid) };
    },
  }));
}
