// ----------------- Constants and Configuration -----------------
const USERS_KEY = 'cms_users_v2';
const TX_KEY_PREFIX = 'cms_tx_'; // Changed to prefix for user-specific keys
const SESSION_KEY = 'cms_session_v2';
const DEMO_USER = { email: 'student@school.edu', name: 'Demo Student', pin: '1234' };

// ----------------- Utilities -----------------
function nowTimestamp() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return { date: `${mm}/${dd}/${yy}`, time: `${hh}:${min}:${ss}`, iso: d.toISOString() };
}

function uid(prefix = 'id') {
    return prefix + Math.random().toString(36).slice(2, 9);
}

function formatCurrency(amount) {
    return '₱' + parseFloat(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const [mm, dd, yy] = dateStr.split('/').map(Number);
    return new Date(2000 + yy, mm - 1, dd);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPin(pin) {
    return pin && pin.length >= 4 && pin.length <= 12 && /^\d+$/.test(pin);
}

function showAlert(message, type = 'info', duration = 5000) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alert.style.position = 'fixed';
    alert.style.bottom = '0px';
    alert.style.left = '50%';
    alert.style.transform = 'translateX(-50%)';
    alert.style.zIndex = '9999';
    alert.style.minWidth = '250px';
    alert.style.maxWidth = '90vw';
    alert.style.textAlign = 'center';
    alert.style.color = 'black';

    document.body.appendChild(alert);

    if (duration > 0) {
        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, duration);
    }

    return alert;
}

// ----------------- alert if something goes wrong please refresh the page -----------------
function showAlertMessage(message, type = 'info') {
    showAlert(message, type);
}

// ----------------- Storage Functions -----------------
function load(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
        console.error('Error loading from storage:', e);
        return null;
    }
}

function save(key, val) {
    try {
        localStorage.setItem(key, JSON.stringify(val));
        return true;
    } catch (e) {
        console.error('Error saving to storage:', e);
        showAlert('Error saving data. Please try again.', 'error');
        return false;
    }
}

function getUsers() { return load(USERS_KEY) || []; }
function saveUsers(u) { return save(USERS_KEY, u); }

// User-specific transaction functions
function getTxKey() {
    const session = getSession();
    return session && session.email ? `${TX_KEY_PREFIX}${session.email}` : null;
}

function getTx() {
    const txKey = getTxKey();
    return txKey ? load(txKey) || [] : [];
}

function saveTx(arr) {
    const txKey = getTxKey();
    return txKey ? save(txKey, arr) : false;
}

function getSession() { return load(SESSION_KEY); }
function setSession(session) { return save(SESSION_KEY, session); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

// ----------------- NEW: Enhanced User Functions -----------------
function getCurrentUser() {
    const session = getSession();
    if (!session) return null;

    const users = getUsers();
    const user = users.find(u => u.email === session.email);
    if (user) {
        // Ensure user has settings and reflections
        if (!user.settings) user.settings = {};
        if (!user.reflections) user.reflections = [];
        return user;
    }
    return null;
}

function saveUserData(user) {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.email === user.email);
    if (userIndex !== -1) {
        users[userIndex] = user;
        return saveUsers(users);
    }
    return false;
}

// ----------------- NEW: Enhanced Features -----------------
function updateSavingsInsights() {
    const user = getCurrentUser();
    if (!user) return;

    const txs = getTx();
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay());

    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    // Calculate current week savings
    const currentWeekSavings = calculateSavingsForPeriod(txs, currentWeekStart, today);

    // Calculate last week savings
    const lastWeekEnd = new Date(currentWeekStart.getTime() - 1);
    const lastWeekSavings = calculateSavingsForPeriod(txs, lastWeekStart, lastWeekEnd);

    // Update weekly savings display
    const weeklySavingsEl = document.getElementById('weekly-savings');
    const weeklyComparisonEl = document.getElementById('weekly-comparison');

    if (weeklySavingsEl) {
        weeklySavingsEl.textContent = formatCurrency(currentWeekSavings);
        weeklySavingsEl.className = `insight-value ${currentWeekSavings >= 0 ? 'insight-positive' : 'insight-negative'}`;
    }

    if (weeklyComparisonEl && lastWeekSavings !== 0) {
        const changePercent = ((currentWeekSavings - lastWeekSavings) / Math.abs(lastWeekSavings)) * 100;
        const direction = changePercent >= 0 ? 'more' : 'less';
        weeklyComparisonEl.textContent = `vs last week: ${Math.abs(changePercent).toFixed(1)}% ${direction}`;
        weeklyComparisonEl.style.color = changePercent >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    // Update 30-day projection
    const monthlyProjectionEl = document.getElementById('monthly-projection');
    if (monthlyProjectionEl) {
        const dailyRate = currentWeekSavings / 7; // Average daily savings
        const monthlyProjection = dailyRate * 30;
        monthlyProjectionEl.textContent = formatCurrency(monthlyProjection);
        monthlyProjectionEl.className = `insight-value ${monthlyProjection >= 0 ? 'insight-positive' : 'insight-negative'}`;
    }

    // Update savings goal progress
    updateSavingsGoalProgress();
}

function calculateSavingsForPeriod(transactions, startDate, endDate) {
    let savings = 0;
    transactions.forEach(transaction => {
        const transactionDate = new Date(transaction.createdAt.iso);
        if (transactionDate >= startDate && transactionDate <= endDate) {
            if (transaction.type === 'inflow') {
                savings += transaction.amount;
            } else {
                savings -= transaction.amount;
            }
        }
    });
    return savings;
}

function calculateSpendingForPeriod(transactions, startDate, endDate) {
    let spending = 0;
    const isSameDay = startDate.toDateString() === endDate.toDateString();

    transactions.forEach(transaction => {
        if (transaction.type === 'outflow') {
            const transactionDate = new Date(transaction.createdAt.iso);
            if (isSameDay) {
                if (transactionDate.toDateString() === startDate.toDateString()) {
                    spending += transaction.amount;
                }
            } else if (transactionDate >= startDate && transactionDate <= endDate) {
                spending += transaction.amount;
            }
        }
    });
    return spending;
}

function updateSavingsGoalProgress() {
    const user = getCurrentUser();
    if (!user || !user.settings || !user.settings.savingsGoal) return;

    const goalAmount = user.settings.savingsGoal;
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthStart = new Date(currentYear, currentMonth, 1);
    const today = new Date();

    const txs = getTx();
    let monthlySavings = 0;
    txs.forEach(transaction => {
        const transactionDate = new Date(transaction.createdAt.iso);
        if (transactionDate >= monthStart && transactionDate <= today) {
            if (transaction.type === 'inflow') {
                monthlySavings += transaction.amount;
            } else {
                monthlySavings -= transaction.amount;
            }
        }
    });

    const progressPercent = Math.min(100, (monthlySavings / goalAmount) * 100);

    const goalProgressText = document.getElementById('goal-progress-text');
    const goalProgressFill = document.getElementById('goal-progress-fill');

    if (goalProgressText) {
        goalProgressText.textContent = `₱${monthlySavings.toFixed(2)} of ₱${goalAmount.toFixed(2)}`;
    }

    if (goalProgressFill) {
        goalProgressFill.style.width = `${progressPercent}%`;
    }
}

function updateSpendingPatterns() {
    const txs = getTx();
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay());

    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    // Get spending by category for current and last week
    const currentWeekSpending = getSpendingByCategory(txs, currentWeekStart, today);
    const lastWeekSpending = getSpendingByCategory(txs, lastWeekStart, new Date(lastWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000));

    // Update pattern alerts
    updatePatternAlerts(currentWeekSpending, lastWeekSpending);

    // Update category chart
    updateCategoryChart(currentWeekSpending);

    // Update top categories
    updateTopCategories(currentWeekSpending);
}

