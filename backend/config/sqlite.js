const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Database file path
const dbPath = path.join(__dirname, '../database.sqlite');

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
    } else {
        console.log('✅ Connected to SQLite database');
    }
});

// Database setup functions
function createTables() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Users table
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    role TEXT DEFAULT 'user',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
            });

            // Products table
            db.run(`
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    price REAL NOT NULL,
                    category TEXT NOT NULL,
                    image_url TEXT,
                    stock_quantity INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
            });

            // Cart table
            db.run(`
                CREATE TABLE IF NOT EXISTS cart (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    product_id INTEGER NOT NULL,
                    quantity INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                    UNIQUE(user_id, product_id)
                )
            `, (err) => {
                if (err) reject(err);
            });

            console.log('✅ All tables created successfully');
            resolve();
        });
    });
}

// Insert sample data
async function insertSampleData() {
    try {
        // Check if admin user exists
        const adminExists = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
                    ['admin', 'admin@ecommerce.com', hashedPassword, 'admin'],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            console.log('✅ Admin user created (username: admin, password: admin123)');
        }

        // Check if sample products exist
        const productCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        if (productCount === 0) {
            const sampleProducts = [
                ['Smartphone Pro Max', 'Latest flagship smartphone with advanced camera system', 999.99, 'Electronics', 'https://via.placeholder.com/300x300/4F46E5/FFFFFF?text=Smartphone', 50],
                ['Wireless Headphones', 'Premium noise-cancelling wireless headphones', 299.99, 'Electronics', 'https://via.placeholder.com/300x300/059669/FFFFFF?text=Headphones', 30],
                ['Designer Jacket', 'Stylish winter jacket with premium materials', 199.99, 'Clothing', 'https://via.placeholder.com/300x300/DC2626/FFFFFF?text=Jacket', 25],
                ['Running Shoes', 'Professional running shoes with advanced cushioning', 149.99, 'Sports', 'https://via.placeholder.com/300x300/EA580C/FFFFFF?text=Shoes', 40],
                ['Coffee Maker', 'Automatic coffee maker with programmable settings', 89.99, 'Home', 'https://via.placeholder.com/300x300/7C2D12/FFFFFF?text=Coffee+Maker', 20],
                ['Laptop Stand', 'Adjustable aluminum laptop stand for better ergonomics', 49.99, 'Electronics', 'https://via.placeholder.com/300x300/1F2937/FFFFFF?text=Laptop+Stand', 35],
                ['Yoga Mat', 'Premium non-slip yoga mat for all fitness levels', 39.99, 'Sports', 'https://via.placeholder.com/300x300/0F766E/FFFFFF?text=Yoga+Mat', 60],
                ['Smart Watch', 'Feature-rich smartwatch with health tracking', 399.99, 'Electronics', 'https://via.placeholder.com/300x300/0EA5E9/FFFFFF?text=Smart+Watch', 25]
            ];

            for (const product of sampleProducts) {
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO products (name, description, price, category, image_url, stock_quantity) VALUES (?, ?, ?, ?, ?, ?)',
                        product,
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
            console.log('✅ Sample products added');
        }

        console.log('✅ Sample data inserted successfully');
    } catch (error) {
        console.error('❌ Error inserting sample data:', error.message);
        throw error;
    }
}

// Initialize database
async function initializeDatabase() {
    console.log('🔄 Setting up SQLite database...');
    
    try {
        await createTables();
        await insertSampleData();
        console.log('✅ Database setup completed successfully!');
        return true;
    } catch (error) {
        console.log('❌ Database setup failed:', error.message);
        return false;
    }
}

// Wrapper functions for database operations
const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const queryOne = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

module.exports = {
    db,
    query,
    queryOne,
    run,
    initializeDatabase
};