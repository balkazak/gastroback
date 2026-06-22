import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));


// PostgreSQL Pool Connection
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Helper for JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Доступ запрещен: отсутствует токен' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'supersecretgastromirkey123!', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Недействительный или истекший токен' });
    }
    req.user = user;
    next();
  });
};

// Admin only middleware
const requireAdmin = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ message: 'Доступ запрещен: требуются права администратора' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при проверке прав' });
  }
};

const categoryImages = {
  'Бакалея': 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80',
  'Фрукты': 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=500&auto=format&fit=crop&q=80',
  'Овощи': 'https://images.unsplash.com/photo-1566385101042-1a010c129fa6?w=500&auto=format&fit=crop&q=80',
  'Зелень': 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=500&auto=format&fit=crop&q=80',
  'Ягоды': 'https://images.unsplash.com/photo-1513530534585-c7b1394c6d51?w=500&auto=format&fit=crop&q=80',
  'Салаты': 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop&q=80',
  'Масла и жиры': 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=80',
  'Молочные продукты': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&auto=format&fit=crop&q=80',
  'Сыры и сырные продукты': 'https://images.unsplash.com/photo-1486887396153-fa416525c108?w=500&auto=format&fit=crop&q=80',
  'Колбасные изделия и х/к': 'https://images.unsplash.com/photo-1624462966581-bc6d768cbce5?w=500&auto=format&fit=crop&q=80',
  'Морепродукты': 'https://images.unsplash.com/photo-1534080391025-a87b99835782?w=500&auto=format&fit=crop&q=80',
  'Мука и мучные изделия': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80',
  'Мясо птицы': 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=500&auto=format&fit=crop&q=80',
  'Полуфабрикаты и картофельные изделия': 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500&auto=format&fit=crop&q=80',
  'Суши бар': 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=500&auto=format&fit=crop&q=80',
  'Соусы и уксусы': 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=500&auto=format&fit=crop&q=80',
  'Консервация': 'https://images.unsplash.com/photo-1536638317175-32449e082d60?w=500&auto=format&fit=crop&q=80',
  'Крупы': 'https://images.unsplash.com/photo-1574316071802-0d684efa7bf5?w=500&auto=format&fit=crop&q=80',
  'Кондитерские': 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500&auto=format&fit=crop&q=80',
  'Орехи': 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=500&auto=format&fit=crop&q=80',
  'Приправы и специи': 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=500&auto=format&fit=crop&q=80',
  'Сиропы': 'https://images.unsplash.com/photo-1589733901241-5e56479f4747?w=500&auto=format&fit=crop&q=80',
  'Чай-кофе': 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&auto=format&fit=crop&q=80',
  'Ягоды и овощи с/м': 'https://images.unsplash.com/photo-1513530534585-c7b1394c6d51?w=500&auto=format&fit=crop&q=80',
  'Хоз.товары': 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=500&auto=format&fit=crop&q=80'
};