function getSpendingByCategory(transactions, startDate, endDate) {
    const spendingByCategory = {};
    transactions.forEach(transaction => {
        const transactionDate = new Date(transaction.createdAt.iso);
        if (transactionDate >= startDate && transactionDate <= endDate && transaction.type === 'outflow') {
            const category = transaction.category || 'Other';
            spendingByCategory[category] = (spendingByCategory[category] || 0) + transaction.amount;
        }
    });
    return spendingByCategory;
}

function updatePatternAlerts(currentWeekSpending, lastWeekSpending) {
    const patternAlertsEl = document.getElementById('pattern-alerts');
    if (!patternAlertsEl) return;

    patternAlertsEl.innerHTML = '';

    for (const category in currentWeekSpending) {
        if (lastWeekSpending[category]) {
            const change = ((currentWeekSpending[category] - lastWeekSpending[category]) / lastWeekSpending[category]) * 100;
            if (Math.abs(change) > 20) {
                const direction = change > 0 ? 'more' : 'less';
                const alert = document.createElement('div');
                alert.className = 'pattern-alert';
                alert.innerHTML = `
                    <strong>Spending Pattern Change</strong>
                    <p>You spent ${Math.abs(change).toFixed(0)}% ${direction} on ${category} this week compared to last week.</p>
                `;
                patternAlertsEl.appendChild(alert);
            }
        }
    }
}

function updateCategoryChart(spendingByCategory) {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;

    const categories = Object.keys(spendingByCategory);
    const amounts = Object.values(spendingByCategory);

    // Destroy existing chart if it exists
    if (window.categoryChartInstance) {
        window.categoryChartInstance.destroy();
    }

    if (categories.length === 0) {
        ctx.parentElement.innerHTML = '<div class="muted text-center">No spending data for this period</div>';
        return;
    }

    window.categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{
                data: amounts,
                backgroundColor: [
                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
                    '#9966FF', '#FF9F40', '#8AC926', '#1982C4'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: 'Spending by Category'
                }
            }
        }
    });
}

function updateTopCategories(spendingByCategory) {
    const topCategoriesEl = document.getElementById('top-categories');
    if (!topCategoriesEl) return;

    const categories = Object.entries(spendingByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    if (categories.length === 0) {
        topCategoriesEl.innerHTML = '<div class="muted">No spending data for this period</div>';
        return;
    }

    let html = '<h4>Top Spending Categories This Week<ul style="padding:10px;">';
    categories.forEach(([category, amount]) => {
        html += `<li>${category}: ${formatCurrency(amount)}</li>`;
    });
    html += '</ul></h4>';

    topCategoriesEl.innerHTML = html;
}

function checkSpendingLimits() {
    const user = getCurrentUser();
    if (!user || !user.settings) return;

    const txs = getTx();
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay());

    const dailySpent = calculateSpendingForPeriod(txs, today, today);
    const weeklySpent = calculateSpendingForPeriod(txs, currentWeekStart, today);

    const warningsContainer = document.getElementById('spending-limit-warnings');
    if (!warningsContainer) return;

    warningsContainer.innerHTML = '';

    if (user.settings.dailySpendingLimit > 0) {
        const dailyPercentage = (dailySpent / user.settings.dailySpendingLimit) * 100;
        if (dailyPercentage >= 80) {
            const warning = document.createElement('div');
            warning.className = 'spending-limit-warning';
            warning.innerHTML = `
                <strong>Daily Spending Limit Warning</strong>
                <p>You've spent ${formatCurrency(dailySpent)} today, which is ${dailyPercentage.toFixed(0)}% of your daily limit (${formatCurrency(user.settings.dailySpendingLimit)}).</p>
            `;
            warningsContainer.appendChild(warning);
        }
    }

    if (user.settings.weeklySpendingLimit > 0) {
        const weeklyPercentage = (weeklySpent / user.settings.weeklySpendingLimit) * 100;
        if (weeklyPercentage >= 80) {
            const warning = document.createElement('div');
            warning.className = 'spending-limit-warning';
            warning.innerHTML = `
                <strong>Weekly Spending Limit Warning</strong>
                <p>You've spent ${formatCurrency(weeklySpent)} this week, which is ${weeklyPercentage.toFixed(0)}% of your weekly limit (${formatCurrency(user.settings.weeklySpendingLimit)}).</p>
            `;
            warningsContainer.appendChild(warning);
        }
    }
}

function updateNotifications() {
    const notifications = generateNotifications();
    const badge = document.getElementById('notification-count');

    if (badge && notifications.length > 0) {
        badge.textContent = notifications.length;
        badge.style.display = 'flex';
    } else if (badge) {
        badge.style.display = 'none';
    }
}

function generateNotifications() {
    const notifications = [];
    const user = getCurrentUser();
    if (!user || !user.transactions) return notifications;

    const txs = getTx();
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay());

    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    // Check spending limits
    if (user.settings) {
        const dailySpent = calculateSpendingForPeriod(txs, today, today);
        const weeklySpent = calculateSpendingForPeriod(txs, currentWeekStart, today);

        if (user.settings.dailySpendingLimit > 0 && dailySpent > user.settings.dailySpendingLimit * 0.8) {
            notifications.push({
                type: 'warning',
                title: 'Daily Spending Alert',
                message: `You've spent ${formatCurrency(dailySpent)} today, which is ${(dailySpent / user.settings.dailySpendingLimit * 100).toFixed(0)}% of your daily limit (${formatCurrency(user.settings.dailySpendingLimit)}).`,
                time: 'Today'
            });
        }

        if (user.settings.weeklySpendingLimit > 0 && weeklySpent > user.settings.weeklySpendingLimit * 0.8) {
            notifications.push({
                type: 'warning',
                title: 'Weekly Spending Alert',
                message: `You've spent ${formatCurrency(weeklySpent)} this week, which is ${(weeklySpent / user.settings.weeklySpendingLimit * 100).toFixed(0)}% of your weekly limit (${formatCurrency(user.settings.weeklySpendingLimit)}).`,
                time: 'This week'
            });
        }
    }

    // Check for spending pattern changes
    const currentWeekSpending = getSpendingByCategory(txs, currentWeekStart, today);
    const lastWeekSpending = getSpendingByCategory(txs, lastWeekStart, new Date(lastWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000));

    for (const category in currentWeekSpending) {
        if (lastWeekSpending[category]) {
            const change = ((currentWeekSpending[category] - lastWeekSpending[category]) / lastWeekSpending[category]) * 100;
            if (Math.abs(change) > 20) {
                const direction = change > 0 ? 'more' : 'less';
                notifications.push({
                    type: 'info',
                    title: 'Spending Pattern Change',
                    message: `You spent ${Math.abs(change).toFixed(0)}% ${direction} on ${category} this week compared to last week.`,
                    time: 'This week'
                });
            }
        }
    }

    // Check for missed daily entries
    const lastTransactionDate = txs.length > 0 ?
        new Date(txs[txs.length - 1].createdAt.iso) : null;

    if (lastTransactionDate) {
        const daysSinceLastEntry = Math.floor((today - lastTransactionDate) / (1000 * 60 * 60 * 24));
        if (daysSinceLastEntry > 1 && user.settings.dailyReminder) {
            notifications.push({
                type: 'info',
                title: 'Daily Tracking Reminder',
                message: `It's been ${daysSinceLastEntry} days since your last transaction entry. Don't forget to track your spending daily!`,
                time: 'Today'
            });
        }
    }

    return notifications;
}

