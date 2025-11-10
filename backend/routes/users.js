const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's cart
router.get('/cart', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        const [cartItems] = await pool.query(`
            SELECT 
                cart.id as cart_id,
                cart.quantity,
                products.id,
                products.name,
                products.price,
                products.image_url,
                products.stock_quantity
            FROM cart 
            JOIN products ON cart.product_id = products.id 
            WHERE cart.user_id = ?
            ORDER BY cart.created_at DESC
        `, [userId]);

        // Calculate total
        const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        res.json({
            cart: cartItems,
            total: total.toFixed(2),
            itemCount: cartItems.length
        });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({ message: 'Failed to fetch cart' });
    }
});

// Add item to cart
router.post('/cart', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { productId, quantity = 1 } = req.body;

        if (!productId) {
            return res.status(400).json({ message: 'Product ID is required' });
        }

        // Check if product exists and has stock
        const [products] = await pool.query(
            'SELECT id, stock_quantity FROM products WHERE id = ?',
            [productId]
        );

        if (products.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const product = products[0];
        const requestedQuantity = parseInt(quantity);

        if (product.stock_quantity < requestedQuantity) {
            return res.status(400).json({ message: 'Insufficient stock' });
        }

        // Check if item already exists in cart
        const [existingItems] = await pool.query(
            'SELECT id, quantity FROM cart WHERE user_id = ? AND product_id = ?',
            [userId, productId]
        );

        if (existingItems.length > 0) {
            // Update existing cart item
            const existingItem = existingItems[0];
            const newQuantity = existingItem.quantity + requestedQuantity;
            
            if (product.stock_quantity < newQuantity) {
                return res.status(400).json({ message: 'Insufficient stock for requested quantity' });
            }

            await pool.query(
                'UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ?',
                [newQuantity, userId, productId]
            );
        } else {
            // Add new cart item
            await pool.query(
                'INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)',
                [userId, productId, requestedQuantity]
            );
        }

        res.json({ message: 'Item added to cart successfully' });
    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({ message: 'Failed to add item to cart' });
    }
});

// Update cart item quantity
router.put('/cart/:cartId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { cartId } = req.params;
        const { quantity } = req.body;

        if (!quantity || quantity < 1) {
            return res.status(400).json({ message: 'Quantity must be at least 1' });
        }

        // Check if cart item belongs to user and get product info
        const [cartItems] = await pool.query(`
            SELECT cart.id, cart.product_id, products.stock_quantity 
            FROM cart 
            JOIN products ON cart.product_id = products.id 
            WHERE cart.id = ? AND cart.user_id = ?
        `, [cartId, userId]);

        if (cartItems.length === 0) {
            return res.status(404).json({ message: 'Cart item not found' });
        }

        const cartItem = cartItems[0];
        
        if (cartItem.stock_quantity < quantity) {
            return res.status(400).json({ message: 'Insufficient stock' });
        }

        await pool.query(
            'UPDATE cart SET quantity = ? WHERE id = ? AND user_id = ?',
            [quantity, cartId, userId]
        );

        res.json({ message: 'Cart item updated successfully' });
    } catch (error) {
        console.error('Update cart error:', error);
        res.status(500).json({ message: 'Failed to update cart item' });
    }
});

// Remove item from cart
router.delete('/cart/:cartId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { cartId } = req.params;

        const [result] = await pool.query(
            'DELETE FROM cart WHERE id = ? AND user_id = ?',
            [cartId, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Cart item not found' });
        }

        res.json({ message: 'Item removed from cart successfully' });
    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({ message: 'Failed to remove item from cart' });
    }
});

// Clear entire cart
router.delete('/cart', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        await pool.query(
            'DELETE FROM cart WHERE user_id = ?',
            [userId]
        );

        res.json({ message: 'Cart cleared successfully' });
    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({ message: 'Failed to clear cart' });
    }
});

// Checkout: enforce Cash on Delivery and record order
router.post('/checkout', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { paymentMethod } = req.body || {};

        // Enforce Cash on Delivery only
        const allowedMethod = 'cash-on-delivery';
        if (!paymentMethod || paymentMethod !== allowedMethod) {
            return res.status(400).json({ 
                message: 'Only Cash on Delivery is available.',
                allowedPaymentMethod: allowedMethod
            });
        }

        // Get cart items with prices and stock
        const [cartItems] = await pool.query(`
            SELECT 
                cart.id,
                cart.quantity,
                products.id AS product_id,
                products.name AS product_name,
                products.price AS product_price,
                products.stock_quantity
            FROM cart 
            JOIN products ON cart.product_id = products.id 
            WHERE cart.user_id = ?
            ORDER BY cart.created_at DESC
        `, [userId]);

        if (cartItems.length === 0) {
            return res.status(400).json({ message: 'Cart is empty' });
        }

        // Check stock for all items
        for (const item of cartItems) {
            if (item.stock_quantity < item.quantity) {
                return res.status(400).json({ 
                    message: `Insufficient stock for product ID ${item.product_id}` 
                });
            }
        }

        // Compute total and build order items payload
        const orderItems = cartItems.map(ci => ({
            productId: ci.product_id,
            name: ci.product_name,
            price: Number(ci.product_price),
            quantity: ci.quantity
        }));

        const totalAmount = orderItems.reduce((sum, it) => sum + (it.price * it.quantity), 0);

        // Insert order record
        const [orderResult] = await pool.query(
            'INSERT INTO orders (user_id, items, total_amount, payment_method, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [
                userId,
                JSON.stringify(orderItems),
                totalAmount.toFixed(2),
                allowedMethod,
                'pending'
            ]
        );

        const orderId = orderResult.insertId;

        // Update stock quantities after recording the order
        for (const item of cartItems) {
            await pool.query(
                'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
                [item.quantity, item.product_id]
            );
        }

        // Clear cart
        await pool.query('DELETE FROM cart WHERE user_id = ?', [userId]);

        res.json({ 
            message: 'Order placed successfully. Payment method: Cash on Delivery.',
            orderId,
            paymentMethod: allowedMethod
        });
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ message: 'Checkout failed' });
    }
});

module.exports = router;