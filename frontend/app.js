const API_BASE_URL = (function() {
  const { protocol, hostname, port } = window.location;
  const backendPort = '3000';
  if (port === backendPort) {
    return '/api';
  }
  return `${protocol}//${hostname}:${backendPort}/api`;
})();
// Global variables
let cart = [];
let currentProduct = null;
let currentUser = null;
let products = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    fetchProducts();
    setupEventListeners();
    restoreSession();
    updateCartCount();
});

// Setup event listeners
function setupEventListeners() {
    // Mobile menu toggle
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    hamburger.addEventListener('click', function() {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    // Navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.classList.contains('cart-link')) {
                e.preventDefault();
                openCartModal();
            } else if (this.classList.contains('login-link')) {
                e.preventDefault();
                openLoginModal();
            } else if (this.classList.contains('admin-link')) {
                e.preventDefault();
                openAdminLoginModal();
            }
        });
    });

    // Form submissions
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('signup-form').addEventListener('submit', handleSignup);
    document.getElementById('admin-login-form').addEventListener('submit', handleAdminLogin);
    const adminSignupForm = document.getElementById('admin-signup-form');
    if (adminSignupForm) {
        adminSignupForm.addEventListener('submit', handleAdminSignup);
    }

    // Top nav category links (Men/Women)
    const menLink = document.querySelector('.nav-menu .nav-item:nth-child(1) .nav-link');
    const womenLink = document.querySelector('.nav-menu .nav-item:nth-child(2) .nav-link');
    if (menLink) {
        menLink.addEventListener('click', (e) => {
            e.preventDefault();
            fetchProducts({ category: 'men' });
            document.getElementById('featured-products').scrollIntoView({ behavior: 'smooth' });
        });
    }
    if (womenLink) {
        womenLink.addEventListener('click', (e) => {
            e.preventDefault();
            fetchProducts({ category: 'women' });
            document.getElementById('featured-products').scrollIntoView({ behavior: 'smooth' });
        });
    }


}

// Load and display products
async function fetchProducts(queryParams = {}) {
    try {
        let url = `${API_BASE_URL}/products`;
        if (Object.keys(queryParams).length > 0) {
            const params = new URLSearchParams(queryParams);
            url = `${url}?${params.toString()}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch products');
        }
        const data = await response.json();
        products = data.products;
        displayProducts(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        const productsGrid = document.getElementById('products-grid');
        productsGrid.innerHTML = '<p>Error loading products. Please try again later.</p>';
    }
}

function displayProducts(productsToDisplay) {
    const productsGrid = document.getElementById('products-grid');
    productsGrid.innerHTML = '';
    productsToDisplay.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        
        // Resolve image URL - prefix backend host for uploads
        let imageUrl = 'https://via.placeholder.com/200';
        if (product.image_url) {
            imageUrl = product.image_url;
        } else if (product.image_url1) {
            imageUrl = product.image_url1;
        }
        // Add cache buster for uploaded images
       if (imageUrl.startsWith('/uploads')) {
    imageUrl = `http://localhost:3000${imageUrl}?t=${Date.now()}`;
}



        productCard.innerHTML = `
            <div class="product-image">
                <img src="${imageUrl}" alt="${product.name}" loading="lazy" />
            </div>
            <div class="product-info">
                <h3 class="product-title">${product.name}</h3>
                <div class="product-price">$${product.price}</div>
            </div>
        `;
        productCard.addEventListener('click', () => showProductDetails(product.id));
        productsGrid.appendChild(productCard);
    });
}