function checkDailyReminder() {
    const user = getCurrentUser();
    if (!user || !user.settings || !user.settings.dailyReminder) return;

    // Check if user has logged any transactions today
    const today = new Date();
    const txs = getTx();
    const hasEntryToday = txs.some(transaction => {
        const transactionDate = new Date(transaction.createdAt.iso);
        return transactionDate.toDateString() === today.toDateString();
    });

    if (!hasEntryToday) {
        // Show reminder notification
        updateNotifications();
    }
}

// ----------------- NEW: Settings and Modals -----------------
function initSettings() {
    const btnSettings = document.getElementById('btn-settings');
    const btnNotifications = document.getElementById('btn-notifications');
    const setGoalBtn = document.getElementById('btn-set-goal');
    const saveReflectionBtn = document.getElementById('btn-save-reflection');

    if (btnSettings) {
        btnSettings.addEventListener('click', showSettingsModal);
    }

    if (btnNotifications) {
        btnNotifications.addEventListener('click', showNotificationsModal);
    }

    if (setGoalBtn) {
        setGoalBtn.addEventListener('click', showSettingsModal);
    }

    if (saveReflectionBtn) {
        saveReflectionBtn.addEventListener('click', saveReflectionNotes);
    }

    // Add event delegation for delete buttons
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('delete-reflection-btn')) {
            const reflectionId = e.target.getAttribute('data-reflection-id');
            if (reflectionId) {
                deleteReflection(reflectionId);
            }
        }
    });
}

