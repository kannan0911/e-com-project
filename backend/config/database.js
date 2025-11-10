const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3307,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'ecommerce_db'
};

// Create connection pool
const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Database setup functions
async function createDatabase() {
    try {
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password
        });

        await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        console.log(`✅ Database '${dbConfig.database}' created/verified`);
        await connection.end();
        return true;
    } catch (error) {
        console.error('❌ Error creating database:', error.message);
        return false;
    }
}

async function createTables() {
    try {
        // Users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('user', 'admin') DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Products table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price DECIMAL(10,2) NOT NULL,
                category VARCHAR(100) NOT NULL,
                image_url VARCHAR(500),
                image_url2 VARCHAR(500),
                image_url3 VARCHAR(500),
                image_url4 VARCHAR(500),
                image_url5 VARCHAR(500),
                stock_quantity INT DEFAULT 0,
                added_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        // Cart table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cart (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                product_id INT NOT NULL,
                quantity INT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                UNIQUE KEY unique_user_product (user_id, product_id)
            )
        `);

        // Orders table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                items TEXT NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                payment_method VARCHAR(50) NOT NULL,
                status ENUM('pending','processing','completed','cancelled') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        console.log('✅ All tables created successfully');
        return true;
    } catch (error) {
        console.error('❌ Error creating tables:', error.message);
        return false;
    }
}

// Ensure required columns exist on products table (handles older schemas)
async function ensureProductsColumns() {
    try {
        const [cols] = await pool.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'`
        );
        const existing = new Set(cols.map(c => c.COLUMN_NAME));

        // Define required columns and their SQL definitions
        const required = [
            { name: 'image_url2', sql: 'ALTER TABLE products ADD COLUMN image_url2 VARCHAR(500) NULL AFTER image_url' },
            { name: 'image_url3', sql: 'ALTER TABLE products ADD COLUMN image_url3 VARCHAR(500) NULL AFTER image_url2' },
            { name: 'image_url4', sql: 'ALTER TABLE products ADD COLUMN image_url4 VARCHAR(500) NULL AFTER image_url3' },
            { name: 'image_url5', sql: 'ALTER TABLE products ADD COLUMN image_url5 VARCHAR(500) NULL AFTER image_url4' },
            { name: 'stock_quantity', sql: 'ALTER TABLE products ADD COLUMN stock_quantity INT DEFAULT 0' },
            { name: 'added_by', sql: 'ALTER TABLE products ADD COLUMN added_by INT NULL' }
        ];

        for (const req of required) {
            if (!existing.has(req.name)) {
                await pool.query(req.sql);
                console.log(`🛠️  Added missing column: products.${req.name}`);
            }
        }

        // Ensure foreign key for added_by exists (best effort)
        // Note: MySQL doesn’t expose FKs simply; try to add if not present.
        if (existing.has('added_by')) {
            try {
                await pool.query(
                    `ALTER TABLE products ADD CONSTRAINT fk_products_added_by FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL`
                );
                console.log('🛠️  Ensured foreign key on products.added_by');
            } catch (e) {
                // Ignore if constraint already exists
            }
        }

        return true;
    } catch (error) {
        console.error('⚠️  Could not verify/patch products columns:', error.message);
        return false;
    }
}

// Initialize database
async function initializeDatabase() {
    console.log('🔄 Setting up database...');
    
    const dbCreated = await createDatabase();
    if (!dbCreated) {
        console.log('❌ Database setup failed');
        return false;
    }

    const tablesCreated = await createTables();
    if (!tablesCreated) {
        console.log('❌ Table creation failed');
        return false;
    }

    // Patch older schemas to include new product columns
    await ensureProductsColumns();

    console.log('✅ Database setup completed successfully!');
    return true;
}

async function deleteAllProducts() {
    try {
        await pool.query('DELETE FROM products');
        console.log('🗑️ All products deleted');
        return true;
    } catch (error) {
        console.error('❌ Error deleting products:', error.message);
        return false;
    }
}

// Insert sample data
async function insertSampleData() {
    await deleteAllProducts();
    try {
        // Check if admin user exists
        const [adminRows] = await pool.query('SELECT id FROM users WHERE username = ?', ['admin']);
        if (adminRows.length === 0) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await pool.query(
                'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
                ['admin', 'admin@ecommerce.com', hashedPassword, 'admin']
            );
            console.log('✅ Admin user created (username: admin, password: admin123)');
        }

        // Skip inserting sample products to keep products table empty
        console.log('ℹ️ Skipping sample product insertion; products table remains empty');

        console.log('✅ Sample data inserted successfully');
        return true;
    } catch (error) {
        console.error('❌ Error inserting sample data:', error.message);
        return false;
    }
}

module.exports = { pool, initializeDatabase, insertSampleData };