async function showProductDetails(productId) {
    try {
        const response = await fetch(`${API_BASE_URL}/products/${productId}`);
        if (!response.ok) throw new Error('Failed to load product');
        const data = await response.json();
        const product = data.product;
        currentProduct = product;

        const modal = document.getElementById('product-modal');
        // Build image set (supports up to 5 images from backend)
        const rawImageUrls = [
            product.image_url,
            product.image_url1,
            product.image_url2,
            product.image_url3,
            product.image_url4,
            product.image_url5
        ].filter(Boolean);

        // Normalize URLs and add cache buster for uploaded local files
        // ✅ FIXED: normalize URLs correctly for backend-hosted images
const backendBase = API_BASE_URL.replace('/api', '');
const normalizedImageUrls = rawImageUrls.map(url => {
    if (typeof url !== 'string') return null;
    if (url.startsWith('/uploads')) {
        return `${backendBase}${url}?t=${Date.now()}`;
    }
    return url;
}).filter(Boolean);


        const mainImageUrl = normalizedImageUrls[0] || 'https://via.placeholder.com/300';
        const modalImageEl = document.getElementById('modal-product-image');
        modalImageEl.src = mainImageUrl;

        // Render thumbnails
        const thumbsContainer = document.getElementById('modal-thumbnails');
        if (thumbsContainer) {
            thumbsContainer.innerHTML = normalizedImageUrls
                .map((u, idx) => `<img class="modal-thumb ${idx === 0 ? 'active' : ''}" src="${u}" alt="Thumbnail ${idx + 1}" data-src="${u}">`)
                .join('');

            // Wire thumbnail clicks to update main image
            thumbsContainer.querySelectorAll('.modal-thumb').forEach(thumb => {
                thumb.addEventListener('click', () => {
                    const newSrc = thumb.getAttribute('data-src');
                    modalImageEl.src = newSrc;
                    // update active state
                    thumbsContainer.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('active'));
                    thumb.classList.add('active');
                });
            });
        }

        document.getElementById('modal-product-title').textContent = product.name;
        document.getElementById('modal-product-description').textContent = product.description || '';
        document.getElementById('modal-original-price').textContent = '';
        document.getElementById('modal-discount-price').textContent = `$${product.price}`;
        document.getElementById('quantity').value = 1;

        modal.style.display = 'block';
    } catch (err) {
        console.error('Product details error:', err);
        showNotification('Unable to load product details.');
    }
}

function closeProductModal() {
    document.getElementById('product-modal').style.display = 'none';
    currentProduct = null;
}

// Quantity controls
function increaseQuantity() {
    const quantityInput = document.getElementById('quantity');
    const currentValue = parseInt(quantityInput.value);
    if (currentValue < 10) {
        quantityInput.value = currentValue + 1;
    }
}

function decreaseQuantity() {
    const quantityInput = document.getElementById('quantity');
    const currentValue = parseInt(quantityInput.value);
    if (currentValue > 1) {
        quantityInput.value = currentValue - 1;
    }
}

// Cart functions
async function addToCart() {
    if (!currentProduct) return;

    const quantity = parseInt(document.getElementById('quantity').value);
    const token = localStorage.getItem('token');

    if (!token) {
        showNotification('Please log in to add items to your cart.');
        openLoginModal();
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/users/cart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                productId: currentProduct.id,
                quantity: quantity
            })
        });

        if (response.ok) {
            showNotification('Product added to cart!');
            await fetchCart();
            closeProductModal();
        } else {
            const errorData = await response.json();
            showNotification(`Error: ${errorData.message}`);
        }
    } catch (error) {
        console.error('Add to cart error:', error);
        showNotification('Failed to add item to cart. Please try again.');
    }
}

async function fetchCart() {
    const token = localStorage.getItem('token');
    if (!token) {
        cart = [];
        updateCartCount();
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/users/cart`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const cartData = await response.json();
            cart = cartData.cart;
            updateCartCount();
        } else {
            console.error('Failed to fetch cart');
            cart = [];
            updateCartCount();
        }
    } catch (error) {
        console.error('Fetch cart error:', error);
        cart = [];
        updateCartCount();
    }
}
function buyNow() {
    addToCart();
    openCartModal();
}

function updateCartCount() {
    const cartCount = document.querySelector('.cart-count');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;
}

async function openCartModal() {
    await fetchCart(); // Ensure cart data is up-to-date

    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    const cartCountBadge = document.getElementById('cart-count-badge');

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart"></i>
                <p>Your cart is empty</p>
                <button class="btn-continue" onclick="closeCartModal()">Start Shopping</button>
            </div>
        `;
        cartTotal.textContent = '0.00';
        cartCountBadge.textContent = '0';
    } else {
        cartItems.innerHTML = cart.map(item => {
            let imgSrc = 'https://via.placeholder.com/100';
            const backendBase = API_BASE_URL.replace('/api', ''); // ✅ removes /api from URL

            if (item.image_url) {
                if (item.image_url.startsWith('/uploads')) {
                    imgSrc = `${backendBase}${item.image_url}?t=${Date.now()}`;
                } else {
                    imgSrc = item.image_url;
                }
            } else if (item.image_url1) {
                if (item.image_url1.startsWith('/uploads')) {
                    imgSrc = `${backendBase}${item.image_url1}?t=${Date.now()}`;
                } else {
                    imgSrc = item.image_url1;
                }
            }

            return `
            <div class="cart-item">
                <div class="cart-item-image">
                    <img src="${imgSrc}" alt="${item.name}" />
                </div>
                <div class="cart-item-details">
                    <div class="cart-item-title">${item.name}</div>
                    <div class="cart-item-quantity">
                        <button class="quantity-btn" onclick="updateCartItemQuantity(${item.cart_id}, ${item.quantity - 1})">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn" onclick="updateCartItemQuantity(${item.cart_id}, ${item.quantity + 1})">+</button>
                    </div>
                    <div class="cart-item-price">$${item.price}</div>
                </div>
                <div class="cart-item-actions">
                    <button class="remove-item" onclick="removeFromCart(${item.cart_id})">Remove</button>
                </div>
            </div>
        `;
        }).join('');

        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotal.textContent = total.toFixed(2);
        cartCountBadge.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
    }

    document.getElementById('cart-modal').style.display = 'block';
}