// Update the loadReflections function to ensure proper data attributes
function loadReflections() {
    const user = getCurrentUser();
    const container = document.getElementById('reflections-container');
    const listContainer = document.getElementById('reflections-list');

    if (!user || !user.reflections || user.reflections.length === 0) {
        if (container) container.innerHTML = `
            <div class="muted">No reflections yet. Start by writing your first reflection above.</div>
        `;
        if (listContainer) listContainer.style.display = 'none';
        return;
    }

    if (listContainer) listContainer.style.display = 'block';

    let html = '';
    user.reflections.slice().reverse().forEach((reflection, index) => {
        const reflectionDate = new Date(reflection.date);
        const dateString = reflectionDate.toLocaleDateString();
        const timeString = reflectionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        html += `
            <div class="reflection-item" 
                 style="border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; margin-bottom: 1rem; background: #111;">
                <div class="flex justify-between items-start mb-2">
                    <strong style="color: var(--text);">Reflection #${index + 1}</strong>
                    <span class="muted" style="font-size: 0.75rem;">${dateString} ${timeString}</span>
                </div>
                <p style="color: var(--text); margin: 0; line-height: 1.5;">${reflection.text}</p>
                <div class="flex justify-end mt-2">
                    <button class="btn-secondary btn-small delete-reflection-btn" 
                            data-reflection-id="${reflection.id}"
                            style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">
                        Delete
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    
    // Re-attach event listeners after loading reflections
    attachDeleteReflectionListeners();
}

// Separate function to attach delete listeners
function attachDeleteReflectionListeners() {
    // Remove any existing listeners to prevent duplicates
    document.removeEventListener('click', handleDeleteReflectionClick);
    
    // Add new listener
    document.addEventListener('click', handleDeleteReflectionClick);
}

// Separate handler function for better management
function handleDeleteReflectionClick(e) {
    if (e.target && e.target.classList.contains('delete-reflection-btn')) {
        const reflectionId = e.target.getAttribute('data-reflection-id');
        console.log('Delete button clicked, reflection ID:', reflectionId); // Debug log
        if (reflectionId) {
            deleteReflection(reflectionId);
        }
    }
}

// Improved deleteReflection function with better error handling
function deleteReflection(reflectionId) {
    console.log('deleteReflection called with ID:', reflectionId); // Debug log
    
    if (!reflectionId) {
        showAlert('Invalid reflection ID', 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete this reflection?')) return;

    const user = getCurrentUser();
    console.log('Current user:', user); // Debug log

    if (user && Array.isArray(user.reflections)) {
        console.log('Reflections before deletion:', user.reflections); // Debug log
        
        // Filter out the deleted reflection
        const initialLength = user.reflections.length;
        user.reflections = user.reflections.filter(ref => {
            console.log('Checking reflection:', ref.id, 'against:', reflectionId); // Debug log
            return ref.id !== reflectionId;
        });
        
        console.log('Reflections after deletion:', user.reflections); // Debug log
        
        // Check if anything was actually removed
        if (user.reflections.length === initialLength) {
            showAlert('Reflection not found. It may have already been deleted.', 'error');
            return;
        }

        // Use your existing saveUserData function
        if (saveUserData(user)) {
            showAlert('Reflection deleted successfully.', 'success');
            loadReflections(); // Refresh the list
        } else {
            showAlert('Failed to save changes. Please try again.', 'error');
        }
    } else {
        showAlert('Unable to delete reflection. User data not found.', 'error');
    }
}

// Update initSettings to use the new approach
function initSettings() {
    const btnSettings = document.getElementById('btn-settings');
    const btnNotifications = document.getElementById('btn-notifications');
    const setGoalBtn = document.getElementById('btn-set-goal');
    const saveReflectionBtn = document.getElementById('btn-save-reflection');

    if (btnSettings) {
        btnSettings.addEventListener('click', showSettingsModal);
    }

    if (btnNotifications) {
        btnNotifications.addEventListener('click', showNotificationsModal);
    }

    if (setGoalBtn) {
        setGoalBtn.addEventListener('click', showSettingsModal);
    }

    if (saveReflectionBtn) {
        saveReflectionBtn.addEventListener('click', saveReflectionNotes);
    }

    // Initialize delete reflection listeners
    attachDeleteReflectionListeners();
}
function deleteAllReflections() {
    const user = getCurrentUser();
    
    if (!user || !user.reflections || user.reflections.length === 0) {
        showAlert('No reflections to delete.', 'info');
        return;
    }

    if (!confirm(`Are you sure you want to delete ALL ${user.reflections.length} reflections? This action cannot be undone.`)) {
        return;
    }

    // Clear all reflections
    user.reflections = [];

    if (saveUserData(user)) {
        showAlert('All reflections have been deleted successfully.', 'success');
        loadReflections(); // Refresh the display
    } else {
        showAlert('Failed to delete reflections. Please try again.', 'error');
    }
}

// Add this function to create a "Delete All" button in your UI
function addDeleteAllReflectionsButton() {
    const reflectionsContainer = document.getElementById('reflections-container');
    if (!reflectionsContainer) return;

    // Check if delete all button already exists
    if (document.getElementById('delete-all-reflections-btn')) {
        return;
    }

    const deleteAllBtn = document.createElement('button');
    deleteAllBtn.id = 'delete-all-reflections-btn';
    deleteAllBtn.className = 'btn-secondary btn-small';
    deleteAllBtn.textContent = 'Delete All Reflections';
    deleteAllBtn.style.marginBottom = '1rem';
    deleteAllBtn.style.backgroundColor = 'var(--danger)';
    deleteAllBtn.style.borderColor = 'var(--danger)';
    
    deleteAllBtn.addEventListener('click', deleteAllReflections);
    
    // Insert the button at the top of reflections container
    reflectionsContainer.parentNode.insertBefore(deleteAllBtn, reflectionsContainer);
}

// Update the loadReflections function to include the delete all button
function loadReflections() {
    const user = getCurrentUser();
    const container = document.getElementById('reflections-container');
    const listContainer = document.getElementById('reflections-list');

    if (!user || !user.reflections || user.reflections.length === 0) {
        if (container) container.innerHTML = `
            <div class="muted">No reflections yet. Start by writing your first reflection above.</div>
        `;
        if (listContainer) listContainer.style.display = 'none';
        
        // Remove delete all button if no reflections
        const deleteAllBtn = document.getElementById('delete-all-reflections-btn');
        if (deleteAllBtn) {
            deleteAllBtn.remove();
        }
        return;
    }

    if (listContainer) listContainer.style.display = 'block';

    // Add delete all button when there are reflections
    addDeleteAllReflectionsButton();

    let html = '';
    user.reflections.slice().reverse().forEach((reflection, index) => {
        const reflectionDate = new Date(reflection.date);
        const dateString = reflectionDate.toLocaleDateString();
        const timeString = reflectionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        html += `
            <div class="reflection-item" 
                 style="border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; margin-bottom: 1rem; background: #111;">
                <div class="flex justify-between items-start mb-2">
                    <strong style="color: var(--text);">Reflection #${index + 1}</strong>
                    <span class="muted" style="font-size: 0.75rem;">${dateString} ${timeString}</span>
                </div>
                <p style="color: var(--text); margin: 0; line-height: 1.5;">${reflection.text}</p>
                <div class="flex justify-end mt-2">
                    <button class="btn-secondary btn-small delete-reflection-btn" 
                            data-reflection-id="${reflection.id}"
                            style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">
                        Delete
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    
    // Re-attach event listeners after loading reflections
    attachDeleteReflectionListeners();
}

// Also, you can call this function directly from browser console to clear all reflections:
function clearAllReflectionsNow() {
    const user = getCurrentUser();
    if (user) {
        user.reflections = [];
        saveUserData(user);
        loadReflections();
        console.log('All reflections cleared!');
    }
}


function showSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    const user = getCurrentUser();
    if (user && user.settings) {
        document.getElementById('savings-goal-amount').value = user.settings.savingsGoal || '';
        document.getElementById('daily-spending-limit').value = user.settings.dailySpendingLimit || '';
        document.getElementById('weekly-spending-limit').value = user.settings.weeklySpendingLimit || '';
        document.getElementById('daily-reminder').checked = user.settings.dailyReminder || false;
        document.getElementById('weekly-report').checked = user.settings.weeklyReport || false;
    }

    modal.classList.add('active');

    // Set up event listeners for settings modal
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('cancel-settings').addEventListener('click', function () {
        modal.classList.remove('active');
    });
    document.getElementById('close-settings-modal').addEventListener('click', function () {
        modal.classList.remove('active');
    });
}

function saveSettings() {
    const savingsGoal = parseFloat(document.getElementById('savings-goal-amount').value) || 0;
    const dailySpendingLimit = parseFloat(document.getElementById('daily-spending-limit').value) || 0;
    const weeklySpendingLimit = parseFloat(document.getElementById('weekly-spending-limit').value) || 0;
    const dailyReminder = document.getElementById('daily-reminder').checked;
    const weeklyReport = document.getElementById('weekly-report').checked;

    const user = getCurrentUser();
    if (user) {
        if (!user.settings) user.settings = {};

        user.settings.savingsGoal = savingsGoal;
        user.settings.dailySpendingLimit = dailySpendingLimit;
        user.settings.weeklySpendingLimit = weeklySpendingLimit;
        user.settings.dailyReminder = dailyReminder;
        user.settings.weeklyReport = weeklyReport;

        saveUserData(user);
        updateSavingsGoalProgress();
        checkSpendingLimits();
        updateNotifications();

        // Show confirmation
        showAlert('Settings saved successfully!', 'success');

        // Close modal
        document.getElementById('settings-modal').classList.remove('active');
    }
}

function showNotificationsModal() {
    const modal = document.getElementById('notifications-modal');
    if (!modal) return;

    // Generate notifications based on current data
    const notifications = generateNotifications();
    const notificationsList = document.getElementById('notifications-list');

    if (notifications.length === 0) {
        notificationsList.innerHTML = '<p class="muted text-center">No new notifications</p>';
    } else {
        let html = '';
        notifications.forEach(notification => {
            html += `
                <div class="notification-item ${notification.type === 'warning' ? 'spending-limit-warning' : 'pattern-alert'}">
                    <div class="flex justify-between">
                        <strong>${notification.title}</strong>
                        <span class="muted" style="font-size:0.75rem">${notification.time}</span>
                    </div>
                    <p style="margin:0.5rem 0 0 0">${notification.message}</p>
                </div>
            `;
        });
        notificationsList.innerHTML = html;
    }

    modal.classList.add('active');

    // Clear notification badge
    document.getElementById('notification-count').style.display = 'none';

    // Set up event listeners for notifications modal
    document.getElementById('close-notifications-modal').addEventListener('click', function () {
        modal.classList.remove('active');
    });
}

function saveReflectionNotes() {
    const reflectionText = document.getElementById('reflection-notes').value;
    const user = getCurrentUser();

    if (user && reflectionText.trim()) {
        if (!user.reflections) user.reflections = [];

        user.reflections.push({
            id: uid('ref_'),
            date: new Date().toISOString(),
            text: reflectionText
        });

        saveUserData(user);
        document.getElementById('reflection-notes').value = '';
        showAlert('Reflection saved!', 'success');
        loadReflections(); // Refresh the list to show the new reflection
    }
}

// ----------------- Authentication -----------------
function initAuth() {
    const loginEmail = document.getElementById('login-email');
    const loginPin = document.getElementById('login-pin');
    const btnLogin = document.getElementById('btn-login');
    const btnShowRegister = document.getElementById('btn-show-register');
    const btnShowLogin = document.getElementById('btn-show-login');
    const btnRegister = document.getElementById('btn-register');
    const regPin = document.getElementById('reg-pin');
    const passwordStrength = document.getElementById('password-strength');

    // Toggle between login and register forms
    btnShowRegister.addEventListener('click', () => {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
    });

    btnShowLogin.addEventListener('click', () => {
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
    });

    // Password strength indicator
    regPin.addEventListener('input', function () {
        const pin = this.value;
        if (!pin) {
            passwordStrength.style.display = 'none';
            return;
        }

        passwordStrength.style.display = 'block';
        if (pin.length < 4) {
            passwordStrength.textContent = 'PIN too short (min 4 digits)';
            passwordStrength.style.color = 'var(--danger)';
        } else if (pin.length > 12) {
            passwordStrength.textContent = 'PIN too long (max 12 digits)';
            passwordStrength.style.color = 'var(--danger)';
        } else if (!/^\d+$/.test(pin)) {
            passwordStrength.textContent = 'PIN should contain only digits';
            passwordStrength.style.color = 'var(--danger)';
        } else {
            passwordStrength.textContent = 'PIN is valid';
            passwordStrength.style.color = 'var(--success)';
        }
    });

    // Register new user
    btnRegister.addEventListener('click', () => {
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim().toLowerCase();
        const pin = regPin.value;

        if (!name || !email || !pin) {
            showAlert('Please fill all fields', 'error');
            return;
        }

        if (!isValidEmail(email)) {
            showAlert('Please enter a valid email address', 'error');
            return;
        }

        if (!isValidPin(pin)) {
            showAlert('PIN must be 4-12 digits', 'error');
            return;
        }

        const users = getUsers();
        if (users.some(u => u.email === email)) {
            showAlert('Email already registered', 'error');
            return;
        }

        // Initialize user with default settings
        const newUser = {
            email,
            name,
            pin,
            settings: {},
            reflections: []
        };

        users.push(newUser);
        if (saveUsers(users)) {
            // Initialize empty transaction storage for new user
            const userTxKey = `${TX_KEY_PREFIX}${email}`;
            save(userTxKey, []);

            showAlert('Account created successfully. You may now login.', 'success');
            document.getElementById('register-form').style.display = 'none';
            document.getElementById('login-form').style.display = 'block';
            document.getElementById('login-email').value = email;
        }
    });

    // On page load, populate email if remembered
    window.addEventListener('DOMContentLoaded', () => {
        const rememberedEmail = localStorage.getItem('rememberedEmail');
        if (rememberedEmail) {
            loginEmail.value = rememberedEmail;
            document.getElementById('remember-me').checked = true;
        }
    });

    // Login user
    btnLogin.addEventListener('click', () => {
        const email = loginEmail.value.trim().toLowerCase();
        const pin = loginPin.value;
        const remember = document.getElementById('remember-me').checked;

        if (!email || !pin) {
            showAlert('Please enter both email and PIN', 'error');
            return;
        }

        const users = getUsers();
        const u = users.find(x => x.email === email && x.pin === pin);
        if (!u) {
            showAlert('Invalid email or PIN', 'error');
            return;
        }

        // Remember me
        if (remember) {
            localStorage.setItem('rememberedEmail', email);
        } else {
            localStorage.removeItem('rememberedEmail');
        }

        const session = { email: u.email, name: u.name, loginAt: nowTimestamp() };
        if (setSession(session)) {
            showAlert(`Welcome back, ${u.name}!`, 'success');

            setTimeout(() => {
                showAlert('If something went wrong, please refresh the page.', 'info');
            }, 5000); // wait 5 seconds so they appear stacked nicely

            renderApp();
        }
    });

    //forgot pin
    document.getElementById('btn-forgot-pin').addEventListener('click', () => {
        const email = prompt("Please enter your registered email to reset your PIN / Password:");
        if (!email) {
            showAlert('Email is required to reset PIN / Password', 'error');
            return;
        }
        const users = getUsers();
        const userIndex = users.findIndex(u => u.email === email.trim().toLowerCase());
        if (userIndex === -1) {
            showAlert('Email not found', 'error');
            return;
        }
        const newPin = prompt("Enter your new PIN / Password (4-12 digits):");
        if (!isValidPin(newPin)) {
            showAlert('PIN must be 4-12 digits', 'error');
            return;
        }
        users[userIndex].pin = newPin;
        if (saveUsers(users)) {
            showAlert('PIN has been reset successfully. You may now login with your new PIN / Password.', 'success');
        }
    });

    // Logout with confirmation
    document.getElementById('btn-logout').addEventListener('click', () => {
        const confirmLogout = confirm("Are you sure you want to logout?");
        if (confirmLogout) {
            clearSession();       // clear user session/localStorage data
            renderApp();          // re-render login screen
            showAlert('You have been logged out', 'info'); // optional alert
        } else {
            // user canceled logout, do nothing
            showAlert('Logout canceled', 'info'); // optional
        }
    });

}

function initProfileEditor() {
    const btnEditProfile = document.getElementById('btn-edit-profile');
    const modal = document.getElementById('profile-modal');
    const closeModal = document.getElementById('close-profile-modal');
    const cancelBtn = document.getElementById('cancel-profile');
    const saveBtn = document.getElementById('save-profile');

    btnEditProfile.addEventListener('click', () => {
        const session = getSession();
        document.getElementById('edit-name').value = session.name;
        document.getElementById('edit-pin').value = "";
        modal.classList.add('active');
    });

    function closeProfileModal() {
        modal.classList.remove('active');
    }

    closeModal.addEventListener('click', closeProfileModal);
    cancelBtn.addEventListener('click', closeProfileModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeProfileModal(); });

    saveBtn.addEventListener('click', () => {
        const newName = document.getElementById('edit-name').value.trim();
        const newPin = document.getElementById('edit-pin').value;

        let users = getUsers();
        let session = getSession();

        // Update user record
        const userIndex = users.findIndex(u => u.email === session.email);
        if (userIndex !== -1) {
            users[userIndex].name = newName;
            if (newPin !== "") {
                if (!isValidPin(newPin)) {
                    showAlert('PIN must be 4–12 digits', 'error');
                    return;
                }
                users[userIndex].pin = newPin;
            }
            saveUsers(users);

            // Update session so UI updates immediately
            session.name = newName;
            setSession(session);

            renderApp();
            showAlert('Profile updated successfully!', 'success');
        }

        closeProfileModal();
    });
}

