import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

export const DB_NAME = 'lifeos.db';

// Single shared connection for the whole app (one user, one device).
export const sqlite = openDatabaseSync(DB_NAME, { enableChangeListener: true });

sqlite.execSync('PRAGMA journal_mode = WAL;');
sqlite.execSync('PRAGMA foreign_keys = ON;');
sqlite.execSync('PRAGMA busy_timeout = 5000;');

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
