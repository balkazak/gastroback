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
    console.log("Inspecting columns of table 'payments'...");
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'payments';
    `);
    console.log("Columns:", cols.rows);

    console.log("\nQuerying first 5 rows from payments...");
    const rows = await client.query("SELECT * FROM payments LIMIT 5");
    console.log("Rows:", rows.rows);
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