// ----------------- Transaction Management -----------------
function initTransactions() {
    const btnAddTrans = document.getElementById('btn-add-trans');
    const modal = document.getElementById('modal');
    const btnCancelTrans = document.getElementById('btn-cancel-trans');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnSaveTrans = document.getElementById('btn-save-trans');
    const transType = document.getElementById('trans-type');
    const transAmount = document.getElementById('trans-amount');
    const transNote = document.getElementById('trans-note');
    const modalTitle = document.getElementById('modal-title');
    const editMeta = document.getElementById('edit-meta');

    let editingId = null;

    // Open modal for adding/editing transactions
    btnAddTrans.addEventListener('click', () => openModal());
    btnCancelTrans.addEventListener('click', closeModal);
    btnCloseModal.addEventListener('click', closeModal);

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Save transaction
    btnSaveTrans.addEventListener('click', saveTransaction);

    function openModal(tx = null) {
        editingId = null;
        modal.classList.add('active');

        if (tx) {
            modalTitle.textContent = 'Edit transaction';
            transType.value = tx.type;
            transAmount.value = tx.amount;
            transNote.value = tx.note;
            editingId = tx.id;
            editMeta.style.display = 'block';
            editMeta.textContent = `Created by ${tx.createdBy} on ${tx.createdAt.date} ${tx.createdAt.time}` +
                (tx.editedBy ? ` — Last edited by ${tx.editedBy} on ${tx.editedAt.date} ${tx.editedAt.time}` : '');
        } else {
            modalTitle.textContent = 'Add transaction';
            transType.value = 'inflow';
            transAmount.value = '';
            transNote.value = '';
            editMeta.style.display = 'none';
        }
    }

    function closeModal() {
        modal.classList.remove('active');
        editingId = null;
    }

    function saveTransaction() {
        const session = getSession();
        if (!session) {
            showAlert('Not logged in', 'error');
            return;
        }

        const type = transType.value;
        const amount = parseFloat(transAmount.value);
        const note = transNote.value.trim();

        if (isNaN(amount) || amount <= 0) {
            showAlert('Please enter a valid amount', 'error');
            return;
        }

        if (!note) {
            showAlert('Please enter a note/description', 'error');
            return;
        }

        const txs = getTx();

        if (editingId) {
            // Update existing transaction
            const idx = txs.findIndex(x => x.id === editingId);
            if (idx === -1) {
                showAlert('Transaction not found', 'error');
                closeModal();
                return;
            }

            txs[idx].type = type;
            txs[idx].amount = amount;
            txs[idx].note = note;
            txs[idx].editedBy = session.email;
            txs[idx].editedAt = nowTimestamp();

            if (saveTx(txs)) {
                showAlert('Transaction updated successfully', 'success');
            }
        } else {
            // Create new transaction
            const ts = nowTimestamp();
            const tx = {
                id: uid('tx_'),
                type,
                amount,
                note,
                date: ts.date,
                time: ts.time,
                createdBy: session.email,
                createdAt: ts
            };

            txs.push(tx);
            if (saveTx(txs)) {
                showAlert('Transaction saved successfully', 'success');
            }
        }

        closeModal();
        loadAndRender();
    }

    // Expose edit and delete functions globally for inline buttons
    window.editTx = function (id) {
        const txs = getTx();
        const tx = txs.find(x => x.id === id);
        if (!tx) return;
        openModal(tx);
    };

    window.deleteTx = function (id) {
        if (!confirm('Are you sure you want to delete this transaction?')) return;

        const txs = getTx().filter(x => x.id !== id);
        if (saveTx(txs)) {
            showAlert('Transaction deleted', 'success');
            loadAndRender();
        }
    };
}

