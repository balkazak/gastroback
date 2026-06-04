import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const run = async () => {
  const client = await pool.connect();
  try {
    const productsFilePath = path.join(process.cwd(), '../frontend/src/data/products.json');
    if (fs.existsSync(productsFilePath)) {
      const rawData = fs.readFileSync(productsFilePath, 'utf8');
      const productsList = JSON.parse(rawData);
      await client.query('BEGIN');
      for (const item of productsList) {
        await client.query(
          `INSERT INTO products (id, name, price, category, unit, manufacturer) VALUES ($1, $2, $3, $4, $5, $6) 
           ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, name = EXCLUDED.name, category = EXCLUDED.category, unit = EXCLUDED.unit, manufacturer = EXCLUDED.manufacturer`,
          [item.id, item.name, item.price, item.category, item.unit, item.manufacturer]
        );
      }
      await client.query('COMMIT');
      console.log(`Successfully synchronized ${productsList.length} products to database.`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
};

run();