const nameKeywordImages = [
  { keywords: ['помидор', 'томат', 'кетчуп'], url: 'https://images.unsplash.com/photo-1595855759920-86582396756a?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['моцарелла', 'сулугуни', 'сыр'], url: 'https://images.unsplash.com/photo-1559561853-08451507cbe7?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['лосось', 'семга', 'форель', 'рыба'], url: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['хлеб', 'батон', 'булочк'], url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['креветки', 'морепрод'], url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['лимон', 'лайм', 'цитрус'], url: 'https://images.unsplash.com/photo-1590502593747-42a996133562?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['картоф'], url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['куриц', 'цыплен', 'окорок', 'крылышк'], url: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['чай'], url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['кофе', 'капучино', 'эспрессо'], url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['кола', 'cola', 'пепси', 'sprite', 'напит'], url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['вода'], url: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['лапша', 'рамен', 'фунчоза', 'спагетти', 'паста'], url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['кисель'], url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['капуста', 'брокколи'], url: 'https://images.unsplash.com/photo-1581009137042-c552e485697a?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['масло', 'оливков'], url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['творог', 'сметана', 'йогурт'], url: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['мука'], url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['выпечка', 'десерт', 'чизкейк', 'торт', 'пирог'], url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['шоколад'], url: 'https://images.unsplash.com/photo-1511381939415-e44015466834?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['конфеты', 'леденец'], url: 'https://images.unsplash.com/photo-1581798459219-318e76aecc7b?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['печенье'], url: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['ягод', 'клубника', 'малина', 'черника', 'вишня'], url: 'https://images.unsplash.com/photo-1513530534585-c7b1394c6d51?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['фрукт', 'банан', 'яблок', 'апельсин'], url: 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['огур'], url: 'https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['гриб', 'шампиньон'], url: 'https://images.unsplash.com/photo-1571244856003-9d5df1b99a65?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['укроп', 'петрушк', 'салат', 'базилик', 'зелень'], url: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['соус', 'майонез'], url: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['рис'], url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['суши', 'ролл'], url: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['пицца'], url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop&q=80' },
  { keywords: ['упаковка', 'коробк', 'стакан', 'пакет'], url: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=500&auto=format&fit=crop&q=80' }
];

const initDatabase = async () => {
  const client = await pool.connect();
  try {
    console.log('Connecting to Neon PostgreSQL for full migration & seeding...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'restaurant',
        order_limit NUMERIC(12, 2) DEFAULT 500000.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'restaurant';
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS order_limit NUMERIC(12, 2) DEFAULT 500000.00;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS discount NUMERIC(5, 2) DEFAULT 0.00;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS shipped_amount NUMERIC(12, 2) DEFAULT 0.00;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0.00;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS overdue_amount NUMERIC(12, 2) DEFAULT 0.00;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bin_iin VARCHAR(50);
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bank VARCHAR(255);
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS kbe VARCHAR(20);
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bic VARCHAR(50);
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS account_number VARCHAR(100);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price NUMERIC(12, 2) NOT NULL,
        category VARCHAR(100) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        manufacturer VARCHAR(255) NOT NULL
      );
    `);
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS is_in_stock BOOLEAN DEFAULT TRUE;
    `);
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
    `);
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        total_price NUMERIC(12, 2) NOT NULL,
        items JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(5, 2) DEFAULT 0.00;
    `);
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_price NUMERIC(12, 2);
    `);
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS waybill_number VARCHAR(100);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(12, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const adminEmail = 'admin@gastromir.kz';
    const adminCheck = await client.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
    if (adminCheck.rows.length === 0) {
      const salt = await bcrypt.genSalt(10);
      const hashedAdminPassword = await bcrypt.hash('admin', salt);
      await client.query(
        `INSERT INTO users (name, email, password, role, order_limit) VALUES ($1, $2, $3, $4, $5)`,
        ['Администратор', adminEmail, hashedAdminPassword, 'admin', 999999999.00]
      );
      console.log('Seeded default admin account (admin@gastromir.kz / admin)');
    }

    const countResult = await client.query('SELECT COUNT(*) FROM products');
    const isDbEmpty = parseInt(countResult.rows[0].count, 10) === 0;

    if (isDbEmpty) {
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
        console.log(`Synchronized ${productsList.length} products successfully into PostgreSQL.`);
      }

      const newItems = [
        { category: 'Напитки', name: 'Вода', unit: 'шт' },
        { category: 'Напитки', name: 'Газированные напитки', unit: 'шт' },
        { category: 'Напитки', name: 'Соки и нектары', unit: 'шт' },
        { category: 'Напитки', name: 'Морсы', unit: 'шт' },
        { category: 'Напитки', name: 'Энергетические напитки', unit: 'шт' },
        { category: 'Напитки', name: 'Чай и кофе', unit: 'шт' },
        { category: 'Напитки', name: 'Сиропы и основы', unit: 'шт' },

        { category: 'Сладости', name: 'Шоколад', unit: 'шт' },
        { category: 'Сладости', name: 'Конфеты', unit: 'шт' },
        { category: 'Сладости', name: 'Печенье', unit: 'шт' },

        { category: 'Сублимированные ягоды и фрукты', name: 'Сублимированные ягоды', unit: 'шт' },
        { category: 'Сублимированные ягоды и фрукты', name: 'Сублимированные фрукты', unit: 'шт' },

        { category: 'Готовая продукция', name: 'Выпечка', unit: 'шт' },
        { category: 'Готовая продукция', name: 'Десерты', unit: 'шт' },
        { category: 'Готовая продукция', name: 'Сладости', unit: 'шт' },
        { category: 'Готовая продукция', name: 'Чизкейки', unit: 'шт' },

        { category: 'Упаковка и доставка', name: 'Пицца (коробки)', unit: 'шт' },
        { category: 'Упаковка и доставка', name: 'Супы и горячие (контейнеры)', unit: 'шт' },
        { category: 'Упаковка и доставка', name: 'Ланч-боксы (основные блюда)', unit: 'шт' },
        { category: 'Упаковка и доставка', name: 'Салаты (контейнеры)', unit: 'шт' },
        { category: 'Упаковка и доставка', name: 'Стаканы и напитки (стаканы, крышки, трубочки)', unit: 'шт' },
        { category: 'Упаковка и доставка', name: 'Соусы (соусники)', unit: 'шт' },
        { category: 'Упаковка и доставка', name: 'Одноразовая посуда (приборы, тарелки, салфетки)', unit: 'шт' },
        { category: 'Упаковка и доставка', name: 'Пакеты и упаковка (крафт, доставка)', unit: 'шт' }
      ];

      let seededCount = 0;
      for (const item of newItems) {
        const check = await client.query('SELECT id FROM products WHERE name = $1 AND category = $2', [item.name, item.category]);
        if (check.rows.length === 0) {
          await client.query(
            `INSERT INTO products (name, price, category, unit, manufacturer) VALUES ($1, 0.00, $2, $3, 'Не указан')`,
            [item.name, item.category, item.unit]
          );
          seededCount++;
        }
      }
      if (seededCount > 0) {
        console.log(`Seeded ${seededCount} new custom products successfully into database.`);
      }
    }

    const result = await client.query('SELECT id, name, category, image_url FROM products WHERE image_url IS NULL');
    if (result.rows.length > 0) {
      const updates = [];
      const values = [];
      let index = 1;
      for (const row of result.rows) {
        let matchedUrl = null;
        const lowerName = row.name.toLowerCase();
        for (const item of nameKeywordImages) {
          if (item.keywords.some(kw => lowerName.includes(kw))) {
            matchedUrl = item.url;
            break;
          }
        }
        if (!matchedUrl) {
          matchedUrl = categoryImages[row.category];
        }
        if (matchedUrl) {
          updates.push(`($${index}, $${index + 1})`);
          values.push(row.id, matchedUrl);
          index += 2;
        }
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
        console.log(`Successfully seeded ${updates.length} product images in bulk.`);
      }
    }

    console.log('Neon Database full migration & seeding finished successfully.');
  } catch (err) {
    console.error('Error during database initialization:', err);
  } finally {
    client.release();
  }
};

initDatabase();

const saveUploadedImage = (productId, base64String) => {
  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 string');
  }
  const extension = matches[1].split('/')[1] || 'jpg';
  const buffer = Buffer.from(matches[2], 'base64');
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const fileName = `product_${productId}_${Date.now()}.${extension}`;
  const filePath = path.join(uploadsDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${fileName}`;
};

const deleteProductImageFile = (imageUrl) => {
  if (imageUrl && imageUrl.startsWith('/uploads/')) {
    const fileName = imageUrl.replace('/uploads/', '');
    const filePath = path.join(process.cwd(), 'uploads', fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(err);
      }
    }
  }
};

