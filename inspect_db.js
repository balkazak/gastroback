import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("Inspecting columns of table 'orders'...");
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'orders';
    `);
    console.log("Columns:", cols.rows);

    console.log("\nInspecting triggers on table 'orders'...");
    const triggers = await client.query(`
      SELECT tgname, tgenabled, tgtype 
      FROM pg_trigger 
      WHERE tgrelid = 'orders'::regclass;
    `);
    console.log("Triggers:", triggers.rows);

    console.log("\nInspecting trigger functions...");
    const functions = await client.query(`
      SELECT proname, prosrc 
      FROM pg_proc 
      WHERE proname LIKE '%order%' OR proname LIKE '%payment%';
    `);
    console.log("Functions count:", functions.rows.length);
    for(const f of functions.rows) {
      console.log(`- Function: ${f.proname}\nSource:\n${f.prosrc}\n`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
