import { openDatabase } from '../host/sqlite';
export type DB = ReturnType<typeof openDatabase>;
export const open = (o: { name: string }): DB => openDatabase(o.name);
