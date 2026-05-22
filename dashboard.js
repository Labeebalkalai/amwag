// Dashboard Logic for Amwaj Al-Sayyad
// --- Firebase Configuration ---
// قم بوضع بيانات Firebase الخاصة بك هنا لتفعيل المزامنة العالمية
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

// Check if Firebase is configured
const isFirebaseEnabled = firebaseConfig.apiKey !== "YOUR_API_KEY";
let db;

if (isFirebaseEnabled) {
    // Initialize Firebase (Assuming libraries are loaded in HTML)
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
}

let menuData = JSON.parse(localStorage.getItem('restaurantMenu')) || initialMenuItems;

let reservationsData = [];

// Real-time Reservations Sync with Sound Notification
if (isFirebaseEnabled && db) {
    let initialReservationsLoaded = false;
    db.ref('reservations').on('value', (snapshot) => {
        const data = snapshot.val();
        const newData = [];
        if (data) {
            Object.keys(data).forEach(key => {
                newData.push({ id: key, ...data[key] });
            });
            // Sort by createdAt (newest first)
            newData.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }
        
        // Play sound if a new reservation arrives (skip first load)
        if (initialReservationsLoaded && newData.length > reservationsData.length) {
            playNotificationSound();
        }

        reservationsData = newData;
        renderReservations();
        updateDashboardStats();
        initialReservationsLoaded = true;
    });
} else {
    reservationsData = JSON.parse(localStorage.getItem('reservations')) || [];
}

// Tab Switching
function showSection(sectionId) {
    document.querySelectorAll('main > section').forEach(section => section.style.display = 'none');
    const target = document.getElementById(sectionId);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
    const activeItem = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeItem) activeItem.classList.add('active');
}

// --- Data Persistence ---
function saveData() {
    localStorage.setItem('restaurantMenu', JSON.stringify(menuData));
    localStorage.setItem('reservations', JSON.stringify(reservationsData));

    // Sync menu to Firebase for global persistence
    if (isFirebaseEnabled && db) {
        db.ref('menu').set(menuData).then(() => {
            console.log('Menu synced to Firebase successfully');
        }).catch(err => console.error('Firebase menu sync error:', err));
    }
}

// --- Menu Management ---
function getUnavailableItems() {
    return JSON.parse(localStorage.getItem('unavailableItems')) || [];
}

function toggleAvailability(itemId) {
    let unavailable = getUnavailableItems();
    // Compare as numbers
    const idx = unavailable.findIndex(id => Number(id) === Number(itemId));
    if (idx === -1) {
        unavailable.push(itemId);
    } else {
        unavailable.splice(idx, 1);
    }
    localStorage.setItem('unavailableItems', JSON.stringify(unavailable));

    // Sync to Firebase
    if (isFirebaseEnabled && db) {
        db.ref('settings/unavailableItems').set(unavailable);
    }

    renderMenuTable();
}

