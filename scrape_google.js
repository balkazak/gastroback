import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchImageUrl(query) {
  try {
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=images&iax=images`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const vqdMatch = html.match(/vqd=["']([^"']+)["']/i) || html.match(/vqd=([^&'"\s]+)/i);
    if (!vqdMatch) return null;
    const vqd = vqdMatch[1];
    
    await sleep(300);
    
    const imageUrl = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&vqd=${vqd}`;
    const imgRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36',
        'Referer': 'https://duckduckgo.com/'
      }
    });
    if (!imgRes.ok) return null;
    const data = await imgRes.json();
    if (data.results && data.results.length > 0) {
      for (const item of data.results) {
        if (item.image && (item.image.startsWith('http://') || item.image.startsWith('https://'))) {
          return item.image;
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
  return null;
}

async function main() {
  const client = await pool.connect();
  try {
    const dbRes = await client.query('SELECT id, name FROM products WHERE image_url IS NULL ORDER BY id');
    const products = dbRes.rows;
    console.log(`Found ${products.length} products without images.`);
    
    let updatedCount = 0;
    let consecutiveFailures = 0;
    
    for (let i = 0; i < products.length; i++) {
      const prod = products[i];
      console.log(`[${i + 1}/${products.length}] Searching image for "${prod.name}"...`);
      const imgUrl = await fetchImageUrl(prod.name);
      if (imgUrl) {
        consecutiveFailures = 0;
        await client.query('UPDATE products SET image_url = $1 WHERE id = $2', [imgUrl, prod.id]);
        console.log(`-> Set image: ${imgUrl}`);
        updatedCount++;
      } else {
        consecutiveFailures++;
        console.log(`-> No image found. (Consecutive failures: ${consecutiveFailures})`);
        if (consecutiveFailures >= 10) {
          console.log('Too many consecutive failures. We might be rate-limited. Exiting...');
          break;
        }
      }
      await sleep(1000);
    }
    console.log(`Done! Updated ${updatedCount} products.`);
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