// --- Auth APIs ---


// 1. Register User (Restaurant)
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone, address, bin_iin, bank, kbe, bic, account_number } = req.body;

  if (!name || !email || !password || !phone || !address) {
    return res.status(400).json({ message: 'Все поля обязательны для заполнения' });
  }

  try {
    const userExist = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userExist.rows.length > 0) {
      return res.status(400).json({ message: 'Пользователь с такой почтой уже существует' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await pool.query(
      `INSERT INTO users (name, email, password, role, order_limit, phone, address, bin_iin, bank, kbe, bic, account_number, discount) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0.00) 
       RETURNING id, name, email, role, order_limit, phone, address, bin_iin, bank, kbe, bic, account_number, discount, created_at`,
      [name, email.toLowerCase(), hashedPassword, 'restaurant', 500000.00, phone, address, bin_iin, bank, kbe, bic, account_number]
    );

    const token = jwt.sign(
      { id: newUser.rows[0].id, email: newUser.rows[0].email },
      process.env.JWT_SECRET || 'supersecretgastromirkey123!',
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      user: {
        ...newUser.rows[0],
        order_limit: parseFloat(newUser.rows[0].order_limit),
        discount: parseFloat(newUser.rows[0].discount || 0),
        total_orders_sum: 0.00
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при регистрации' });
  }
});

// 2. Login User (Restaurant or Admin)
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Все поля обязательны для заполнения' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Неверная почта или пароль' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Неверная почта или пароль' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'supersecretgastromirkey123!',
      { expiresIn: '30d' }
    );

    const sumResult = await pool.query('SELECT COALESCE(SUM(total_price), 0) as total_sum FROM orders WHERE user_id = $1', [user.id]);
    const totalOrdersSum = parseFloat(sumResult.rows[0].total_sum);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        order_limit: parseFloat(user.order_limit),
        discount: parseFloat(user.discount || 0),
        phone: user.phone,
        address: user.address,
        bin_iin: user.bin_iin,
        bank: user.bank,
        kbe: user.kbe,
        bic: user.bic,
        account_number: user.account_number,
        created_at: user.created_at,
        total_orders_sum: totalOrdersSum
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при авторизации' });
  }
});

// 3. Get Authenticated User Profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, role, order_limit, discount, phone, address, bin_iin, bank, kbe, bic, account_number, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    const sumResult = await pool.query('SELECT COALESCE(SUM(total_price), 0) as total_sum FROM orders WHERE user_id = $1', [req.user.id]);
    const totalOrdersSum = parseFloat(sumResult.rows[0].total_sum);
    const user = result.rows[0];
    user.order_limit = parseFloat(user.order_limit);
    user.discount = parseFloat(user.discount || 0);
    user.total_orders_sum = totalOrdersSum;
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при получении данных' });
  }
});

