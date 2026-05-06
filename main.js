// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyCSV-NGe0i_ae-fm_BXVmxWSexWJGWz89Y",
    authDomain: "amwaj-sayyad.firebaseapp.com",
    databaseURL: "https://amwaj-sayyad-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "amwaj-sayyad",
    storageBucket: "amwaj-sayyad.firebasestorage.app",
    messagingSenderId: "28428341574",
    appId: "1:28428341574:web:d88c9559f342384083d547",
    measurementId: "G-3RPDK4KJ38"
};

const isFirebaseEnabled = firebaseConfig.apiKey !== "YOUR_API_KEY";
let db;
if (isFirebaseEnabled) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
}
// ----- Global Variables -----
let menuItems = [];
let unavailableItems = [];
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let globalSettings = {};
let currentDiscount = 0;
let loggedInCustomer = JSON.parse(localStorage.getItem('loggedInCustomer')) || null;
let customerPoints = 0; 

// Track if Firebase menu has loaded (to avoid flash of old data)
let firebaseMenuLoaded = false;

// --- Adaptive UI & Interactive Features ---
function initAdaptiveUI() {
    const savedTheme = localStorage.getItem('user-theme');
    if (savedTheme) {
        document.body.setAttribute('data-theme', savedTheme);
        return;
    }

    const now = new Date();
    const hours = now.getHours();
    let theme = 'morning';

    if (hours >= 17 && hours < 20) theme = 'sunset';
    else if (hours >= 20 || hours < 6) theme = 'night';

    document.body.setAttribute('data-theme', theme);
    console.log(`Adaptive UI: Set theme to ${theme}`);
}

function initVisualEffects() {
    const progress = document.getElementById('scroll-progress');
    const cursor = document.getElementById('custom-cursor');

    // Scroll Progress
    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        if (progress) progress.style.width = scrolled + "%";
    });

    // Custom Cursor
    document.addEventListener('mousemove', (e) => {
        if (cursor) {
            cursor.style.left = e.clientX + 'px';
            cursor.style.top = e.clientY + 'px';
        }
    });

    // Hover detection for cursor
    const interactiveElements = document.querySelectorAll('a, button, .card, .cart-btn');
    interactiveElements.forEach(el => {
        el.addEventListener('mouseenter', () => cursor?.classList.add('hover'));
        el.addEventListener('mouseleave', () => cursor?.classList.remove('hover'));
    });
}

function initVoiceAssistant() {
    if (!('webkitSpeechRecognition' in window)) return;

    const recognition = new webkitSpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.continuous = false;

    window.startVoiceSearch = () => {
        recognition.start();
        console.log("Voice Assistant: Listening...");
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log("Voice Assistant Heard:", transcript);
        const searchInput = document.getElementById('menu-search');
        if (searchInput) {
            searchInput.value = transcript;
            searchMenu();
            searchInput.scrollIntoView({ behavior: 'smooth' });
        }
    };
}

function listenToGlobalUpdates() {
    if (!isFirebaseEnabled || !db) return;

    // Listen to Settings
    db.ref('settings').on('value', (snapshot) => {
        globalSettings = snapshot.val() || {};
        
        // Handle Maintenance Mode
        if (globalSettings.maintenanceMode) {
            document.body.innerHTML = `
                <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:var(--deep-blue); color:white; text-align:center; padding:2rem; font-family: 'Inter', sans-serif;">
                    <i class="fas fa-tools" style="font-size:5rem; color:var(--sandy-gold); margin-bottom:2rem;"></i>
                    <h1>نحن في أعمال صيانة مؤقتة</h1>
                    <p style="margin-top:1rem; font-size:1.2rem;">نعمل على تحسين تجربتكم.. سنعود قريباً جداً!</p>
                    <button onclick="location.reload()" class="btn-primary" style="margin-top:2rem;">تحديث الصفحة</button>
                </div>
            `;
        }

        // Handle Event Mode (Special Effects)
        if (globalSettings.eventMode) {
            startEventEffects();
        } else {
            const oldCanvas = document.getElementById('event-canvas');
            if (oldCanvas) oldCanvas.remove();
        }
    });

    // Listen to Broadcast Messages
    db.ref('notifications/broadcast').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.time > (Date.now() - 30000)) { 
            showBroadcastAlert(data.msg);
        }
    });
}

function showBroadcastAlert(msg) {
    const alertDiv = document.createElement('div');
    alertDiv.style = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:var(--ocean-blue); color:white; padding:1rem 2rem; border-radius:50px; z-index:9999; box-shadow:0 10px 30px rgba(0,0,0,0.3); display:flex; align-items:center; gap:15px; border:2px solid var(--sandy-gold); transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); opacity:0; transform:translateX(-50%) translateY(-20px);";
    alertDiv.innerHTML = `<i class="fas fa-bullhorn" style="color:var(--sandy-gold);"></i> <strong>تنبيه إداري:</strong> ${msg}`;
    document.body.appendChild(alertDiv);
    
    // Trigger animation
    setTimeout(() => {
        alertDiv.style.opacity = "1";
        alertDiv.style.transform = "translateX(-50%) translateY(0)";
    }, 100);

    setTimeout(() => {
        alertDiv.style.opacity = "0";
        alertDiv.style.transform = "translateX(-50%) translateY(-20px)";
        setTimeout(() => alertDiv.remove(), 500);
    }, 10000);
}

function startEventEffects() {
    if (document.getElementById('event-canvas')) return;
    const canvas = document.createElement('div');
    canvas.id = 'event-canvas';
    canvas.style = "position:fixed; inset:0; pointer-events:none; z-index:9998; overflow:hidden;";
    document.body.appendChild(canvas);
    
    const interval = setInterval(() => {
        if (!globalSettings.eventMode) {
            clearInterval(interval);
            canvas.remove();
            return;
        }
        const fish = document.createElement('i');
        fish.className = "fas fa-fish";
        const top = Math.random() * 100;
        const size = Math.random() * 20 + 10;
        const duration = Math.random() * 10 + 5;
        fish.style = `position:absolute; top:${top}%; left:-50px; color:rgba(56, 189, 248, 0.2); font-size:${size}px; transition: left ${duration}s linear;`;
        canvas.appendChild(fish);
        
        setTimeout(() => {
            fish.style.left = "calc(100% + 50px)";
        }, 100);

        setTimeout(() => fish.remove(), duration * 1000 + 500);
    }, 2500);
}

// --- Developer Modal Functions ---
function openDeveloperModal() {
    const modal = document.getElementById('developer-modal');
    if (modal) modal.style.display = 'flex';
}

function closeDeveloperModal() {
    const modal = document.getElementById('developer-modal');
    if (modal) modal.style.display = 'none';
}

