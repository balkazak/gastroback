import fs from 'fs';
import path from 'path';

const csvPath = path.join(process.cwd(), '../frontend/src/assets/docs/final prices.csv');
const jsonPath = path.join(process.cwd(), '../frontend/src/data/products.json');

if (!fs.existsSync(csvPath) || !fs.existsSync(jsonPath)) {
  console.error('Files not found');
  process.exit(1);
}

const csvData = fs.readFileSync(csvPath, 'utf8');
const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

const lines = csvData.split('\n').map(l => l.trim()).filter(Boolean);
const csvProducts = [];
let currentCategory = 'Бакалея';

for (const line of lines) {
  if (line.includes('ПРАЙС CASTROMIR ОБЩИЙ') || line.includes('Дата:') || line.includes('Склад:')) {
    continue;
  }
  const parts = parseCSVLine(line);
  if (parts.length < 2) continue;

  if (parts[0] === '' && parts[1] && !parts[2]) {
    const cat = parts[1].replace(/["']/g, '').trim();
    if (cat && isNaN(Number(cat))) {
      currentCategory = cat;
    }
    continue;
  }

  const num = parts[0];
  const name = parts[1];
  const priceStr = parts[2];
  const manufacturer = parts[3] || '';

  if (num && !isNaN(Number(num)) && name && priceStr) {
    const price = parseFloat(priceStr.replace(/,/g, ''));
    if (!isNaN(price)) {
      csvProducts.push({
        num: parseInt(num, 10),
        name,
        price,
        category: currentCategory,
        manufacturer
      });
    }
  }
}

console.log(`Parsed ${csvProducts.length} items from CSV.`);

let updatedCount = 0;
const normalizedKey = (str) => {
  return str.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
};

for (const csvProd of csvProducts) {
  const normCSV = normalizedKey(csvProd.name);
  let matched = jsonData.find(p => normalizedKey(p.name) === normCSV);
  
  if (!matched) {
    matched = jsonData.find(p => {
      const normP = normalizedKey(p.name);
      return normP.includes(normCSV) || normCSV.includes(normP);
    });
  }

  if (matched) {
    if (matched.price !== csvProd.price) {
      matched.price = csvProd.price;
      updatedCount++;
    }
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');
console.log(`Successfully updated ${updatedCount} product prices in products.json.`);