function renderMenuTable() {
    const tbody = document.getElementById('menu-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const unavailable = getUnavailableItems();
    menuData.forEach(item => {
        const isUnavailable = unavailable.includes(item.id);
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eee';
        if (isUnavailable) tr.style.opacity = '0.5';
        tr.innerHTML = `
            <td style="padding: 1rem;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${item.image}" style="width: 40px; height: 40px; border-radius: 5px; object-fit: cover; border: 1px solid #eee;" onerror="this.src='https://via.placeholder.com/40?text=Error'">
                    <span>${item.name}</span>
                </div>
            </td>
            <td style="padding: 1rem;">${translateCategory(item.category)}</td>
            <td style="padding: 1rem;">${item.price || (item.pricePerKilo + ' (كيلو)')} <span class="icon-saudi_riyal"></span></td>
            <td style="padding: 1rem;">
                <button onclick="toggleAvailability(${item.id})" style="
                    padding: 5px 14px;
                    border-radius: 20px;
                    border: none;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 0.8rem;
                    background: ${isUnavailable ? '#fecaca' : '#d1fae5'};
                    color: ${isUnavailable ? '#dc2626' : '#16a34a'};
                ">
                    ${isUnavailable ? '❌ غير متوفر' : '✅ متوفر'}
                </button>
            </td>
            <td style="padding: 1rem;">
                <button onclick="openModal(${item.id})" style="color: var(--ocean-blue); border: none; background: none; cursor: pointer; font-size: 1.1rem;"><i class="fas fa-edit"></i></button>
                <button onclick="deleteItem(${item.id})" style="color: #dc3545; border: none; background: none; cursor: pointer; margin-right: 15px; font-size: 1.1rem;"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function handleMenuSubmit() {
    // Strong Protection Check
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        alert('تنبيه أمني: لا تملك صلاحية القيام بهذا الإجراء. يرجى تسجيل الدخول أولاً.');
        window.location.href = 'login.html';
        return;
    }
    
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('modal-name').value;
    const category = document.getElementById('modal-category').value;
    const price = document.getElementById('modal-price').value;
    const image = document.getElementById('modal-image').value;

    if (!name || !price) {
        alert('يرجى تعبئة كافة الحقول');
        return;
    }

    if (id) {
        // Edit
        const index = menuData.findIndex(item => item.id == id);
        if (index !== -1) {
            menuData[index] = { ...menuData[index], name, category, price: parseFloat(price), image };
        }
    } else {
        // Add
        const newItem = {
            id: Date.now(),
            name,
            category,
            price: parseFloat(price),
            image: image || "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=400&q=80"
        };
        menuData.push(newItem);
    }

    saveData();
    renderMenuTable();
    updateDashboardStats();
    closeModal();
}

function deleteItem(id) {
    // Strong Protection Check
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        alert('تنبيه أمني: لا تملك صلاحية حذف الأصناف.');
        window.location.href = 'login.html';
        return;
    }

    if (confirm('هل أنت متأكد من حذف هذا الصنف؟')) {
        menuData = menuData.filter(item => item.id !== id);
        saveData();
        renderMenuTable();
        updateDashboardStats();
    }
}

// --- Reservations Management ---
function renderReservations() {
    const tbody = document.getElementById('reservations-tbody');
    const overviewTbody = document.getElementById('overview-res-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    if (overviewTbody) overviewTbody.innerHTML = '';

    reservationsData.forEach(res => {
        const rowHTML = `
            <td style="padding: 1rem;">${res.name}</td>
            <td style="padding: 1rem;">${res.date}</td>
            <td style="padding: 1rem;">${res.time}</td>
            <td style="padding: 1rem;">${res.persons}</td>
            <td style="padding: 1rem;">
                <span style="background: ${res.status === 'confirmed' ? '#d4edda' : '#fff3cd'}; color: ${res.status === 'confirmed' ? '#155724' : '#856404'}; padding: 5px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 500;">
                    ${res.status === 'confirmed' ? 'مؤكد' : 'قيد الانتظار'}
                </span>
            </td>
            <td style="padding: 1rem;">
                ${res.status === 'pending' ? `<button onclick="updateResStatus('${res.id}', 'confirmed')" class="btn-primary" style="padding: 5px 15px; font-size: 0.8rem; background: #28a745; margin-left: 5px;">تأكيد</button>` : `<button onclick="updateResStatus('${res.id}', 'pending')" style="background: none; border: 1px solid #ddd; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 0.8rem; margin-left: 5px;">إعادة تعليق</button>`}
                <button onclick="deleteReservation('${res.id}')" style="background: none; border: 1px solid #ff4d4d; color: #ff4d4d; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 0.8rem;"><i class="fas fa-trash"></i></button>
            </td>
        `;
        
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eee';
        tr.innerHTML = rowHTML;
        tbody.appendChild(tr);

        if (overviewTbody) {
            const trOverview = document.createElement('tr');
            trOverview.style.borderBottom = '1px solid #eee';
            trOverview.innerHTML = `
                <td style="padding: 1rem;">${res.name}</td>
                <td style="padding: 1rem;">${res.date}</td>
                <td style="padding: 1rem;">${res.time}</td>
                <td style="padding: 1rem;"><span style="color: ${res.status === 'confirmed' ? '#22c55e' : '#f59e0b'}">${res.status === 'confirmed' ? 'مؤكد' : 'قيد الانتظار'}</span></td>
            `;
            overviewTbody.appendChild(trOverview);
        }
    });
}

function updateResStatus(id, status) {
    if (isFirebaseEnabled && db) {
        db.ref('reservations/' + id).update({ status }).then(() => {
            console.log("Reservation status updated in Firebase");
        });
    } else {
        const index = reservationsData.findIndex(r => r.id === id);
        if (index !== -1) {
            reservationsData[index].status = status;
            saveData();
            renderReservations();
            updateDashboardStats();
        }
    }
}

function deleteReservation(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الحجز؟')) return;
    if (isFirebaseEnabled && db) {
        db.ref('reservations/' + id).remove();
    } else {
        reservationsData = reservationsData.filter(r => r.id !== id);
        saveData();
        renderReservations();
        updateDashboardStats();
    }
}
document.addEventListener('DOMContentLoaded', () => {
    renderMenuTable();
    renderReservations();
    updateDashboardStats();
    loadSettings();
    initStaffManagement();
    initAdminChat();

    // Load settings from Firebase into form fields
    if (isFirebaseEnabled && db) {
        db.ref('settings').once('value', (snapshot) => {
            const settings = snapshot.val();
            if (settings) {
                loadSettingsFromObj(settings);
            }
        });
        // Also load menu from Firebase to keep dashboard in sync
        db.ref('menu').once('value', (snapshot) => {
            const firebaseMenu = snapshot.val();
            if (firebaseMenu && Array.isArray(firebaseMenu)) {
                menuData = firebaseMenu;
                localStorage.setItem('restaurantMenu', JSON.stringify(menuData));
                renderMenuTable();
                updateDashboardStats();
            }
        });
    }
    // Load customers from Firebase
    if (isFirebaseEnabled && db) {
        db.ref('customers').on('value', (snapshot) => {
            const customersObj = snapshot.val();
            const customersData = customersObj ? Object.values(customersObj) : [];
            renderCustomers(customersData);
        });

        // Load Global Orders
        let initialOrdersLoaded = false;
        db.ref('orders').on('value', (snapshot) => {
            const ordersObj = snapshot.val();
            const ordersData = ordersObj ? Object.values(ordersObj) : [];
            
            // Play sound if a new order arrives (skip first load)
            if (initialOrdersLoaded && ordersData.length > 0) {
                // Check if the latest order is new (comparing counts is simplest for this case)
                const currentCount = parseInt(document.getElementById('total-orders-count')?.innerText || "0");
                if (ordersData.length > currentCount) {
                    playNotificationSound();
                }
            }
            
            renderOrders(ordersData);
            initialOrdersLoaded = true;
        });
    }
});

// --- Customers Management ---
function renderCustomers(customers) {
    const tbody = document.getElementById('customers-table-body');
    const countEl = document.getElementById('total-customers-count');
    if (!tbody || !countEl) return;

    countEl.innerText = customers.length;
    tbody.innerHTML = '';

    // Sort by points descending
    customers.sort((a, b) => (b.points || 0) - (a.points || 0));

    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">لا يوجد عملاء مسجلين بعد.</td></tr>';
        return;
    }

    customers.forEach(customer => {
        const dateObj = new Date(customer.lastPurchaseDate);
        const dateStr = !isNaN(dateObj) ? dateObj.toLocaleDateString('ar-EG') : 'غير متوفر';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${customer.name || '-'}</strong></td>
            <td dir="ltr" style="text-align: right;">${customer.phone || '-'}</td>
            <td>${customer.email || '-'}</td>
            <td>${dateStr}</td>
            <td><span style="background: ${customer.points >= 100 ? '#22c55e' : '#f59e0b'}; color: white; padding: 3px 8px; border-radius: 12px; font-weight: bold;">${customer.points || 0}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Settings ---
function saveSettings() {
    const settings = getAllSettings();
    if (isFirebaseEnabled) {
        db.ref('settings').set(settings).then(() => {
            alert('تم حفظ الإعدادات عالمياً بنجاح!');
        }).catch(err => alert('خطأ في المزامنة: ' + err.message));
    } else {
        localStorage.setItem('restaurantSettings', JSON.stringify(settings));
        alert('تم الحفظ محلياً (قم بضبط Firebase للمزامنة العالمية)');
    }
}

function saveSingle(type) {
    const currentSettings = getAllSettings();
    let message = 'تم حفظ التعديلات بنجاح!';
    
    if (isFirebaseEnabled) {
        db.ref('settings').set(currentSettings).then(() => {
            alert(message);
        }).catch(err => alert('خطأ: ' + err.message));
    } else {
        localStorage.setItem('restaurantSettings', JSON.stringify(currentSettings));
        alert(message);
    }
}

function changeAdminPassword() {
    const newPass = document.getElementById('setting-admin-pass').value;
    if (!newPass) {
        alert('يرجى إدخال كلمة المرور الجديدة');
        return;
    }
    if (isFirebaseEnabled && db) {
        db.ref('security/adminPass').set(newPass).then(() => {
            alert('تم تحديث كلمة مرور الإدارة بنجاح!');
            document.getElementById('setting-admin-pass').value = '';
        });
    } else {
        localStorage.setItem('adminPassword', newPass);
        alert('تم تحديث كلمة المرور محلياً');
    }
}

function sendBroadcast() {
    const msg = document.getElementById('broadcast-msg').value;
    if (!msg) return;
    if (isFirebaseEnabled && db) {
        db.ref('notifications/broadcast').set({
            msg: msg,
            time: Date.now()
        }).then(() => {
            alert('تم إرسال التنبيه لجميع الزوار!');
            document.getElementById('broadcast-msg').value = '';
        });
    } else {
        alert('هذه الميزة تتطلب تفعيل Firebase للمزامنة اللحظية مع الزوار');
    }
}

function getAllSettings() {
    return {
        whatsapp: document.getElementById('setting-whatsapp').value,
        openTime: document.getElementById('setting-open-time').value,
        closeTime: document.getElementById('setting-close-time').value,
        manualStatus: document.getElementById('restaurant-status-text').innerText === 'مفتوح' ? 'open' : 'closed',
        promoText: document.getElementById('setting-promo-text').value,
        promoImage: document.getElementById('setting-promo-image').value,
        promoVideo: document.getElementById('setting-promo-video').value,
        showPromo: document.getElementById('setting-show-promo').checked,
        snapchat: document.getElementById('setting-snapchat').value,
        tiktok: document.getElementById('setting-tiktok').value,
        popupTitle: document.getElementById('setting-popup-title').value,
        popupText: document.getElementById('setting-popup-text').value,
        showPopup: document.getElementById('setting-show-popup').checked,
        colorPrimary: document.getElementById('setting-color-primary').value,
        colorDeep: document.getElementById('setting-color-deep').value,
        colorGold: document.getElementById('setting-color-gold').value,
        colorOrange: document.getElementById('setting-color-orange').value,
        colorBg: document.getElementById('setting-color-bg').value,
        coupons: getCouponsFromTable(),
        enableOnlinePayment: document.getElementById('setting-enable-online-payment').checked,
        // New Futuristic Settings
        maintenanceMode: document.getElementById('setting-maintenance-mode').checked,
        eventMode: document.getElementById('setting-event-mode').checked,
        pointsPerOrder: document.getElementById('setting-points-per-order').value,
        pointsThreshold: document.getElementById('setting-points-threshold').value,
        loyaltyCta: document.getElementById('loyalty-cta-input').value,
        loyaltyDesc: document.getElementById('loyalty-desc-input').value,
        heroTitle: document.getElementById('hero-title-input').value,
        heroDesc: document.getElementById('hero-desc-input').value,
        aboutTitle: document.getElementById('about-title-input').value,
        aboutDesc: document.getElementById('about-desc-input').value,
        aboutF1: document.getElementById('about-f1-input').value,
        aboutF2: document.getElementById('about-f2-input').value,
        aboutF3: document.getElementById('about-f3-input').value,
        googleMapsUrl: document.getElementById('google-maps-url-input').value
    };
}



function loadSettings() {
    // First try Firebase, then fallback to localStorage
    if (isFirebaseEnabled && db) {
        db.ref('settings').once('value', (snapshot) => {
            const settings = snapshot.val();
            if (settings) {
                loadSettingsFromObj(settings);
            } else {
                loadSettingsFromLocalStorage();
            }
        }).catch(() => loadSettingsFromLocalStorage());
    } else {
        loadSettingsFromLocalStorage();
    }
}

function loadSettingsFromLocalStorage() {
    const savedSettings = localStorage.getItem('restaurantSettings');
    if (savedSettings) {
        loadSettingsFromObj(JSON.parse(savedSettings));
    }
}

function loadSettingsFromObj(settings) {
    if (!settings) return;
    if (settings.whatsapp) document.getElementById('setting-whatsapp').value = settings.whatsapp;
    if (settings.openTime) document.getElementById('setting-open-time').value = settings.openTime;
    if (settings.closeTime) document.getElementById('setting-close-time').value = settings.closeTime;

    if (settings.manualStatus) {
        const statusText = document.getElementById('restaurant-status-text');
        const isOpen = settings.manualStatus === 'open';
        statusText.innerText = isOpen ? 'مفتوح' : 'مغلق';
        statusText.style.color = isOpen ? '#22c55e' : '#dc3545';
    }

    if (settings.promoText) document.getElementById('setting-promo-text').value = settings.promoText;
    if (settings.promoImage) document.getElementById('setting-promo-image').value = settings.promoImage;
    if (settings.promoVideo) document.getElementById('setting-promo-video').value = settings.promoVideo;
    if (settings.showPromo !== undefined) document.getElementById('setting-show-promo').checked = settings.showPromo;

    if (settings.snapchat) document.getElementById('setting-snapchat').value = settings.snapchat;
    if (settings.tiktok) document.getElementById('setting-tiktok').value = settings.tiktok;
    if (settings.popupTitle) document.getElementById('setting-popup-title').value = settings.popupTitle;
    if (settings.popupText) document.getElementById('setting-popup-text').value = settings.popupText;
    if (settings.showPopup !== undefined) document.getElementById('setting-show-popup').checked = settings.showPopup;

    if (settings.colorPrimary) document.getElementById('setting-color-primary').value = settings.colorPrimary;
    if (settings.colorDeep) document.getElementById('setting-color-deep').value = settings.colorDeep;
    if (settings.colorGold) document.getElementById('setting-color-gold').value = settings.colorGold;
    if (settings.colorOrange) document.getElementById('setting-color-orange').value = settings.colorOrange;
    if (settings.colorBg) document.getElementById('setting-color-bg').value = settings.colorBg;

    if (settings.coupons) renderCouponsTable(settings.coupons);
    if (settings.enableOnlinePayment !== undefined) document.getElementById('setting-enable-online-payment').checked = settings.enableOnlinePayment;

    // New Futuristic Settings Loading
    if (settings.maintenanceMode !== undefined) document.getElementById('setting-maintenance-mode').checked = settings.maintenanceMode;
    if (settings.eventMode !== undefined) document.getElementById('setting-event-mode').checked = settings.eventMode;
    if (settings.pointsPerOrder !== undefined) document.getElementById('setting-points-per-order').value = settings.pointsPerOrder;
    if (settings.pointsThreshold !== undefined) document.getElementById('setting-points-threshold').value = settings.pointsThreshold;

    if (settings.heroTitle) document.getElementById('hero-title-input').value = settings.heroTitle;
    if (settings.heroDesc) document.getElementById('hero-desc-input').value = settings.heroDesc;
    if (settings.loyaltyCta) document.getElementById('loyalty-cta-input').value = settings.loyaltyCta;
    if (settings.loyaltyDesc) document.getElementById('loyalty-desc-input').value = settings.loyaltyDesc;
    if (settings.aboutTitle) document.getElementById('about-title-input').value = settings.aboutTitle;
    if (settings.aboutDesc) document.getElementById('about-desc-input').value = settings.aboutDesc;
    if (settings.aboutF1) document.getElementById('about-f1-input').value = settings.aboutF1;
    if (settings.aboutF2) document.getElementById('about-f2-input').value = settings.aboutF2;
    if (settings.aboutF3) document.getElementById('about-f3-input').value = settings.aboutF3;
    if (settings.googleMapsUrl) document.getElementById('google-maps-url-input').value = settings.googleMapsUrl;
}

function toggleRestaurantStatus() {
    const statusText = document.getElementById('restaurant-status-text');
    const isCurrentlyOpen = statusText.innerText === 'مفتوح';
    statusText.innerText = isCurrentlyOpen ? 'مغلق' : 'مفتوح';
    statusText.style.color = isCurrentlyOpen ? '#dc3545' : '#22c55e';
}

// --- Utility & Helpers ---
function translateCategory(cat) {
    const mapping = { appetizer: 'مقبلات', grilled: 'قسم السمك', stew: 'طواجن', traditional: 'ماكولات شعبيه', soup: 'شوربات', drink: 'مشروبات' };
    return mapping[cat] || cat;
}

function openModal(id = null) {
    const modal = document.getElementById('menu-modal');
    const title = document.getElementById('modal-title');
    const submitBtn = document.getElementById('modal-submit-btn');

    if (id) {
        const item = menuData.find(i => i.id === id);
        title.innerText = 'تعديل الصنف';
        document.getElementById('edit-id').value = item.id;
        document.getElementById('modal-name').value = item.name;
        document.getElementById('modal-category').value = item.category;
        document.getElementById('modal-price').value = item.price || item.pricePerKilo;
        document.getElementById('modal-image').value = item.image || '';
    } else {
        title.innerText = 'إضافة صنف جديد';
        document.getElementById('edit-id').value = '';
        document.getElementById('modal-name').value = '';
        document.getElementById('modal-price').value = '';
        document.getElementById('modal-image').value = '';
    }
    modal.style.display = 'flex';
    updateModalImagePreview();
}

function updateModalImagePreview() {
    const url = document.getElementById('modal-image').value;
    const img = document.getElementById('modal-image-preview');
    const placeholder = document.getElementById('modal-image-placeholder');
    
    if (url) {
        img.src = url;
        img.style.display = 'block';
        placeholder.style.display = 'none';
        img.onerror = () => {
            img.style.display = 'none';
            placeholder.style.display = 'block';
            placeholder.className = "fas fa-exclamation-triangle";
            placeholder.style.color = "#dc3545";
        };
    } else {
        img.style.display = 'none';
        placeholder.style.display = 'block';
        placeholder.className = "fas fa-image";
        placeholder.style.color = "#cbd5e1";
    }
}

function closeModal() {
    document.getElementById('menu-modal').style.display = 'none';
}

function updateDashboardStats() {
    const menuCount = document.getElementById('stat-menu-count');
    const resCount = document.getElementById('stat-res-count');
    if (menuCount) menuCount.innerText = menuData.length;
    if (resCount) resCount.innerText = reservationsData.filter(r => r.status === 'pending').length;
}

function logout() {
    localStorage.removeItem('isLoggedIn');
    window.location.href = 'login.html';
}

// --- Multi-Coupon Logic ---
let activeCoupons = [];

function addNewCoupon() {
    const code = document.getElementById('new-coupon-code').value.trim().toUpperCase();
    const discount = document.getElementById('new-coupon-discount').value;
    
    if (!code || !discount) {
        alert("يرجى إدخال كود ونسبة الخصم");
        return;
    }
    
    activeCoupons.push({ code, discount: parseFloat(discount) });
    document.getElementById('new-coupon-code').value = '';
    document.getElementById('new-coupon-discount').value = '';
    
    renderCouponsTable(activeCoupons);
    saveSingle('coupon');
}

function deleteCoupon(index) {
    activeCoupons.splice(index, 1);
    renderCouponsTable(activeCoupons);
    saveSingle('coupon');
}

function renderCouponsTable(coupons) {
    activeCoupons = coupons || [];
    const tbody = document.getElementById('coupons-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    activeCoupons.forEach((c, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 10px;"><strong>${c.code}</strong></td>
            <td style="padding: 10px;">${c.discount}%</td>
            <td style="padding: 10px;">
                <button onclick="deleteCoupon(${index})" style="color: #dc3545; border: none; background: none; cursor: pointer;"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function getCouponsFromTable() {
    return activeCoupons;
}

// --- Notification Sound ---
const notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function playNotificationSound() {
    notificationSound.play().catch(e => console.log("Sound play blocked by browser. User must interact first."));
}

// --- Orders Management ---
function renderOrders(orders) {
    const tbody = document.getElementById('orders-tbody');
    const countEl = document.getElementById('total-orders-count');
    if (!tbody || !countEl) return;

    // Sort by timestamp descending
    orders.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    countEl.innerText = orders.length;
    tbody.innerHTML = '';

    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">لا توجد طلبات بعد.</td></tr>';
        return;
    }

    orders.forEach(order => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eee';
        
        const statusConfig = {
            'pending': { text: 'قيد الانتظار', color: '#f59e0b', bg: '#fef3c7' },
            'preparing': { text: 'جاري التحضير', color: '#3b82f6', bg: '#dbeafe' },
            'ready': { text: 'جاهز / للتوصيل', color: '#8b5cf6', bg: '#ede9fe' },
            'delivered': { text: 'تم التسليم', color: '#10b981', bg: '#d1fae5' },
            'cancelled': { text: 'ملغي', color: '#ef4444', bg: '#fee2e2' }
        };

        const config = statusConfig[order.status] || statusConfig['pending'];

        tr.innerHTML = `
            <td style="padding: 1rem;"><strong>${order.orderId}</strong></td>
            <td style="padding: 1rem;">
                <div>${order.customerName}</div>
                <div style="font-size: 0.8rem; color: #64748b;">${order.customerPhone}</div>
            </td>
            <td style="padding: 1rem; font-size: 0.85rem;">${order.date}</td>
            <td style="padding: 1rem; color: #0369a1; font-weight: 500;"><i class="fas fa-clock"></i> ${order.preparationTime || 'فوري'}</td>
            <td style="padding: 1rem; font-weight: bold;">${order.total} <span class="icon-saudi_riyal"></span></td>
            <td style="padding: 1rem;">
                <span style="background: ${config.bg}; color: ${config.color}; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: bold;">
                    ${config.text}
                </span>
            </td>
            <td style="padding: 1rem;">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <select onchange="updateOrderStatus('${order.orderId}', '${order.customerPhone}', this.value)" style="padding: 5px; border-radius: 5px; border: 1px solid #ddd; font-size: 0.8rem;">
                        <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>إنتظار</option>
                        <option value="preparing" ${order.status === 'preparing' ? 'selected' : ''}>تحضير</option>
                        <option value="ready" ${order.status === 'ready' ? 'selected' : ''}>جاهز</option>
                        <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>تسليم</option>
                        <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>إلغاء</option>
                    </select>
                    <button onclick="deleteOrder('${order.orderId}', '${order.customerPhone}')" style="color: #ef4444; border: none; background: none; cursor: pointer; font-size: 1.1rem;" title="حذف الطلب">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateOrderStatus(orderId, phone, newStatus) {
    if (!isFirebaseEnabled || !db) return;

    const updates = {};
    // 1. Update in global orders
    updates['/orders/' + orderId + '/status'] = newStatus;
    // 2. Update in customer history
    updates['/customers/' + phone + '/orders/' + orderId + '/status'] = newStatus;

    db.ref().update(updates).then(() => {
        console.log("Order status updated successfully");
    }).catch(err => alert("Error updating order: " + err.message));
}

function deleteOrder(orderId, phone) {
    if (!confirm(`هل أنت متأكد من حذف الطلب رقم ${orderId} نهائياً؟`)) return;
    
    if (!isFirebaseEnabled || !db) return;

    const updates = {};
    updates['/orders/' + orderId] = null;
    updates['/customers/' + phone + '/orders/' + orderId] = null;

    db.ref().update(updates).then(() => {
        console.log("Order deleted successfully");
    }).catch(err => alert("Error deleting order: " + err.message));
}

// ======================================================
// ===       STAFF MANAGEMENT - Firebase CRUD         ===
// ======================================================

const DEFAULT_STAFF = [
    { name: 'الأستاذ محمد', role: 'المدير العام للمطعم', type: 'reservations', phone: '966546117271', icon: 'fa-user-tie' },
    { name: 'الشيف حسن', role: 'كبير الطهاة (تنفيذي)', type: 'orders', phone: '966546117271', icon: 'fa-utensils' },
    { name: 'خدمة العملاء', role: 'متاحون لمساعدتكم 24/7', type: 'general', phone: '966546117271', icon: 'fa-headset' }
];

const STAFF_TYPE_LABELS = {
    reservations: { label: 'الحجوزات والاستفسارات', icon: 'fa-calendar-check' },
    delivery: { label: 'متابعة التوصيل', icon: 'fa-shipping-fast' },
    feedback: { label: 'الاقتراحات والملاحظات', icon: 'fa-comment-dots' },
    orders: { label: 'إدارة الطلبات', icon: 'fa-shopping-bag' },
    general: { label: 'الدعم العام', icon: 'fa-headset' }
};

function initStaffManagement() {
    if (!isFirebaseEnabled || !db) return;

    // Check if staff node exists; if not, seed defaults
    db.ref('staff').once('value', snapshot => {
        if (!snapshot.exists()) {
            DEFAULT_STAFF.forEach(s => db.ref('staff').push(s));
        }
    });

    // Listen for real-time changes
    db.ref('staff').on('value', snapshot => {
        const staffObj = snapshot.val();
        const staffList = staffObj
            ? Object.entries(staffObj).map(([key, val]) => ({ key, ...val }))
            : [];
        renderStaffTable(staffList);
    });
}

function renderStaffTable(staffList) {
    const tbody = document.getElementById('staff-tbody');
    if (!tbody) return;

    if (staffList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">لا يوجد موظفون مسجلون بعد. أضف موظفاً جديداً.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    staffList.forEach(staff => {
        const typeInfo = STAFF_TYPE_LABELS[staff.type] || STAFF_TYPE_LABELS['general'];
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eee';
        tr.innerHTML = `
            <td style="padding: 1rem;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:40px; height:40px; background:var(--deep-blue); border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--sandy-gold);">
                        <i class="fas ${staff.icon || 'fa-user'}"></i>
                    </div>
                    <strong>${staff.name}</strong>
                </div>
            </td>
            <td style="padding: 1rem; color: var(--text-muted);">${staff.role}</td>
            <td style="padding: 1rem;">
                <span style="background:#e0f2fe; color:#0369a1; padding:4px 10px; border-radius:20px; font-size:0.8rem; white-space:nowrap;">
                    <i class="fas ${typeInfo.icon}"></i> ${typeInfo.label}
                </span>
            </td>
            <td style="padding: 1rem; direction:ltr; text-align:right;">
                <a href="https://wa.me/${staff.phone}" target="_blank" style="color:#25d366; text-decoration:none;">
                    <i class="fab fa-whatsapp"></i> ${staff.phone}
                </a>
            </td>
            <td style="padding: 1rem;">
                <button onclick="openStaffModal('${staff.key}')" style="color:var(--ocean-blue); border:none; background:none; cursor:pointer; font-size:1.1rem; margin-left:10px;"><i class="fas fa-edit"></i></button>
                <button onclick="deleteStaff('${staff.key}', '${staff.name}')" style="color:#dc3545; border:none; background:none; cursor:pointer; font-size:1.1rem;"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

let _staffCache = {};

function openStaffModal(key = null) {
    document.getElementById('staff-modal').style.display = 'flex';

    if (key) {
        // Edit mode: fetch data from Firebase
        document.getElementById('staff-modal-title').innerText = 'تعديل بيانات الموظف';
        document.getElementById('staff-edit-key').value = key;

        db.ref('staff/' + key).once('value', snap => {
            const s = snap.val();
            if (!s) return;
            document.getElementById('staff-name').value = s.name || '';
            document.getElementById('staff-role').value = s.role || '';
            document.getElementById('staff-type').value = s.type || 'general';
            document.getElementById('staff-phone').value = s.phone || '';
            document.getElementById('staff-icon').value = s.icon || 'fa-user-tie';
            updateStaffIconPreview();
        });
    } else {
        // Add mode
        document.getElementById('staff-modal-title').innerText = 'إضافة موظف جديد';
        document.getElementById('staff-edit-key').value = '';
        document.getElementById('staff-name').value = '';
        document.getElementById('staff-role').value = '';
        document.getElementById('staff-type').value = 'general';
        document.getElementById('staff-phone').value = '';
        document.getElementById('staff-icon').value = 'fa-user-tie';
        updateStaffIconPreview();
    }
}

function closeStaffModal() {
    document.getElementById('staff-modal').style.display = 'none';
}

function handleStaffSubmit() {
    const name  = document.getElementById('staff-name').value.trim();
    const role  = document.getElementById('staff-role').value.trim();
    const type  = document.getElementById('staff-type').value;
    const phone = document.getElementById('staff-phone').value.trim().replace(/\D/g, '');
    const icon  = document.getElementById('staff-icon').value.trim() || 'fa-user-tie';
    const key   = document.getElementById('staff-edit-key').value;

    if (!name || !role || !phone) {
        alert('يرجى تعبئة الاسم والمسمى الوظيفي ورقم الواتساب.');
        return;
    }

    if (!isFirebaseEnabled || !db) {
        alert('تحتاج إلى تفعيل Firebase لحفظ بيانات الموظفين.');
        return;
    }

    const staffData = { name, role, type, phone, icon };

    const ref = key ? db.ref('staff/' + key) : db.ref('staff').push();
    const promise = key ? ref.set(staffData) : ref.then ? ref : Promise.resolve();

    if (key) {
        ref.set(staffData).then(() => {
            alert('تم تحديث بيانات الموظف بنجاح!');
            closeStaffModal();
        }).catch(err => alert('خطأ: ' + err.message));
    } else {
        db.ref('staff').push(staffData).then(() => {
            alert('تمت إضافة الموظف بنجاح!');
            closeStaffModal();
        }).catch(err => alert('خطأ: ' + err.message));
    }
}

function deleteStaff(key, name) {
    if (!confirm(`هل أنت متأكد من حذف الموظف "${name}"؟`)) return;
    db.ref('staff/' + key).remove().then(() => {
        console.log('Staff member removed:', key);
    }).catch(err => alert('خطأ في الحذف: ' + err.message));
}

function updateStaffIconPreview() {
    const iconInput = document.getElementById('staff-icon').value.trim();
    const preview = document.getElementById('staff-icon-preview');
    if (preview && iconInput) {
        preview.className = 'fas ' + iconInput;
    }
}

// ======================================================
// ===       ADMIN CHAT MANAGEMENT - Firebase         ===
// ======================================================

let activeChatId = null;
let activeChatListener = null;
let adminChatsData = {};

// Request Notification permission for admin page
if ("Notification" in window) {
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}
// Helper to notify admin of new customer messages
window.adminNotifiedChats = window.adminNotifiedChats || new Set();
function notifyAdminForNewMessage(chatId, info) {
    if (!info || !info.lastMessage) return;
    if (window.adminNotifiedChats.has(chatId)) return;
    // Show notification
    if ("Notification" in window && Notification.permission === "granted") {
        const title = "رسالة جديدة من العميل";
        const body = `${info.customerName || 'عميل'}: ${info.lastMessage}`;
        new Notification(title, { body: body, icon: 'logo.png.jpeg', tag: 'admin-chat', data: { chatId } });
    }
    window.adminNotifiedChats.add(chatId);
}
function initAdminChat() {
    if (!isFirebaseEnabled || !db) return;

    db.ref('chats').on('value', snapshot => {
        const chats = snapshot.val();
        adminChatsData = chats || {};
        // Notify for any chats with unreadByAdmin flag
        Object.entries(adminChatsData).forEach(([id, chat]) => {
            if (chat.info && chat.info.unreadByAdmin) {
                notifyAdminForNewMessage(id, chat.info);
            }
        });
        renderAdminChatList(adminChatsData);
    });
}
function listenToChats() {
    if (!isFirebaseEnabled || !db) return;

    // Request Notification permission for admin page
    if ("Notification" in window) {
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    }
    // Helper to notify customer via service worker
    window.showCustomerNotification = function(title, body, url, tag) {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SHOW_NOTIFICATION',
                title: title,
                body: body,
                url: url || '/',
                tag: tag || 'chat'
            });
        }
    };

    db.ref('chats').on('value', snapshot => {
        const chats = snapshot.val();
        adminChatsData = chats || {};
        renderAdminChatList(adminChatsData);
    });
}

function initMenuManagement() {
    console.log("Menu management initialized");
}

function renderAdminChatList(chats) {
    const listEl = document.getElementById('admin-chat-list');
    if (!listEl) return;

    const entries = Object.entries(chats);
    if (entries.length === 0) {
        listEl.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--text-muted);">
            <i class="fas fa-inbox" style="font-size:2rem; margin-bottom:1rem; display:block;"></i>
            <p>لا توجد محادثات بعد.</p>
        </div>`;
        return;
    }

    // Sort by lastActivity descending
    entries.sort((a, b) => {
        const aTime = a[1].info?.lastActivity || 0;
        const bTime = b[1].info?.lastActivity || 0;
        return bTime - aTime;
    });

    let totalUnread = 0;
    listEl.innerHTML = '';

    entries.forEach(([chatId, chatData]) => {
        const info = chatData.info || {};
        const name = info.customerName || 'زائر';
        const lastMsg = info.lastMessage || 'بدأ محادثة جديدة';
        const isUnread = info.unreadByAdmin === true;
        const timeStr = info.lastActivity
            ? new Date(info.lastActivity).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
            : '';
        const initial = name.charAt(0);

        if (isUnread) totalUnread++;

        const item = document.createElement('div');
        item.className = 'chat-conv-item' + (chatId === activeChatId ? ' active' : '');
        item.onclick = () => openAdminChat(chatId);
        item.innerHTML = `
            <div class="conv-avatar">${initial}</div>
            <div class="conv-info">
                <h4>${name}</h4>
                <small>${lastMsg.substring(0, 35)}${lastMsg.length > 35 ? '...' : ''}</small>
            </div>
            <div style="text-align:left; flex-shrink:0; display:flex; flex-direction:column; align-items:flex-end;">
                <small style="color:var(--text-muted); font-size:0.7rem;">${timeStr}</small>
                <div style="display:flex; gap:8px; align-items:center; margin-top:4px;">
                    ${isUnread ? '<div class="unread-badge">●</div>' : ''}
                    <button onclick="deleteAdminChat('${chatId}', event)" style="background:none; border:none; color:#ef4444; cursor:pointer; padding:2px; font-size:0.9rem;" title="حذف المحادثة">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
        listEl.appendChild(item);
    });

    // Update sidebar badge
    const sidebarBadge = document.getElementById('sidebar-chat-badge');
    if (sidebarBadge) {
        if (totalUnread > 0) {
            sidebarBadge.innerText = totalUnread;
            sidebarBadge.style.display = 'inline';
        } else {
            sidebarBadge.style.display = 'none';
        }
    }
}

function deleteAdminChat(chatId, event) {
    if (event) event.stopPropagation();
    if (!confirm('هل أنت متأكد من حذف هذه المحادثة نهائياً؟')) return;
    
    if (isFirebaseEnabled && db) {
        db.ref('chats/' + chatId).remove().then(() => {
            if (activeChatId === chatId) {
                activeChatId = null;
                document.getElementById('admin-chat-name').innerText = 'اختر محادثة';
                document.getElementById('admin-chat-status').innerText = 'اختر عميلاً من القائمة للبدء';
                document.getElementById('admin-chat-messages').innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:3rem;">
                    <i class="fas fa-comment-dots" style="font-size:3rem; margin-bottom:1rem; display:block; opacity:0.3;"></i>
                    <p>اختر محادثة من القائمة لعرض الرسائل</p>
                </div>`;
                document.getElementById('admin-chat-input-area').style.display = 'none';
            }
        }).catch(err => alert('خطأ في الحذف: ' + err.message));
    }
}

function openAdminChat(chatId) {
    activeChatId = chatId;

    // Mark as read
    if (isFirebaseEnabled && db) {
        db.ref('chats/' + chatId + '/info/unreadByAdmin').set(false);
    }

    const info = adminChatsData[chatId]?.info || {};
    const nameEl = document.getElementById('admin-chat-name');
    const statusEl = document.getElementById('admin-chat-status');
    const inputArea = document.getElementById('admin-chat-input-area');

    if (nameEl) nameEl.innerText = info.customerName || 'زائر';
    if (statusEl) statusEl.innerText = 'محادثة نشطة';
    if (inputArea) inputArea.style.display = 'flex';

    // Highlight active item
    document.querySelectorAll('.chat-conv-item').forEach(el => el.classList.remove('active'));
    // Re-render list to mark active
    renderAdminChatList(adminChatsData);

    // Remove old listener
    if (activeChatListener) {
        db.ref('chats/' + activeChatListener).off();
    }
    activeChatListener = chatId;

    // Listen for messages in this chat
    db.ref('chats/' + chatId + '/messages').orderByChild('timestamp').on('value', snapshot => {
        const msgs = snapshot.val();
        renderAdminChatMessages(msgs);
    });

    // Focus input
    setTimeout(() => {
        document.getElementById('admin-chat-input')?.focus();
    }, 200);
}

function renderAdminChatMessages(msgsObj) {
    const container = document.getElementById('admin-chat-messages');
    if (!container) return;

    if (!msgsObj) {
        container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:3rem;">
            <p>لا توجد رسائل بعد في هذه المحادثة.</p>
        </div>`;
        return;
    }

    const msgs = Object.values(msgsObj);
    msgs.sort((a, b) => a.timestamp - b.timestamp);

    container.innerHTML = '';
    msgs.forEach(msg => {
        const time = new Date(msg.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
        const isCustomer = msg.sender === 'customer';
        const div = document.createElement('div');
        div.className = `admin-msg ${isCustomer ? 'from-customer' : 'from-staff'}`;
        div.innerHTML = `
            <span>${msg.text}</span>
            <span class="msg-time">${isCustomer ? (msg.senderName || 'العميل') : 'أنت (الإدارة)'} • ${time}</span>
        `;
        container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;
}

function sendAdminReply() {
    if (!activeChatId) return;
    const input = document.getElementById('admin-chat-input');
    const text = input?.value.trim();
    if (!text) return;

    if (!isFirebaseEnabled || !db) return;

    const msgData = {
        text: text,
        sender: 'staff',
        senderName: 'الإدارة',
        timestamp: Date.now()
    };

    db.ref('chats/' + activeChatId + '/messages').push(msgData);
    db.ref('chats/' + activeChatId + '/info').update({
        lastMessage: 'الإدارة: ' + text,
        lastActivity: Date.now()
    });
    // Notify customer of admin reply
    if (window.showCustomerNotification) {
        window.showCustomerNotification('رد جديد من الدعم', text, '/', 'chat');
    }
    input.value = '';
    input.focus();

    input.value = '';
    input.focus();
}

// --- Reviews Management ---
function initReviewsManagement() {
    if (!isFirebaseEnabled || !db) return;

    db.ref('reviews').on('value', (snapshot) => {
        const data = snapshot.val();
        const tbody = document.getElementById('reviews-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (!data) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">لا توجد تقييمات حالياً.</td></tr>';
            return;
        }

        Object.keys(data).forEach(key => {
            const rev = data[key];
            let starsHtml = '';
            for (let i = 1; i <= 5; i++) {
                starsHtml += `<i class="fas fa-star" style="color: ${i <= rev.rating ? 'var(--sandy-gold)' : '#cbd5e1'}; font-size: 0.8rem;"></i>`;
            }

            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--glass-border)';
            tr.innerHTML = `
                <td style="padding: 1rem;">${rev.name}</td>
                <td style="padding: 1rem;">${starsHtml} (${rev.rating})</td>
                <td style="padding: 1rem; max-width: 300px; white-space: normal; line-height: 1.4;">${rev.text}</td>
                <td style="padding: 1rem;">
                    <span style="background: ${rev.status === 'approved' ? '#dcfce7' : '#fee2e2'}; color: ${rev.status === 'approved' ? '#166534' : '#991b1b'}; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem;">
                        ${rev.status === 'approved' ? 'معتمد' : 'معلق'}
                    </span>
                </td>
                <td style="padding: 1rem;">
                    <div style="display: flex; gap: 8px;">
                        ${rev.status === 'pending' 
                            ? `<button onclick="updateReviewStatus('${key}', 'approved')" class="save-small-btn" style="background: #10b981;"><i class="fas fa-check"></i> اعتماد</button>` 
                            : `<button onclick="updateReviewStatus('${key}', 'pending')" class="save-small-btn" style="background: #64748b;"><i class="fas fa-eye-slash"></i> إخفاء</button>`
                        }
                        <button onclick="deleteReview('${key}')" class="save-small-btn" style="background: #ef4444;"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
}

function updateReviewStatus(key, status) {
    if (isFirebaseEnabled && db) {
        db.ref('reviews/' + key).update({ status }).then(() => {
            console.log("Review status updated");
        });
    }
}

function deleteReview(key) {
    if (!confirm('هل أنت متأكد من حذف هذا التقييم نهائياً؟')) return;
    if (isFirebaseEnabled && db) {
        db.ref('reviews/' + key).remove().then(() => {
            console.log("Review deleted");
        });
    }
}

// --- PWA & App Capabilities ---
function initAppCapabilities() {
    // Request Notification Permission
    if ("Notification" in window) {
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            setTimeout(() => {
                Notification.requestPermission();
            }, 5000);
        }
    }

    // Audio Context unlock
    document.addEventListener('click', () => {
        const audio = new Audio();
        audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
        audio.play().catch(() => {});
    }, { once: true });
}

function playNotificationSound() {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
    audio.play().catch(err => console.log('Sound blocked:', err));
}

// Load theme on startup
document.addEventListener('DOMContentLoaded', () => {
    initAppCapabilities();
    const savedTheme = localStorage.getItem('user-theme') || 'morning';
    document.body.setAttribute('data-theme', savedTheme);
    initReviewsManagement();
    
    // Additional Admin Inits
    getAllSettings();
    listenToChats();
    initMenuManagement();
});
