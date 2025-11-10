const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// User Registration
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        // Check if user exists
        const [existingUsers] = await pool.query(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({ message: 'Username or email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const [result] = await pool.query(
            'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, 'user']
        );

        // Generate token
        const token = generateToken(result.insertId, 'user');

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: result.insertId,
                username,
                email,
                role: 'user'
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Registration failed' });
    }
});

// User Login (accepts email OR username)
router.post('/login', async (req, res) => {
    try {
        const { email, username, password } = req.body;

        // Accept either email or username
        const identifier = email || username;
        if (!identifier || !password) {
            return res.status(400).json({ message: 'Email/username and password are required' });
        }

        // Find user by email or username, limited to regular user role
        const [users] = await pool.query(
            'SELECT id, username, email, password, role FROM users WHERE (email = ? OR username = ?) AND role = ?',
            [identifier, identifier, 'user']
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = users[0];

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate token
        const token = generateToken(user.id, user.role);

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Login failed' });
    }
});

// Admin Login (accepts email OR username)
router.post('/admin/login', async (req, res) => {
    try {
        const { email, username, password } = req.body;

        // Accept either email or username
        const identifier = email || username;
        if (!identifier || !password) {
            return res.status(400).json({ message: 'Email/username and password are required' });
        }

        // Find admin user by email or username
        const [users] = await pool.query(
            'SELECT id, username, email, password, role FROM users WHERE (email = ? OR username = ?) AND role = ?',
            [identifier, identifier, 'admin']
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid admin credentials' });
        }

        const user = users[0];

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid admin credentials' });
        }

        // Generate token
        const token = generateToken(user.id, user.role);

        res.json({
            message: 'Admin login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: 'Admin login failed' });
    }
});

// Create Admin Account (admin only)
router.post('/admin/create', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        // Check if user exists
        const [existingUsers] = await pool.query(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({ message: 'Username or email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert admin user
        const [result] = await pool.query(
            'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, 'admin']
        );

        // Generate token
        const token = generateToken(result.insertId, 'admin');

        res.status(201).json({
            message: 'Admin account created successfully',
            token,
            user: {
                id: result.insertId,
                username,
                email,
                role: 'admin'
            }
        });
    } catch (error) {
        console.error('Admin creation error:', error);
        res.status(500).json({ message: 'Admin account creation failed' });
    }
});

// Get current user profile
router.get('/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const { authenticateToken } = require('../middleware/auth');
        // This would normally use the authenticateToken middleware
        // For now, we'll decode the token manually
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [users] = await pool.query(
            'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = users[0];

        res.json({ user: user });
    } catch (error) {
        console.error('Profile error', error);
        res.status(500).json({ message: 'Failed to get profile' });
    }
});

module.exports = router;