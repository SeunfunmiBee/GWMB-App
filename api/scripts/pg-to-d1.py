"""Generate D1 (SQLite) DDL from a Postgres database that has every supabase/migrations file applied.

Usage: python scripts/pg-to-d1.py "<psql connection args>" > migrations/0003_app_schema.sql
Anything that cannot be translated safely is listed in a trailing comment block (the "ledger")
so it can be re-implemented in Worker code. It is never silently dropped.
"""
import json
import re
import shlex
import subprocess
import sys

PSQL = sys.argv[1] if len(sys.argv) > 1 else "-h localhost -p 55432 -U postgres -d gwmb"
SKIP = {"profiles", "memberships", "membership_records", "app_admins"}  # hand-written in 0002_identity.sql
NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
UUID = ("(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || "
        "substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))")
ledger: list[str] = []


def q(sql: str):
    out = subprocess.run(["psql", *shlex.split(PSQL), "-tA", "-c", sql], capture_output=True, text=True, check=True).stdout.strip()
    return json.loads(out) if out else []


def sqlite_type(data_type: str, udt: str) -> str:
    if data_type in ("integer", "bigint", "smallint", "boolean"):
        return "integer"
    if data_type in ("numeric", "real", "double precision"):
        return "real"
    return "text"  # text, uuid, timestamptz, date, jsonb, arrays (JSON text)


def default(expr: str | None, table: str, col: str, data_type: str) -> str | None:
    if expr is None:
        return None
    e = expr.strip()
    if e == "now()":
        return NOW
    if e == "gen_random_uuid()":
        return UUID
    if e in ("true", "false"):
        return "1" if e == "true" else "0"
    if re.fullmatch(r"-?\d+(\.\d+)?", e):
        return e
    if e in ("'{}'::text[]", "'{}'::uuid[]", "'[]'::jsonb"):
        return "'[]'"
    if e == "'{}'::jsonb":
        return "'{}'"
    m = re.fullmatch(r"ARRAY\[(.*)\]", e)
    if m:
        items = [re.sub(r"::text$", "", i.strip()).strip("'") for i in m.group(1).split(",")]
        return "'" + json.dumps(items) + "'"
    m = re.fullmatch(r"'((?:[^']|'')*)'::(text|character varying|date)", e)
    if m:
        return f"'{m.group(1)}'"
    if e.startswith("nextval("):
        return None
    ledger.append(f"{table}.{col}: default `{e}` must be set by the Worker")
    return None


def check(defn: str, table: str) -> str | None:
    d = defn
    d = re.sub(r"(\w+) = ANY \(ARRAY\[(.*?)\]\)", lambda m: f"{m.group(1)} in ({m.group(2)})", d)
    d = re.sub(r"\((\w+) = ANY \(ARRAY\[(.*?)\]\)\)", lambda m: f"({m.group(1)} in ({m.group(2)}))", d)
    d = re.sub(r"::(text|integer|numeric|bigint)(\[\])?", "", d)
    d = d.replace("char_length(", "length(").replace("cardinality(", "json_array_length(")
    if re.search(r"<@|@>|~|\bARRAY\[|::|\bANY\b|\bALL\b", d) or re.search(r"\bregexp|similar to|date_part|extract\(", d, re.I):
        ledger.append(f"{table}: check `{defn}` not expressible in SQLite; validate in the Worker")
        return None
    return d


def index(defn: str, table: str) -> str | None:
    m = re.match(r"CREATE (UNIQUE )?INDEX (\S+) ON public\.(\S+) USING (\w+) \((.*?)\)( WHERE (.*))?$", defn)
    if not m:
        ledger.append(f"{table}: index not translated: {defn}")
        return None
    unique, name, tbl, method, cols, _, where = m.groups()
    if method != "btree":
        ledger.append(f"{table}: {method} index `{name}` dropped (array membership is filtered in the Worker)")
        return None
    cols = re.sub(r"TRIM\(BOTH FROM (.*?)\)", r"trim(\1)", cols)
    if re.search(r"normalize_\w+\(", cols):
        ledger.append(f"{table}: index `{name}` uses a SQL function; store normalized values from the Worker instead")
        return None
    sql = f"create {'unique ' if unique else ''}index {name} on {tbl} ({cols})"
    if where:
        where = re.sub(r"::text", "", where)
        if where.startswith("(") and where.endswith(")"):
            where = where[1:-1]
        where = where if re.search(r"[=<>]| is ", where, re.I) else f"{where} = 1"
        where = where.replace("= true", "= 1").replace("= false", "= 0")
        sql += f" where {where}"
    return sql + ";"


tables = [t for t in q("select json_agg(tablename order by tablename) from pg_tables where schemaname='public'") if t not in SKIP]
columns = q("""select json_agg(json_build_object('t',table_name,'c',column_name,'type',data_type,'udt',udt_name,'null',is_nullable,
  'def',column_default,'ident',is_identity) order by table_name, ordinal_position) from information_schema.columns where table_schema='public'""")
