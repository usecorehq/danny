import postgres from "postgres";
import type { Db } from "./client.js";
import { migrate } from "./migrate.js";
import { seedCoreTechnologies } from "./seed.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// One connection, so transactions in the migrator stay on the same session.
const sql = postgres(url, { max: 1, onnotice: () => {} });
const db: Db = {
  query: async (text, params = []) => (await sql.unsafe(text, params as never[])) as never,
  exec: async (text) => {
    await sql.unsafe(text);
  },
};

const command = process.argv[2];
try {
  if (command === "migrate") {
    const applied = await migrate(db);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Nothing to apply.");
  } else if (command === "seed") {
    console.log(`Seeded workspace ${await seedCoreTechnologies(db)}`);
  } else {
    console.error("Usage: cli.ts migrate|seed");
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
