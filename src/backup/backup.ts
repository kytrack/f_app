/**
 * Backup & restore of the local database, and a CSV export of the point ledger.
 * Native only (the web preview has no file system access).
 */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { defaultDatabaseDirectory } from 'expo-sqlite';
import { Platform } from 'react-native';
import { DB_NAME, getSqlite } from '@/src/db/client';
import type { DomainCtx } from '@/src/domain/context';
import { recentEntries } from '@/src/domain/points/ledger';

export const isBackupSupported = Platform.OS !== 'web';

const SQLITE_HEADER = 'SQLite format 3';

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function dbFile(): File {
  return new File(defaultDatabaseDirectory, DB_NAME);
}

/** Copies the live database into the cache and opens the share sheet. */
export async function exportDatabase(): Promise<string> {
  if (!isBackupSupported) throw new Error('Csak telefonon érhető el');
  getSqlite().execSync('PRAGMA wal_checkpoint(TRUNCATE);');
  const dest = new File(Paths.cache, `lifeos-backup-${stamp()}.db`);
  if (dest.exists) dest.delete();
  dbFile().copy(dest);
  await Sharing.shareAsync(dest.uri, { mimeType: 'application/vnd.sqlite3', dialogTitle: 'LifeOS mentés' });
  return dest.uri;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The whole point ledger as CSV (newest first), shared via the system sheet. */
export async function exportLedgerCsv(ctx: DomainCtx): Promise<string> {
  if (!isBackupSupported) throw new Error('Csak telefonon érhető el');
  const rows = recentEntries(ctx, 100_000);
  const header = ['date', 'created_at', 'reason', 'delta', 'multiplier', 'ref_type', 'ref_id', 'reverses_id', 'note'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [r.date, r.createdAt, r.reason, r.delta, r.multiplier, r.refType, r.refId, r.reversesId, r.note].map(csvEscape).join(','),
    );
  }
  const dest = new File(Paths.cache, `lifeos-pontok-${stamp()}.csv`);
  if (dest.exists) dest.delete();
  dest.write(lines.join('\n'));
  await Sharing.shareAsync(dest.uri, { mimeType: 'text/csv', dialogTitle: 'Pont-történet CSV' });
  return dest.uri;
}

export type ImportResult = 'canceled' | 'restored';

/**
 * Replaces the live database with a picked backup file. The app must be restarted
 * afterwards: the open connection and every in-memory snapshot still point at the old data.
 */
export async function importDatabase(): Promise<ImportResult> {
  if (!isBackupSupported) throw new Error('Csak telefonon érhető el');
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets[0]) return 'canceled';
  const picked = new File(res.assets[0].uri);
  const head = new TextDecoder().decode((await picked.bytes()).slice(0, 15));
  if (head !== SQLITE_HEADER) throw new Error('Ez nem LifeOS adatbázis-mentés (.db)');

  getSqlite().closeSync();
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const f = new File(defaultDatabaseDirectory, DB_NAME + suffix);
    if (f.exists) f.delete();
  }
  picked.copy(dbFile());
  return 'restored';
}