// 4. Update Authenticated User Profile
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  const { phone, address, password, bin_iin, bank, kbe, bic, account_number } = req.body;

  try {
    let query = 'UPDATE users SET phone = $1, address = $2, bin_iin = $4, bank = $5, kbe = $6, bic = $7, account_number = $8';
    const params = [phone, address, req.user.id, bin_iin, bank, kbe, bic, account_number];

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ message: 'Пароль должен содержать минимум 6 символов' });
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      query += ', password = $9 WHERE id = $3';
      params.push(hashedPassword);
    } else {
      query += ' WHERE id = $3';
    }

    query += ' RETURNING id, name, email, role, order_limit, discount, phone, address, bin_iin, bank, kbe, bic, account_number, created_at';

    const result = await pool.query(query, params);

    const sumResult = await pool.query('SELECT COALESCE(SUM(total_price), 0) as total_sum FROM orders WHERE user_id = $1', [req.user.id]);
    const totalOrdersSum = parseFloat(sumResult.rows[0].total_sum);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const user = result.rows[0];
    user.order_limit = parseFloat(user.order_limit);
    user.discount = parseFloat(user.discount || 0);
    user.total_orders_sum = totalOrdersSum;

    res.json({
      message: 'Профиль успешно обновлен',
      user
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при обновлении профиля' });
  }
});

// --- Dynamic Catalog APIs ---

// 1. Get All Products
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY category, name');
    const formattedProducts = result.rows.map(p => ({
      ...p,
      price: parseFloat(p.price)
    }));
    res.json(formattedProducts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при загрузке каталога' });
  }
});

// --- Orders / Invoices APIs ---

// 1. Place New Order (Checkout)
app.post('/api/orders', authenticateToken, async (req, res) => {
  const { items, totalPrice, discount, originalPrice } = req.body;

  if (!items || items.length === 0 || !totalPrice) {
    return res.status(400).json({ message: 'Корзина пуста' });
  }

  try {
    // Fetch current user details
    const userQuery = await pool.query('SELECT order_limit, discount FROM users WHERE id = $1', [req.user.id]);
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ message: 'Ресторан не найден' });
    }

    const orderLimit = parseFloat(userQuery.rows[0].order_limit);
    const userDiscount = parseFloat(userQuery.rows[0].discount || 0);

    // Verify limit constraint
    const sumResult = await pool.query('SELECT COALESCE(SUM(total_price), 0) as total_sum FROM orders WHERE user_id = $1', [req.user.id]);
    const totalOrdersSum = parseFloat(sumResult.rows[0].total_sum);

    if (totalOrdersSum + parseFloat(totalPrice) > orderLimit) {
      return res.status(400).json({ 
        message: `Сумма заказа (${totalPrice.toLocaleString()} ₸) с учетом предыдущих накладных (${totalOrdersSum.toLocaleString()} ₸) превышает ваш установленный лимит (${orderLimit.toLocaleString()} ₸)` 
      });
    }

    // Insert order record
    const newOrder = await pool.query(
      'INSERT INTO orders (user_id, total_price, items, discount, original_price) VALUES ($1, $2, $3, $4, $5) RETURNING id, total_price, items, discount, original_price, created_at',
      [req.user.id, totalPrice, JSON.stringify(items), discount !== undefined ? discount : userDiscount, originalPrice !== undefined ? originalPrice : totalPrice]
    );

    res.status(201).json({
      message: 'Заказ успешно оформлен',
      order: {
        ...newOrder.rows[0],
        total_price: parseFloat(newOrder.rows[0].total_price),
        discount: parseFloat(newOrder.rows[0].discount || 0),
        original_price: parseFloat(newOrder.rows[0].original_price || newOrder.rows[0].total_price)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при оформлении заказа' });
  }
});

// 2. Fetch Order History
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    // Check role
    const userQuery = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    const role = userQuery.rows[0]?.role;

    let result;
    if (role === 'admin') {
      result = await pool.query(`
        SELECT o.id, o.total_price, o.items, o.discount, o.original_price, o.created_at, o.waybill_number,
               u.name as restaurant_name, u.email as restaurant_email,
               u.phone as restaurant_phone, u.address as restaurant_address,
               u.bin_iin as restaurant_bin_iin, u.bank as restaurant_bank,
               u.kbe as restaurant_kbe, u.bic as restaurant_bic,
               u.account_number as restaurant_account_number
        FROM orders o
        JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
      `);
    } else {
      // Restaurant sees only their own orders
      result = await pool.query(
        'SELECT id, total_price, items, discount, original_price, created_at, waybill_number FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
        [req.user.id]
      );
    }

    const formattedOrders = result.rows.map(o => ({
      ...o,
      total_price: parseFloat(o.total_price),
      discount: parseFloat(o.discount || 0),
      original_price: parseFloat(o.original_price || o.total_price)
    }));

    res.json(formattedOrders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при загрузке истории заказов' });
  }
});