function closeCartModal() {
    document.getElementById('cart-modal').style.display = 'none';
}

async function removeFromCart(cartId) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE_URL}/users/cart/${cartId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            showNotification('Item removed from cart.');
            await fetchCart();
            openCartModal(); // Refresh the cart display
        } else {
            showNotification('Failed to remove item from cart.');
        }
    } catch (error) {
        console.error('Remove from cart error:', error);
        showNotification('Error removing item from cart.');
    }
}

async function updateCartItemQuantity(cartId, newQuantity) {
    if (newQuantity <= 0) {
        await removeFromCart(cartId);
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE_URL}/users/cart/${cartId}`,
         {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ quantity: newQuantity })
        });

        if (response.ok) {
            await fetchCart();
            openCartModal(); // Refresh the cart display
        } else {
            const errorData = await response.json();
            showNotification(`Update failed: ${errorData.message}`);
        }
    } catch (error) {
        console.error('Update cart quantity error:', error);
        showNotification('Error updating cart quantity.');
    }
}

function checkout() {
    if (cart.length === 0) {
        showNotification('Your cart is empty!');
        return;
    }
    
    // Close cart modal and open checkout modal
    closeCartModal();
    openCheckoutModal();
}

function openCheckoutModal() {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    document.getElementById('checkout-total').textContent = total.toFixed(2);
    document.getElementById('checkout-modal').style.display = 'block';
}

function closeCheckoutModal() {
    document.getElementById('checkout-modal').style.display = 'none';
}

// Handle checkout form submission
document.addEventListener('DOMContentLoaded', function() {
    const checkoutForm = document.getElementById('checkout-form');
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const token = localStorage.getItem('token');
            if (!token) {
                showNotification('Please login to place an order.');
                return;
            }

            const paymentMethod = document.getElementById('checkout-payment').value;
            if (paymentMethod !== 'cash-on-delivery') {
                showNotification('Only Cash on Delivery is available.');
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/users/checkout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ paymentMethod })
                });

                if (response.ok) {
                    const data = await response.json();
                    showNotification('Order placed successfully! Payment: Cash on Delivery.');
                    // Clear cart after successful order
                    cart = [];
                    updateCartCount();
                    closeCheckoutModal();
                    checkoutForm.reset();
                } else {
                    const err = await response.json();
                    showNotification(err.message || 'Checkout failed.');
                }
            } catch (error) {
                showNotification('Error processing order. Please try again.');
                console.error('Checkout error:', error);
            }
        });
    }
});

// Login/Signup modal functions
function openLoginModal() {
    document.getElementById('login-modal').style.display = 'block';
}

function closeLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
}

function openSignupModal() {
    document.getElementById('signup-modal').style.display = 'block';
}

function closeSignupModal() {
    document.getElementById('signup-modal').style.display = 'none';
}

function openAdminLoginModal() {
    document.getElementById('admin-login-modal').style.display = 'block';
}

function closeAdminLoginModal() {
    document.getElementById('admin-login-modal').style.display = 'none';
}

// Admin Signup modal functions
function openAdminSignupModal() {
    const modal = document.getElementById('admin-signup-modal');
    if (modal) modal.style.display = 'block';
}

function closeAdminSignupModal() {
    const modal = document.getElementById('admin-signup-modal');
    if (modal) modal.style.display = 'none';
}

function showSignup() {
    closeLoginModal();
    openSignupModal();
}

function showLogin() {
    closeSignupModal();
    openLoginModal();
}

// Authentication functions
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            updateUIForLoggedInUser();
            closeLoginModal();
            showNotification('Login successful!');
            await fetchCart(); // Fetch cart after login
        } else {
            const errorData = await response.json();
            showNotification(`Login failed: ${errorData.message}`);
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('An error occurred during login.');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            updateUIForLoggedInUser();
            closeLoginModal();
            showNotification('Login successful!');
            document.getElementById('login-form').reset();
            await fetchCart(); // Fetch cart after login
        } else {
            const errorData = await response.json();
            showNotification(`Login failed: ${errorData.message}`);
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('An error occurred during login.');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const username = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            updateUIForLoggedInUser();
            closeSignupModal();
            showNotification('Account created successfully!');
            document.getElementById('signup-form').reset();
            await fetchCart(); // Fetch cart for new user
        } else {
            const errorData = await response.json();
            showNotification(`Signup failed: ${errorData.message}`);
        }
    } catch (error) {
        console.error('Signup error:', error);
        showNotification('An error occurred during signup.');
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email').value; // may contain username too
    const password = document.getElementById('admin-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username: email, password })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            updateUIForLoggedInUser();
            closeAdminLoginModal();
            showNotification('Admin login successful!');
            document.getElementById('admin-login-form').reset();
            // Open admin dashboard and load admin products
            openAdminDashboardModal();
            await fetchAdminProducts();
        } else {
            const errorData = await response.json();
            showNotification(errorData.message || 'Admin login failed.');
        }
    } catch (error) {
        console.error('Admin login error:', error);
        showNotification('An error occurred during admin login.');
    }
}

// Admin Signup handler
async function handleAdminSignup(e) {
    e.preventDefault();
    const username = document.getElementById('admin-signup-username').value;
    const email = document.getElementById('admin-signup-email').value;
    const password = document.getElementById('admin-signup-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/admin/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            updateUIForLoggedInUser();
            closeAdminSignupModal();
            showNotification('Admin account created successfully!');
            const form = document.getElementById('admin-signup-form');
            if (form) form.reset();
            openAdminDashboardModal();
            await fetchAdminProducts();
        } else {
            const errorData = await response.json();
            showNotification(errorData.message || 'Admin signup failed.');
        }
    } catch (error) {
        console.error('Admin signup error:', error);
        showNotification('An error occurred during admin signup.');
    }
}

function updateUIForLoggedInUser() {
    const loginLink = document.querySelector('.login-link');
    const adminLink = document.querySelector('.admin-link');
    const mainContent = document.querySelector('main');
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');

    if (currentUser) {
        if (currentUser.role === 'admin') {
            if (mainContent) mainContent.style.display = 'none';
            if (header) header.style.display = 'none';
            if (footer) footer.style.display = 'none';
        } else {
            loginLink.innerHTML = '<i class="fas fa-user"></i> Logout';
            adminLink.style.display = 'none';
        }

        loginLink.onclick = function(e) {
            e.preventDefault();
            logout();
        };
    } else {
        mainContent.style.display = 'block';
        header.style.display = 'block';
        footer.style.display = 'block';
    }
}

// Restore session on page load
function restoreSession() {
    try {
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        if (token && storedUser) {
            currentUser = JSON.parse(storedUser);
            updateUIForLoggedInUser();
            // Load cart for this user so counts persist
            fetchCart();
            // If admin, ensure admin dashboard view is active after refresh
            if (currentUser && currentUser.role === 'admin') {
                openAdminDashboardModal();
                fetchAdminProducts();
            }
        } else {
            // Ensure login link opens login modal
            const loginLink = document.querySelector('.login-link');
            const adminLink = document.querySelector('.admin-link');
            if (loginLink) {
                loginLink.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
                loginLink.onclick = function(e) {
                    e.preventDefault();
                    openLoginModal();
                };
            }
            if (adminLink) {
                adminLink.style.display = 'block';
            }
        }
    } catch (e) {
        console.error('Session restore error:', e);
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    cart = []; // Clear the cart variable
    updateCartCount(); // Update cart count in UI

    const loginLink = document.querySelector('.login-link');
    const adminLink = document.querySelector('.admin-link');
    const mainContent = document.querySelector('main');
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');

    // Show main content for all users
    if (mainContent) mainContent.style.display = 'block';
    if (header) header.style.display = 'block';
    if (footer) footer.style.display = 'block';

    // Reset login link
    if (loginLink) {
        loginLink.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        loginLink.onclick = function(e) {
            e.preventDefault();
            openLoginModal();
        };
    }
    
    // Show admin link
    if (adminLink) adminLink.style.display = 'block';

    // Close admin dashboard if open
    closeAdminDashboardModal();

    showNotification('Logged out successfully!');
}

// Admin Dashboard functions
function openAdminDashboardModal() {
    document.getElementById('admin-dashboard-modal').style.display = 'block';
    setupAdminDashboardEvents();
}

function closeAdminDashboardModal() {
    const modal = document.getElementById('admin-dashboard-modal');
    if (modal) {
        modal.style.display = 'none';
        // Also reset any form data in the dashboard
        const form = document.getElementById('admin-add-product-form');
        if (form) form.reset();
    }
}

async function fetchAdminProducts() {
    const token = localStorage.getItem('token');
    if (!token) {
        showNotification('Admin token missing. Please log in again.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/products/admin/products`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showNotification(err.message || 'Failed to load admin products.');
            return;
        }

        const data = await response.json();
        const listEl = document.getElementById('admin-products-list');
        if (!listEl) return;

        if (!data.products || data.products.length === 0) {
            listEl.innerHTML = '<p>No products yet.</p>';
            return;
        }

        listEl.innerHTML = data.products.map(p => {
            let imgSrc = 'https://via.placeholder.com/120';
            if (p.image_url) {
                imgSrc = p.image_url;
            } else if (p.image_url1) {
                imgSrc = p.image_url1;
            }
            // Add cache buster for uploaded images
            if (imgSrc.startsWith('/uploads')) {
    imgSrc = `http://localhost:3000${imgSrc}?t=${Date.now()}`;
}

            return `
            <div class="admin-product">
                <div class="admin-product-image">
                    <img src="${imgSrc}" alt="${p.name}" />
                </div>
                <div class="admin-product-details">
                    <div class="admin-product-title">${p.name}</div>
                    <div class="admin-product-price">$${p.price}</div>
                </div>
                <div class="admin-product-actions">
                    <button class="btn-remove" onclick="deleteAdminProduct(${p.id})">Remove</button>
                </div>
            </div>
        `; }).join('');
    } catch (error) {
        console.error('Admin products fetch error:', error);
        showNotification('Error loading admin products.');
    }
}