// --- Support Modal Functions ---
function openSupportModal() {
    const modal = document.getElementById('support-modal');
    if (modal) modal.style.display = 'flex';
}

function closeSupportModal() {
    const modal = document.getElementById('support-modal');
    if (modal) modal.style.display = 'none';
}



// Render Menu
function renderMenu(filter = 'all', searchQuery = '') {
    // Only load from localStorage if menuItems is empty (initial load fallback)
    if (menuItems.length === 0) {
        menuItems = JSON.parse(localStorage.getItem('restaurantMenu')) || initialMenuItems;
    }
    
    const menuGrid = document.getElementById('menu-grid');
    if (!menuGrid) return;

    menuGrid.innerHTML = '';
    
    let filteredItems = filter === 'all' ? menuItems : menuItems.filter(item => item.category === filter);
    
    if (searchQuery) {
        filteredItems = filteredItems.filter(item => 
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            translateCategory(item.category).includes(searchQuery)
        );
    }

    const isCurrentlyClosed = document.getElementById('current-status-badge')?.innerText.includes("مغلق");
    const currentUnavailable = unavailableItems;

    if (filteredItems.length === 0) {
        menuGrid.innerHTML = `<div style="text-align:center; padding: 3rem; color: #64748b; grid-column: 1/-1;"><i class="fas fa-search" style="font-size:2rem; margin-bottom:1rem;"></i><p>لا توجد نتائج لبحثك</p></div>`;
        return;
    }

    filteredItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        
        let customInputUI = '';
        if (item.category === 'grilled') {
            customInputUI += `
                <div style="margin-bottom: 10px;">
                    <label style="font-size: 0.8rem; display: block; margin-bottom: 5px;">طريقة التحضير:</label>
                    <select id="prep-${item.id}" style="width: 100%; padding: 8px; border-radius: 5px; border: 1px solid #ddd; font-family: inherit;">
                        <option value="مشوي">مشوي</option>
                        <option value="مقلي">مقلي</option>
                    </select>
                </div>
            `;
        }
        if (item.pricePerKilo) {
            customInputUI += `
                <div style="margin-bottom: 10px;">
                    <label style="font-size: 0.8rem; display: block; margin-bottom: 5px;">أدخل الوزن (بالجرام):</label>
                    <input type="number" class="weight-input" id="weight-${item.id}" value="1000" min="100" step="100" oninput="updateCustomPrice(${item.id}, ${item.pricePerKilo})" style="width: 100%; padding: 8px; border-radius: 5px; border: 1px solid #ddd; font-family: inherit;">
                </div>
            `;
        }
        
        // FIX: Compare as number AND string to handle both cases
        const isUnavailable = currentUnavailable.some(id => Number(id) === Number(item.id));

        card.className = 'card';

        card.innerHTML = `
            ${isUnavailable ? `<div style="position:absolute;top:10px;right:10px;background:#dc2626;color:white;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:bold;z-index:2;">🚫 نفذت الكمية</div>` : ''}
            <img src="${item.image}" alt="${item.name}" style="${isUnavailable ? 'filter: grayscale(70%);' : ''}">
            <div class="card-content">
                <h3 style="${isUnavailable ? 'color:#9ca3af;' : ''}">${item.name}</h3>
                ${item.calories ? `<p class="item-calories">${item.calories} سعرة حرارية</p>` : ''}
                ${isUnavailable ? '' : customInputUI}
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span id="price-${item.id}" style="font-weight: bold; color: ${isUnavailable ? '#9ca3af' : 'var(--ocean-blue)'};">${item.price || item.pricePerKilo} <span class="icon-saudi_riyal"></span></span>
                    ${isUnavailable ?
                        `<button class="add-to-cart" disabled style="background:#e5e7eb;color:#9ca3af;cursor:not-allowed;border:none;">🚫 نفذت الكمية</button>` :
                        isCurrentlyClosed ?
                            `<button class="add-to-cart" disabled style="background: #ccc; cursor: not-allowed;">المطعم مغلق</button>` :
                            `<button class="add-to-cart" onclick="addToCart(${item.id})"><i class="fas fa-plus"></i> إضافة للسلة</button>`
                    }
                </div>
            </div>
        `;

        // Apply styles AFTER innerHTML is set
        if (isUnavailable) {
            card.style.opacity = '0.65';
            card.style.position = 'relative';
        } else {
            card.style.opacity = '1';
            card.style.position = 'relative'; // Always relative for badge positioning
        }

        menuGrid.appendChild(card);
    });
}

function updateCustomPrice(id, pricePerKilo) {
    const weight = document.getElementById(`weight-${id}`).value;
    const priceSpan = document.getElementById(`price-${id}`);
    const calculatedPrice = (weight / 1000) * pricePerKilo;
    priceSpan.innerHTML = calculatedPrice.toFixed(2) + ' <span class="icon-saudi_riyal"></span>';
}

// Filter Function
function filterMenu(category) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (event) event.target.classList.add('active');
    renderMenu(category, document.getElementById('menu-search').value);
}

function searchMenu() {
    const query = document.getElementById('menu-search').value;
    const activeFilter = document.querySelector('.filter-btn.active').innerText;
    // Map Arabic display name back to category key
    const mapping = { 'الكل': 'all', 'مقبلات': 'appetizer', 'قسم السمك': 'grilled', 'طواجن': 'stew', 'شوربات': 'soup', 'ماكولات شعبيه': 'traditional', 'مشروبات': 'drink' };
    renderMenu(mapping[activeFilter] || 'all', query);
}

// Cart Logic
function addToCart(id) {
    const item = menuItems.find(i => i.id === id);
    let selectedWeight = null;
    let selectedPrice = item.price;
    let selectedPrep = null;

    if (item.category === 'grilled') {
        const prepSelect = document.getElementById(`prep-${id}`);
        if (prepSelect) selectedPrep = prepSelect.value;
    }

    if (item.pricePerKilo) {
        const weightInput = document.getElementById(`weight-${id}`);
        const weightValue = weightInput.value;
        selectedWeight = weightValue + " جرام";
        selectedPrice = (weightValue / 1000) * item.pricePerKilo;
    }

    // Unique ID for cart items with same product but different weight or prep
    const cartId = item.id + (selectedWeight ? '-' + selectedWeight : '') + (selectedPrep ? '-' + selectedPrep : '');
    const cartItem = cart.find(i => i.cartId === cartId);

    if (cartItem) {
        cartItem.quantity++;
    } else {
        cart.push({ ...item, cartId, quantity: 1, price: selectedPrice, selectedWeight, selectedPrep });
    }

    updateCart();
    
    // Visual feedback
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = "تمت الإضافة!";
    btn.style.background = "#28a745";
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = "var(--ocean-blue)";
    }, 1000);
}

function updateCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
    const count = cart.reduce((acc, item) => acc + item.quantity, 0);
    document.getElementById('cart-count').innerText = count;
    renderCartItems();
}

function renderCartItems() {
    const cartItemsList = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    if (!cartItemsList) return;

    cartItemsList.innerHTML = '';
    let total = 0;

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        const itemEl = document.createElement('div');
        itemEl.style.display = 'flex';
        itemEl.style.justifyContent = 'space-between';
        itemEl.style.marginBottom = '1rem';
        itemEl.innerHTML = `
            <div>
                <strong>${item.name}</strong> ${item.selectedPrep ? `[${item.selectedPrep}]` : ''} ${item.selectedWeight ? `(${item.selectedWeight})` : ''} x ${item.quantity}
            </div>
            <div>
                    <span>${itemTotal.toFixed(2)} <span class="icon-saudi_riyal"></span></span>
                <i class="fas fa-trash" onclick="removeFromCart('${item.cartId}')" style="color: red; cursor: pointer; margin-right: 10px;"></i>
            </div>
        `;
        cartItemsList.appendChild(itemEl);
    });

    const discountArea = document.getElementById('discount-area');
    const discountAmountEl = document.getElementById('discount-amount');

    const balanceEl = document.getElementById('loyalty-points-balance');
    const redeemSection = document.getElementById('loyalty-redeem-section');
    const redeemCheckbox = document.getElementById('redeem-points-checkbox');
    let loyaltyDiscount = 0;

    if (balanceEl) {
        const pointsToDisplay = loggedInCustomer ? (loggedInCustomer.points || 0) : 0;
        balanceEl.innerText = pointsToDisplay;
        
        if (pointsToDisplay >= 100) {
            redeemSection.style.display = 'block';
            if (redeemCheckbox && redeemCheckbox.checked && cart.length > 0) {
                const mostExpensiveItem = [...cart].sort((a, b) => b.price - a.price)[0];
                loyaltyDiscount = mostExpensiveItem.price; 
            }
        } else {
            redeemSection.style.display = 'none';
            if(redeemCheckbox) redeemCheckbox.checked = false;
        }
    }

    let totalAfterLoyalty = total - loyaltyDiscount;
    if(totalAfterLoyalty < 0) totalAfterLoyalty = 0;
    
    totalEl.innerText = total.toFixed(2);
    
    if (currentDiscount > 0 || loyaltyDiscount > 0) {
        let finalDiscountVal = 0;
        if(currentDiscount > 0) {
            finalDiscountVal += totalAfterLoyalty * (currentDiscount / 100);
        }
        finalDiscountVal += loyaltyDiscount;

        discountArea.style.display = 'flex';
        discountAmountEl.innerText = finalDiscountVal.toFixed(2);
        totalEl.innerText = (total - finalDiscountVal).toFixed(2);
    } else {
        discountArea.style.display = 'none';
        totalEl.innerText = total.toFixed(2);
    }

    // Update new points preview
    const newPointsPreview = document.getElementById('new-points-preview');
    if (newPointsPreview) {
        newPointsPreview.innerText = cart.length > 0 ? "1" : "0";
    }

    // --- Loyalty Claim Button in Cart ---
    if (loggedInCustomer) {
        const threshold = globalSettings && globalSettings.pointsThreshold ? parseInt(globalSettings.pointsThreshold) : 100;
        let cartClaimContainer = document.getElementById('cart-loyalty-claim-container');
        if (!cartClaimContainer) {
            cartClaimContainer = document.createElement('div');
            cartClaimContainer.id = 'cart-loyalty-claim-container';
            const checkoutBtn = document.querySelector('button[onclick="checkout()"]');
            if (checkoutBtn && checkoutBtn.parentElement) {
                checkoutBtn.parentElement.insertBefore(cartClaimContainer, checkoutBtn);
            }
        }
        cartClaimContainer.innerHTML = '';
        if (loggedInCustomer.points >= threshold) {
            const claimBtn = document.createElement('button');
            claimBtn.innerHTML = `<i class="fab fa-whatsapp"></i> مطالبه بالنقاط (${loggedInCustomer.points})`;
            claimBtn.style.cssText = "width:100%; padding:10px; background:#25d366; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:bold; margin-bottom:10px; font-size:0.9rem; animation: pulse 2s infinite;";
            claimBtn.onclick = () => claimLoyaltyPoints();
            cartClaimContainer.appendChild(claimBtn);
        }
    }
}
function checkout() {
    const name = document.getElementById('customer-name').value;
    const phone = document.getElementById('customer-phone').value;
    const email = document.getElementById('customer-email').value;
    const notes = document.getElementById('order-notes').value;
    const orderType = document.querySelector('input[name="order-type"]:checked').value;
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    const redeemCheckbox = document.getElementById('redeem-points-checkbox');
    const isRedeeming = redeemCheckbox && redeemCheckbox.checked;

    if (!name || !phone) {
        alert("يرجى إدخال الاسم ورقم الجوال.");
        return;
    }

    if (cart.length === 0) {
        alert("سلة التسوق فارغة!");
        return;
    }

    const total = document.getElementById('cart-total').innerText;
    const currentCartData = [...cart]; // Capture cart data before clearing
    const totalItemsCount = currentCartData.reduce((acc, item) => acc + item.quantity, 0);
    const phoneNumber = "966546117271";

    let message = `*طلب جديد من الموقع*\n\n`;
    message += `👤 *العميل:* ${name}\n`;
    message += `📱 *الجوال:* ${phone}\n`;
    if (email) message += `📧 *البريد:* ${email}\n`;
    message += `🛍️ *نوع الطلب:* ${orderType}\n`;
    message += `💳 *طريقة الدفع:* ${paymentMethod}\n`;
    if (notes) message += `📝 *ملاحظات:* ${notes}\n`;
    if (isRedeeming) message += `🎁 *تم استخدام 100 نقطة لوجبة مجانية*\n`;
    message += `\n*الطلبات:*\n`;

    currentCartData.forEach(item => {
        message += `- ${item.name} ${item.selectedPrep ? `[${item.selectedPrep}]` : ''} ${item.selectedWeight ? `(${item.selectedWeight})` : ''} (x${item.quantity}) - ${(item.price * item.quantity).toFixed(2)} ر.س\n`;
    });

    message += `\n💰 *الإجمالي النهائي: ${total} ر.س*`;

    // ----- LOYALTY POINTS FIREBASE SAVE -----
    if (isFirebaseEnabled && db) {
        const targetPhone = loggedInCustomer ? loggedInCustomer.phone : phone;
        if (targetPhone) {
            const customerRef = db.ref('customers/' + targetPhone);
            customerRef.once('value').then(snapshot => {
                let customerData = snapshot.val();
                if (!customerData) {
                    customerData = { name, phone, email, points: 0, lastPurchaseDate: new Date().toISOString() };
                }
                customerData.lastPurchaseDate = new Date().toISOString();
                const pointsToAdd = globalSettings && globalSettings.pointsPerOrder ? parseInt(globalSettings.pointsPerOrder) : 1;
                const threshold = globalSettings && globalSettings.pointsThreshold ? parseInt(globalSettings.pointsThreshold) : 10;
                
                if (isRedeeming && customerData.points >= threshold) customerData.points -= threshold;
                customerData.points += pointsToAdd; 
                customerRef.set(customerData);

                // Save Order Invoice and Tracking
                const orderId = 'ORD-' + Date.now();
                const orderData = {
                    orderId,
                    customerName: name,
                    customerPhone: targetPhone,
                    date: new Date().toLocaleString('ar-SA'),
                    timestamp: Date.now(),
                    total: total,
                    items: currentCartData.map(i => ({ 
                        name: i.name, 
                        qty: i.quantity, 
                        price: i.price,
                        prep: i.selectedPrep || '',
                        weight: i.selectedWeight || ''
                    })),
                    payment: paymentMethod,
                    type: orderType,
                    notes: notes || '',
                    status: 'pending' // Initial status
                };

                // 1. Save to customer's history
                db.ref('customers/' + targetPhone + '/orders/' + orderId).set(orderData);
                
                // 2. Save to global orders node for Admin Dashboard
                db.ref('orders/' + orderId).set(orderData);
            }).catch(err => console.error("Firebase Save Error:", err));
        }
    }
    // ----------------------------------------

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');

    cart = [];
    updateCart();
    toggleCart();
    
    document.getElementById('order-notes').value = '';
    if(redeemCheckbox) redeemCheckbox.checked = false;
}