// ----------------- Filtering and Controls -----------------
function initFilters() {
    const filterStart = document.getElementById('filter-start');
    const filterEnd = document.getElementById('filter-end');
    const btnApplyFilter = document.getElementById('btn-apply-filter');
    const btnClearFilter = document.getElementById('btn-clear-filter');
    const viewType = document.getElementById('view-type');
    const searchInput = document.getElementById('search');

    // Set default date range to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    filterStart.valueAsDate = firstDay;
    filterEnd.valueAsDate = lastDay;

    // Apply filters
    btnApplyFilter.addEventListener('click', loadAndRender);
    btnClearFilter.addEventListener('click', () => {
        filterStart.value = '';
        filterEnd.value = '';
        loadAndRender();
    });

    // Update on filter changes
    viewType.addEventListener('change', loadAndRender);
    searchInput.addEventListener('input', debounce(loadAndRender, 300));
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ----------------- Data Rendering -----------------
function loadAndRender() {
    const txs = getTx();
    const session = getSession();
    const start = document.getElementById('filter-start').value ? new Date(document.getElementById('filter-start').value) : null;
    const end = document.getElementById('filter-end').value ? new Date(document.getElementById('filter-end').value) : null;
    const viewType = document.getElementById('view-type').value;
    const searchQuery = (document.getElementById('search').value || '').toLowerCase();

    // Filter transactions
    let filtered = txs.filter(tx => {
        // Filter by date range
        if (start && new Date(tx.createdAt.iso) < start) return false;
        if (end) {
            const endDate = new Date(end);
            endDate.setDate(endDate.getDate() + 1);
            if (new Date(tx.createdAt.iso) >= endDate) return false;
        }

        // Filter by view type
        if (viewType !== 'all' && tx.type !== viewType) return false;

        // Filter by search query
        if (searchQuery &&
            !tx.note.toLowerCase().includes(searchQuery) &&
            !String(tx.amount).includes(searchQuery)) {
            return false;
        }

        return true;
    });

    // Update statistics
    updateStatistics(filtered);

    // Render transactions
    renderTransactions(filtered);

    // Render daily summary
    renderDailySummary(filtered);

    // Remove or comment out this line if you don't need savings history
    // renderHistory(txs);

    // Update enhanced features
    updateSavingsInsights();
    updateSpendingPatterns();
    checkSpendingLimits();
    updateNotifications();
    checkDailyReminder();
    loadReflections();
    updateSavingsGoalProgress();
    updateMonthlySavingsChart();
}

function updateStatistics(transactions) {
    // Get ALL transactions for the selected period (not filtered by view type)
    const allTransactions = getTx();
    const start = document.getElementById('filter-start').value ? new Date(document.getElementById('filter-start').value) : null;
    const end = document.getElementById('filter-end').value ? new Date(document.getElementById('filter-end').value) : null;

    // Filter by date range only (not by view type)
    let periodTransactions = allTransactions.filter(tx => {
        if (start && new Date(tx.createdAt.iso) < start) return false;
        if (end) {
            const endDate = new Date(end);
            endDate.setDate(endDate.getDate() + 1);
            if (new Date(tx.createdAt.iso) >= endDate) return false;
        }
        return true;
    });

    // Calculate statistics from ALL transactions in the period
    const stats = periodTransactions.reduce((acc, tx) => {
        if (tx.type === 'inflow') {
            acc.inflow += tx.amount;
        } else {
            acc.outflow += tx.amount;
        }
        acc.count++;
        return acc;
    }, { inflow: 0, outflow: 0, count: 0 });

    document.getElementById('stat-inflow').textContent = formatCurrency(stats.inflow);
    document.getElementById('stat-outflow').textContent = formatCurrency(stats.outflow);
    document.getElementById('stat-savings').textContent = formatCurrency(stats.inflow - stats.outflow);
    document.getElementById('stat-count').textContent = stats.count;
}

function renderTransactions(transactions) {
    const container = document.getElementById('transactions');

    if (transactions.length === 0) {
        container.innerHTML = '<div class="text-center muted mt-3">No transactions found</div>';
        return;
    }

    // Get ALL transactions for savings calculation
    const allTransactions = getTx();

    // Group ALL transactions by date for savings calculation
    const allByDate = {};
    allTransactions.forEach(tx => {
        if (!allByDate[tx.date]) allByDate[tx.date] = { inflow: 0, outflow: 0 };
        if (tx.type === 'inflow') allByDate[tx.date].inflow += tx.amount;
        else allByDate[tx.date].outflow += tx.amount;
    });

    // Sort dates in ASCENDING order for savings calculation
    const datesAsc = Object.keys(allByDate).sort((a, b) => {
        const dateA = parseDate(a);
        const dateB = parseDate(b);
        return dateA - dateB;
    });

    // Calculate cumulative savings in ascending order
    let runningBalance = 0;
    const savingsByDate = {};

    datesAsc.forEach(date => {
        const data = allByDate[date];
        const dailySavings = data.inflow - data.outflow;
        runningBalance += dailySavings;
        savingsByDate[date] = runningBalance;
    });

    // Group filtered transactions by date for display
    const byDate = {};
    transactions.forEach(tx => {
        if (!byDate[tx.date]) byDate[tx.date] = [];
        byDate[tx.date].push(tx);
    });

    // Sort dates in descending order for display
    const datesDesc = Object.keys(byDate).sort((a, b) => {
        const dateA = parseDate(a);
        const dateB = parseDate(b);
        return dateB - dateA;
    });

    // Render transactions by date
    container.innerHTML = '';
    datesDesc.forEach(date => {
        // Sort newest first (LIFO)
        const dateTransactions = byDate[date].sort((a, b) => b.time.localeCompare(a.time));

        // Calculate totals for ALL transactions of this date for the current user
        const allDateTransactions = allTransactions.filter(tx => tx.date === date);
        const dateTotal = allDateTransactions.reduce((acc, tx) => {
            if (tx.type === 'inflow') acc.inflow += tx.amount;
            else acc.outflow += tx.amount;
            return acc;
        }, { inflow: 0, outflow: 0 });

        // Use cumulative savings from savingsByDate
        const savings = savingsByDate[date] || 0;

        const dateHeader = document.createElement('div');
        dateHeader.className = 'card';
        dateHeader.innerHTML = `
            <div class="flex justify-between items-center">
                <div>
                    <strong>${date}</strong>
                    <div class="muted small">Total inflow: ${formatCurrency(dateTotal.inflow)} — outflow: ${formatCurrency(dateTotal.outflow)}</div>
                </div>
                <div class="text-right">
                    <div class="badge2" style="padding:6px 10px; background: #000000; color: #ffffff; border: 1px solid #333333">
                        Savings ${formatCurrency(savings)}
                    </div>
                </div>
            </div>
        `;

        const list = document.createElement('div');
        list.className = 'trans-list';

        // Only show transactions that match the current view filter
        dateTransactions.forEach(tx => {
            const item = document.createElement('div');
            item.className = 'trans-item';
            item.innerHTML = `
                <div class="trans-info">
                    <div class="flex items-center gap-2">
                        <div class="badge">
                            ${tx.type === 'inflow' ? 'IN' : 'OUT'}
                        </div>
                        <div>
                            <div class="trans-amount">${formatCurrency(tx.amount)}</div>
                            <div class="muted">${tx.note || ''}</div>
                        </div>
                    </div>
                    <div class="trans-meta">
                        ${tx.date} ${tx.time} — by ${tx.createdBy}
                        ${tx.editedBy ? ` — edited by ${tx.editedBy} ${tx.editedAt.date} ${tx.editedAt.time}` : ''}
                    </div>
                </div>
                <div class="trans-actions no-print">
                    <button class="btn-secondary btn-small" onclick="editTx('${tx.id}')">Edit</button>
                    <button class="btn-secondary btn-small" onclick="deleteTx('${tx.id}')">Delete</button>
                </div>
            `;
            list.appendChild(item);
        });

        dateHeader.appendChild(list);
        container.appendChild(dateHeader);
    });
}

function renderDailySummary(transactions) {
    const container = document.getElementById('daily-summary');

    // Get ALL transactions for the selected period (not filtered by view type)
    const allTransactions = getTx();
    const start = document.getElementById('filter-start').value ? new Date(document.getElementById('filter-start').value) : null;
    const end = document.getElementById('filter-end').value ? new Date(document.getElementById('filter-end').value) : null;

    // Filter by date range only (not by view type)
    let periodTransactions = allTransactions.filter(tx => {
        if (start && new Date(tx.createdAt.iso) < start) return false;
        if (end) {
            const endDate = new Date(end);
            endDate.setDate(endDate.getDate() + 1);
            if (new Date(tx.createdAt.iso) >= endDate) return false;
        }
        return true;
    });

    if (periodTransactions.length === 0) {
        container.innerHTML = '<div class="muted">No transactions for selected period.</div>';
        return;
    }

    // Group by date and calculate totals from ALL transactions in the period
    const byDate = {};
    periodTransactions.forEach(tx => {
        if (!byDate[tx.date]) byDate[tx.date] = { inflow: 0, outflow: 0 };
        if (tx.type === 'inflow') byDate[tx.date].inflow += tx.amount;
        else byDate[tx.date].outflow += tx.amount;
    });

    // Sort dates in ASCENDING order for savings calculation
    const datesAsc = Object.keys(byDate).sort((a, b) => {
        const dateA = parseDate(a);
        const dateB = parseDate(b);
        return dateA - dateB;
    });

    // Calculate cumulative savings in ascending order
    let runningBalance = 0;
    const savingsByDate = {};

    datesAsc.forEach(date => {
        const data = byDate[date];
        const dailySavings = data.inflow - data.outflow;
        runningBalance += dailySavings;
        savingsByDate[date] = runningBalance;
    });

    // Sort dates in DESCENDING order for display
    const datesDesc = Object.keys(byDate).sort((a, b) => {
        const dateA = parseDate(a);
        const dateB = parseDate(b);
        return dateB - dateA;
    });

    // Create table
    let html = '<table><thead><tr><th>Date</th><th>Inflow</th><th>Outflow</th><th class="text-center">Savings</th></tr></thead><tbody>';

    datesDesc.forEach(date => {
        const data = byDate[date];
        const savings = savingsByDate[date];
        html += `
            <tr>
                <td>${date}</td>
                <td>${formatCurrency(data.inflow)}</td>
                <td>${formatCurrency(data.outflow)}</td>
                <td class="${savings >= 0 ? 'badge-success' : 'badge-danger'}" style="text-align:center">${formatCurrency(savings)}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderHistory(allTransactions) {
    const container = document.getElementById('history-list');

    // Check if container exists before trying to manipulate it
    if (!container) {
        console.warn('History container not found');
        return;
    }

    if (allTransactions.length === 0) {
        container.innerHTML = '<div class="muted">No history yet.</div>';
        return;
    }

    // Group by date and calculate totals
    const byDate = {};
    allTransactions.forEach(tx => {
        if (!byDate[tx.date]) byDate[tx.date] = { inflow: 0, outflow: 0 };
        if (tx.type === 'inflow') byDate[tx.date].inflow += tx.amount;
        else byDate[tx.date].outflow += tx.amount;
    });

    // Sort dates in ASCENDING order for savings calculation
    const datesAsc = Object.keys(byDate).sort((a, b) => {
        const dateA = parseDate(a);
        const dateB = parseDate(b);
        return dateA - dateB;
    });

    // Calculate cumulative savings in ascending order
    let runningBalance = 0;
    const savingsByDate = {};

    datesAsc.forEach(date => {
        const data = byDate[date];
        const dailySavings = data.inflow - data.outflow;
        runningBalance += dailySavings;
        savingsByDate[date] = runningBalance;
    });

    // Sort dates in DESCENDING order for display
    const datesDesc = Object.keys(byDate).sort((a, b) => {
        const dateA = parseDate(a);
        const dateB = parseDate(b);
        return dateB - dateA;
    });

    // Create table
    let html = '<table><thead><tr><th>Date</th><th>Savings</th><th>Notes</th></tr></thead><tbody>';

    datesDesc.forEach(date => {
        const data = byDate[date];
        const savings = savingsByDate[date];
        html += `
            <tr>
                <td>${date}</td>
                <td class="${savings >= 0 ? 'badge-success' : 'badge-danger'}" style="text-align:center">${formatCurrency(savings)}</td>
                <td class="muted">Inflow: ${formatCurrency(data.inflow)} | Outflow: ${formatCurrency(data.outflow)}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ----------------- Print and Export -----------------
function initPrintExport() {
    const btnPrint = document.getElementById('btn-print');

    btnPrint.addEventListener('click', showPrintOptions);
}

function showPrintOptions() {
    // Create a modal for print options
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h3>Print Report</h3>
                <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div>
                <label for="print-report-type">Select Report Type:</label>
                <select id="print-report-type" class="w-full mt-2">
                    <option value="daily-cash-inflows">A. Daily Cash Inflows Report</option>
                    <option value="daily-cash-outflows">B. Daily Cash Outflows Report</option>
                    <option value="daily-savings">C. Daily Savings Summary</option>
                </select>
                <div class="flex gap-2 mt-3">
                    <button id="btn-confirm-print" class="btn-primary">Print</button>
                    <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Set up the confirm print button
    document.getElementById('btn-confirm-print').addEventListener('click', () => {
        const reportType = document.getElementById('print-report-type').value;
        modal.remove();
        printReport(reportType);
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

function printReport(reportType = null) {
    // Use provided reportType or fall back to the dropdown selection
    const selectedReportType = reportType || document.getElementById('report-type').value;
    const txs = getTx();
    const start = document.getElementById('filter-start').value ? new Date(document.getElementById('filter-start').value) : null;
    const end = document.getElementById('filter-end').value ? new Date(document.getElementById('filter-end').value) : null;

    // Filter transactions by date range
    let filtered = txs.filter(tx => {
        if (start && new Date(tx.createdAt.iso) < start) return false;
        if (end) {
            const endDate = new Date(end);
            endDate.setDate(endDate.getDate() + 1);
            if (new Date(tx.createdAt.iso) >= endDate) return false;
        }
        return true;
    });

    // Prepare printable content
    let html = '<h2>Personal Cash Flaw Management System - Report</h2>';
    const session = getSession();
    const timestamp = nowTimestamp();

    if (session) {
        html += `<div><strong>User:</strong> ${session.email} (${session.name})</div>`;
    }
    html += `<div><strong>Generated:</strong> ${timestamp.date} ${timestamp.time}</div>`;

    if (start || end) {
        html += `<div><strong>Period:</strong> ${start ? start.toLocaleDateString() : 'Start'} to ${end ? end.toLocaleDateString() : 'End'}</div>`;
    }

    html += '<hr style="margin:1rem 0">';

    // helper to sort dates descending
    const sortDatesDesc = (a, b) => {
        const dateA = parseDate(a);
        const dateB = parseDate(b);
        return dateB - dateA;
    };

    if (selectedReportType === 'daily-cash-inflows') {
        html += '<h3>Daily Cash Inflows Report</h3>';
        // group by date
        const byDate = {};
        filtered.forEach(tx => {
            if (tx.type !== 'inflow') return;
            if (!byDate[tx.date]) byDate[tx.date] = [];
            byDate[tx.date].push(tx);
        });

        html += '<table><thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Timestamp</th><th>Edited By</th></tr></thead><tbody>';
        Object.keys(byDate).sort(sortDatesDesc).forEach(date => {
            const items = byDate[date].sort((a, b) => a.time.localeCompare(b.time));
            items.forEach(tx => {
                const edited = tx.editedBy ? `${tx.editedBy} (${tx.editedAt.date} ${tx.editedAt.time})` : '-';
                html += `<tr>
                            <td>${date}</td>
                            <td>${tx.note || '-'}</td>
                            <td>${formatCurrency(tx.amount)}</td>
                            <td>${tx.createdAt.date} ${tx.createdAt.time}</td>
                            <td>${edited}</td>
                         </tr>`;
            });
        });
        html += '</tbody></table>';

    } else if (selectedReportType === 'daily-cash-outflows') {
        html += '<h3>Daily Cash Outflows Report</h3>';
        // group by date
        const byDate = {};
        filtered.forEach(tx => {
            if (tx.type !== 'outflow') return;
            if (!byDate[tx.date]) byDate[tx.date] = [];
            byDate[tx.date].push(tx);
        });

        html += '<table><thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Timestamp</th><th>Edited By</th></tr></thead><tbody>';
        Object.keys(byDate).sort(sortDatesDesc).forEach(date => {
            const items = byDate[date].sort((a, b) => a.time.localeCompare(b.time));
            items.forEach(tx => {
                const edited = tx.editedBy ? `${tx.editedBy} (${tx.editedAt.date} ${tx.editedAt.time})` : '-';
                html += `<tr>
                            <td>${date}</td>
                            <td>${tx.note || '-'}</td>
                            <td>${formatCurrency(tx.amount)}</td>
                            <td>${tx.createdAt.date} ${tx.createdAt.time}</td>
                            <td>${edited}</td>
                         </tr>`;
            });
        });
        html += '</tbody></table>';

    } else {
        // Daily Savings Summary - show per-date savings and include timestamp & edited-by summary
        html += '<h3>Daily Savings Summary</h3>';
        const byDate = {};
        filtered.forEach(tx => {
            if (!byDate[tx.date]) byDate[tx.date] = { inflow: 0, outflow: 0, latestIso: null, editors: new Set() };
            if (tx.type === 'inflow') byDate[tx.date].inflow += tx.amount;
            else byDate[tx.date].outflow += tx.amount;

            // track latest timestamp for the date
            if (!byDate[tx.date].latestIso || new Date(tx.createdAt.iso) > new Date(byDate[tx.date].latestIso)) {
                byDate[tx.date].latestIso = tx.createdAt.iso;
            }

            if (tx.editedBy) byDate[tx.date].editors.add(`${tx.editedBy} (${tx.editedAt.date} ${tx.editedAt.time})`);
        });

        html += '<table><thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Timestamp</th><th>Edited By</th></tr></thead><tbody>';
        Object.keys(byDate).sort(sortDatesDesc).forEach(date => {
            const data = byDate[date];
            const savings = data.inflow - data.outflow;
            const ts = data.latestIso ? new Date(data.latestIso) : null;
            const tsDisplay = ts ? `${String(ts.getMonth() + 1).padStart(2, '0')}/${String(ts.getDate()).padStart(2, '0')}/${String(ts.getFullYear()).slice(-2)} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}` : '-';
            const editorsArr = Array.from(data.editors);
            const editorsDisplay = editorsArr.length ? editorsArr.join('; ') : '-';

            html += `<tr>
                        <td>${date}</td>
                        <td>Daily Savings</td>
                        <td>${formatCurrency(savings)}</td>
                        <td>${tsDisplay}</td>
                        <td>${editorsDisplay}</td>
                     </tr>`;
        });
        html += '</tbody></table>';
    }

    // Open print windowA
    const w = window.open('', '_blank');
    w.document.write(`
        <html>
            <head>
                <title>Personal Cash Flaw Management System - Report</title>
                <meta charset="utf-8"/>
                <meta name="viewport" content="width=device-width,initial-scale=1"/>
                <style>
                    body { font-family: Arial, Helvetica, sans-serif; padding: 1rem; color: #333; }
                    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
                    th, td { padding: 0.75rem; border: 1px solid #ddd; text-align: left; vertical-align: top; }
                    th { background-color: #f5f5f5; font-weight: bold; }
                    hr { margin: 1rem 0; border: 0; border-top: 1px solid #eee; }
                    h2, h3 { margin-bottom: 0.5rem; }
                </style>
            </head>
            <body>
                ${html}
            </body>
        </html>
    `);
    w.document.close();
    w.print();
}

// ----------------- Monthly Savings Chart -----------------
let monthlySavingsChart;

function initMonthlySavingsChart() {
    const ctx = document.getElementById('weeklySavingsChart');
    if (!ctx) return;

    const { labels, data } = getMonthlySavings();

    monthlySavingsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: "Monthly Savings (₱)",
                data: data,
                borderWidth: 2,
                backgroundColor: "rgba(76, 175, 80, 0.7)",
                borderColor: "#4CAF50",
                borderRadius: 4,
                borderSkipped: false,
            },
            {
                // GOAL LINE
                label: "Monthly Goal",
                data: Array(12).fill(100),
                type: 'line',
                borderWidth: 2,
                borderDash: [5, 5],
                tension: 0.3,
                borderColor: "#FF9800",
                pointRadius: 0,
                fill: false
            }]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: { enabled: true },
                legend: { position: "bottom" }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: "Amount (₱)" }
                },
            }
        }
    });
}