app.put('/api/orders/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { items, totalPrice, discount, originalPrice } = req.body;

  if (!items || items.length === 0 || totalPrice === undefined || isNaN(totalPrice)) {
    return res.status(400).json({ message: 'Некорректные данные накладной' });
  }

  try {
    const orderCheck = await pool.query('SELECT user_id FROM orders WHERE id = $1', [parseInt(id, 10)]);
    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Накладная не найдена' });
    }

    if (orderCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ message: 'Доступ запрещен' });
    }

    const userQuery = await pool.query('SELECT order_limit, discount FROM users WHERE id = $1', [req.user.id]);
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ message: 'Ресторан не найден' });
    }

    const orderLimit = parseFloat(userQuery.rows[0].order_limit);
    const userDiscount = parseFloat(userQuery.rows[0].discount || 0);

    const sumResult = await pool.query('SELECT COALESCE(SUM(total_price), 0) as total_sum FROM orders WHERE user_id = $1 AND id != $2', [req.user.id, parseInt(id, 10)]);
    const totalOrdersSum = parseFloat(sumResult.rows[0].total_sum);

    if (totalOrdersSum + parseFloat(totalPrice) > orderLimit) {
      return res.status(400).json({ 
        message: `Сумма заказа (${totalPrice.toLocaleString()} ₸) с учетом других накладных (${totalOrdersSum.toLocaleString()} ₸) превышает ваш установленный лимит (${orderLimit.toLocaleString()} ₸)` 
      });
    }

    const finalDiscount = discount !== undefined ? discount : userDiscount;
    const finalOriginalPrice = originalPrice !== undefined ? originalPrice : totalPrice;

    const updateResult = await pool.query(
      'UPDATE orders SET items = $1, total_price = $2, discount = $3, original_price = $4 WHERE id = $5 RETURNING *',
      [JSON.stringify(items), totalPrice, finalDiscount, finalOriginalPrice, parseInt(id, 10)]
    );

    res.json({
      message: 'Накладная успешно обновлена',
      order: {
        ...updateResult.rows[0],
        total_price: parseFloat(updateResult.rows[0].total_price),
        discount: parseFloat(updateResult.rows[0].discount || 0),
        original_price: parseFloat(updateResult.rows[0].original_price || updateResult.rows[0].total_price)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при обновлении накладной' });
  }
});

// --- Admin Features APIs ---

// 1. Get Registered Restaurants List
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, order_limit, discount, shipped_amount, paid_amount, overdue_amount, created_at, phone, address, bin_iin, bank, kbe, bic, account_number 
       FROM users 
       WHERE role = 'restaurant' 
       ORDER BY created_at DESC`
    );
    const restaurants = result.rows.map(r => ({
      ...r,
      order_limit: parseFloat(r.order_limit),
      discount: parseFloat(r.discount || 0),
      shipped_amount: parseFloat(r.shipped_amount || 0),
      paid_amount: parseFloat(r.paid_amount || 0),
      overdue_amount: parseFloat(r.overdue_amount || 0)
    }));
    res.json(restaurants);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при загрузке ресторанов' });
  }
});

// 2. Set credit limit for user
app.put('/api/admin/users/:id/limit', authenticateToken, requireAdmin, async (req, res) => {
  const { limit } = req.body;
  const { id } = req.params;

  if (limit === undefined || isNaN(limit)) {
    return res.status(400).json({ message: 'Некорректная сумма лимита' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET order_limit = $1 WHERE id = $2 RETURNING id, name, order_limit',
      [limit, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ресторан не найден' });
    }

    res.json({
      message: 'Лимит успешно обновлен',
      user: {
        ...result.rows[0],
        order_limit: parseFloat(result.rows[0].order_limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при обновлении лимита' });
  }
});

// 2.0.1 Update settlements/debts details for user
app.put('/api/admin/users/:id/debts', authenticateToken, requireAdmin, async (req, res) => {
  const { shipped_amount, paid_amount, overdue_amount } = req.body;
  const { id } = req.params;

  if (shipped_amount === undefined || paid_amount === undefined || overdue_amount === undefined ||
      isNaN(shipped_amount) || isNaN(paid_amount) || isNaN(overdue_amount)) {
    return res.status(400).json({ message: 'Некорректные данные взаиморасчетов' });
  }

  try {
    const result = await pool.query(
      `UPDATE users 
       SET shipped_amount = $1, paid_amount = $2, overdue_amount = $3 
       WHERE id = $4 
       RETURNING id, name, shipped_amount, paid_amount, overdue_amount`,
      [parseFloat(shipped_amount), parseFloat(paid_amount), parseFloat(overdue_amount), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ресторан не найден' });
    }

    res.json({
      message: 'Данные взаиморасчетов успешно обновлены',
      user: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        shipped_amount: parseFloat(result.rows[0].shipped_amount),
        paid_amount: parseFloat(result.rows[0].paid_amount),
        overdue_amount: parseFloat(result.rows[0].overdue_amount)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при обновлении взаиморасчетов' });
  }
});

// --- Payments Log APIs ---

// 1. Get all payments (Admin only)
app.get('/api/admin/payments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.user_id, p.amount, p.created_at, u.name as restaurant_name 
      FROM payments p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `);
    const payments = result.rows.map(p => ({
      ...p,
      amount: parseFloat(p.amount)
    }));
    res.json(payments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при загрузке оплат' });
  }
});

