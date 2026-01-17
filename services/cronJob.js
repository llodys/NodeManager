const axios = require('axios');

const CONFIG = {
    baseUrl: 'http://localhost:3000', 
    auth: {
        username: 'admin',
        password: 'password'
    }
};

let token = '';

function parseLocalDate(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getLocalToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getNextExpireDate(sub) {
    const today = getLocalToday();
    const expireDate = parseLocalDate(sub.expireDate);

    if (!sub.repeat || sub.repeat === 'never' || expireDate >= today) {
        return expireDate;
    }

    let nextDate = new Date(expireDate);
    while (nextDate < today) {
        switch (sub.repeat) {
            case 'daily': nextDate.setDate(nextDate.getDate() + 1); break;
            case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
            case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
            case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
            default: return expireDate;
        }
    }
    return nextDate;
}

async function login() {
    try {
        const res = await axios.post(`${CONFIG.baseUrl}/api/auth/login`, CONFIG.auth);
        token = res.data.token;
        return true;
    } catch (e) {
        console.error(e.message);
        return false;
    }
}

async function sendNotify(id) {
    try {
        await axios.post(`${CONFIG.baseUrl}/api/subs/${id}/notify`, {}, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (e) {
        console.error(e.message);
    }
}

async function checkAndNotify() {
    if (!await login()) return;

    try {
        const res = await axios.get(`${CONFIG.baseUrl}/api/subs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const subs = res.data.data || res.data;
        const today = getLocalToday();

        for (const sub of subs) {
            const nextDate = getNextExpireDate(sub);
            const remainingDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
            const threshold = sub.notifyDays || 7;

            if (remainingDays >= 0 && remainingDays <= threshold) {
                await sendNotify(sub.id);
            }
        }
    } catch (e) {
        console.error(e.message);
    }
}

module.exports = checkAndNotify;