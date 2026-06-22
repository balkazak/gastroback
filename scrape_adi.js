import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const cleanWord = (w) => {
  const translations = {
    'aroyd': 'арой',
    'aroy': 'арой',
    'аройд': 'арой',
    'арой': 'арой',
    'granoro': 'граноро',
    'гранора': 'граноро',
    'lactalis': 'лакталис',
    'president': 'президент',
    'lays': 'лейс',
    'леис': 'лейс',
    'комо': 'комо',
    'komo': 'комо',
    'тамаки': 'тамаки',
    'tamaki': 'тамаки',
    'альпро': 'альпро',
    'alpro': 'альпро',
    'гринмилк': 'гринмилк',
    'greenmilk': 'гринмилк'
  };
  return translations[w] || w;
};

const getCleanWords = (name) => {
  if (!name) return [];
  let clean = name.toLowerCase();
  clean = clean.replace(/\b\d+[\s\.,]*\d*\s*(?:кг|гр|г|л|мл|шт|g|ml|kg|oz|ванночка|ящик|коробка|уп|пакет|литр|литров|х)(?![a-zA-Zа-яА-Я0-9_])/gi, ' ');
  clean = clean.replace(/\b\d+\s*(?:кг|гр|г|л|мл|шт|g|ml|kg|oz|ванночка|ящик|коробка|уп|пакет)(?![a-zA-Zа-яА-Я0-9_])/gi, ' ');
  clean = clean.replace(/["'«»“”„“\-\(\)\.,\/\*]/g, ' ');
  const words = clean.split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1)
    .map(cleanWord);
  return words;
};

async function fetchPage(offset) {
  const url = `https://adi.kz/mag/HoReCaFOOD/goods/index/${offset}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return '';
    return await response.text();
  } catch (err) {
    console.error(err);
    return '';
  }
}

function parseProducts(html) {
  const items = [];
  const cards = html.split('class="product-card"');
  if (cards.length <= 1) return items;

  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];
    const imgMatch = card.match(/<img[^>]*src="([^"]+)"[^>]*class="card_image"/);
    const nameMatch = card.match(/class="i-product-name"[\s\S]*?class="text-content">([^<]+)<\/b>/);

    if (imgMatch && nameMatch) {
      const imgUrl = imgMatch[1].trim();
      const name = nameMatch[1].trim();

      if (imgUrl !== '/e.png' && !imgUrl.includes('placeholder')) {
        const fullImgUrl = imgUrl.startsWith('http') ? imgUrl : `https://adi.kz${imgUrl}`;
        items.push({ name, imageUrl: fullImgUrl });
      }
    }
  }
  return items;
}

async function main() {
  console.log('Starting scraper...');
  const scrapedProducts = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    console.log(`Fetching offset: ${offset}...`);
    const html = await fetchPage(offset);
    if (!html) {
      hasMore = false;
      break;
    }

    const items = parseProducts(html);
    console.log(`Parsed ${items.length} items from page.`);
    if (items.length === 0) {
      hasMore = false;
      break;
    }

    scrapedProducts.push(...items);
    offset += 50;
  }

  console.log(`Total scraped products: ${scrapedProducts.length}`);

  const client = await pool.connect();
  try {
    const dbRes = await client.query('SELECT id, name, category, image_url FROM products');
    const dbProducts = dbRes.rows;

    let matchedCount = 0;
    let resetCount = 0;
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const prod of dbProducts) {
      if (prod.image_url && prod.image_url.startsWith('/uploads/')) {
        continue;
      }

      const dbWords = getCleanWords(prod.name);
      let matchedUrl = null;

      if (dbWords.length > 0) {
        for (const scrP of scrapedProducts) {
          const scrWords = getCleanWords(scrP.name);
          if (scrWords.length === 0) continue;

          let isMatch = false;
          if (dbWords.length === 1 && scrWords.length === 1) {
            isMatch = dbWords[0] === scrWords[0];
          } else if (dbWords.length >= 2 && scrWords.length >= 2) {
            const allScrInDb = scrWords.every(w => dbWords.includes(w));
            const allDbInScr = dbWords.every(w => scrWords.includes(w));
            if (allScrInDb || allDbInScr) {
              isMatch = true;
            }
          }

          if (isMatch) {
            matchedUrl = scrP.imageUrl;
            break;
          }
        }
      }

      if (matchedUrl) {
        matchedCount++;
      } else {
        resetCount++;
      }

      updates.push(`($${paramIndex}, $${paramIndex + 1})`);
      values.push(prod.id, matchedUrl);
      paramIndex += 2;
    }

    if (updates.length > 0) {
      await client.query('BEGIN');
      const queryText = `
        UPDATE products AS p SET
          image_url = v.image_url
        FROM (VALUES ${updates.join(', ')}) AS v(id, image_url)
        WHERE p.id = CAST(v.id AS INTEGER)
      `;
      await client.query(queryText, values);
      await client.query('COMMIT');
      console.log(`Database updated! Matched: ${matchedCount}, Reset to null: ${resetCount}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
