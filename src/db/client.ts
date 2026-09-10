import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import * as schema from './schema';

export const DB_NAME = 'lifeos.db';

let sqlite: SQLiteDatabase | null = null;
let db: ExpoSQLiteDatabase<typeof schema> | null = null;

/** Single shared connection for the whole app (one user, one device). Lazy so web can warm up first. */
export function getSqlite(): SQLiteDatabase {
  if (!sqlite) {
    sqlite = openDatabaseSync(DB_NAME, { enableChangeListener: true });
    sqlite.execSync('PRAGMA journal_mode = WAL;');
    sqlite.execSync('PRAGMA foreign_keys = ON;');
    sqlite.execSync('PRAGMA busy_timeout = 5000;');
  }
  return sqlite;
}

export function getDb(): ExpoSQLiteDatabase<typeof schema> {
  if (!db) db = drizzle(getSqlite(), { schema });
  return db;
}

/**
 * Must resolve before the first synchronous query.
 * On web, expo-sqlite runs in a worker and the sync bridge only waits a few milliseconds;
 * the very first call would time out while the worker downloads and compiles the wasm.
 * An async open forces that initialisation to complete first.
 */
export async function prepareDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    const warm = await openDatabaseAsync(DB_NAME);
    await warm.getFirstAsync('SELECT 1');
    // Keep `warm` open: closing it would tear down the worker-side VFS state.
  }
  getDb();
}
