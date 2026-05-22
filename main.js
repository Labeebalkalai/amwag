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

// =====================================================
// ===   PWA, Service Worker & Notifications       ===
// =====================================================

let swRegistration = null;

async function initAppCapabilities() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        try {
            swRegistration = await navigator.serviceWorker.register('sw.js');
            console.log('SW: Registered successfully');
        } catch (err) {
            console.warn('SW: Registration failed', err);
        }
    }

    // Request Notification Permission with a friendly prompt
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            // Show a custom in-page prompt after 4 seconds
            setTimeout(() => {
                showNotificationPrompt();
            }, 4000);
        } else if (Notification.permission === 'granted') {
            console.log('Notifications: Already granted');
        }
    }

    // Audio Context unlock for mobile (to allow sounds)
    document.addEventListener('click', () => {
        const audio = new Audio();
        audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
        audio.play().catch(() => {});
    }, { once: true });
}

// Show a beautiful in-page notification permission prompt
function showNotificationPrompt() {
    if (Notification.permission !== 'default') return;
    if (sessionStorage.getItem('notif-prompt-shown')) return;
    sessionStorage.setItem('notif-prompt-shown', '1');

    const prompt = document.createElement('div');
    prompt.id = 'notif-permission-prompt';
    prompt.style.cssText = `
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(100px);
        background: linear-gradient(135deg, #001f3f, #002d5a);
        color: white; padding: 1rem 1.5rem; border-radius: 20px;
        z-index: 99999; display: flex; align-items: center; gap: 15px;
        box-shadow: 0 15px 40px rgba(0,0,0,0.4);
        border: 1px solid rgba(212,175,55,0.4);
        max-width: 420px; width: calc(100% - 40px);
        transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        font-family: 'Inter', sans-serif;
        direction: rtl;
    `;
    prompt.innerHTML = `
        <div style="background:rgba(212,175,55,0.2); width:45px; height:45px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <i class="fas fa-bell" style="color:#d4af37; font-size:1.3rem;"></i>
        </div>
        <div style="flex:1;">
            <div style="font-weight:700; font-size:0.95rem; margin-bottom:4px;">فعّل الإشعارات 🔔</div>
            <div style="font-size:0.8rem; opacity:0.8; line-height:1.4;">احصل على إشعار فوري عند تحديث طلبك أو رد فريقنا عليك</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; flex-shrink:0;">
            <button id="notif-allow-btn" style="background:#d4af37; color:#001f3f; border:none; padding:7px 14px; border-radius:20px; font-weight:700; cursor:pointer; font-size:0.8rem; white-space:nowrap;">السماح</button>
            <button id="notif-deny-btn" style="background:transparent; color:rgba(255,255,255,0.6); border:1px solid rgba(255,255,255,0.2); padding:5px 14px; border-radius:20px; cursor:pointer; font-size:0.75rem; white-space:nowrap;">لاحقاً</button>
        </div>
    `;
    document.body.appendChild(prompt);
    setTimeout(() => {
        prompt.style.transform = 'translateX(-50%) translateY(0)';
    }, 100);

    document.getElementById('notif-allow-btn').onclick = async () => {
        dismissPrompt(prompt);
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
            sendLocalNotification('أمواج الصياد 🐟', 'تم تفعيل الإشعارات بنجاح! ستصلك تحديثات طلباتك ورسائل فريقنا فوراً.', 'index.html', 'welcome');
        }
    };
    document.getElementById('notif-deny-btn').onclick = () => dismissPrompt(prompt);

    // Auto-dismiss after 12 seconds
    setTimeout(() => dismissPrompt(prompt), 12000);
}

function dismissPrompt(el) {
    if (!el || !el.parentNode) return;
    el.style.transform = 'translateX(-50%) translateY(120px)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 400);
}

// =====================================================
// === Core: Send Local Notification via SW        ===
// =====================================================
function sendLocalNotification(title, body, url = '/', tag = 'amwaj') {
    // Check if running inside Android App via bridge (supports multiple bridge names like AndroidBridge, Android, JSBridge)
    const bridge = window.AndroidBridge || window.Android || window.JSBridge;
    if (bridge && (typeof bridge.showAndroidNotification === 'function' || typeof bridge.showNotification === 'function')) {
        try {
            if (typeof bridge.showAndroidNotification === 'function') {
                bridge.showAndroidNotification(title, body);
            } else {
                bridge.showNotification(title, body);
            }
            console.log('SW: Notification sent via Android Bridge successfully');
            return;
        } catch (e) {
            console.error('Android bridge notification failed:', e);
        }
    }

    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    // Use SW if available (works when tab is closed/background)
    if (swRegistration && swRegistration.active) {
        swRegistration.active.postMessage({
            type: 'SHOW_NOTIFICATION',
            title,
            body,
            url,
            tag,
            requireInteraction: true
        });
    } else if (navigator.serviceWorker.controller) {
        // Fallback to current controller
        navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title,
            body,
            url,
            tag,
            requireInteraction: true
        });
    } else {
        // Last resort: browser Notification API (only works when tab is open)
        try {
            new Notification(title, {
                body,
                icon: 'logo.png.jpeg',
                tag,
                dir: 'rtl'
            });
        } catch (e) { console.warn('Notification failed:', e); }
    }
}