// --- Authentication & Profile Logic ---

function updateAuthUI() {
    const navBtn = document.getElementById('auth-nav-btn');
    const mobileBtn = document.getElementById('auth-mobile-btn');
    const nameInput = document.getElementById('customer-name');
    const phoneInput = document.getElementById('customer-phone');
    const emailInput = document.getElementById('customer-email');

    if (loggedInCustomer) {
        const displayText = `أهلاً ${loggedInCustomer.name.split(' ')[0]} ⭐ ${loggedInCustomer.points || 0}`;
        if (navBtn) navBtn.innerHTML = `<i class="fas fa-user-circle"></i> ${displayText}`;
        if (mobileBtn) mobileBtn.innerHTML = `<i class="fas fa-user-circle"></i> ${displayText}`;
        
        if (nameInput) nameInput.value = loggedInCustomer.name;
        if (phoneInput) phoneInput.value = loggedInCustomer.phone;
        if (emailInput) emailInput.value = loggedInCustomer.email || '';
    } else {
        if (navBtn) navBtn.innerHTML = `<i class="fas fa-user-circle"></i> حسابي`;
        if (mobileBtn) mobileBtn.innerHTML = `<i class="fas fa-user-circle"></i> حسابي`;
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (emailInput) emailInput.value = '';
    }
}

