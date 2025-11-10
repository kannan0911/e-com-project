const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
});
// Enable CORS for local frontend on port 8081
app.use(cors({
    origin: [
        'http://localhost:8081',
        'http://127.0.0.1:8081',
        'http://localhost:8082',
        'http://127.0.0.1:8082'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Serve uploaded images - use absolute path and ensure proper URL handling
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'public, max-age=3600');
    }
}));

// Use MySQL
const { pool, initializeDatabase, insertSampleData } = require('./config/database');

// Test database connection
async function testConnection() {
    try {
        await pool.query('SELECT 1');
        console.log('✅ MySQL database connected successfully');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

// Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const userRoutes = require('./routes/users');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Start server
async function startServer() {
    const isConnected = await testConnection();
    if (!isConnected) {
        console.log('⚠️  Starting server without database connection...');
        console.log('Please check your MySQL configuration and run database setup.');
    }
    // Ensure database and tables are initialized and patched
    try {
        await initializeDatabase();
        // Insert sample data (admin user, sample products) if missing
        await insertSampleData();
    } catch (e) {
        console.log('⚠️  Database initialization step encountered an issue:', e.message);
    }
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
    });
}

startServer();

module.exports = { app, pool };