function playNotificationSound() {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
    audio.play().catch(err => console.log('Sound blocked:', err));
}

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

        // Apply Dynamic Texts
        if (globalSettings.heroTitle) {
            const el = document.getElementById('hero-title');
            if (el) el.innerText = globalSettings.heroTitle;
        }
        if (globalSettings.heroDesc) {
            const el = document.getElementById('hero-desc');
            if (el) el.innerText = globalSettings.heroDesc;
        }
        if (globalSettings.loyaltyCta) {
            const el = document.getElementById('loyalty-cta');
            if (el) el.innerText = globalSettings.loyaltyCta;
        }
        if (globalSettings.loyaltyDesc) {
            const el = document.getElementById('loyalty-desc');
            if (el) el.innerHTML = globalSettings.loyaltyDesc;
        }
        if (globalSettings.aboutTitle) {
            const el = document.getElementById('about-title');
            if (el) el.innerText = globalSettings.aboutTitle;
        }
        if (globalSettings.aboutDesc) {
            const el = document.getElementById('about-desc');
            if (el) el.innerText = globalSettings.aboutDesc;
        }
        if (globalSettings.aboutF1) {
            const el = document.getElementById('about-f1');
            if (el) el.innerText = globalSettings.aboutF1;
        }
        if (globalSettings.aboutF2) {
            const el = document.getElementById('about-f2');
            if (el) el.innerText = globalSettings.aboutF2;
        }
        if (globalSettings.aboutF3) {
            const el = document.getElementById('about-f3');
            if (el) el.innerText = globalSettings.aboutF3;
        }

        if (globalSettings.googleMapsUrl) {
            const iframe = document.getElementById('google-map-iframe');
            const directionsBtn = document.getElementById('get-directions-btn');
            if (iframe) iframe.src = globalSettings.googleMapsUrl;
            
            if (directionsBtn && !globalSettings.googleMapsUrl.startsWith('http')) {
                 directionsBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(globalSettings.googleMapsUrl)}`;
            }
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

// ===================================================
// ===    LIVE CHAT SYSTEM - Customer Side          ===
// ===================================================

let chatId = localStorage.getItem('chatId');
let chatWidgetOpen = false;
let chatUnread = 0;
let chatListener = null;

function getChatId() {
    if (!chatId) {
        chatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        localStorage.setItem('chatId', chatId);
    }
    return chatId;
}

function getChatUserName() {
    if (loggedInCustomer) return loggedInCustomer.name;
    return 'زائر';
}

function toggleChatWidget() {
    const widget = document.getElementById('chat-widget');
    if (!widget) return;

    chatWidgetOpen = !chatWidgetOpen;
    widget.style.display = chatWidgetOpen ? 'flex' : 'none';

    if (chatWidgetOpen) {
        // Reset unread
        chatUnread = 0;
        const badge = document.getElementById('chat-unread-badge');
        if (badge) badge.style.display = 'none';

        // Start listening
        initCustomerChat();
        initOrderNotifications();

        // Focus input
        setTimeout(() => {
            document.getElementById('chat-input')?.focus();
        }, 300);
    }
}

function initCustomerChat() {
    if (!isFirebaseEnabled || !db) return;
    if (chatListener) return; // Already listening

    const id = getChatId();
    // Helper to show admin notifications (if permission granted)
    window.showAdminNotification = function(title, body, url, tag) {
        const bridge = window.AndroidBridge || window.Android || window.JSBridge;
        if (bridge && (typeof bridge.showAndroidNotification === 'function' || typeof bridge.showNotification === 'function')) {
            try {
                if (typeof bridge.showAndroidNotification === 'function') {
                    bridge.showAndroidNotification(title, body);
                } else {
                    bridge.showNotification(title, body);
                }
                console.log('Admin Notification sent via Android Bridge successfully');
                return;
            } catch (e) {
                console.error('Android bridge notification failed:', e);
            }
        }
        if ("Notification" in window) {
            if (Notification.permission === "granted") {
                new Notification(title, { body: body, icon: 'logo.png.jpeg', tag: tag, data: { url: url } });
            } else if (Notification.permission !== "denied") {
                Notification.requestPermission().then(p => {
                    if (p === "granted") {
                        new Notification(title, { body: body, icon: 'logo.png.jpeg', tag: tag, data: { url: url } });
                    }
                });
            }
        }
    };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        window.showCustomerNotification = function(title, body, url, tag) {
            const bridge = window.AndroidBridge || window.Android || window.JSBridge;
            if (bridge && (typeof bridge.showAndroidNotification === 'function' || typeof bridge.showNotification === 'function')) {
                try {
                    if (typeof bridge.showAndroidNotification === 'function') {
                        bridge.showAndroidNotification(title, body);
                    } else {
                        bridge.showNotification(title, body);
                    }
                    console.log('Customer Notification sent via Android Bridge successfully');
                    return;
                } catch (e) {
                    console.error('Android bridge notification failed:', e);
                }
            }
            navigator.serviceWorker.controller.postMessage({
                type: 'SHOW_NOTIFICATION',
                title: title,
                body: body,
                url: url || '/',
                tag: tag || 'chat'
            });
        };
    }
    // Track last seen admin message timestamp to avoid duplicate notifications
    window.lastAdminMsgTimestamp = 0;

    // Create/update chat metadata
    db.ref('chats/' + id + '/info').update({
        customerName: getChatUserName(),
        lastActivity: Date.now(),
        status: 'active'
    });

    // Listen for messages
    chatListener = db.ref('chats/' + id + '/messages').orderByChild('timestamp');
    chatListener.on('value', snapshot => {
        const msgs = snapshot.val();
        renderCustomerChatMessages(msgs);
    });
}

function renderCustomerChatMessages(msgsObj) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    // Welcome message
    let html = `<div class="chat-msg staff">
        <span>مرحباً بك في أمواج الصياد! 🐟 كيف يمكننا مساعدتك؟</span>
        <span class="msg-time">فريق الدعم</span>
    </div>`;

    if (msgsObj) {
        const msgs = Object.values(msgsObj);
        msgs.sort((a, b) => a.timestamp - b.timestamp);

        let newStaffMsgs = 0;
        msgs.forEach(msg => {
            const time = new Date(msg.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
            const isCustomer = msg.sender === 'customer';
            html += `<div class="chat-msg ${isCustomer ? 'customer' : 'staff'}">
                <span>${msg.text}</span>
                <span class="msg-time">${isCustomer ? 'أنت' : 'فريق الدعم'} • ${time}</span>
            </div>`;
            if (!isCustomer) newStaffMsgs++;
        });

        // Unread badge (only when widget is closed)
        if (!chatWidgetOpen && newStaffMsgs > 0) {
            chatUnread = newStaffMsgs;
            const badge = document.getElementById('chat-unread-badge');
            if (badge) {
                badge.innerText = chatUnread;
                badge.style.display = 'flex';
            }
        }
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;

    // After rendering, check for new admin messages and notify if page is not focused
    if (msgsObj) {
        const msgs = Object.values(msgsObj);
        const newAdminMsgs = msgs.filter(m => m.sender === 'admin' && m.timestamp > (window.lastAdminMsgTimestamp || 0));
        if (newAdminMsgs.length > 0) {
            // Update the last seen timestamp
            const latest = Math.max(...newAdminMsgs.map(m => m.timestamp));
            window.lastAdminMsgTimestamp = latest;
            // Show notification if user is not actively viewing the chat widget
            if (document.hidden || !chatWidgetOpen) {
                const latestMsg = newAdminMsgs[newAdminMsgs.length - 1];
                const time = new Date(latestMsg.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                const title = 'رسالة جديدة من الدعم';
                const body = `${latestMsg.text} • ${time}`;
                window.showCustomerNotification(title, body, '/', 'chat');
                // Play sound for notification
                if (typeof playNotificationSound === 'function') {
                    playNotificationSound();
                }
            }
        }
    }
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input?.value.trim();
    if (!text) return;
    if (!isFirebaseEnabled || !db) {
        alert('خدمة الدردشة غير متاحة حالياً.');
        return;
    }

    const id = getChatId();
    const msgData = {
        text: text,
        sender: 'customer',
        senderName: getChatUserName(),
        timestamp: Date.now()
    };

    db.ref('chats/' + id + '/messages').push(msgData);
    db.ref('chats/' + id + '/info').update({
        customerName: getChatUserName(),
        lastMessage: text,
        lastActivity: Date.now(),
        status: 'active',
        unreadByAdmin: true
    });

    // After sending message, notify admin (if admin page active)
    if (window.showAdminNotification) {
        window.showAdminNotification('رسالة جديدة من العميل', text, '/', 'chat');
    }
}

// ===================================================
// ===    ORDER TRACKING SYSTEM - Customer Side     ===
// ===================================================

let trackingListener = null;

function openTrackingModal(orderId = null) {
    const modal = document.getElementById('tracking-modal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (orderId) {
        document.getElementById('track-order-id').value = orderId;
        initTracking(orderId);
    } else {
        resetTrackingView();
    }
}

function closeTrackingModal() {
    const modal = document.getElementById('tracking-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    
    // Stop listening if any
    if (trackingListener) {
        trackingListener.off();
        trackingListener = null;
    }
}

function searchOrderToTrack() {
    let id = document.getElementById('track-order-id').value.trim().toUpperCase();
    if (!id) {
        showTrackingError("يرجى إدخال رقم الطلب أولاً.");
        return;
    }
    
    // Auto-prepend ORD- if user enters just the number
    if (!id.startsWith('ORD-')) {
        id = 'ORD-' + id;
    }
    
    initTracking(id);
}

function initTracking(orderId) {
    if (!isFirebaseEnabled || !db) {
        showTrackingError("نظام التتبع غير متوفر حالياً.");
        return;
    }

    showTrackingError(null); 
    console.log("Searching for Order ID:", orderId);
    
    // Show loading state
    const searchForm = document.getElementById('tracking-search-form');
    const loader = document.getElementById('tracking-loader');
    if (searchForm) searchForm.style.display = 'none';
    if (loader) loader.style.display = 'block';
    
    db.ref('orders/' + orderId).once('value').then(snapshot => {
        const order = snapshot.val();
        
        // Hide loader
        if (searchForm) searchForm.style.display = 'flex';
        if (loader) loader.style.display = 'none';

        if (!order) {
            showTrackingError("لم يتم العثور على طلب بهذا الرقم (#" + orderId + "). يرجى التأكد من الرقم والمحاولة مرة أخرى.");
            return;
        }

        // Show Content
        document.getElementById('tracking-input-area').style.display = 'none';
        document.getElementById('tracking-content').style.display = 'block';
        
        // Populate Basic Info
        document.getElementById('display-track-id').innerText = '#' + orderId;
        document.getElementById('display-track-eta').innerText = order.preparationTime || '--:--';
        
        // Render Items
        const itemsList = document.getElementById('tracking-items-summary');
        itemsList.innerHTML = order.items.map(item => `
            <div style="font-size: 0.85rem; padding: 5px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
                <strong>${item.name}</strong> (x${item.qty})
            </div>
        `).join('');

        // Start Real-time Listening
        if (trackingListener) trackingListener.off();
        trackingListener = db.ref('orders/' + orderId);
        trackingListener.on('value', snap => {
            const updatedOrder = snap.val();
            if (updatedOrder) {
                updateTrackingStepper(updatedOrder.status);
            }
        });
    }).catch(err => {
        console.error("Tracking Error:", err);
        showTrackingError("حدث خطأ أثناء جلب بيانات الطلب.");
    });
}

function updateTrackingStepper(status) {
    const stages = ['pending', 'preparing', 'ready', 'delivered'];
    const currentIndex = stages.indexOf(status || 'pending');

    stages.forEach((stage, index) => {
        const el = document.getElementById('step-' + stage);
        const line = el.previousElementSibling; // step-line

        el.classList.remove('active', 'completed');
        if (line && line.classList.contains('step-line')) {
            line.classList.remove('completed');
        }

        if (index < currentIndex) {
            el.classList.add('completed');
            if (line && line.classList.contains('step-line')) line.classList.add('completed');
        } else if (index === currentIndex) {
            el.classList.add('active');
            if (line && line.classList.contains('step-line')) {
                // If it's active, the line before it should be completed
                line.classList.add('completed');
            }
        }
    });

    // Special: if delivered, play a small sound or effect
    if (status === 'delivered') {
        // You could trigger confetti here if a library is loaded
        console.log("Order Delivered! 🎉");
    }
}

function resetTrackingView() {
    document.getElementById('tracking-input-area').style.display = 'block';
    document.getElementById('tracking-content').style.display = 'none';
    const searchForm = document.getElementById('tracking-search-form');
    const loader = document.getElementById('tracking-loader');
    if (searchForm) searchForm.style.display = 'flex';
    if (loader) loader.style.display = 'none';
    
    document.getElementById('track-order-id').value = '';
    showTrackingError(null);
    if (trackingListener) {
        trackingListener.off();
        trackingListener = null;
    }
}

function showTrackingError(msg) {
    const errEl = document.getElementById('tracking-error');
    if (msg) {
        errEl.innerText = msg;
        errEl.style.display = 'block';
    } else {
        errEl.style.display = 'none';
    }
}

function contactSupportForOrder() {
    const id = document.getElementById('display-track-id').innerText;
    const msg = encodeURIComponent(`مرحباً أمواج الصياد، لدي استفسار بخصوص طلبي رقم ${id}`);
    window.open(`https://wa.me/966546117271?text=${msg}`, '_blank');
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

        // Calculate quantity in cart
        const cartQty = cart.filter(i => i.id === item.id).reduce((sum, i) => sum + i.quantity, 0);

        card.innerHTML = `
            <div class="card-qty-badge" id="qty-badge-${item.id}" style="position: absolute; top: 15px; left: 15px; width: 32px; height: 32px; border-radius: 50%; display: ${cartQty > 0 ? 'flex' : 'none'}; align-items: center; justify-content: center; font-weight: bold; font-size: 0.95rem; z-index: 5;">${cartQty}</div>
            ${isUnavailable ? `<div style="position:absolute;top:10px;right:10px;background:#dc2626;color:white;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:bold;z-index:2;">🚫 نفذت الكمية</div>` : ''}
            <img src="${item.image}" alt="${item.name}" style="${isUnavailable ? 'filter: grayscale(70%);' : ''}">
            <div class="card-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 5px;">
                    <h3 style="margin: 0; ${isUnavailable ? 'color:#9ca3af;' : ''}">${item.name}</h3>
                    <span class="selected-qty-text" id="qty-text-${item.id}" style="display: ${cartQty > 0 ? 'inline-block' : 'none'}; padding: 2px 8px; border-radius: 20px; font-size: 0.8rem; font-weight: bold;">مختار: ${cartQty}</span>
                </div>
                ${item.calories ? `<p class="item-calories" style="margin-top: 0;">${item.calories} سعرة حرارية</p>` : ''}
                ${isUnavailable ? '' : customInputUI}
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span id="price-${item.id}" style="font-weight: bold; color: ${isUnavailable ? '#9ca3af' : 'var(--ocean-blue)'};">${item.price || item.pricePerKilo} <span class="icon-saudi_riyal"></span></span>
                    ${isUnavailable ?
                        `<button class="add-to-cart" disabled style="background:#e5e7eb;color:#9ca3af;cursor:not-allowed;border:none;">🚫 نفذت الكمية</button>` :
                        isCurrentlyClosed ?
                            `<button class="add-to-cart" disabled style="background: #ccc; cursor: not-allowed;">المطعم مغلق</button>` :
                            `
                            <div id="btn-add-${item.id}" style="display: ${cartQty > 0 ? 'none' : 'block'};">
                                <button class="add-to-cart" onclick="addToCart(${item.id})"><i class="fas fa-plus"></i> إضافة للسلة</button>
                            </div>
                            <div id="btn-qty-${item.id}" style="display: ${cartQty > 0 ? 'flex' : 'none'}; align-items: center; justify-content: space-between; background: #f1f5f9; padding: 5px; border-radius: 8px; width: 110px;">
                                <button onclick="addToCart(${item.id})" style="background: #10b981; color: white; border: none; border-radius: 5px; width: 30px; height: 30px; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center;">+</button>
                                <span id="qty-val-${item.id}" style="font-weight: bold; font-size: 1.1rem; color: #1e293b;">${cartQty}</span>
                                <button onclick="decreaseQuantityFromMenu(${item.id})" style="background: #ef4444; color: white; border: none; border-radius: 5px; width: 30px; height: 30px; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center;">-</button>
                            </div>
                            `
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
    if (event && event.target && event.target.classList.contains('add-to-cart')) {
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = "تمت الإضافة!";
        btn.style.background = "#28a745";
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = "var(--ocean-blue)";
        }, 1000);
    }
}

function updateCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
    const count = cart.reduce((acc, item) => acc + item.quantity, 0);
    document.getElementById('cart-count').innerText = count;
    renderCartItems();
    updateMenuQuantities();
}

function updateMenuQuantities() {
    if (typeof menuItems !== 'undefined' && Array.isArray(menuItems)) {
        menuItems.forEach(item => {
            const cartQty = cart.filter(i => i.id === item.id).reduce((sum, i) => sum + i.quantity, 0);
            
            const badge = document.getElementById(`qty-badge-${item.id}`);
            if (badge) {
                badge.innerText = cartQty;
                badge.style.display = cartQty > 0 ? 'flex' : 'none';
            }
            
            const label = document.getElementById(`qty-text-${item.id}`);
            if (label) {
                label.innerText = `مختار: ${cartQty}`;
                label.style.display = cartQty > 0 ? 'inline-block' : 'none';
            }

            const btnAdd = document.getElementById(`btn-add-${item.id}`);
            const btnQty = document.getElementById(`btn-qty-${item.id}`);
            const qtyVal = document.getElementById(`qty-val-${item.id}`);
            
            if (btnAdd && btnQty && qtyVal) {
                qtyVal.innerText = cartQty;
                if (cartQty > 0) {
                    btnAdd.style.display = 'none';
                    btnQty.style.display = 'flex';
                } else {
                    btnAdd.style.display = 'block';
                    btnQty.style.display = 'none';
                }
            }
        });
    }
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
                <strong>${item.name}</strong> ${item.selectedPrep ? `[${item.selectedPrep}]` : ''} ${item.selectedWeight ? `(${item.selectedWeight})` : ''} 
                <div style="display: inline-flex; align-items: center; margin-right: 10px; gap: 5px; background: #f1f5f9; padding: 2px 8px; border-radius: 20px;">
                    <button onclick="increaseQuantity('${item.cartId}')" style="background: none; border: none; cursor: pointer; font-size: 1.1rem; color: #10b981; padding: 0 5px;">+</button>
                    <span style="font-weight: bold; min-width: 20px; text-align: center;">${item.quantity}</span>
                    <button onclick="decreaseQuantity('${item.cartId}')" style="background: none; border: none; cursor: pointer; font-size: 1.1rem; color: #ef4444; padding: 0 5px;">-</button>
                </div>
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
    const preparationTime = document.getElementById('preparation-time').value;
    const formattedPrepTime = formatTime(preparationTime);
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
    if (preparationTime) message += `⏰ *وقت التجهيز:* ${formattedPrepTime}\n`;
    if (notes) message += `📝 *ملاحظات:* ${notes}\n`;
    if (isRedeeming) message += `🎁 *تم استخدام 100 نقطة لوجبة مجانية*\n`;
    message += `\n*الطلبات:*\n`;

    currentCartData.forEach(item => {
        message += `- ${item.name} ${item.selectedPrep ? `[${item.selectedPrep}]` : ''} ${item.selectedWeight ? `(${item.selectedWeight})` : ''} (x${item.quantity}) - ${(item.price * item.quantity).toFixed(2)} ر.س\n`;
    });

    message += `\n💰 *الإجمالي النهائي: ${total} ر.س*`;

    // Get sequential order ID and save order
    if (isFirebaseEnabled && db) {
        db.ref('settings/orderCounter').transaction((currentCount) => {
            return (currentCount || 0) + 1;
        }, (error, committed, snapshot) => {
            if (error) {
                console.error("Order Counter Transaction Failed:", error);
                // Fallback to timestamp if transaction fails
                saveOrder('ORD-' + Date.now());
            } else if (committed) {
                const newId = snapshot.val();
                saveOrder('ORD-' + newId);
            }
        });
    } else {
        // Fallback for non-firebase
        const fallbackId = 'ORD-' + Date.now();
        saveOrder(fallbackId);
    }

    function saveOrder(orderId) {
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
                    
                    if (isRedeeming && customerData.points >= threshold) {
                        customerData.points -= threshold;
                    }
                    customerData.points += pointsToAdd; 
                    
                    customerRef.set(customerData).then(() => {
                        // Update local session to reflect new points immediately
                        if (loggedInCustomer && loggedInCustomer.phone === targetPhone) {
                            loggedInCustomer = customerData;
                            localStorage.setItem('loggedInCustomer', JSON.stringify(loggedInCustomer));
                            updateAuthUI();
                        }
                    });

                    // Save Order Invoice and Tracking
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
                        preparationTime: formattedPrepTime || 'فوري',
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

        const encodedMessage = encodeURIComponent(message + `\n🔢 *رقم الطلب:* ${orderId}`);
        const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

        window.open(whatsappUrl, '_blank');

        cart = [];
        updateCart();
        toggleCart();
        
        document.getElementById('order-notes').value = '';
        if(redeemCheckbox) redeemCheckbox.checked = false;

        // Trigger Tracking for the newly created order
        if (isFirebaseEnabled) {
            setTimeout(() => {
                openTrackingModal(orderId);
            }, 1500);
        }
    }
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
                                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                        <button onclick='openTrackingModal("${order.orderId}")' style="padding: 8px 12px; background: var(--coral-orange); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.8rem; font-weight: bold;"><i class="fas fa-truck"></i> تتبع</button>
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

// ===================================================
// ===   PASSWORD RECOVERY SYSTEM                  ===
// ===================================================

let recoveredCustomerData = null; // Store the found customer temporarily
let recoveryPassVisible = false;  // Track password visibility state

function openRecoveryModal() {
    // Close the auth modal first
    const authModal = document.getElementById('auth-modal');
    if (authModal) authModal.style.display = 'none';

    // Open recovery modal
    const modal = document.getElementById('recovery-modal');
    if (modal) {
        modal.style.display = 'flex';
        resetRecoveryModal();
        setTimeout(() => {
            const phoneInput = document.getElementById('recovery-phone');
            if (phoneInput) phoneInput.focus();
        }, 300);
    }
}

function closeRecoveryModal() {
    const modal = document.getElementById('recovery-modal');
    if (modal) modal.style.display = 'none';
    recoveredCustomerData = null;
    recoveryPassVisible = false;
}

function resetRecoveryModal() {
    document.getElementById('recovery-step-1').style.display = 'block';
    document.getElementById('recovery-step-2').style.display = 'none';
    const nameEl = document.getElementById('recovery-name');
    const phoneEl = document.getElementById('recovery-phone');
    if (nameEl) {
        nameEl.value = '';
        nameEl.style.borderColor = '#e2e8f0';
    }
    if (phoneEl) {
        phoneEl.value = '';
        phoneEl.style.borderColor = '#e2e8f0';
    }
    document.getElementById('recovery-error').style.display = 'none';
    document.getElementById('recovery-error').innerText = '';
    recoveredCustomerData = null;
    recoveryPassVisible = false;
}

function processRecover() {
    const nameInput = document.getElementById('recovery-name');
    const phoneInput = document.getElementById('recovery-phone');
    const errorEl = document.getElementById('recovery-error');
    const btn = document.getElementById('recovery-btn');
    
    const name = nameInput ? nameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';

    // Hide previous errors and reset borders
    errorEl.style.display = 'none';
    if (nameInput) nameInput.style.borderColor = '#e2e8f0';
    if (phoneInput) phoneInput.style.borderColor = '#e2e8f0';

    if (!name || !phone) {
        errorEl.innerText = 'يرجى إدخال الاسم ورقم الجوال معًا';
        errorEl.style.display = 'block';
        if (!name && nameInput) nameInput.style.borderColor = '#dc3545';
        if (!phone && phoneInput) phoneInput.style.borderColor = '#dc3545';
        return;
    }

    if (!isFirebaseEnabled || !db) {
        errorEl.innerText = 'هذه الميزة تتطلب الاتصال بالشبكة. يرجى المحاولة لاحقاً.';
        errorEl.style.display = 'block';
        return;
    }

    // Show loading state
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري البحث...';
    btn.disabled = true;

    db.ref('customers/' + phone).once('value').then(snapshot => {
        const data = snapshot.val();

        btn.innerHTML = '<i class="fas fa-search"></i> بحث عن الحساب';
        btn.disabled = false;

        if (!data) {
            // Not found
            errorEl.innerText = '❌ لا يوجد حساب مسجل بهذا الرقم. تأكد من الرقم أو قم بإنشاء حساب جديد.';
            errorEl.style.display = 'block';
            if (phoneInput) {
                phoneInput.style.borderColor = '#dc3545';
                phoneInput.style.animation = 'shake 0.4s ease';
                setTimeout(() => { phoneInput.style.animation = ''; }, 400);
            }
            return;
        }

        // Arabic normalizer helper to handle spelling variations (e.g. أ vs ا, ة vs ه)
        function normalizeArabic(text) {
            if (!text) return '';
            return text.trim().toLowerCase()
                .replace(/[أإآ]/g, 'ا')
                .replace(/ة/g, 'ه')
                .replace(/ى/g, 'ي')
                .replace(/\s+/g, ' ');
        }

        const normDbName = normalizeArabic(data.name);
        const normEnteredName = normalizeArabic(name);

        // Security check: Check if the entered name matches the database name
        if (normDbName !== normEnteredName && !normDbName.includes(normEnteredName) && !normEnteredName.includes(normDbName)) {
            errorEl.innerText = '❌ الاسم ورقم الجوال غير متطابقين. يرجى التأكد من الاسم المسجل.';
            errorEl.style.display = 'block';
            if (nameInput) {
                nameInput.style.borderColor = '#dc3545';
                nameInput.style.animation = 'shake 0.4s ease';
                setTimeout(() => { nameInput.style.animation = ''; }, 400);
            }
            return;
        }

        // Found and verified! Store and display
        recoveredCustomerData = data;
        recoveryPassVisible = false;

        // Populate step 2
        document.getElementById('recovery-show-name').innerText = data.name || 'غير محدد';
        document.getElementById('recovery-show-phone').innerText = data.phone || phone;
        
        // Show password masked by default
        const passEl = document.getElementById('recovery-show-pass');
        const eyeIcon = document.getElementById('recovery-eye-icon');
        if (passEl) {
            passEl.innerText = '••••••••';
            passEl.setAttribute('data-pass', data.password || '');
        }
        if (eyeIcon) {
            eyeIcon.className = 'fas fa-eye';
        }

        // Switch to step 2
        document.getElementById('recovery-step-1').style.display = 'none';
        document.getElementById('recovery-step-2').style.display = 'block';

    }).catch(err => {
        btn.innerHTML = '<i class="fas fa-search"></i> بحث عن الحساب';
        btn.disabled = false;
        errorEl.innerText = 'حدث خطأ أثناء البحث. يرجى المحاولة مرة أخرى.';
        errorEl.style.display = 'block';
        console.error('Recovery Error:', err);
    });
}

function toggleRecoveryPass() {
    const passEl = document.getElementById('recovery-show-pass');
    const eyeIcon = document.getElementById('recovery-eye-icon');
    if (!passEl || !recoveredCustomerData) return;

    recoveryPassVisible = !recoveryPassVisible;
    const actualPass = passEl.getAttribute('data-pass') || recoveredCustomerData.password || '';

    if (recoveryPassVisible) {
        passEl.innerText = actualPass || 'لا توجد كلمة مرور';
        passEl.style.letterSpacing = '1px';
        if (eyeIcon) eyeIcon.className = 'fas fa-eye-slash';
    } else {
        passEl.innerText = '••••••••';
        passEl.style.letterSpacing = '3px';
        if (eyeIcon) eyeIcon.className = 'fas fa-eye';
    }
}

function loginFromRecovery() {
    if (!recoveredCustomerData) return;

    // Auto-login the customer
    loggedInCustomer = recoveredCustomerData;
    localStorage.setItem('loggedInCustomer', JSON.stringify(loggedInCustomer));
    updateAuthUI();
    
    // Listen for real-time updates
    if (isFirebaseEnabled && db) {
        db.ref('customers/' + loggedInCustomer.phone).on('value', snap => {
            if (snap.val()) {
                loggedInCustomer = snap.val();
                localStorage.setItem('loggedInCustomer', JSON.stringify(loggedInCustomer));
                updateAuthUI();
            }
        });
    }

    // Close modal with a success message
    closeRecoveryModal();
    
    // Show success toast
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-80px);
        background: linear-gradient(135deg, #059669, #10b981); color: white;
        padding: 1rem 2rem; border-radius: 50px; z-index: 99999;
        box-shadow: 0 15px 40px rgba(5,150,105,0.4);
        display: flex; align-items: center; gap: 12px;
        font-family: 'Inter', sans-serif; direction: rtl;
        transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        border: 1px solid rgba(255,255,255,0.2);
    `;
    toast.innerHTML = `
        <i class="fas fa-check-circle" style="font-size: 1.3rem;"></i>
        <div>
            <div style="font-weight: 700;">مرحباً ${loggedInCustomer.name.split(' ')[0]}! 👋</div>
            <div style="font-size: 0.8rem; opacity: 0.9;">تم تسجيل الدخول بنجاح</div>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; }, 100);
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(-80px)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
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

        // Save to Firebase
        if (isFirebaseEnabled && db) {
            const resData = {
                name,
                phone,
                date,
                time,
                persons,
                status: 'pending',
                createdAt: Date.now()
            };
            db.ref('reservations').push(resData).then(() => {
                console.log("Reservation saved to Firebase");
                window.open(whatsappUrl, '_blank');
                resForm.reset();
            }).catch(err => {
                console.error("Firebase reservation error:", err);
                // Fallback: still open WhatsApp even if DB fails
                window.open(whatsappUrl, '_blank');
                resForm.reset();
            });
        } else {
            window.open(whatsappUrl, '_blank');
            resForm.reset();
        }
    });
}

// --- Rating & Reviews Logic ---
function initRatingSystem() {
    const stars = document.querySelectorAll('.rating-star');
    const ratingInput = document.getElementById('selected-rating');
    const reviewForm = document.getElementById('review-form');

    stars.forEach(star => {
        star.addEventListener('click', () => {
            const rating = star.getAttribute('data-rating');
            ratingInput.value = rating;
            
            // Update stars UI
            stars.forEach(s => {
                if (s.getAttribute('data-rating') <= rating) {
                    s.style.color = 'var(--sandy-gold)';
                } else {
                    s.style.color = '#cbd5e1';
                }
            });
        });

        star.addEventListener('mouseenter', () => {
            const rating = star.getAttribute('data-rating');
            stars.forEach(s => {
                if (s.getAttribute('data-rating') <= rating) {
                    s.style.color = 'var(--sandy-gold)';
                }
            });
        });

        star.addEventListener('mouseleave', () => {
            const currentRating = ratingInput.value;
            stars.forEach(s => {
                if (s.getAttribute('data-rating') <= currentRating) {
                    s.style.color = 'var(--sandy-gold)';
                } else {
                    s.style.color = '#cbd5e1';
                }
            });
        });
    });

    if (reviewForm) {
        reviewForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const rating = ratingInput.value;
            const name = document.getElementById('review-name').value;
            const text = document.getElementById('review-text').value;

            if (rating == 0) {
                alert("يرجى اختيار التقييم بالنجوم أولاً.");
                return;
            }

            if (isFirebaseEnabled && db) {
                const reviewData = {
                    name,
                    rating: parseInt(rating),
                    text,
                    status: 'pending', // Requires admin approval
                    timestamp: Date.now()
                };

                db.ref('reviews').push(reviewData).then(() => {
                    alert("شكراً لك! تم إرسال تقييمك بنجاح وسوف يظهر بعد مراجعة الإدارة.");
                    reviewForm.reset();
                    ratingInput.value = 0;
                    stars.forEach(s => s.style.color = '#cbd5e1');
                }).catch(err => alert("حدث خطأ أثناء إرسال التقييم: " + err.message));
            } else {
                alert("عذراً، نظام التقييم يتطلب تفعيل قاعدة البيانات.");
            }
        });
    }
}

function renderReviews() {
    const grid = document.getElementById('reviews-dynamic-grid');
    if (!grid || !isFirebaseEnabled || !db) return;

    db.ref('reviews').on('value', (snapshot) => {
        const data = snapshot.val();
        grid.innerHTML = '';
        
        let approvedReviews = [];
        if (data) {
            approvedReviews = Object.values(data).filter(r => r.status === 'approved');
        }

        if (approvedReviews.length === 0) {
            grid.innerHTML = `
                <div style="text-align: center; grid-column: 1/-1; padding: 2rem; color: var(--text-muted);">
                    <p>لا توجد تقييمات معتمدة بعد. كن أول من يقيمنا!</p>
                </div>
            `;
            return;
        }

        // Show latest 6 approved reviews
        approvedReviews.sort((a, b) => b.timestamp - a.timestamp).slice(0, 6).forEach(rev => {
            let starsHtml = '';
            for (let i = 1; i <= 5; i++) {
                starsHtml += `<i class="fas fa-star" style="color: ${i <= rev.rating ? 'var(--sandy-gold)' : '#cbd5e1'}"></i>`;
            }

            const card = document.createElement('div');
            card.className = 'card card-content';
            card.innerHTML = `
                <div style="margin-bottom: 1rem;">${starsHtml}</div>
                <p>"${rev.text}"</p>
                <h4 style="margin-top: 1rem;">- ${rev.name}</h4>
            `;
            grid.appendChild(card);
        });
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    updateCart();
    renderMenu();
    initRatingSystem();
    renderReviews();

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
    if (settings.snapchat) document.getElementById('link-snapchat').href = settings.snapchat;
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

function increaseQuantity(cartId) {
    const item = cart.find(i => i.cartId === cartId);
    if (item) {
        item.quantity++;
        updateCart();
    }
}

function decreaseQuantity(cartId) {
    const item = cart.find(i => i.cartId === cartId);
    if (item) {
        if (item.quantity > 1) {
            item.quantity--;
        } else {
            cart = cart.filter(i => i.cartId !== cartId);
        }
        updateCart();
    }
}

function decreaseQuantityFromMenu(id) {
    const item = menuItems.find(i => i.id === id);
    if (!item) return;
    
    let selectedWeight = null;
    let selectedPrep = null;

    if (item.category === 'grilled') {
        const prepSelect = document.getElementById(`prep-${id}`);
        if (prepSelect) selectedPrep = prepSelect.value;
    }

    if (item.pricePerKilo) {
        const weightInput = document.getElementById(`weight-${id}`);
        if (weightInput) selectedWeight = weightInput.value + " جرام";
    }

    const cartId = item.id + (selectedWeight ? '-' + selectedWeight : '') + (selectedPrep ? '-' + selectedPrep : '');
    decreaseQuantity(cartId);
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
    // Preload logo to ensure it renders in the PDF
    const logoImg = new Image();
    logoImg.src = 'data:image/jpeg;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAJf/8QAAv/aAAwDAQACAAMAAAAh8888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888822yDACCCCCAzV6+888888888888888888888888888888888888888888888888888888888888885nxlM86yGHPFe888MOCQ58888888888888888888888888888888888888888888888888888888885rCAARxw+vO++9PdrT3/wDDCs0tPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPtIgDRbHvvvvvvvvvvvvvjfctrCI2/PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP+wCxPvvvvvvvvvvvvvvvvvvvrcvLEkvfPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPN4RP8A7777777777777777777777755rwwRPzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzyEJU777777777777777777777777777xjAwlrzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz7zysIL777777777777777777777HX77777772PEqbzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz7777qGX77777777777777777777u6l7777rT7775VRrPzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz7776khX77777777777777777777n5xH776Q6N7776wYApbzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz7777omz77777777777777777777/64z2ZCtIL777776wzRpLzzzzzzzzzzzzzzzzzzzzzzzzzzzzz7777777vB7777777777r3777bbH3aaZIfG06koyy0nf77776Szb7zzzzzzzzzzzzzzzzzzzzzzzzzzz77777779577777zH3FLHUlD3LN7DDD6IfIyMrNfzbL+x77776h2ibzzzzzzzzzzzzzzzzzzzzzzzzzzz7777777nT7777wDVIuwRP4ERxhxwHyGuwcjO8hUmxs2Dz77775sRB3zzzzzzzzzzzzzzzzzzzzzzzzz77777770P7776zURgPXsawZR5Gx6y4FFB0gwgQghB3X4Jb777765oKDzzzzzzzzzzzzzzzzzzzzzzzzz7777776/z7776KEEVw3P7Z36zX776sO8sGB2Fq5YFDPjrnPb7777sJFfzzzzzzzzzzzzzzzzzzzzzzzz7777777777775o3qSkEqYTX77r7776pzw4ZqSezIqQn1HyH77777yqlHzzzzzzzzzzzzzzzzzzzzzzz7777777777vhH6IiZngLDL+Hb777777B777e0ZDvG0MFpN6j77zzzywADzzzzzzzzzzzzzzzzzzzzzzz7777777775qQZ6zPNv4pCXqzH77777zL76jL75kaTpoFdVYiZL77zzwhH7zzzzzzzzzzzzzzzzzzzzz777777777q0hIxD2lPf66P7v07777766f77wr7768GVY4GB1IIv777zwv5bzzzzzzzzzzzzzzzzzzzzzz77777774X9z6Fb0Vzzis1O9177v7HFStT6jj77764yTV8AoP0P777zzhbDzzzzzzzzzzzzzzzzzzzz777777771p77777tt3Y7rkAf77760Sq/8BzTof777774fL6z8XvD777775hrzzzzzzzzzzzzzzzzzzzz77777775Lb77777m4n2dD3TX777777rDvhRy3X7777764e6xuSBX777776IHzzzzzzzzzzzzzzzzzzzz7777777WT7777774orU73ulYVALA4bi9jGbFvP/T777770bbnj/7777775sXzzzzzzzzzzzzzzzzzzzz777777597777777775FX7itX5i7cOL7xRb4yBhhNU3jnT5ifyofT7777768b77zzzzzzzzzzzzzzzzzz777776wf77777777774zv75y5u4fCyQxdbMMYK1Y61zGN7wbzs+K7X77775L77zzzzzzzzzzzzzzzzzz777777jb7777777777773grzF47wShLrw0hYo+QFz7iGb77h3w8lsbX7760f77zzzzzzzzzzzzzzzzz7777775j7777777777777771+CS7Lx/wDsO+ILYX8++7bc+++8P34vJJJ2++7W++88888888888888888+++++++2++++++++++++++++uuaKH1++2++++Za4wEjk+++++Jd86oKuy++s3++888888888888888888++++++a++++++++++++++++++Nxus1whB+++sd8+9fk+++++8w+qJ2zrW+rv+8888888888888888888+++++++++++++++++++++++++++8uuRMZq3++++++0iV976++G+G82ve++t3+8888888888888888888++++++eU+++++++++++++++++++++FOQ8Wl4+q9KAsYrP+0A+Ty7HqSX++sd+8888888888888888888++++++5Z+++++++++++++++++++++VgWdqVzwx50+++4+++++d7ERpQ+++1+888888888888888888888++++++12++++/O++++++++++++++UkrpB4oRhRNQ++8s2+++++Nw+a+++L+888888888888888888888+++++++Q+++6R8++++++++++++7GKZ/oFMFN4EBM1++6X+++++caxN+++d8888888888888888888888+++++++JV++kEc+++++++++16Gs+EBP0F8d++8uRH++vd++++reJR+W+++88888888888888888888888+++++++eW8Ip+++++++3oCP++++su+Teru+++GAR2++1++++z++++c08888888888888888888888888+++++++++pEf8AvvvdDZ7Pvvvvvvvvvvvg9vvvjl/XvvvvvvvnvvvvvOPPPPPPPPPPPPPPPPPPPPPPPPPPvvvvvvvvruM/vvvvvvvvvvvvvvvvvvmDv/d+01O98W8edPvvvvvvvOFPPPPPPPPPPPPPPPPPPPPPPPPPPvvvvvvvr6Avvvvvvvvvvvvvvvvtuq4xpjDT+N/tfywjqgetvvvvvPHvPPPPPPPPPPPPPPPPPPPPPPPPPvvvvvvvrrwctvvvvvvvvvvuegAcwRXec+Hr/P8A777777+6kvX777zzzzzzzzzzzzzzzzzzzzzzzzzzzzz77777777jdyZDDH7nvqFHIM333jfz0/zjrqZgAHLPKNKrXJ1377zzzzzzzzzzzzzzzzzzzzzzzzzzzzz777777776z02kD57InDX21nS+c7z/APeRtMNZ9vff+OfPNM5XV3+++888888888888888888888888888++++++++++vUz9989382CtOe+8vOq59+6HPsfPfudc5cy62/TVU++w2888888888888888888888888+++++++++++++Pu88/f8AvvvsptOR3D/vvvvvvvvvvvPvvvrr2kSqI+hW/vPPPPPPPPPPPPPPPPPPPPPPPvvvvvvvvvvvvvvvvvvvvvvv7/vtu4svvvvvvvvvjoNvvvvvvvrarTUd3fvPPPPPPPPPPPPPPPPPPPPPPvvvvvvvvvvvvvvvvvvvvvvvvu6bLTJPvh8/vvvvGwM/vvvvvvvvvrMLP/vPPPPPPPPPPPPPPPPPPPPPPvvvvvvvvvvvvP8A77777777OmrNnID/AA+8GoP/AN5fNCdfu2sfvvvvvuKfHPvPPPPPPPPPPPPPPPPPPPPPPvvvvvvvvvvsaDPvvvvvvDp/WKsNJLafv/8A/kDT7SY1z9/lP7777777zZz7zzzzzzzzzzzzzzzzzzzzzz7777777r7bZf6LnCvZk70nfG1gY+/kf741L33zrjX7RftixfubhICh9T37zzzzzzzzzzzzzzzzzzzzzz777777680p2NY3jiPh7W7Fp727mvjbtf7v3vJ16xz75304LzP2549/e7z7zzzzzzzzzzzzzzzzzzzzzz7777777uYms5/TnPEnl5iPb+1z3wfL5/7VGFp3S/n98Kx8P/8A3Of9cm83+8888888888888888888888++++++fNM1JZ9uodsdvNJBd2d7vX/AKnvvgFWKTJfrPvvkQdDdDnGsPEr9vvvPPPPPPPPPPPPPPPPPPPPPPvvvvr3MUZzvfOfcVcE/LnrPvvvvvvvvvhQv3/vvvvuzYQ3vnNbbPsHvvvPPPPPPPPPPPPPPPPPPPPPPPvvvvvvPDznTvtWKdvvvvvvvvvvvvvvvvv7H/vvvvvu/n3PvvvvvvvvvPPPPPPPPPPPPPPPPPPPPPPPPPPPvvvvvvvvvvsB3V/PPPvvvvvvvvvvvvvvvvvvvvvrLPvvvvvvvvvPPPPPPPPPPPPPPPPPPPPPPPPPPPPPvvvvvvvvvvvvn/PPPPPPvvvvvvvvvvvvvvvvvvvvvvvvvvPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPfPPPvvvvvvvvvvvvvPPe9//AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A88888888888888888888888888888+++++++++++88888888888888888888888888888888888888888888888888888888888888888888888+++++++++88888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888++++8/8QAAv/aAAwDAQACAAMAAAAQ88888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888x5CR1/7zz39ZtF2w8888888888888888888888888888888888888888888888888888888888888xxWpTDFN+x41oDBBzyepw0888888888888888888888888888888888888888888888888888888888rPe6hHgdOed9MuN9rDLDzGpr488888888888888888888888888888888888888888888888888889MFy30Mf++++++++++++ONgDKRn4tw8888888888888888888888888888888888888888888888888s6T1nN++++++++++++++++++OuYDRswL088888888888888888888888888888888888888888888885Cko/8AvvvvvvvvvvvvvvvvvvvvvvqiAoTRcPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPOPOAwA1fvvvvvvvvvvvvvvvvvvvvvvvvvrKgsR6lPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPjPEAl//vvvvvvvvvvvvvvvvvPPMffPvvvvvifDNFMPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPvvuhBCXvvvvvvvvvvvvvvvPPPPP+l3vvPPNnvvvxq9R1PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPvvvozAvvvvvvvvvvvvvvPPPPPPKdLNPPPI/q3PvvvGf8Aa3zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz7776kSf7777777777777zzzzzzyjGWnjManqOvzz776xcsHTzzzzzzzzzzzzzzzzzzzzzzzzzzzzz7777777CP7777777777rPbzzTXvP3OQai0yQ8IW4fZb77769NDV/zzzzzzzzzzzzzzzzzzzzzzzzzzz77777769P3z77zTP+Rm1bqF4pLX4oBtGR/wCCHTpT8GFx0++++fpH0888888888888888888888888888+++++++Wm+++8XNV1HluVCLAeT4Gn4EXf1Fof4PWhinLW+++++OzZ18888888888888888888888888+++++++4f++++7YniwdXb/FK0w+W+zCXqtGT8whlhIe8x4w+++++utC8888888888888888888888888+++++++w3++++my5HYYGwYgcaX888/CwjNpPTxAlW7h6ijW0++++M+f0888888888888888888888888+++++++8++88+novA7QH0JS88qU8+spfOLV/F+KEnGpmK/H8++++s3Wa88888888888888888888888++++++++++/mW8eit4amrcsd888+++8u8+ok97ErOXsDWg8f2+8888a3t88888888888888888888888+++++++++8j1Xc9ht98y4u0ma8+++++18+/j8sLqQ2KkWO1sB0++88s95f888888888888888888888+++++++++8Wlt0Q5REb8uwNwdb++++8Y48+r78++PcL+amiEiAe+++88YA/8888888888888888888888+++++++6Lc8ed9S1/bnnp9pN88yyzYCY8+qe8+++8cc2M9TL9c+++88soX88888888888888888888++++++++1G9++++Pg5vQnRfu++88vMnMDKBXyb88888syo8VkUne+++++uEh88888888888888888888+++++++6ZN+++++uCpT1F5y5888888460mGTH9888888sJe++DOs++++++iv88888888888888888888+++++++zE+++++++fA8sjtiMxTA1SjWXt3RMLE/y08888I7RIl3+++++++0t88888888888888888888++++++6D+++++++++8DsU60vImYvVm5uJaKsJH0QYXD1+8xH2GYd2+++++qr++888888888888888888++++++8U+++++++++++fHx8druIY4pIBjIQEHGULq1pvR8+Zwv8AAvdfvvvqh/vvPPPPPPPPPPPPPPPPPPvvvvvjvfvvvvvvvvvvvjqRNqcIvufIaRc/k6B9Gb3Ov5PPD+NvAQSvvvvv1PvvPPPPPPPPPPPPPPPPPvvvvvvi3vvvvvvvvvvvvvvuy2ACn8rzfXvMaV02/PNQO/PPLp9atyLwtvvqjPvvPPPPPPPPPPPPPPPPPvvvvvvkPvvvvvvvvvvvvvvvrmitAw/POvPLOdKjz6NQvPPPPD+KnyrzQNvuTvvvPPPPPPPPPPPPPPPPPPvvvvvpPvvvvvvvvvvvvvvvvvnpfjmJnP8ATzy640x9EnTzzzzrTxtH2ep77r/7zzzzzzzzzzzzzzzzzzz77777677777777777777777777y51/PgLnPzzzzzB47vffzTxTzcF0bX77ub7zzzzzzzzzzzzzzzzzzz777774nT777777777777777777777VTXBqJ/eo6Yvc2WJ05iNHbulwLT76/77zzzzzzzzzzzzzzzzzzz777776lT777777777777777777774ek8L8MAQv1vzzxFnzzyz6SC6TX774h7zzzzzzzzzzzzzzzzzzzzz777776T777774n7777777777777wAgzAMeic9svDzz57zzzzzwE+ar77677zzzzzzzzzzzzzzzzzzzzz777776rv777hY/77777777777jY+AOhmym91ryux3zz3zzzzzyELdDb777zzzzzzzzzzzzzzzzzzzzzz7777775lH77nD7777777777up71zQMM4J4Hz66QP7z69Xzzzy2cwRtD777zzzzzzzzzzzzzzzzzzzzzzz77777777T6YXz777777nslK1774gzy1TlPz7zEw/T6yPzzzxz77751Dzzzzzzzzzzzzzzzzzzzzzzzzz777777777/oT77b3C/Vzz7777777746R7777y1cbzzzzzz7637776ynzzzzzzzzzzzzzzzzzzzzzzzzz777777777gQ776wz77777777777776zOPbzyKi+VkZXLHrz777777z33zzzzzzzzzzzzzzzzzzzzzzzzz777777761afT7777777777777zzf8AUbDoy2wIOGFA97GImX8++++88/8APPPPPPPPPPPPPPPPPPPPPPPPPvvvvvvvrOqRNPPvvvvvvvuNbdvDTvqjXv8Atxx9zzzzzy/0zdr777zzzzzzzzzzzzzzzzzzzzzzzzzzzzz77777776mvh2/z3/nHWv4y7F30wWBwx7b7hnR+npN27HLqv5X77zzzzzzzzzzzzzzzzzzzzzzzzzzzzz77777776xMfZnA4YLkAEBKsz8W97GSS4HX6o5yy4vOLDOyTDz/wC++888888888888888888888888888++++++++885x74R89H+1P8fc80uNeJd20MP8ON/vuqLe3vMJ9ww++8z888888888888888888888888+++++++++8888eNusveOc+8736BWuN88888888888688888++By3EufD+88888888888888888888888++++++++8888888+++++++8sOc8w16R++8888888lXj88+++++M4z7u69+8888888888888888888888++++++++8888888+++++++888nG3v8d88uU8++8+n/v8APPPPvvvvvjEIvvvPPPPPPPPPPPPPPPPPPPPPPvvvvvvvvvvvOv8Az777777zf18zUknP7zrLD/j1j6jS3zKxHz77776jUBX7zzzzzzzzzzzzzzzzzzzzzz7777777777z7Vfzzz7zzDPsWxGR15Efyq4EvAQ4nHFHeNV3377776+19/7zzzzzzzzzzzzzzzzzzzzzz7777777r3nR0ohUbiCEODUJzFXCDo+jT4/TLMbCwBaFlItDnAFaR36Px37zzzzzzzzzzzzzzzzzzzzzz7777777/Tcs5SB2UwmPhOmssDAxeWMJX7rkVw5yqv8qAGUjM0BIqEtiff7zzzzzzzzzzzzzzzzzzzzzz777777btP1Fx/uc0msUPfyo9GhGAMxl77a8gdr+k3s0F3MHIUOVc2tADb7zzzzzzzzzzzzzzzzzzzzzz7777770EUUa18weZqV/DX+UbE8sT1f3772tLrxK4377zfYjzLeCYo2ZNz77zzzzzzzzzzzzzzzzzzzzzz77777yD107MPLWE2jIyB8y7777777776tjzd/77776lF2/wA+9dMN+Iv++88888888888888888888888+++++uvfqitsc+VZd++++++++++++++++/Zc++++++pAwt+++++++++888888888888888888888888888++++++++++oZsW1888+++++++++++++++++++++++e+++++++++88888888888888888888888888888+++++++++++9/u888888++++++++++++++++++++++++++8888888888888888888888888888888r088+++++++++++++88y37zzzzzzz37zzzzzzzzzzzzzzzzzzzzzz/wD/APvTzzzzzzzzzzzzzzzzzzzzzzzzzzzz77777777777zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz777777777zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz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';
    
    const generatePdf = () => {
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
                <img src="${logoImg.src}" alt="Logo" style="height: 80px; margin-bottom: 10px;">
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
            html2canvas: { scale: 2, useCORS: true, allowTaint: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(element).save();
    };

    // Since the image is base64, we don't need to wait for onload
    generatePdf();
}

// --- Initialization ---
window.addEventListener('load', () => {
    initAppCapabilities();
    initAdaptiveUI();
    initVisualEffects();
    initVoiceAssistant();
    listenToGlobalUpdates();
    
    // Existing initialization calls if any
    updateAuthUI();
    renderMenu();
    listenToNewOrders();
    initRatingSystem();
    renderReviews();
    checkRestaurantStatus();
    loadAnnouncementSettings();
    renderStaffSection();
    renderSupportModal();
    listenToChatMessages();
});