function updateMonthlySavingsChart() {
    if (!monthlySavingsChart) return;

    const { labels, data } = getMonthlySavings();
    monthlySavingsChart.data.labels = labels;
    monthlySavingsChart.data.datasets[0].data = data;
    monthlySavingsChart.update();
}

function getMonthlySavings() {
    const currentYear = new Date().getFullYear();
    const tx = getTx(); // all transactions

    // Initialize savings array for each month of the year
    const savingsData = Array(12).fill(0);
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    tx.forEach(t => {
        const date = parseDate(t.date);
        if (date && date.getFullYear() === currentYear) {
            const monthIndex = date.getMonth(); // 0-11
            savingsData[monthIndex] += (t.type === "inflow" ? t.amount : -t.amount);
        }
    });

    return { labels, data: savingsData };
}

function exportData() {
    const txs = getTx();
    const session = getSession();
    const data = {
        exportedAt: nowTimestamp(),
        user: session ? { email: session.email, name: session.name } : null,
        transactions: txs
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash_management_${nowTimestamp().date.replace(/\//g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showAlert('Data exported successfully', 'success');
}

// ----------------- App Initialization -----------------
function renderApp() {
    const session = getSession();
    const authSection = document.getElementById('auth');
    const dashboard = document.getElementById('dashboard');
    const logoutBtn = document.getElementById('btn-logout');
    const notificationsBtn = document.getElementById('btn-notifications');

    if (!session) {
        authSection.style.display = 'block';
        dashboard.style.display = 'none';
        logoutBtn.style.display = 'none';
        if (notificationsBtn) notificationsBtn.style.display = 'none';
        return;
    }

    authSection.style.display = 'none';
    dashboard.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
    if (notificationsBtn) notificationsBtn.style.display = 'inline-block';

    document.getElementById('u-email').textContent = session.email;
    document.getElementById('u-name').textContent = session.name || '';
    initProfileEditor();
    loadAndRender();
}

function initApp() {
    // Create demo user if no users exist
    const users = getUsers();
    if (users.length === 0) {
        users.push(DEMO_USER);
        saveUsers(users);
    }

    // Initialize all components
    initAuth();
    initTransactions();
    initFilters();
    initPrintExport();
    initMonthlySavingsChart();
    updateMonthlySavingsChart();
    initSettings(); // ADDED THIS LINE - Initialize settings and enhanced features
    // Render the app based on current session
    renderApp();
}

// Start the application when DOM is loaded

document.addEventListener('DOMContentLoaded', initApp);