cons = q("""select json_agg(json_build_object('t',conrelid::regclass::text,'type',contype,'def',pg_get_constraintdef(oid),'name',conname,
  'cols',(select json_agg(attname order by k.ord) from unnest(conkey) with ordinality k(n,ord) join pg_attribute a on a.attrelid=conrelid and a.attnum=k.n),
  'ref',confrelid::regclass::text)) from pg_constraint where connamespace='public'::regnamespace""")
idx = q("""select json_agg(json_build_object('t',tablename,'def',indexdef)) from pg_indexes i where schemaname='public'
  and not exists (select 1 from pg_constraint c where c.conname=i.indexname and c.connamespace='public'::regnamespace)""")

deps = {t: set() for t in tables}
for c in cons:
    if c["type"] == "f" and c["t"] in deps and c["ref"] in deps and c["ref"] != c["t"]:
        deps[c["t"]].add(c["ref"])
ordered: list[str] = []
while deps:
    ready = sorted(t for t, d in deps.items() if not d - set(ordered))
    if not ready:
        raise SystemExit(f"FK cycle among: {sorted(deps)}")
    for t in ready:
        ordered.append(t)
        deps.pop(t)

print("-- Generated by api/scripts/pg-to-d1.py from the final Supabase schema (all supabase/migrations applied).")
print("-- Do not hand-edit generated tables; fix the generator or add a later migration.")
print("-- Conventions: see 0002_identity.sql. Access rules (former RLS policies) live in the Worker.\n")
for t in ordered:
    lines = []
    tcols = [c for c in columns if c["t"] == t]
    tcons = [c for c in cons if c["t"] == t]
    pk = next((c["cols"] for c in tcons if c["type"] == "p"), [])
    for c in tcols:
        if c["ident"] == "YES":
            lines.append(f"  {c['c']} integer primary key autoincrement")
            continue
        col = f"  {c['c']} {sqlite_type(c['type'], c['udt'])}"
        if pk == [c["c"]]:
            col += " primary key"
        if c["null"] == "NO" and pk != [c["c"]]:
            col += " not null"
        d = default(c["def"], t, c["c"], c["type"])
        if d is not None:
            col += f" default {d}"
        lines.append(col)
    if len(pk) > 1:
        lines.append(f"  primary key ({', '.join(pk)})")
    for c in tcons:
        if c["type"] == "u":
            lines.append(f"  unique ({', '.join(c['cols'])})")
        elif c["type"] == "f":
            ref = '"user"' if c["ref"] == "auth.users" else c["ref"]
            m = re.search(r"REFERENCES \S+?\((.*?)\)(.*)$", c["def"])
            tail = re.sub(r"\s*not valid$", "", m.group(2).strip().lower()) if m else ""  # Postgres-only option
            lines.append(f"  foreign key ({', '.join(c['cols'])}) references {ref}({m.group(1) if m else 'id'}){(' ' + tail) if tail else ''}")
        elif c["type"] == "c":
            ck = check(c["def"], t)
            if ck:
                lines.append("  " + re.sub(r"^CHECK", "check", ck))
    print(f"create table {t} (\n" + ",\n".join(lines) + "\n);")
    for i in idx:
        if i["t"] == t:
            s = index(i["def"], t)
            if s:
                print(s)
    if any(c["c"] == "updated_at" for c in tcols) and pk:
        key = " and ".join(f"{k} = new.{k}" for k in pk)
        print(f"create trigger {t}_updated_at after update on {t} for each row when new.updated_at = old.updated_at\n"
              f"begin update {t} set updated_at = {NOW} where {key}; end;")
    print()

print("-- LEDGER: items the Worker must implement (generator could not translate them)")
for item in ledger:
    print(f"--   {item}")

# Column kinds for row decoding/encoding in the Worker (D1 returns 0/1 and JSON text).
if len(sys.argv) > 2:
    kinds: dict[str, dict[str, list[str]]] = {}
    for c in columns:
        kind = "bool" if c["type"] == "boolean" else "json" if c["type"] in ("jsonb", "json", "ARRAY") else \
            "time" if c["type"] == "timestamp with time zone" else None
        if kind:
            kinds.setdefault(c["t"], {"bool": [], "json": [], "time": []})[kind].append(c["c"])
    with open(sys.argv[2], "w", encoding="utf-8") as out:
        out.write("// Generated by api/scripts/pg-to-d1.py. Column kinds per table, used by src/db.ts.\n")
        out.write("export const COLUMN_KINDS: Record<string, { bool: string[]; json: string[]; time: string[] }> = ")
        out.write(json.dumps(dict(sorted(kinds.items())), indent=2))
        out.write(";\n")
