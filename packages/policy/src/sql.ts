import sqlParser from "node-sql-parser";

const parser = new sqlParser.Parser();

/** Wildcard column, as in `select *` or `select o.*`. */
export const ALL_COLUMNS = "*";

export interface ColumnRef {
  /** Resolved table name without schema, or null when the parser could not resolve it. */
  table: string | null;
  column: string;
  access: "read" | "write";
}

export type SqlAnalysis =
  | { ok: true; tables: Set<string>; writeTables: Set<string>; columns: ColumnRef[] }
  | { ok: false; error: string };

const WRITE_TYPES = new Set(["insert", "update", "delete", "replace"]);

function stripSchema(name: string): string {
  const parts = name.split(".");
  return (parts[parts.length - 1] ?? name).toLowerCase();
}

function normalizeColumn(name: string): string {
  return name === "(.*)" ? ALL_COLUMNS : name.toLowerCase();
}

/**
 * Lists the tables and columns a Postgres statement touches. Aliases are resolved
 * by the parser; unqualified columns come back with `table: null`.
 */
export function analyzeSql(sql: string): SqlAnalysis {
  let result: { tableList: string[]; columnList: string[] };
  try {
    result = parser.parse(sql, { database: "postgresql" });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const tables = new Set<string>();
  const writeTables = new Set<string>();
  for (const entry of result.tableList) {
    const [type = "", schema = "null", table = ""] = entry.split("::");
    const name = stripSchema(schema === "null" ? table : `${schema}.${table}`);
    tables.add(name);
    if (WRITE_TYPES.has(type)) writeTables.add(name);
  }

  const columns: ColumnRef[] = result.columnList.map((entry) => {
    const [type = "", table = "null", column = ""] = entry.split("::");
    return {
      table: table === "null" ? null : stripSchema(table),
      column: normalizeColumn(column),
      access: WRITE_TYPES.has(type) ? "write" : "read",
    };
  });

  return { ok: true, tables, writeTables, columns };
}

/**
 * True if `ref` may touch `table.column`. Unresolved and wildcard references count
 * when the table is in scope: a guardrail fails closed.
 */
export function touches(
  ref: ColumnRef,
  table: string,
  column: string,
  tablesInScope: Set<string>,
): boolean {
  const columnMatches = ref.column === column || ref.column === ALL_COLUMNS;
  if (!columnMatches) return false;
  if (ref.table !== null) return ref.table === table;
  return tablesInScope.has(table);
}