function openProfileModal() {
    const modal = document.getElementById('auth-modal');
    const profileView = document.getElementById('profile-view');
    const authView = document.getElementById('auth-view');
    
    if (loggedInCustomer) {
        document.getElementById('profile-name').innerText = loggedInCustomer.name;
        document.getElementById('profile-phone').innerText = loggedInCustomer.phone;
        document.getElementById('profile-points').innerText = loggedInCustomer.points || 0;
        
        // Fetch and display orders
        const ordersList = document.getElementById('profile-orders-list');
        if (ordersList) {
            ordersList.innerHTML = '<p style="text-align:center; font-size:0.8rem;">جاري تحميل الفواتير...</p>';
            if (isFirebaseEnabled && db) {
                db.ref('customers/' + loggedInCustomer.phone + '/orders').limitToLast(10).once('value').then(snapshot => {
                    const orders = snapshot.val();
                    if (orders) {
                        const ordersArray = Object.values(orders);
                        ordersArray.sort((a, b) => b.timestamp - a.timestamp);
                        ordersList.innerHTML = ordersArray.map(order => {
                            const statusConfig = {
                                'pending': { text: 'قيد الانتظار', color: '#f59e0b', bg: '#fef3c7' },
                                'preparing': { text: 'جاري التحضير', color: '#3b82f6', bg: '#dbeafe' },
                                'ready': { text: 'جاهز للاستلام', color: '#8b5cf6', bg: '#ede9fe' },
                                'delivered': { text: 'تم التسليم', color: '#10b981', bg: '#d1fae5' },
                                'cancelled': { text: 'ملغي', color: '#ef4444', bg: '#fee2e2' }
                            };
                            const config = statusConfig[order.status] || statusConfig['pending'];
                            
                            return `
                                <div style="padding: 1rem; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                                    <div style="flex: 1; min-width: 200px;">
                                        <div style="font-weight: bold; font-size: 0.9rem; color: var(--text-main); margin-bottom: 5px;">
                                            طلب #${order.orderId}
                                            <span style="background: ${config.bg}; color: ${config.color}; padding: 2px 8px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; margin-right: 10px;">
                                                ${config.text}
                                            </span>
                                        </div>
                                        <div style="font-size: 0.8rem; color: #94a3b8;">${order.date}</div>
                                        <div style="font-weight: bold; margin-top: 5px; color: var(--ocean-blue);">${order.total} <span class="icon-saudi_riyal"></span></div>
                                    </div>
                                    <div style="display: flex; gap: 8px;">
                                        <button onclick='printInvoice("${order.orderId}", ${JSON.stringify(order)})' style="padding: 8px 12px; background: #64748b; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.8rem;"><i class="fas fa-print"></i> طباعة</button>
                                        <button onclick='downloadInvoicePDF("${order.orderId}", ${JSON.stringify(order)})' style="padding: 8px 12px; background: var(--ocean-blue); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.8rem;"><i class="fas fa-file-pdf"></i> تحميل PDF</button>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    } else {
                        ordersList.innerHTML = '<p style="color: #94a3b8; font-size: 0.85rem; text-align: center;">لا توجد طلبات سابقة بعد.</p>';
                    }
                });
            }
        }

        // --- Loyalty Claim Button Logic ---
        const threshold = globalSettings && globalSettings.pointsThreshold ? parseInt(globalSettings.pointsThreshold) : 100;
        const claimContainer = document.getElementById('loyalty-claim-container') || document.createElement('div');
        claimContainer.id = 'loyalty-claim-container';
        claimContainer.innerHTML = '';
        
        if (loggedInCustomer.points >= threshold) {
            const claimBtn = document.createElement('button');
            claimBtn.innerHTML = `<i class="fab fa-whatsapp"></i> مطالبة بالنقاط (${loggedInCustomer.points})`;
            claimBtn.style.cssText = "width:100%; padding:12px; background:#25d366; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:bold; margin-top:1rem; animation: pulse 2s infinite;";
            claimBtn.onclick = () => claimLoyaltyPoints();
            claimContainer.appendChild(claimBtn);
        }
        
        const profileView = document.getElementById('profile-view');
        // Insert before logout button
        const logoutBtn = profileView.querySelector('button[onclick="processLogout()"]');
        if (logoutBtn) {
            profileView.insertBefore(claimContainer, logoutBtn);
        } else {
            profileView.appendChild(claimContainer);
        }

        profileView.style.display = 'block';
        authView.style.display = 'none';
    } else {
        profileView.style.display = 'none';
        authView.style.display = 'block';
        switchAuthTab('login');
    }
    modal.style.display = 'flex';
}

function claimLoyaltyPoints() {
    if (!loggedInCustomer) return;
    
    const threshold = globalSettings && globalSettings.pointsThreshold ? parseInt(globalSettings.pointsThreshold) : 100;
    if (loggedInCustomer.points < threshold) {
        alert("عذراً، رصيدك غير كافٍ للمطالبة.");
        return;
    }

    const oldPoints = loggedInCustomer.points;
    const newPoints = oldPoints - threshold;
    
    // 1. Prepare WhatsApp message
    const msg = encodeURIComponent(`مرحباً أمواج الصياد، أود المطالبة بمكافأة النقاط الخاصة بي.\nالاسم: ${loggedInCustomer.name}\nالهاتف: ${loggedInCustomer.phone}\nالنقاط المستبدلة: ${threshold}\nالرصيد المتبقي: ${newPoints}`);
    const adminPhone = globalSettings.whatsapp || "966546117271";
    
    // 2. Update Firebase
    if (isFirebaseEnabled && db) {
        db.ref('customers/' + loggedInCustomer.phone + '/points').set(newPoints)
            .then(() => {
                // 3. Update Local State
                loggedInCustomer.points = newPoints;
                localStorage.setItem('loggedInCustomer', JSON.stringify(loggedInCustomer));
                
                // 4. Update UI
                updateAuthUI();
                renderCartItems();
                
                // 5. Open WhatsApp
                window.open(`https://wa.me/${adminPhone}?text=${msg}`, '_blank');
                
                alert("تم استبدال النقاط بنجاح وفتح محادثة واتساب للمطالبة.");
                closeProfileModal();
            })
            .catch(err => {
                alert("حدث خطأ أثناء تحديث النقاط: " + err.message);
            });
    } else {
        alert("هذه الميزة تتطلب تفعيل نظام المزامنة.");
    }
}

function closeProfileModal() {
    document.getElementById('auth-modal').style.display = 'none';
}

function switchAuthTab(tab) {
    document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('auth-title').innerText = tab === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد';
    document.getElementById('tab-login').style.color = tab === 'login' ? 'var(--ocean-blue)' : '#94a3b8';
    document.getElementById('tab-register').style.color = tab === 'register' ? 'var(--ocean-blue)' : '#94a3b8';
    document.getElementById('auth-error').style.display = 'none';
}

function processLogin() {
    const phone = document.getElementById('login-phone').value.trim();
    const pass = document.getElementById('login-password').value;
    const errorEl = document.getElementById('auth-error');

    if (!phone || !pass) {
        errorEl.innerText = "يرجى إدخال رقم الجوال وكلمة المرور";
        errorEl.style.display = 'block';
        return;
    }

    if (isFirebaseEnabled && db) {
        db.ref('customers/' + phone).once('value').then(snapshot => {
            const data = snapshot.val();
            if (data && data.password === pass) {
                loggedInCustomer = data;
                localStorage.setItem('loggedInCustomer', JSON.stringify(loggedInCustomer));
                updateAuthUI();
                closeProfileModal();
                // Listen for real-time updates
                db.ref('customers/' + phone).on('value', snap => {
                    if (snap.val()) {
                        loggedInCustomer = snap.val();
                        localStorage.setItem('loggedInCustomer', JSON.stringify(loggedInCustomer));
                        updateAuthUI();
                    }
                });
            } else {
                errorEl.innerText = "بيانات الدخول غير صحيحة";
                errorEl.style.display = 'block';
            }
        });
    }
}

function processRegister() {
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const pass = document.getElementById('reg-password').value;
    const errorEl = document.getElementById('auth-error');

    if (!name || !phone || !pass) {
        errorEl.innerText = "يرجى تعبئة جميع الحقول";
        errorEl.style.display = 'block';
        return;
    }

    if (isFirebaseEnabled && db) {
        db.ref('customers/' + phone).once('value').then(snapshot => {
            if (snapshot.exists()) {
                errorEl.innerText = "رقم الجوال مسجل مسبقاً";
                errorEl.style.display = 'block';
            } else {
                const newUser = { name, phone, password: pass, points: 0, lastPurchaseDate: new Date().toISOString() };
                db.ref('customers/' + phone).set(newUser).then(() => {
                    loggedInCustomer = newUser;
                    localStorage.setItem('loggedInCustomer', JSON.stringify(loggedInCustomer));
                    updateAuthUI();
                    closeProfileModal();
                });
            }
        });
    }
}

function processLogout() {
    loggedInCustomer = null;
    localStorage.removeItem('loggedInCustomer');
    updateAuthUI();
    closeProfileModal();
}

function toggleCart() {
    const sidebar = document.getElementById('cart-sidebar');
    if (sidebar.style.left === '0px') {
        sidebar.style.left = '-400px';
    } else {
        sidebar.style.left = '0px';
        renderCartItems();
    }
}

// Reservation Form Handling
const resForm = document.getElementById('reservation-form');
if (resForm) {
    resForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('res-name').value;
        const phone = document.getElementById('res-phone').value;
        const date = document.getElementById('res-date').value;
        const time = document.getElementById('res-time').value;
        const persons = document.getElementById('res-persons').value;

        if (!name || !phone || !date || !time) {
            alert("يرجى تعبئة جميع الحقول المطلوبة.");
            return;
        }

        const adminPhone = "966546117271";
        let message = `*طلب حجز طاولة جديد*\n\n`;
        message += `👤 *الاسم:* ${name}\n`;
        message += `📱 *رقم الجوال:* ${phone}\n`;
        message += `📅 *التاريخ:* ${date}\n`;
        message += `⏰ *الوقت:* ${time}\n`;
        message += `👥 *عدد الأفراد:* ${persons}\n\n`;
        message += `شكراً لكم!`;

        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = `https://wa.me/${adminPhone}?text=${encodedMessage}`;

        window.open(whatsappUrl, '_blank');
        
        resForm.reset();
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    updateCart();
    renderMenu();

    if (isFirebaseEnabled) {
        // Real-time listener for settings
        db.ref('settings').on('value', (snapshot) => {
            const settings = snapshot.val();
            if (settings) {
                applySettings(settings);
            }
        }, (error) => {
            console.error('Firebase settings error:', error);
        });

        // Real-time listener for menu (يُحدِّث المنيو فوراً عند أي تعديل من لوحة التحكم)
        db.ref('menu').on('value', (snapshot) => {
            const firebaseMenu = snapshot.val();
            if (firebaseMenu && Array.isArray(firebaseMenu) && firebaseMenu.length > 0) {
                menuItems = firebaseMenu;
                localStorage.setItem('restaurantMenu', JSON.stringify(menuItems));
                firebaseMenuLoaded = true;
                renderMenu(); // Re-render with latest menu from Firebase
            }
        }, (error) => {
            console.error('Firebase menu error:', error);
        });

        // Real-time listener for unavailable items
        db.ref('settings/unavailableItems').on('value', (snapshot) => {
            const data = snapshot.val();
            unavailableItems = Array.isArray(data) ? data : [];
            localStorage.setItem('unavailableItems', JSON.stringify(unavailableItems));
            renderMenu();
        });

    } else {
        initStatus(); // Fallback to local
    }

    updateAuthUI();
    initAdaptiveUI();
    initVisualEffects();
    initVoiceAssistant();
    listenToGlobalUpdates();
    initStaff(); // Load staff from Firebase
    
    if (loggedInCustomer && isFirebaseEnabled && db) {
        db.ref('customers/' + loggedInCustomer.phone).on('value', snap => {
            if (snap.val()) {
                loggedInCustomer = snap.val();
                localStorage.setItem('loggedInCustomer', JSON.stringify(loggedInCustomer));
                updateAuthUI();
            }
        });
    }
});

// ===================================================
// ===    STAFF - Dynamic Rendering from Firebase  ===
// ===================================================

const STAFF_TYPE_META = {
    reservations: { label: 'الاستفسارات والحجوزات',  sub: 'تواصل مع مدير الصالة',      icon: 'fa-calendar-check',  msg: 'مرحباً، أود الاستفسار عن حجز...' },
    delivery:     { label: 'تتبع طلبات التوصيل',      sub: 'تواصل مع كابتن التوصيل',   icon: 'fa-shipping-fast',   msg: 'مرحباً، أود تتبع طلبي...' },
    feedback:     { label: 'الاقتراحات والملاحظات',   sub: 'صوتك يهمنا دائماً',        icon: 'fa-comment-dots',    msg: 'مرحباً، لدي ملاحظة بخصوص...' },
    orders:       { label: 'إدارة الطلبات',           sub: 'تواصل مع مسؤول الطلبات',   icon: 'fa-shopping-bag',    msg: 'مرحباً، لدي استفسار عن طلبي...' },
    general:      { label: 'الدعم العام',             sub: 'فريق خدمة العملاء',        icon: 'fa-headset',         msg: 'مرحباً، أحتاج للمساعدة بخصوص...' }
};

function initStaff() {
    if (!isFirebaseEnabled || !db) {
        renderFallbackStaff();
        return;
    }

    db.ref('staff').on('value', snapshot => {
        const staffObj = snapshot.val();
        if (!staffObj) {
            renderFallbackStaff();
            return;
        }
        const staffList = Object.values(staffObj);
        renderStaffSection(staffList);
        renderSupportModal(staffList);
    });
}

function renderFallbackStaff() {
    // Default staff if Firebase unavailable
    const fallback = [
        { name: 'الأستاذ محمد', role: 'المدير العام للمطعم', type: 'reservations', phone: '966546117271', icon: 'fa-user-tie' },
        { name: 'الشيف حسن',    role: 'كبير الطهاة (تنفيذي)', type: 'orders',       phone: '966546117271', icon: 'fa-utensils' },
        { name: 'خدمة العملاء', role: 'متاحون لمساعدتكم 24/7', type: 'general',    phone: '966546117271', icon: 'fa-headset'  }
    ];
    renderStaffSection(fallback);
    renderSupportModal(fallback);
}

function renderStaffSection(staffList) {
    const grid = document.getElementById('staff-grid-dynamic');
    if (!grid) return;
    grid.innerHTML = '';

    staffList.forEach(staff => {
        const meta = STAFF_TYPE_META[staff.type] || STAFF_TYPE_META['general'];
        const msg  = encodeURIComponent(`${meta.msg}`);
        const card = document.createElement('div');
        card.className = 'staff-card';
        card.innerHTML = `
            <div class="staff-img-wrapper">
                <i class="fas ${staff.icon || 'fa-user'}"></i>
            </div>
            <h3>${staff.name}</h3>
            <p>${staff.role}</p>
            <a href="https://wa.me/${staff.phone}?text=${msg}" target="_blank" class="staff-contact-btn">
                <i class="fab fa-whatsapp"></i> تواصل مباشر
            </a>
        `;
        grid.appendChild(card);
    });
}

function renderSupportModal(staffList) {
    const container = document.getElementById('support-options-dynamic');
    if (!container) return;
    container.innerHTML = '';

    staffList.forEach(staff => {
        const meta = STAFF_TYPE_META[staff.type] || STAFF_TYPE_META['general'];
        const msg  = encodeURIComponent(`مرحباً ${staff.name}، ${meta.msg}`);
        const link = document.createElement('a');
        link.href    = `https://wa.me/${staff.phone}?text=${msg}`;
        link.target  = '_blank';
        link.className = 'support-option';
        link.innerHTML = `
            <i class="fas ${meta.icon}"></i>
            <div>
                <h4 style="margin:0;">${meta.label}</h4>
                <small style="color:var(--text-muted);">${staff.name} — ${meta.sub}</small>
            </div>
        `;
        container.appendChild(link);
    });
}

function applySettings(settings) {
    globalSettings = settings;
    const statusBadge = document.getElementById('current-status-badge');
    const openTimeEl = document.getElementById('display-open-time');
    const closeTimeEl = document.getElementById('display-close-time');
    const promoBanner = document.getElementById('promo-banner');
    const promoMarquee = document.getElementById('promo-marquee');
    const promoImageContainer = document.getElementById('promo-image-container');
    const promoImageEl = document.getElementById('promo-image-el');
    const promoVideoContainer = document.getElementById('promo-video-container');
    const promoVideoEl = document.getElementById('promo-video-el');

    const openTime = settings.openTime || "09:00";
    const closeTime = settings.closeTime || "23:00";
    const manualStatus = settings.manualStatus;
    const promoText = settings.promoText || "🔥 عرض الغداء: خصم 20% على جميع الطواجن يومياً من 12 إلى 4 عصراً! 🔥";
    const promoImage = settings.promoImage || "";
    const promoVideo = settings.promoVideo || "";
    const showPromo = settings.showPromo !== undefined ? settings.showPromo : true;

    if (openTimeEl) openTimeEl.innerText = formatTime(openTime);
    if (closeTimeEl) closeTimeEl.innerText = formatTime(closeTime);

    // Update Promo
    if (promoBanner) {
        if (showPromo) {
            promoBanner.style.display = 'block';
            if (promoMarquee) promoMarquee.innerText = promoText;
            if (promoVideo && promoVideoContainer && promoVideoEl) {
                promoVideoEl.src = promoVideo;
                promoVideoContainer.style.display = 'block';
                if (promoImageContainer) promoImageContainer.style.display = 'none';
            } else if (promoImage && promoImageContainer && promoImageEl) {
                promoImageEl.src = promoImage;
                promoImageContainer.style.display = 'block';
                if (promoVideoContainer) promoVideoContainer.style.display = 'none';
            } else {
                if (promoImageContainer) promoImageContainer.style.display = 'none';
                if (promoVideoContainer) promoVideoContainer.style.display = 'none';
            }
        } else {
            promoBanner.style.display = 'none';
        }
    }

    // Status logic
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    let isOpen = false;
    if (openTime <= closeTime) isOpen = currentTime >= openTime && currentTime <= closeTime;
    else isOpen = currentTime >= openTime || currentTime <= closeTime;
    
    if (manualStatus === 'open') isOpen = true;
    if (manualStatus === 'closed') isOpen = false;

    if (statusBadge) {
        statusBadge.innerText = isOpen ? "● مفتوح الآن" : "● مغلق الآن";
        statusBadge.style.color = isOpen ? "#22c55e" : "#dc3545";
    }

    // --- Advanced Features ---
    
    // 1. Social Media Links
    if (settings.instagram) document.getElementById('link-instagram').href = settings.instagram;
    if (settings.tiktok) document.getElementById('link-tiktok').href = settings.tiktok;
    if (settings.whatsapp) {
        document.getElementById('link-whatsapp-footer').href = `https://wa.me/${settings.whatsapp}`;
    }

    // 2. Announcement Popup (Show once per session)
    const popup = document.getElementById('announcement-popup');
    if (settings.showPopup && !sessionStorage.getItem('popupShown')) {
        document.getElementById('popup-title-el').innerText = settings.popupTitle || "تنبيه";
        document.getElementById('popup-text-el').innerText = settings.popupText || "";
        popup.style.display = 'flex';
        sessionStorage.setItem('popupShown', 'true');
    }

    // 3. Theme Colors (Full Sync)
    if (settings.colorPrimary) document.documentElement.style.setProperty('--primary-blue', settings.colorPrimary);
    if (settings.colorDeep) document.documentElement.style.setProperty('--deep-blue', settings.colorDeep);
    if (settings.colorGold) {
        document.documentElement.style.setProperty('--sandy-gold', settings.colorGold);
        document.documentElement.style.setProperty('--ocean-blue', settings.colorGold); // Link primary accent
    }
    if (settings.colorOrange) document.documentElement.style.setProperty('--coral-orange', settings.colorOrange);
    if (settings.colorBg) document.documentElement.style.setProperty('--wave-white', settings.colorBg);

    // 4. Electronic Payment Toggle
    const onlinePaymentWrapper = document.getElementById('payment-online-wrapper');
    if (onlinePaymentWrapper) {
        if (settings.enableOnlinePayment === false) {
            onlinePaymentWrapper.style.display = 'none';
            // If the hidden option was selected, switch to cash
            const selectedMethod = document.querySelector('input[name="payment-method"]:checked');
            if (selectedMethod && selectedMethod.value === "دفع إلكتروني") {
                document.querySelector('input[name="payment-method"][value="كاش (عند الاستلام)"]').checked = true;
            }
        } else {
            onlinePaymentWrapper.style.display = 'flex';
        }
    }
}

function closePopup() {
    document.getElementById('announcement-popup').style.display = 'none';
}

function initStatus() {
    const savedSettings = localStorage.getItem('restaurantSettings');
    const statusBadge = document.getElementById('current-status-badge');
    const openTimeEl = document.getElementById('display-open-time');
    const closeTimeEl = document.getElementById('display-close-time');
    
    // Promo Elements
    const promoBanner = document.getElementById('promo-banner');
    const promoMarquee = document.getElementById('promo-marquee');
    const promoImageContainer = document.getElementById('promo-image-container');
    const promoImageEl = document.getElementById('promo-image-el');
    const promoVideoContainer = document.getElementById('promo-video-container');
    const promoVideoEl = document.getElementById('promo-video-el');

    if (!statusBadge) return;

    let openTime = "09:00";
    let closeTime = "23:00";
    let manualStatus = null;
    let promoText = "🔥 عرض الغداء: خصم 20% على جميع الطواجن يومياً من 12 إلى 4 عصراً! 🔥";
    let promoImage = "";
    let promoVideo = "";
    let showPromo = true;

    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        openTime = settings.openTime || "09:00";
        closeTime = settings.closeTime || "23:00";
        manualStatus = settings.manualStatus;
        promoText = settings.promoText || promoText;
        promoImage = settings.promoImage || "";
        promoVideo = settings.promoVideo || "";
        showPromo = settings.showPromo !== undefined ? settings.showPromo : true;
    }

    // Update Opening Hours Display
    if (openTimeEl) openTimeEl.innerText = formatTime(openTime);
    if (closeTimeEl) closeTimeEl.innerText = formatTime(closeTime);

    // Update Promo Banner
    if (promoBanner) {
        if (showPromo) {
            promoBanner.style.display = 'block';
            if (promoMarquee) promoMarquee.innerText = promoText;
            
            // Priority: Video > Image
            if (promoVideo && promoVideoContainer && promoVideoEl) {
                promoVideoEl.src = promoVideo;
                promoVideoContainer.style.display = 'block';
                if (promoImageContainer) promoImageContainer.style.display = 'none';
            } else if (promoImage && promoImageContainer && promoImageEl) {
                promoImageEl.src = promoImage;
                promoImageContainer.style.display = 'block';
                if (promoVideoContainer) promoVideoContainer.style.display = 'none';
            } else {
                if (promoImageContainer) promoImageContainer.style.display = 'none';
                if (promoVideoContainer) promoVideoContainer.style.display = 'none';
            }
        } else {
            promoBanner.style.display = 'none';
        }
    }

    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    let isOpen = false;
    if (openTime <= closeTime) {
        // Normal hours: e.g. 09:00 to 23:00
        isOpen = currentTime >= openTime && currentTime <= closeTime;
    } else {
        // Cross-midnight: e.g. 18:00 to 02:00
        isOpen = currentTime >= openTime || currentTime <= closeTime;
    }
    
    // Manual override if set (manualStatus could be 'open', 'closed', or undefined)
    if (manualStatus === 'open') isOpen = true;
    if (manualStatus === 'closed') isOpen = false;

    if (isOpen) {
        statusBadge.innerText = "● مفتوح الآن";
        statusBadge.style.color = "#22c55e";
    } else {
        statusBadge.innerText = "● مغلق الآن";
        statusBadge.style.color = "#dc3545";
    }
}

function formatTime(timeStr) {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours);
    const ampm = h >= 12 ? 'م' : 'ص';
    h = h % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
}

function translateCategory(cat) {
    const mapping = {
        'appetizer': 'مقبلات',
        'grilled': 'قسم السمك',
        'stew': 'طواجن',
        'soup': 'شوربات',
        'traditional': 'ماكولات شعبيه',
        'drink': 'مشروبات'
    };
    return mapping[cat] || cat;
}

function removeFromCart(cartId) {
    cart = cart.filter(item => item.cartId !== cartId);
    updateCart();
}

function calculateTotal() {
    renderCartItems();
}

function applyCoupon() {
    const input = document.getElementById('coupon-input');
    const msg = document.getElementById('coupon-msg');
    const code = input.value.trim().toUpperCase();
    
    if (!code) {
        msg.innerText = "يرجى إدخال الكود";
        msg.style.color = "red";
        return;
    }

    const coupons = globalSettings.coupons || [];
    const foundCoupon = coupons.find(c => c.code.toUpperCase() === code);

    if (foundCoupon) {
        currentDiscount = parseFloat(foundCoupon.discount);
        msg.innerText = `تم تطبيق الخصم ${currentDiscount}% بنجاح!`;
        msg.style.color = "green";
    } else {
        // Fallback for the old single coupon structure just in case
        const legacyCode = (globalSettings.couponCode || "AMWAJ20").toUpperCase();
        const legacyDiscount = parseFloat(globalSettings.couponDiscount) || 20;

        if (code === legacyCode) {
            currentDiscount = legacyDiscount;
            msg.innerText = `تم تطبيق الخصم ${currentDiscount}% بنجاح!`;
            msg.style.color = "green";
        } else {
            currentDiscount = 0;
            msg.innerText = "كود الخصم غير صحيح";
            msg.style.color = "red";
        }
    }
    calculateTotal();
}

function processPayment() {
    alert("تمت عملية الدفع بنجاح!");
    closePaymentModal();
    const paymentMethodRadios = document.getElementsByName('payment-method');
    for (let radio of paymentMethodRadios) {
        if (radio.value === "دفع إلكتروني") {
            radio.checked = true;
            break;
        }
    }
    // Proceed to checkout after payment
    checkout();
}

function closePaymentModal() {
    document.getElementById('payment-modal').style.display = 'none';
}

const logoSrc = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + '/logo.png.jpeg';

function printInvoice(orderId, order) {
    const printWindow = window.open('', '_blank');
    const itemsHtml = order.items.map(item => `
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.qty}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: left;">${item.price.toFixed(2)} ر.س</td>
        </tr>
    `).join('');

    printWindow.document.write(`
        <html dir="rtl">
        <head>
            <title>فاتورة رقم ${orderId}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; }
                .header { text-align: center; border-bottom: 2px solid #005a9c; padding-bottom: 20px; margin-bottom: 30px; }
                .logo { font-size: 24px; font-weight: bold; color: #005a9c; }
                .info { display: flex; justify-content: space-between; margin-bottom: 30px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                th { background: #f8f9fa; padding: 10px; text-align: right; border-bottom: 2px solid #eee; }
                .total { text-align: left; font-size: 20px; font-weight: bold; color: #005a9c; }
                .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                <img src="${logoSrc}" alt="Logo" style="height: 80px; margin-bottom: 10px;">
                <div class="logo">مطعم أمواج الصياد</div>
                <p>فاتورة ضريبية مبسطة</p>
            </div>
            <div class="info">
                <div>
                    <strong>رقم الطلب:</strong> ${orderId}<br>
                    <strong>التاريخ:</strong> ${order.date}
                </div>
                <div>
                    <strong>العميل:</strong> ${loggedInCustomer ? loggedInCustomer.name : 'عميل زائر'}<br>
                    <strong>الهاتف:</strong> ${loggedInCustomer ? loggedInCustomer.phone : '-'}
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>الصنف</th>
                        <th style="text-align: center;">الكمية</th>
                        <th style="text-align: left;">السعر</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            <div class="total">
                الإجمالي النهائي: ${order.total} ر.س
            </div>
            <div class="footer">
                شكراً لزيارتكم! نأمل رؤيتكم قريباً.<br>
                www.amwaj-sayyad.com
            </div>
            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function downloadInvoicePDF(orderId, order) {
    const element = document.createElement('div');
    element.dir = 'rtl';
    element.style.padding = '40px';
    element.style.background = 'white';
    element.style.fontFamily = 'Segoe UI, Tahoma, sans-serif';
    
    const itemsHtml = order.items.map(item => `
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${item.name}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.qty}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: left;">${item.price.toFixed(2)} ر.س</td>
        </tr>
    `).join('');

    element.innerHTML = `
        <div style="text-align: center; border-bottom: 2px solid #005a9c; padding-bottom: 20px; margin-bottom: 30px;">
            <img src="${logoSrc}" alt="Logo" style="height: 80px; margin-bottom: 10px;">
            <div style="font-size: 24px; font-weight: bold; color: #005a9c;">مطعم أمواج الصياد</div>
            <p>فاتورة ضريبية مبسطة</p>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px;">
            <div style="text-align: right;">
                <strong>رقم الطلب:</strong> ${orderId}<br>
                <strong>التاريخ:</strong> ${order.date}
            </div>
            <div style="text-align: left;">
                <strong>العميل:</strong> ${loggedInCustomer ? loggedInCustomer.name : 'عميل زائر'}<br>
                <strong>الهاتف:</strong> ${loggedInCustomer ? loggedInCustomer.phone : '-'}
            </div>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px;">
            <thead>
                <tr style="background: #f8f9fa;">
                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #eee;">الصنف</th>
                    <th style="padding: 10px; text-align: center; border-bottom: 2px solid #eee;">الكمية</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #eee;">السعر</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        <div style="text-align: left; font-size: 20px; font-weight: bold; color: #005a9c;">
            الإجمالي النهائي: ${order.total} ر.س
        </div>
        <div style="text-align: center; margin-top: 50px; font-size: 11px; color: #666; border-top: 1px solid #eee; padding-top: 20px;">
            شكراً لزيارتكم! نأمل رؤيتكم قريباً.<br>
            www.amwaj-sayyad.com
        </div>
    `;

    const opt = {
        margin: 10,
        filename: `invoice_${orderId}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
}

