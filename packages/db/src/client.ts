/** The minimal database surface Fola needs, so tests can run on PGlite and prod on postgres.js. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs one or more statements without parameters. */
  exec(sql: string): Promise<void>;
}

/** Runs `fn` in a transaction. Requires a Db pinned to a single connection. */
export async function transaction<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    const result = await fn();
    await db.exec("commit");
    return result;
  } catch (err) {
    await db.exec("rollback");
    throw err;
  }
}
