
let items = JSON.parse(localStorage.getItem('boholLostFoundItems')) || [];
let trashItems = JSON.parse(localStorage.getItem('boholLostFoundTrash')) || [];



document.addEventListener('DOMContentLoaded', function() {
    migrateSimpleItems();
    
    items = JSON.parse(localStorage.getItem('boholLostFoundItems')) || [];
    trashItems = JSON.parse(localStorage.getItem('boholLostFoundTrash')) || [];
    
    loadTrashItems(); 
    
    
    migrateItems();
    loadItems();
    setupEventListeners();
    checkAdminLogin();
    initButtonSounds();
});


// Button press sound effect using Web Audio API
function initButtonSounds() {
    // Create audio context
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;
    
    // Function to play click sound
    window.playButtonSound = function(type = 'default') {
        if (!audioCtx) {
            audioCtx = new AudioContext();
        }
        
        // Create oscillator for click sound
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        // Different sounds based on type
        if (type === 'lost') {
            // Sad/descending sound for lost items
            oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.2);
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.2);
        } else if (type === 'found') {
            // Happy/ascending sound for found items
            oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.2);
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.2);
        } else if (type === 'success') {
            // Success sound
            oscillator.frequency.setValueAtTime(523, audioCtx.currentTime);
            oscillator.frequency.setValueAtTime(659, audioCtx.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(784, audioCtx.currentTime + 0.2);
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.3);
        } else {
            // Default click sound
            oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.1);
        }
    };
    
    // Add sound to all buttons
    document.addEventListener('click', function(e) {
        const button = e.target.closest('button');
        if (button) {
            // Check if it's a lost item button
            if (button.classList.contains('mark-found-btn') || 
                button.closest('#lostItemsGrid')) {
                playButtonSound('lost');
            }
            // Check if it's a found item button
            else if (button.classList.contains('mark-returned-btn') || 
                     button.closest('#foundItemsGrid')) {
                playButtonSound('found');
            }
            // Check for success actions
            else if (button.classList.contains('approve-btn') ||
                     button.classList.contains('item-contact-btn')) {
                playButtonSound('success');
            }
            // Default click sound
            else {
                playButtonSound('default');
            }
        }
    });
}

// Admin Authentication System
const USERS_DB_KEY = 'boholAdminUsers';
const CURRENT_USER_KEY = 'boholCurrentAdminUser';

let currentUser = localStorage.getItem(CURRENT_USER_KEY);
let isSignedIn = !!currentUser;
let users = [];

// Init auth on load - removed global await

// Simple async password hash using Web Crypto API
async function hashPassword(password, salt = '') {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray));
}

// Load users from localStorage
async function loadUsers() {
  const usersData = localStorage.getItem(USERS_DB_KEY);
  if (usersData) {
    users = JSON.parse(usersData);
  }
}

// Save users to localStorage
function saveUsers() {
  localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
}

