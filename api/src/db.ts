// Row conversion between D1 and the shapes the app used with Postgres:
// booleans are stored 0/1, JSON/arrays as text, timestamps as UTC ISO text (so text comparison = time order).
import { COLUMN_KINDS } from './db-columns';
import { HttpError } from './http';

type Row = Record<string, unknown>;

export function decode<T = Row>(table: string, row: Row | null | undefined): T | null {
  if (!row) return null;
  const kinds = COLUMN_KINDS[table];
  if (!kinds) return row as T;
  const out: Row = { ...row };
  for (const col of kinds.bool) if (col in out && out[col] !== null) out[col] = out[col] === 1 || out[col] === true;
  for (const col of kinds.json) {
    if (typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col] as string); } catch { /* leave as text */ }
    }
  }
  return out as T;
}

export const decodeAll = <T = Row>(table: string, rows: Row[]) => rows.map((row) => decode<T>(table, row) as T);

/** Converts values for writing. Timestamps must parse as dates; they are stored as UTC ISO strings. */
export function encode(table: string, values: Row): Row {
  const kinds = COLUMN_KINDS[table] ?? { bool: [], json: [], time: [] };
  const out: Row = {};
  for (const [col, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (value === null) out[col] = null;
    else if (kinds.bool.includes(col)) out[col] = value ? 1 : 0;
    else if (kinds.json.includes(col)) out[col] = JSON.stringify(value);
    else if (kinds.time.includes(col)) out[col] = isoTime(value, col);
    else out[col] = value;
  }
  return out;
}

export function isoTime(value: unknown, label = 'date') {
  const time = typeof value === 'string' || typeof value === 'number' || value instanceof Date ? new Date(value) : new Date(NaN);
  if (Number.isNaN(time.getTime())) throw new HttpError(400, `Invalid ${label.replace(/_/g, ' ')}.`);
  return time.toISOString();
}

/** `insert into <table> (...) values (...) returning *` for already-validated, whitelisted values. */
export async function insertRow<T = Row>(db: D1Database, table: string, values: Row): Promise<T> {
  const data = encode(table, values);
  const cols = Object.keys(data);
  const row = await db.prepare(`insert into ${table} (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')}) returning *`)
    .bind(...cols.map((c) => data[c])).first<Row>();
  return decode<T>(table, row) as T;
}

/** `update <table> set ... where <key> = ? returning *`; returns null when no row matched. */
export async function updateRow<T = Row>(db: D1Database, table: string, key: string, id: string, values: Row): Promise<T | null> {
  const data = encode(table, values);
  const cols = Object.keys(data);
  if (!cols.length) return decode<T>(table, await db.prepare(`select * from ${table} where ${key} = ?`).bind(id).first<Row>());
  const row = await db.prepare(`update ${table} set ${cols.map((c) => `${c} = ?`).join(', ')} where ${key} = ? returning *`)
    .bind(...cols.map((c) => data[c]), id).first<Row>();
  return decode<T>(table, row);
}