function setupAdminDashboardEvents() {
    const form = document.getElementById('admin-add-product-form');
    if (form && !form.dataset.bound) {
        form.addEventListener('submit', handleAdminAddProduct);
        form.dataset.bound = 'true';
    }
}

async function handleAdminAddProduct(e) {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) {
        showNotification('Please log in as admin.');
        return;
    }

    const name = document.getElementById('admin-product-name').value.trim();
    const description = document.getElementById('admin-product-description').value.trim();
    const price = document.getElementById('admin-product-price').value;
    const category = document.getElementById('admin-product-category').value.trim();
    const stock = document.getElementById('admin-product-stock').value || 0;
    const imagesInput = document.getElementById('admin-product-images');

    if (!name || !price || !category) {
        showNotification('Name, price, and category are required.');
        return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('price', price);
    formData.append('category', category);
    formData.append('stock_quantity', stock);

    // Require minimum 4 images
    if (!imagesInput || !imagesInput.files || imagesInput.files.length < 4) {
        showNotification('Please upload 4 product images.');
        return;
    }
    Array.from(imagesInput.files).slice(0, 5).forEach(file => {
        formData.append('images', file);
    });

    try {
        const response = await fetch(`${API_BASE_URL}/products`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showNotification(err.message || 'Failed to add product.');
            return;
        }

        const data = await response.json();
        showNotification('Product added successfully!');
        // Reset form
        document.getElementById('admin-add-product-form').reset();
        // Refresh list
        await fetchAdminProducts();
        await fetchProducts();
    } catch (error) {
        console.error('Add product error:', error);
        showNotification('Error adding product.');
    }
}

async function deleteAdminProduct(productId) {
    const token = localStorage.getItem('token');
    if (!token) {
        showNotification('Please log in as admin.');
        return;
    }

    if (!confirm('Are you sure you want to delete this product?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showNotification(err.message || 'Failed to delete product.');
            return;
        }

        showNotification('Product deleted successfully.');
        await fetchAdminProducts();
        await fetchProducts();
    } catch (error) {
        console.error('Delete product error:', error);
        showNotification('Error deleting product.');
    }
}

// Utility functions
function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 3000;
        font-weight: 600;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        transform: translateX(400px);
        transition: transform 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Close modals when clicking outside
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        const hamburger = document.querySelector('.hamburger');
        const navMenu = document.querySelector('.nav-menu');
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    });
});

// Global category filter for homepage tiles
window.filterByCategory = function(category) {
    if (category === 'all') {
        fetchProducts();
    } else {
        fetchProducts({ category });
    }
    const section = document.getElementById('featured-products') || document.getElementById('products-grid');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
};