// Sign up new admin
async function signUp(username, password, confirmPassword) {
  await loadUsers();
  if (users.find(u => u.username === username)) {
    throw new Error('Username already exists');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  if (password !== confirmPassword) {
    throw new Error('Passwords do not match');
  }
  
  const salt = username + Date.now();
  const hashedPassword = await hashPassword(password, salt);
  
  const newUser = {
    username,
    hashedPassword,
    salt,
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  saveUsers();
  return newUser;
}

// Sign in admin
async function signIn(username, password) {
  await loadUsers();
  const user = users.find(u => u.username === username);
  if (!user) {
    throw new Error('User not found');
  }
  
  const hashedInput = await hashPassword(password, user.salt);
  if (hashedInput === user.hashedPassword) {
    currentUser = username;
    localStorage.setItem(CURRENT_USER_KEY, username);
    isSignedIn = true;
    return true;
  }
  throw new Error('Invalid password');
}

// Sign out
function signOut() {
  currentUser = null;
  localStorage.removeItem(CURRENT_USER_KEY);
  isSignedIn = false;
  updateAdminUI();
  updatePendingCount();
  switchTab('lost');
}

// Migrate existing items to have status property
function migrateItems() {
    let needsSave = false;
    items = items.map(item => {
        if (!item.status) {
            needsSave = true;
            return { ...item, status: 'approved' };
        }
        return item;
    });
    if (needsSave) {
        saveItems();
    }
}

// Migrate items from simple version (if present)
function migrateSimpleItems() {
    const simpleItems = localStorage.getItem('simpleItems');
    if (simpleItems) {
        let simpleList = JSON.parse(simpleItems);
        if (simpleList.some(item => !item.status)) {
            // Migrate old items to new format
            simpleList = simpleList.map(item => ({
                ...item,
                status: 'approved'
            }));
            localStorage.setItem('boholLostFoundItems', JSON.stringify(simpleList));
            localStorage.removeItem('simpleItems');
            console.log('Migrated simpleItems to boholLostFoundItems');
        }
    }
}
// Run migration on load
migrateItems();

// Save items to localStorage
function saveItems() {
    try {
        // Validate data before saving
        const validItems = items.filter(item => item && item.id);
        const validTrash = trashItems.filter(item => item && item.id);
        
        localStorage.setItem('boholLostFoundItems', JSON.stringify(validItems));
        localStorage.setItem('boholLostFoundTrash', JSON.stringify(validTrash));
        
        console.log(`✓ Saved ${validItems.length} items, ${validTrash.length} trash items to localStorage`);
    } catch (error) {
        console.error('❌ localStorage save failed:', error);
        showNotification('Storage error! Cannot save changes.', 'error');
        // Fallback: try clearing old data
        try {
            localStorage.clear();
        } catch (clearError) {
            console.error('localStorage clear also failed:', clearError);
        }
    }
}

// Check admin login status on load
function checkAdminLogin() {
    loadUsers().then(() => {
        if (currentUser) {
            isSignedIn = true;
        }
        updateAdminUI();
        loadTrashItems();
        updatePendingCount();
    });
}

// Load trash items from localStorage on init
function loadTrashItems() {
    const trashData = localStorage.getItem('boholLostFoundTrash');
    if (trashData) {
        trashItems = JSON.parse(trashData);
    }
    // Auto-purge old trash (7 days)
    purgeOldTrash();
}


// Admin Login Functions
// Legacy fns - will be replaced
// ... keep for now until HTML updated

function updateAdminUI() {
    const adminBtn = document.getElementById('adminBtn');
    const adminPanel = document.getElementById('adminPanel');
    const adminNavTab = document.getElementById('adminNavTab');
    const trashNavTab = document.getElementById('trashNavTab');
    const trashPanel = document.getElementById('trashPanel');
    
if (adminBtn) {
    if (isSignedIn) {
        adminBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i> Logout (${currentUser})`;
        adminBtn.onclick = signOut;
        adminBtn.classList.add('admin-logged-in');
    } else {
        adminBtn.innerHTML = '<i class="fas fa-user-shield"></i> Admin';
        adminBtn.onclick = openAdminAuthModal;
        adminBtn.classList.remove('admin-logged-in');
    }
}
    
    // Show/hide admin/trash nav tabs and panels
    if (adminNavTab) adminNavTab.style.display = isSignedIn ? 'block' : 'none';
    if (trashNavTab) trashNavTab.style.display = isSignedIn ? 'block' : 'none';

    if (adminPanel) {
        adminPanel.style.display = isSignedIn ? 'block' : 'none';
        if (isSignedIn) loadAdminPanel();
    }
    if (trashPanel) {
        trashPanel.style.display = isSignedIn ? 'block' : 'none';
        if (isSignedIn) loadTrashPanel();
    }
}


function updatePendingCount() {
    const pendingCount = items.filter(item => item.status === 'pending').length;
    const badge = document.getElementById('pendingBadge');
    if (badge) {
        badge.textContent = pendingCount;
        badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    }
}

// Admin Login Modal Functions
function openAdminAuthModal() {
    document.getElementById('adminAuthModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
    // Reset forms
    document.getElementById('adminSignInForm').reset();
    document.getElementById('adminSignUpForm').reset();
    clearAuthMsgs();
}

function closeAdminAuthModal() {
    document.getElementById('adminAuthModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    clearAuthMsgs();
}

function switchAuthTab(tab) {
    // Hide all forms
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    // Remove active from tabs
    const tabBtns = document.querySelectorAll('.auth-tabs .tab-btn');
    tabBtns.forEach(btn => btn.classList.remove('active'));
    
    // Show selected
    if (tab === 'signin') {
        document.getElementById('adminSignInForm').classList.add('active');
        if (tabBtns[0]) tabBtns[0].classList.add('active');
    } else {
        document.getElementById('adminSignUpForm').classList.add('active');
        if (tabBtns[1]) tabBtns[1].classList.add('active');
    }
    clearAuthMsgs();
}

function clearAuthMsgs() {
    document.getElementById('signInMsg').textContent = '';
    document.getElementById('signUpMsg').textContent = '';
}

// Admin Panel Functions
function loadAdminPanel() {
    const pendingItems = items.filter(item => item.status === 'pending');
    const approvedItems = items.filter(item => item.status === 'approved');
    const rejectedItems = items.filter(item => item.status === 'rejected');
    
    // Update counts
    document.getElementById('pendingCount').textContent = pendingItems.length;
    document.getElementById('approvedCount').textContent = approvedItems.length;
    document.getElementById('rejectedCount').textContent = rejectedItems.length;
    
    // Load pending items
    const pendingGrid = document.getElementById('pendingItemsGrid');
    if (pendingGrid) {
        if (pendingItems.length === 0) {
            pendingGrid.innerHTML = '<p class="empty-message">No pending posts to review.</p>';
        } else {
            pendingGrid.innerHTML = pendingItems.map(item => createAdminItemCard(item)).join('');
        }
    }
    
    // Load all items for management (exclude deleted)
    const allItemsGrid = document.getElementById('allItemsGrid');
    if (allItemsGrid) {
        const sortedItems = items.filter(item => item.status !== 'deleted').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        allItemsGrid.innerHTML = sortedItems.map(item => createAdminItemCard(item)).join('');
    }
}

// Load Trash Panel
function loadTrashPanel() {
    const trashGrid = document.getElementById('trashItemsGrid');
    const emptyMsg = trashGrid.querySelector('.empty-message');
    
    purgeOldTrash(); // Clean old items first
    
    if (trashItems.length === 0) {
        trashGrid.innerHTML = '<p class="empty-message">No items in trash.</p>';
    } else {
        if (emptyMsg) emptyMsg.remove();
        trashGrid.innerHTML = trashItems.map(item => createTrashItemCard(item)).join('');
    }
}

// Create trash item card
function createTrashItemCard(item) {
    const imageHtml = item.imageUrl 
        ? `<img src="${item.imageUrl}" alt="${item.name}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-box\\'></i>'">`
        : `<i class="fas fa-box"></i>`;
    
    const timeAgo = getTimeAgo(item.deletedAt);
    
    return `
        <div class="item-card" data-trash-id="${item.id}">
            <div class="item-image">
                ${imageHtml}
            </div>
            <div class="item-content">
                <div class="item-header">
                    <span class="item-type ${item.type}">${item.type}</span>
                    <span class="item-status trash-status">
                        <i class="fas fa-trash-alt"></i> Deleted ${timeAgo}
                    </span>
                </div>
                <h3 class="item-name">${item.name}</h3>
                <p class="item-description">${item.description}</p>
                <div class="item-details">
                    <div class="item-detail">
                        <i class="fas fa-info-circle"></i>
                        <span>${item.deletedReason}</span>
                    </div>
                </div>
                <div class="admin-actions">
                    <button class="admin-action-btn restore-btn" onclick="restoreFromTrash(${item.id})">
                        <i class="fas fa-trash-restore"></i> Restore
                    </button>
                    <button class="admin-action-btn perm-delete-btn" onclick="permanentDeleteTrash(${item.id})">
                        <i class="fas fa-times-circle"></i> Delete Forever
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Restore from trash
function restoreFromTrash(itemId) {
    const trashIndex = trashItems.findIndex(t => t.id === itemId);
    if (trashIndex !== -1) {
        if (confirm('Restore this item to Approved status?')) {
            const restoredItem = trashItems[trashIndex];
            restoredItem.status = 'approved';
            delete restoredItem.deletedAt;
            delete restoredItem.deletedReason;
            items.push(restoredItem);
            trashItems.splice(trashIndex, 1);
            saveItems();
            loadTrashPanel();
            loadAdminPanel();
            loadItems();
            showNotification('Item restored successfully!', 'success');
        }
    }
}

// Permanent delete from trash
function permanentDeleteTrash(itemId) {
    const trashItem = trashItems.find(t => t.id === itemId);
    if (trashItem) {
        if (confirm(`Permanently delete "${trashItem.name}"? No recovery possible.`)) {
            trashItems = trashItems.filter(t => t.id !== itemId);
            saveItems();
            loadTrashPanel();
            showNotification('Item permanently deleted.', 'success');
        }
    }
}

// Empty all trash
function emptyTrash() {
    if (confirm('Empty all trash? This cannot be undone.')) {
        trashItems = [];
        saveItems();
        loadTrashPanel();
        showNotification('Trash emptied.', 'success');
    }
}

// Purge old trash (older than 7 days)
function purgeOldTrash() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    trashItems = trashItems.filter(item => {
        if (item.deletedAt) {
            const deletedDate = new Date(item.deletedAt);
            return deletedDate > sevenDaysAgo;
        }
        return true;
    });
    
    if (trashItems.length < previousTrashCount) {
        saveItems();
    }
    previousTrashCount = trashItems.length;
}

let previousTrashCount = 0; // Track for purge logging

// Utility: Time ago formatter
function getTimeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
}

// Purge old trash (older than 7 days) - single implementation
function purgeOldTrash() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const beforeCount = trashItems.length;
    trashItems = trashItems.filter(item => {
        if (item.deletedAt) {
            const deletedDate = new Date(item.deletedAt);
            return deletedDate > sevenDaysAgo;
        }
        return true;
    });
    
    if (trashItems.length < beforeCount) {
        console.log(`Purged ${beforeCount - trashItems.length} old trash items`);
        saveItems();
    }
}



// Create admin item card with approve/reject buttons
function createAdminItemCard(item) {
    const imageHtml = item.imageUrl 
        ? `<img src="${item.imageUrl}" alt="${item.name}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-box\\'></i>'">`
        : `<i class="fas fa-box"></i>`;
    
    const statusBadge = getStatusBadge(item.status);
    const statusText = item.status === 'pending' ? 'Pending Approval' : 
                       item.status === 'approved' ? 'Approved' : 'Rejected';
    
    let actionButtons = '';
    
    if (item.status === 'pending') {
        actionButtons = `
            <button class="admin-action-btn approve-btn" onclick="approvePost(${item.id})">
                <i class="fas fa-check"></i> Approve
            </button>
            <button class="admin-action-btn reject-btn" onclick="rejectPost(${item.id})">
                <i class="fas fa-times"></i> Reject
            </button>
        `;
    } else if (item.status === 'approved') {
        actionButtons = `
            <button class="admin-action-btn reject-btn" onclick="rejectPost(${item.id})">
                <i class="fas fa-times"></i> Reject
            </button>
        `;
    } else if (item.status === 'rejected') {
        actionButtons = `
            <button class="admin-action-btn approve-btn" onclick="approvePost(${item.id})">
                <i class="fas fa-check"></i> Approve
            </button>
            <button class="admin-action-btn delete-btn" onclick="deleteItem(${item.id})">
                <i class="fas fa-trash"></i> Delete
            </button>
        `;
    }
    
    return `
        <div class="item-card" data-id="${item.id}">
            <div class="item-image">
                ${imageHtml}
            </div>
            <div class="item-content">
                <div class="item-header">
                    <span class="item-type ${item.type}">${item.type}</span>
                    ${statusBadge}
                </div>
                <h3 class="item-name">${item.name}</h3>
                <p class="item-category"><i class="fas fa-tag"></i> ${item.category}</p>
                <p class="item-description">${item.description}</p>
                <div class="item-details">
                    <div class="item-detail">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${item.location}</span>
                    </div>
                    <div class="item-detail">
                        <i class="fas fa-calendar"></i>
                        <span>${formatDate(item.date)}</span>
                    </div>
                    <div class="item-detail">
                        <i class="fas fa-phone-alt"></i>
                        <span>${item.contact}</span>
                    </div>
                </div>
                <p class="item-status-text"><i class="fas fa-info-circle"></i> ${statusText}</p>
                <div class="admin-actions">
                    ${actionButtons}
                </div>
            </div>
        </div>
    `;
}

// Get status badge HTML
function getStatusBadge(status) {
    const badges = {
        'pending': '<span class="item-status active-status"><i class="fas fa-clock"></i> Pending</span>',
        'approved': '<span class="item-status found-status"><i class="fas fa-check-circle"></i> Approved</span>',
        'rejected': '<span class="item-status returned-status"><i class="fas fa-times-circle"></i> Rejected</span>'
    };
    return badges[status] || '';
}

// Admin: Approve a post
function approvePost(itemId) {
    const item = items.find(i => i.id === itemId);
    if (item) {
        item.status = 'approved';
        saveItems();
        loadAdminPanel();
        updatePendingCount();
        showNotification(`"${item.name}" has been approved.`, 'success');
    }
}

// Admin: Reject a post
function rejectPost(itemId) {
    const item = items.find(i => i.id === itemId);
    if (item) {
        if (confirm(`Are you sure you want to reject "${item.name}"? It will be marked as rejected.`)) {
            item.status = 'rejected';
            saveItems();
            loadAdminPanel();
            updatePendingCount();
            showNotification(`"${item.name}" has been rejected.`, 'info');
        }
    }
}

// Move item to trash
function moveToTrash(itemId, reason = 'admin delete') {
    const item = items.find(i => i.id === itemId);
    if (item) {
        if (confirm(`PERMANENTLY delete "${item.name}"? Moves to Trash (auto-purge 7 days).`)) {
            console.log(`Moving to trash: ${itemId} (${reason})`);
            // Remove from items
            items = items.filter(i => i.id !== itemId);
            // Add to trash with timestamp
            const trashItem = {
                ...item,
                status: 'deleted',
                deletedAt: new Date().toISOString(),
                deletedReason: reason
            };
            trashItems.unshift(trashItem);
            saveItems();
            loadAdminPanel();
            loadTrashPanel();
            loadItems();  // Refresh public views
            updatePendingCount();
            showNotification(`"${item.name}" moved to Trash.`, 'info');
            playButtonSound('success');
        }
    }
}

// Admin: Delete item (moves to trash)
function deleteItem(itemId) {
    console.log(`Admin deleting item ${itemId}`);
    moveToTrash(itemId, 'admin action');
}


// Load and display items (filtered by status for non-admin users)
function loadItems() {
    displayLostItems();
    displayFoundItems();
}

// Display lost items (exclude deleted)
function displayLostItems() {
    const grid = document.getElementById('lostItemsGrid');
    const emptyMessage = document.getElementById('lostEmpty');
    
let lostItems = items.filter(item => item.type === 'lost' && item.status === 'approved');
    
    // Only show approved items in Lost/Found sections
    lostItems = lostItems.filter(item => item.status === 'approved');
    
    if (lostItems.length === 0) {
        grid.innerHTML = '';
        emptyMessage.style.display = 'block';
    } else {
        emptyMessage.style.display = 'none';
        grid.innerHTML = lostItems.map(item => createItemCard(item)).join('');
    }
}


// Display found items
function displayFoundItems() {
    const grid = document.getElementById('foundItemsGrid');
    const emptyMessage = document.getElementById('foundEmpty');
    
    let foundItems = items.filter(item => item.type === 'found');
    
    // Only show approved items in Lost/Found sections
    // Unapproved (pending/rejected) items should only be visible in Admin Panel
    foundItems = foundItems.filter(item => item.status === 'approved');
    
    if (foundItems.length === 0) {
        grid.innerHTML = '';
        emptyMessage.style.display = 'block';
    } else {
        emptyMessage.style.display = 'none';
        grid.innerHTML = foundItems.map(item => createItemCard(item)).join('');
    }
}

// Create item card HTML (for regular users)
function createItemCard(item) {
    const imageHtml = item.imageUrl 
        ? `<img src="${item.imageUrl}" alt="${item.name}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-box\\'></i>'">`
        : `<i class="fas fa-box"></i>`;
    
    // Action buttons - only admins can mark items as found/returned
    let actionButtons = '';
    
if (isSignedIn) {
    if (item.type === 'lost') {
        actionButtons = `
            <button class="item-action-btn mark-found-btn" onclick="markAsFound(${item.id})">
                <i class="fas fa-check"></i> Mark as Found
            </button>
        `;
    } else if (item.type === 'found') {
        actionButtons = `
            <button class="item-action-btn mark-returned-btn" onclick="markAsReturned(${item.id})">
                <i class="fas fa-undo"></i> Mark as Returned
            </button>
        `;
    }
}
    
    // Only admins can delete items - hide delete button for regular users
    const deleteButton = isSignedIn ? `<button class="delete-btn" onclick="deleteItem(${item.id})" title="Delete Item">
                        <i class="fas fa-trash"></i>
                    </button>` : '';
    
    return `
        <div class="item-card" data-id="${item.id}">
            <div class="item-image">
                ${imageHtml}
            </div>
            <div class="item-content">
                <div class="item-header">
                    <span class="item-type ${item.type}">${item.type}</span>
                    ${deleteButton}
                </div>
                <h3 class="item-name">${item.name}</h3>
                <p class="item-category"><i class="fas fa-tag"></i> ${item.category}</p>
                <p class="item-description">${item.description}</p>
                <div class="item-details">
                    <div class="item-detail">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${item.location}</span>
                    </div>
                    <div class="item-detail">
                        <i class="fas fa-calendar"></i>
                        <span>${formatDate(item.date)}</span>
                    </div>
                </div>
                <div class="item-actions">
                    ${actionButtons}
                    <button class="item-contact-btn" onclick="showContact('${item.contact}', '${item.name}')">
                        <i class="fas fa-phone-alt"></i> Contact ${item.type === 'lost' ? 'Owner' : 'Finder'}
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Modern Notification UI Utility
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    notification.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <div class="notification-content">${message}</div>
    `;

    container.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 400);
    }, 4000);
}