// 2. Add new payment transaction (Admin only)
app.post('/api/admin/payments', authenticateToken, requireAdmin, async (req, res) => {
  const { user_id, amount, created_at } = req.body;

  if (!user_id || amount === undefined || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Некорректная сумма или ресторан' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Insert payment record (use custom created_at if provided)
    const insertQuery = created_at 
      ? 'INSERT INTO payments (user_id, amount, created_at) VALUES ($1, $2, $3) RETURNING id, user_id, amount, created_at'
      : 'INSERT INTO payments (user_id, amount) VALUES ($1, $2) RETURNING id, user_id, amount, created_at';
    
    const insertParams = created_at ? [user_id, parseFloat(amount), created_at] : [user_id, parseFloat(amount)];
    const paymentRes = await client.query(insertQuery, insertParams);

    // Increment user paid_amount
    await client.query(
      'UPDATE users SET paid_amount = paid_amount + $1 WHERE id = $2',
      [parseFloat(amount), user_id]
    );

    await client.query('COMMIT');
    res.status(201).json({
      message: 'Оплата успешно зарегистрирована',
      payment: {
        ...paymentRes.rows[0],
        amount: parseFloat(paymentRes.rows[0].amount)
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при регистрации оплаты' });
  } finally {
    client.release();
  }
});

// 3. Delete a payment transaction (Admin only)
app.delete('/api/admin/payments/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch the payment amount and user_id first
    const paymentQuery = await client.query('SELECT user_id, amount FROM payments WHERE id = $1', [id]);
    if (paymentQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Оплата не найдена' });
    }

    const { user_id, amount } = paymentQuery.rows[0];

    // Delete payment record
    await client.query('DELETE FROM payments WHERE id = $1', [id]);

    // Decrement user paid_amount
    await client.query(
      'UPDATE users SET paid_amount = GREATEST(0, paid_amount - $1) WHERE id = $2',
      [parseFloat(amount), user_id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Оплата успешно удалена' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при удалении оплаты' });
  } finally {
    client.release();
  }
});

// Update a payment transaction (Admin only)
app.put('/api/admin/payments/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { amount, created_at, user_id } = req.body;

  if (amount === undefined || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Некорректная сумма оплаты' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch the old payment amount and user_id first
    const paymentQuery = await client.query('SELECT user_id, amount FROM payments WHERE id = $1', [id]);
    if (paymentQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Оплата не найдена' });
    }

    const oldPayment = paymentQuery.rows[0];
    const oldAmount = parseFloat(oldPayment.amount);
    const oldUserId = oldPayment.user_id;

    // Use current request user_id or fall back to old user_id
    const targetUserId = user_id ? parseInt(user_id, 10) : oldUserId;

    // Update payment record
    const updateQuery = created_at
      ? 'UPDATE payments SET user_id = $1, amount = $2, created_at = $3 WHERE id = $4 RETURNING *'
      : 'UPDATE payments SET user_id = $1, amount = $2 WHERE id = $3 RETURNING *';
    
    const updateParams = created_at ? [targetUserId, parseFloat(amount), created_at, id] : [targetUserId, parseFloat(amount), id];
    const updateRes = await client.query(updateQuery, updateParams);

    // Adjust user paid_amount:
    if (oldUserId === targetUserId) {
      const diff = parseFloat(amount) - oldAmount;
      await client.query(
        'UPDATE users SET paid_amount = paid_amount + $1 WHERE id = $2',
        [diff, targetUserId]
      );
    } else {
      await client.query(
        'UPDATE users SET paid_amount = GREATEST(0, paid_amount - $1) WHERE id = $2',
        [oldAmount, oldUserId]
      );
      await client.query(
        'UPDATE users SET paid_amount = paid_amount + $1 WHERE id = $2',
        [parseFloat(amount), targetUserId]
      );
    }

    await client.query('COMMIT');
    res.json({
      message: 'Оплата успешно изменена',
      payment: {
        ...updateRes.rows[0],
        amount: parseFloat(updateRes.rows[0].amount)
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при обновлении оплаты' });
  } finally {
    client.release();
  }
});

// 4. Get own payments (Client only)
app.get('/api/payments', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, amount, created_at FROM payments WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    const payments = result.rows.map(p => ({
      ...p,
      amount: parseFloat(p.amount)
    }));
    res.json(payments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при получении истории оплат' });
  }
});

// 2.1 Set discount for user
app.put('/api/admin/users/:id/discount', authenticateToken, requireAdmin, async (req, res) => {
  const { discount } = req.body;
  const { id } = req.params;

  if (discount === undefined || isNaN(discount) || discount < 0 || discount > 100) {
    return res.status(400).json({ message: 'Некорректный процент скидки (должен быть от 0 до 100)' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET discount = $1 WHERE id = $2 RETURNING id, name, discount',
      [discount, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ресторан не найден' });
    }

    res.json({
      message: 'Скидка успешно обновлена',
      user: {
        ...result.rows[0],
        discount: parseFloat(result.rows[0].discount)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при обновлении скидки' });
  }
});

// 3. Delete registered user
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id, name', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ресторан не найден' });
    }

    res.json({ message: `Ресторан "${result.rows[0].name}" успешно удален` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при удалении ресторана' });
  }
});

// 4. Edit product details (Full Edit)
app.put('/api/admin/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { name, price, category, unit, manufacturer, is_in_stock, image_url, description } = req.body;
  const { id } = req.params;

  if (!name || price === undefined || isNaN(price) || price < 0 || !category || !unit || !manufacturer) {
    return res.status(400).json({ message: 'Все поля обязательны для заполнения и должны быть корректными' });
  }

  try {
    const productCheck = await pool.query('SELECT image_url, is_in_stock, description FROM products WHERE id = $1', [id]);
    if (productCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Товар не найден' });
    }

    let finalImageUrl = productCheck.rows[0].image_url;
    if (image_url !== undefined) {
      if (image_url && image_url.startsWith('data:image/')) {
        if (productCheck.rows[0].image_url) {
          deleteProductImageFile(productCheck.rows[0].image_url);
        }
        finalImageUrl = saveUploadedImage(id, image_url);
      } else if (image_url === null || image_url === '') {
        if (productCheck.rows[0].image_url) {
          deleteProductImageFile(productCheck.rows[0].image_url);
        }
        finalImageUrl = null;
      } else {
        finalImageUrl = image_url;
      }
    }

    const finalIsInStock = is_in_stock !== undefined ? is_in_stock : productCheck.rows[0].is_in_stock;
    const finalDescription = description !== undefined ? description : productCheck.rows[0].description;

    const result = await pool.query(
      `UPDATE products 
       SET name = $1, price = $2, category = $3, unit = $4, manufacturer = $5, is_in_stock = $6, image_url = $7, description = $8 
       WHERE id = $9 
       RETURNING id, name, price, category, unit, manufacturer, is_in_stock, image_url, description`,
      [name, parseFloat(price), category, unit, manufacturer, finalIsInStock, finalImageUrl, finalDescription, id]
    );

    const newPrice = parseFloat(price);
    const ordersRes = await pool.query('SELECT id, items, discount FROM orders');
    for (const order of ordersRes.rows) {
      let items = Array.isArray(order.items) ? order.items : (typeof order.items === 'string' ? JSON.parse(order.items) : []);
      if (!Array.isArray(items)) continue;

      let isUpdated = false;
      for (const item of items) {
        if (String(item.id) === String(id)) {
          item.price = newPrice;
          isUpdated = true;
        }
      }

      if (isUpdated) {
        const discount = parseFloat(order.discount || 0);
        const originalPrice = items.reduce((sum, item) => {
          return sum + (parseFloat(item.price || 0) * (parseFloat(item.quantity) || 0));
        }, 0);
        const totalPrice = Math.round((originalPrice * (1 - discount / 100)) * 100) / 100;

        await pool.query(
          'UPDATE orders SET items = $1, total_price = $2, original_price = $3 WHERE id = $4',
          [JSON.stringify(items), totalPrice, originalPrice, order.id]
        );
      }
    }

    res.json({
      message: 'Товар успешно обновлен',
      product: {
        ...result.rows[0],
        price: parseFloat(result.rows[0].price)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при обновлении товара' });
  }
});

app.delete('/api/admin/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const productCheck = await pool.query('SELECT image_url FROM products WHERE id = $1', [parseInt(id, 10)]);
    if (productCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Товар не найден' });
    }
    if (productCheck.rows[0].image_url) {
      deleteProductImageFile(productCheck.rows[0].image_url);
    }
    await pool.query('DELETE FROM products WHERE id = $1', [parseInt(id, 10)]);
    res.json({ message: 'Товар успешно удален' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при удалении товара' });
  }
});

app.post('/api/admin/products/:id/auto-image', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const productCheck = await pool.query('SELECT name, category FROM products WHERE id = $1', [parseInt(id, 10)]);
    if (productCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Товар не найден' });
    }
    const product = productCheck.rows[0];
    let matchedUrl = null;
    const lowerName = product.name.toLowerCase();
    for (const item of nameKeywordImages) {
      if (item.keywords.some(kw => lowerName.includes(kw))) {
        matchedUrl = item.url;
        break;
      }
    }
    if (!matchedUrl) {
      matchedUrl = categoryImages[product.category];
    }
    if (!matchedUrl) {
      matchedUrl = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80';
    }
    await pool.query('UPDATE products SET image_url = $1 WHERE id = $2', [matchedUrl, parseInt(id, 10)]);
    res.json({ imageUrl: matchedUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при автоматическом поиске изображения' });
  }
});

app.post('/api/admin/products', authenticateToken, requireAdmin, async (req, res) => {
  const { name, price, category, unit, manufacturer, is_in_stock, image_url, description } = req.body;

  if (!name || price === undefined || isNaN(price) || price < 0 || !category || !unit || !manufacturer) {
    return res.status(400).json({ message: 'Все поля обязательны для заполнения и должны быть корректными' });
  }

  try {
    await pool.query("SELECT setval('products_id_seq', COALESCE((SELECT MAX(id) FROM products), 0) + 1, false)");

    const result = await pool.query(
      `INSERT INTO products (name, price, category, unit, manufacturer, is_in_stock, image_url, description) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING id, name, price, category, unit, manufacturer, is_in_stock, image_url, description`,
      [name, parseFloat(price), category, unit, manufacturer, is_in_stock !== undefined ? is_in_stock : true, null, description || null]
    );

    const insertedProduct = result.rows[0];
    let finalImageUrl = null;
    if (image_url && image_url.startsWith('data:image/')) {
      finalImageUrl = saveUploadedImage(insertedProduct.id, image_url);
      await pool.query('UPDATE products SET image_url = $1 WHERE id = $2', [finalImageUrl, insertedProduct.id]);
      insertedProduct.image_url = finalImageUrl;
    }

    res.status(201).json({
      message: 'Товар успешно добавлен',
      product: {
        ...insertedProduct,
        price: parseFloat(insertedProduct.price)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при добавлении товара' });
  }
});


app.put('/api/admin/orders/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { items, totalPrice, discount, originalPrice, waybillNumber } = req.body;

  if (!items || items.length === 0 || totalPrice === undefined || isNaN(totalPrice)) {
    return res.status(400).json({ message: 'Некорректные данные накладной' });
  }

  try {
    const updateResult = await pool.query(
      'UPDATE orders SET items = $1, total_price = $2, discount = $3, original_price = $4, waybill_number = $5 WHERE id = $6 RETURNING id',
      [JSON.stringify(items), totalPrice, discount || 0, originalPrice || totalPrice, waybillNumber || null, parseInt(id, 10)]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: 'Накладная не найдена' });
    }

    const result = await pool.query(`
      SELECT o.id, o.total_price, o.items, o.discount, o.original_price, o.created_at, o.waybill_number,
             u.name as restaurant_name, u.email as restaurant_email,
             u.phone as restaurant_phone, u.address as restaurant_address,
             u.bin_iin as restaurant_bin_iin, u.bank as restaurant_bank,
             u.kbe as restaurant_kbe, u.bic as restaurant_bic,
             u.account_number as restaurant_account_number
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = $1
    `, [parseInt(id, 10)]);

    res.json({
      message: 'Накладная успешно обновлена',
      order: {
        ...result.rows[0],
        total_price: parseFloat(result.rows[0].total_price),
        discount: parseFloat(result.rows[0].discount || 0),
        original_price: parseFloat(result.rows[0].original_price || result.rows[0].total_price)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при обновлении накладной' });
  }
});

app.delete('/api/admin/orders/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderQuery = await client.query('SELECT user_id, total_price FROM orders WHERE id = $1', [parseInt(id, 10)]);
    if (orderQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Накладная не найдена' });
    }
    const { user_id, total_price } = orderQuery.rows[0];
    await client.query('DELETE FROM orders WHERE id = $1', [parseInt(id, 10)]);
    await client.query(
      'UPDATE users SET shipped_amount = GREATEST(0, shipped_amount - $1) WHERE id = $2',
      [parseFloat(total_price), user_id]
    );
    await client.query('COMMIT');
    res.json({ message: 'Накладная успешно удалена' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при удалении накладной' });
  } finally {
    client.release();
  }
});


// Start Server
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
