import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "./db";

const MIGRATION_LOCK_KEY = 784239105;

async function main() {
  const configuredDir = process.env.MIGRATIONS_DIR;
  const dir = configuredDir
    ? path.resolve(configuredDir)
    : path.resolve(process.cwd(), "database/migrations");

  const files = (await fs.readdir(dir)).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
  if (!files.length) throw new Error(`No migrations found in ${dir}`);

  const client = await pool.connect();
  try {
    // Serialize migration runners so two production instances cannot apply the same migration concurrently.
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      for (const file of files) {
        const already = await client.query("SELECT 1 FROM schema_migrations WHERE version=$1", [file]);
        if (already.rowCount) {
          console.log(`Skipping ${file} (already applied)`);
          continue;
        }

        console.log(`Applying ${file}`);
        const sql = await fs.readFile(path.join(dir, file), "utf8");
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [file]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