// Format date for display
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

// Setup event listeners
function setupEventListeners() {
    // Tab navigation
    const navLinks = document.querySelectorAll('.nav-tabs a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const tab = this.getAttribute('data-tab');
            switchTab(tab);
        });
    });

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', function() {
        searchItems(this.value);
    });

    // Form submission
    const form = document.getElementById('itemForm');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        submitItem();
    });

    // Admin login form
    // New auth forms
    const signInForm = document.getElementById('adminSignInForm');
    const signUpForm = document.getElementById('adminSignUpForm');
    
    if (signInForm) {
        signInForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const username = document.getElementById('adminUsernameSignIn').value;
            const password = document.getElementById('adminPasswordSignIn').value;
            const msgDiv = document.getElementById('signInMsg');
            
            try {
                await signIn(username, password);
                closeAdminAuthModal();
                updateAdminUI();
                loadItems();
                showNotification(`Welcome back, ${username}!`, 'success');
                switchTab('admin');
            } catch (error) {
                msgDiv.textContent = error.message;
                msgDiv.className = 'auth-msg error';
            }
        });
    }
    
    if (signUpForm) {
        signUpForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const username = document.getElementById('adminUsernameSignUp').value;
            const password = document.getElementById('adminPasswordSignUp').value;
            const confirmPassword = document.getElementById('adminConfirmPasswordSignUp').value;
            const msgDiv = document.getElementById('signUpMsg');
            
            try {
                await signUp(username, password, confirmPassword);
                switchAuthTab('signin');
                // Set message on the sign-in tab instead so it's visible after switching
                const signInMsg = document.getElementById('signInMsg');
                signInMsg.textContent = 'Account created! You can now sign in.';
                signInMsg.className = 'auth-msg success';
            } catch (error) {
                msgDiv.textContent = error.message;
                msgDiv.className = 'auth-msg error';
            }
        });
    }

    // Close modals on outside click
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            closeModal();
            closeContactModal();
            closeAdminAuthModal();
        }
    });

    // Listen for updates from other tabs/windows for real-time sync
    window.addEventListener('storage', function(e) {
        if (e.key === 'boholLostFoundItems') {
            items = JSON.parse(e.newValue) || [];
            loadItems();
            updatePendingCount();
            if (isSignedIn) loadAdminPanel();
        } else if (e.key === 'boholLostFoundTrash') {
            trashItems = JSON.parse(e.newValue) || [];
            if (isSignedIn) loadTrashPanel();
        }
    });
}


