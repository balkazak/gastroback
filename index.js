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

// Database Auto-Initialization & Seeding
const initDatabase = async () => {
  const client = await pool.connect();
  try {
    console.log('Connecting to Neon PostgreSQL for full migration & seeding...');

    // 1. Create/alter users table
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

    // Ensure columns role and order_limit exist (in case users table already existed from previous turn)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'restaurant';
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS order_limit NUMERIC(12, 2) DEFAULT 500000.00;
    `);

    // 2. Create products table
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

    // 3. Create orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        total_price NUMERIC(12, 2) NOT NULL,
        items JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Seed Default Admin User
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

    // 5. Seed Catalog Products from products.json if empty
    const productsCheck = await client.query('SELECT COUNT(*) FROM products');
    const count = parseInt(productsCheck.rows[0].count, 10);
    if (count === 0) {
      console.log('Products database is empty. Seeding products from products.json...');
      const productsFilePath = path.join(process.cwd(), '../frontend/src/data/products.json');
      if (fs.existsSync(productsFilePath)) {
        const rawData = fs.readFileSync(productsFilePath, 'utf8');
        const productsList = JSON.parse(rawData);
        
        // Batch inserting products
        await client.query('BEGIN');
        for (const item of productsList) {
          await client.query(
            `INSERT INTO products (id, name, price, category, unit, manufacturer) VALUES ($1, $2, $3, $4, $5, $6) 
             ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price`,
            [item.id, item.name, item.price, item.category, item.unit, item.manufacturer]
          );
        }
        await client.query('COMMIT');
        console.log(`Seeded ${productsList.length} products successfully into PostgreSQL.`);
      } else {
        console.warn(`Products seed file not found at: ${productsFilePath}`);
      }
    } else {
      console.log(`Products table checked. Found ${count} products.`);
    }

    console.log('Neon Database full migration & seeding finished successfully.');
  } catch (err) {
    console.error('Error during database initialization:', err);
  } finally {
    client.release();
  }
};

initDatabase();

// --- Auth APIs ---

// 1. Register User (Restaurant)
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
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
      'INSERT INTO users (name, email, password, role, order_limit) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, order_limit, created_at',
      [name, email.toLowerCase(), hashedPassword, 'restaurant', 500000.00]
    );

    const token = jwt.sign(
      { id: newUser.rows[0].id, email: newUser.rows[0].email },
      process.env.JWT_SECRET || 'supersecretgastromirkey123!',
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      user: newUser.rows[0]
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

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        order_limit: parseFloat(user.order_limit),
        created_at: user.created_at
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
    const result = await pool.query('SELECT id, name, email, role, order_limit, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    const user = result.rows[0];
    user.order_limit = parseFloat(user.order_limit);
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при получении данных' });
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
  const { items, totalPrice } = req.body;

  if (!items || items.length === 0 || !totalPrice) {
    return res.status(400).json({ message: 'Корзина пуста' });
  }

  try {
    // Fetch current user details
    const userQuery = await pool.query('SELECT order_limit FROM users WHERE id = $1', [req.user.id]);
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ message: 'Ресторан не найден' });
    }

    const orderLimit = parseFloat(userQuery.rows[0].order_limit);

    // Verify limit constraint
    if (parseFloat(totalPrice) > orderLimit) {
      return res.status(400).json({ 
        message: `Сумма заказа (${totalPrice.toLocaleString()} ₸) превышает ваш установленный лимит (${orderLimit.toLocaleString()} ₸)` 
      });
    }

    // Insert order record
    const newOrder = await pool.query(
      'INSERT INTO orders (user_id, total_price, items) VALUES ($1, $2, $3) RETURNING id, total_price, items, created_at',
      [req.user.id, totalPrice, JSON.stringify(items)]
    );

    res.status(201).json({
      message: 'Заказ успешно оформлен',
      order: newOrder.rows[0]
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
      // Admin sees ALL orders with restaurant details
      result = await pool.query(`
        SELECT o.id, o.total_price, o.items, o.created_at, u.name as restaurant_name, u.email as restaurant_email
        FROM orders o
        JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
      `);
    } else {
      // Restaurant sees only their own orders
      result = await pool.query(
        'SELECT id, total_price, items, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
        [req.user.id]
      );
    }

    const formattedOrders = result.rows.map(o => ({
      ...o,
      total_price: parseFloat(o.total_price)
    }));

    res.json(formattedOrders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при загрузке истории заказов' });
  }
});

// --- Admin Features APIs ---

// 1. Get Registered Restaurants List
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, order_limit, created_at 
       FROM users 
       WHERE role = 'restaurant' 
       ORDER BY created_at DESC`
    );
    const restaurants = result.rows.map(r => ({
      ...r,
      order_limit: parseFloat(r.order_limit)
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

// 4. Edit product price
app.put('/api/admin/products/:id/price', authenticateToken, requireAdmin, async (req, res) => {
  const { price } = req.body;
  const { id } = req.params;

  if (price === undefined || isNaN(price) || price < 0) {
    return res.status(400).json({ message: 'Некорректная цена' });
  }

  try {
    const result = await pool.query(
      'UPDATE products SET price = $1 WHERE id = $2 RETURNING id, name, price',
      [price, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Товар не найден' });
    }

    res.json({
      message: 'Цена успешно обновлена',
      product: {
        ...result.rows[0],
        price: parseFloat(result.rows[0].price)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера при обновлении цены' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
