// Applies db/schema.sql to DATABASE_URL. Idempotent. Run with `npm run db:migrate`.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put it in .env.local.");
  process.exit(1);
}

const sql = neon(url);
const statements = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8")
  .replace(/--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

for (const s of statements) await sql.query(s);
const tables = await sql.query("select table_name from information_schema.tables where table_schema = 'public' order by 1");
console.log(`Applied ${statements.length} statements. Tables: ${tables.map((t) => t.table_name).join(", ")}`);