function switchTab(tabName) {
    
    const navLinks = document.querySelectorAll('.nav-tabs a');
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-tab') === tabName) {
            link.classList.add('active');
        }
    });

    
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-section`).classList.add('active');
}


function searchItems(query) {
    const searchTerm = query.toLowerCase();
    const lostGrid = document.getElementById('lostItemsGrid');
    const foundGrid = document.getElementById('foundItemsGrid');
    
    let lostItems = items.filter(item => 
        item.type === 'lost' && 
        (item.name.toLowerCase().includes(searchTerm) || 
         item.description.toLowerCase().includes(searchTerm) ||
         item.location.toLowerCase().includes(searchTerm) ||
         item.category.toLowerCase().includes(searchTerm))
    );
    
    let foundItems = items.filter(item => 
        item.type === 'found' && 
        (item.name.toLowerCase().includes(searchTerm) || 
         item.description.toLowerCase().includes(searchTerm) ||
         item.location.toLowerCase().includes(searchTerm) ||
         item.category.toLowerCase().includes(searchTerm))
    );

    // Only show approved items in search results
    lostItems = lostItems.filter(item => item.status === 'approved');
    foundItems = foundItems.filter(item => item.status === 'approved');
    
    
    if (lostItems.length === 0) {
        lostGrid.innerHTML = '';
        document.getElementById('lostEmpty').style.display = 'block';
    } else {
        document.getElementById('lostEmpty').style.display = 'none';
        lostGrid.innerHTML = lostItems.map(item => createItemCard(item)).join('');
    }

    
    if (foundItems.length === 0) {
        foundGrid.innerHTML = '';
        document.getElementById('foundEmpty').style.display = 'block';
    } else {
        document.getElementById('foundEmpty').style.display = 'none';
        foundGrid.innerHTML = foundItems.map(item => createItemCard(item)).join('');
    }
}


function openModal() {
    document.getElementById('itemModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}


function closeModal() {
    document.getElementById('itemModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('itemForm').reset();
}


function submitItem() {
    const fileInput = document.getElementById('itemImage');
    const file = fileInput.files[0];
    
    // If a file is selected, convert to base64
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imageUrl = e.target.result;
            saveItemWithImage(imageUrl);
        };
        reader.readAsDataURL(file);
    } else {
        // No image selected
        saveItemWithImage('');
    }
}

function saveItemWithImage(imageUrl) {
    const newItem = {
        id: Date.now(),
        type: document.getElementById('itemType').value,
        name: document.getElementById('itemName').value,
        category: document.getElementById('itemCategory').value,
        description: document.getElementById('itemDescription').value,
        location: document.getElementById('itemLocation').value,
        date: document.getElementById('itemDate').value,
        contact: document.getElementById('itemContact').value,
        imageUrl: imageUrl,
        createdAt: new Date().toISOString(),
        status: 'pending' // New posts require admin approval
    };

    items.push(newItem);
    saveItems();
    loadItems();
    
    // Show message about pending approval
    showNotification('Item submitted! Pending admin approval.', 'success');
    
    closeModal();
    
    // Switch to the appropriate tab
    switchTab(newItem.type);
    
    // Update pending count for admin
    updatePendingCount();
}

// Show contact modal
function showContact(contact, itemName) {
    const modal = document.getElementById('contactModal');
    const details = document.getElementById('contactDetails');
    
    details.innerHTML = `
        <h3>Contact for: ${itemName}</h3>
        <p><i class="fas fa-phone-alt"></i> ${contact}</p>
        <p style="font-size: 0.9rem; color: #666; background: #f5f5f5;">
            <i class="fas fa-info-circle"></i> Please contact the ${items.find(i => i.name === itemName)?.type === 'lost' ? 'owner' : 'finder'} to arrange the return of the item.
        </p>
    `;
    
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}


function closeContactModal() {
    document.getElementById('contactModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Mark lost item as found - for user functionality
function markAsFound(itemId) {
    const item = items.find(i => i.id === itemId);
    if (item && item.type === 'lost') {
        if (confirm(`Mark "${item.name}" (Lost) as Found/Returned? This will permanently remove it from listings.`)) {
            console.log(`Removing lost item ${itemId}: ${item.name}`);
            items = items.filter(i => i.id !== itemId);
            saveItems();
            loadItems();
            showNotification(`"${item.name}" marked as found!`, 'success');
            playButtonSound('success');
        }
    }
}

// Mark found item as returned - for user functionality
function markAsReturned(itemId) {
    const item = items.find(i => i.id === itemId);
    if (item && item.type === 'found') {
        if (confirm(`Mark "${item.name}" (Found) as Returned? This will permanently remove it from listings.`)) {
            console.log(`Removing found item ${itemId}: ${item.name}`);
            items = items.filter(i => i.id !== itemId);
            saveItems();
            loadItems();
            showNotification(`"${item.name}" marked as returned!`, 'success');
            playButtonSound('success');
        }
    }
}

// Toggle Password Visibility
function togglePasswordVisibility(inputId, icon) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}
