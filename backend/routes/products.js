const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB default
    },
    fileFilter: fileFilter
});

// Get all products (public)
router.get('/', async (req, res) => {
    try {
        const { category, search, limit = 10, offset = 0 } = req.query;
        let query = 'SELECT * FROM products WHERE 1=1';
        let params = [];

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        if (search) {
            query += ' AND (name LIKE ? OR description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [products] = await pool.query(query, params);
        
        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM products WHERE 1=1';
        let countParams = [];

        if (category) {
            countQuery += ' AND category = ?';
            countParams.push(category);
        }

        if (search) {
            countQuery += ' AND (name LIKE ? OR description LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const [countResult] = await pool.query(countQuery, countParams);

        res.json({
            products,
            pagination: {
                total: countResult[0].total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ message: 'Failed to fetch products' });
    }
});

// Get product by ID (public)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [products] = await pool.query(
            'SELECT * FROM products WHERE id = ?',
            [id]
        );

        if (products.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const product = products[0];

        res.json({ product: product });
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({ message: 'Failed to fetch product' });
    }
});

// Create product (admin only)
router.post('/', authenticateToken, requireAdmin, upload.array('images', 5), async (req, res) => {
    try {
        const { name, description, price, category, stock_quantity } = req.body;

        // Validation
        if (!name || !price || !category) {
            return res.status(400).json({ message: 'Name, price, and category are required' });
        }

        if (isNaN(price) || price <= 0) {
            return res.status(400).json({ message: 'Price must be a positive number' });
        }

        // Handle multiple images
        const imageUrls = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                imageUrls.push(`/uploads/${file.filename}`);
            });
        }

        const [result] = await pool.query(
            'INSERT INTO products (name, description, price, category, image_url, image_url2, image_url3, image_url4, image_url5, stock_quantity, added_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
            [
                name, 
                description, 
                parseFloat(price), 
                category, 
                imageUrls[0] || null,
                imageUrls[1] || null,
                imageUrls[2] || null,
                imageUrls[3] || null,
                imageUrls[4] || null,
                parseInt(stock_quantity) || 0,
                req.user.userId
            ]
        );

        const [newProduct] = await pool.query(
            'SELECT * FROM products WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({
            message: 'Product created successfully',
            product: newProduct[0]
        });
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ message: 'Failed to create product' });
    }
});

// Update product (admin only - can only update their own products)
router.put('/:id', authenticateToken, requireAdmin, upload.array('images', 5), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, price, category, stock_quantity } = req.body;

        // Get existing product
        const [existingProducts] = await pool.query(
            'SELECT * FROM products WHERE id = ?',
            [id]
        );

        if (existingProducts.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const existingProduct = existingProducts[0];

        // Check if the admin owns this product
        if (existingProduct.added_by !== req.user.userId) {
            return res.status(403).json({ message: 'You can only update products you created' });
        }

        // Handle multiple images
        let imageUrls = [
            existingProduct.image_url,
            existingProduct.image_url2,
            existingProduct.image_url3,
            existingProduct.image_url4,
            existingProduct.image_url5
        ];

        // If new images are uploaded, replace existing ones
        if (req.files && req.files.length > 0) {
            // Delete old images if they exist
            imageUrls.forEach(imageUrl => {
                if (imageUrl) {
                    const oldImagePath = path.join(__dirname, '..', imageUrl);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }
            });

            // Set new images
            imageUrls = [];
            req.files.forEach(file => {
                imageUrls.push(`/uploads/${file.filename}`);
            });

            // Fill remaining slots with null if fewer than 5 images
            while (imageUrls.length < 5) {
                imageUrls.push(null);
            }
        }

        const [result] = await pool.query(
            'UPDATE products SET name = ?, description = ?, price = ?, category = ?, image_url = ?, image_url2 = ?, image_url3 = ?, image_url4 = ?, image_url5 = ?, stock_quantity = ?, updated_at = NOW() WHERE id = ? AND added_by = ?',
            [
                name || existingProduct.name,
                description !== undefined ? description : existingProduct.description,
                price ? parseFloat(price) : existingProduct.price,
                category || existingProduct.category,
                imageUrls[0],
                imageUrls[1],
                imageUrls[2],
                imageUrls[3],
                imageUrls[4],
                stock_quantity !== undefined ? parseInt(stock_quantity) : existingProduct.stock_quantity,
                id,
                req.user.userId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Product not found or not owned by you' });
        }

        const [updatedProduct] = await pool.query(
            'SELECT * FROM products WHERE id = ?',
            [id]
        );

        res.json({
            message: 'Product updated successfully',
            product: updatedProduct[0]
        });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ message: 'Failed to update product' });
    }
});

// Delete product (admin only - can only delete their own products)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.userId;

        // Get product to check ownership and get image URLs
        const [products] = await pool.query(
            'SELECT image_url, image_url2, image_url3, image_url4, image_url5, added_by FROM products WHERE id = ?',
            [id]
        );

        if (products.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const product = products[0];

        // Check if the admin owns this product
        if (product.added_by !== adminId) {
            return res.status(403).json({ message: 'You can only delete products you created' });
        }

        // Delete product
        const [result] = await pool.query(
            'DELETE FROM products WHERE id = ? AND added_by = ?',
            [id, adminId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Product not found or not owned by you' });
        }

        // Delete associated images
        const imageUrls = [product.image_url, product.image_url2, product.image_url3, product.image_url4, product.image_url5];
        imageUrls.forEach(imageUrl => {
            if (imageUrl) {
                const imagePath = path.join(__dirname, '..', imageUrl);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }
        });

        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ message: 'Failed to delete product' });
    }
});

// Get admin's own products (admin only)
router.get('/admin/products', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { category, search, limit = 10, offset = 0 } = req.query;
        
        let query = 'SELECT * FROM products WHERE added_by = ?';
        let params = [adminId];

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        if (search) {
            query += ' AND (name LIKE ? OR description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [products] = await pool.query(query, params);
        
        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM products WHERE added_by = ?';
        let countParams = [adminId];

        if (category) {
            countQuery += ' AND category = ?';
            countParams.push(category);
        }

        if (search) {
            countQuery += ' AND (name LIKE ? OR description LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const [countResult] = await pool.query(countQuery, countParams);

        res.json({
            products,
            pagination: {
                total: countResult[0].total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Get admin products error:', error);
        res.status(500).json({ message: 'Failed to fetch admin products' });
    }
});

// Get categories (public)
router.get('/categories/list', async (req, res) => {
    try {
        const [categories] = await pool.query(
            'SELECT DISTINCT category FROM products ORDER BY category'
        );

        res.json({ 
            categories: categories.map(cat => cat.category) 
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ message: 'Failed to fetch categories' });
    }
});

module.exports = router;