const API_URL = '/api/subs';
let currentSubs = [];
let editingId = null;
let currentFilter = 'All';
let renewUnit = 'year';
let calDate = new Date();
let selectedDateStr = null;

function logout() {
    if (!confirm('确定要退出登录吗？')) {
        return;
    }
    
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}

function checkToken() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

function toLocalDateStr(date) {
    if (!date) date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getLocalToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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
            case 'custom': return expireDate; 
            default: return expireDate;
        }
    }
    return nextDate;
}

function isRecurrenceDate(sub, targetDateStr) {
    if (!sub.repeat || sub.repeat === 'never') return false;

    const start = parseLocalDate(sub.startDate);
    const expire = parseLocalDate(sub.expireDate);
    const target = parseLocalDate(targetDateStr);

    if (target < start) return false;

    const eD = expire.getDate();
    const eM = expire.getMonth();
    const eDay = expire.getDay();

    const tD = target.getDate();
    const tM = target.getMonth();
    const tDay = target.getDay();

    switch (sub.repeat) {
        case 'daily': return true;
        case 'weekly': return tDay === eDay;
        case 'monthly': return tD === eD;
        case 'yearly': return tM === eM && tD === eD;
        default: return false;
    }
}

async function loadSubscriptions() {
    if (!checkToken()) return;
    const token = localStorage.getItem('token');

    try {
        const res = await fetch(API_URL, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) return logout();

        currentSubs = await res.json();
        if (currentSubs.data) currentSubs = currentSubs.data;

        renderAll();
    } catch (e) { console.error(e); }
}

function renderAll() {
    renderStats();
    renderFilterBar();
    renderSubs();
}

function renderStats() {
    const total = currentSubs.length;
    const today = getLocalToday();
    let expired = 0, expiring = 0;

    currentSubs.forEach(s => {
        const nextDate = getNextExpireDate(s);
        let remainingDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
        let threshold = s.notifyDays || 7;

        if ((!s.repeat || s.repeat === 'never') && nextDate < today) {
            expired++;
        } else if (remainingDays <= threshold) {
            expiring++;
        }
    });

    if(document.getElementById('statTotal')) {
        document.getElementById('statTotal').innerText = total;
        document.getElementById('statNormal').innerText = total - expired - expiring;
        document.getElementById('statExpiring30').innerText = expiring;
        document.getElementById('statExpired').innerText = expired;
    }
}

function renderFilterBar() {
    const container = document.getElementById('typeFilter');
    if (!container) return;
    container.innerHTML = '';

    const types = new Set(currentSubs.map(s => s.type ? s.type.trim() : '未分类'));
    const allTypes = ['All', ...Array.from(types).sort()];

    const fragment = document.createDocumentFragment();
    allTypes.forEach(type => {
        const btn = document.createElement('button');
        btn.className = `filter-btn ${currentFilter === type ? 'active' : ''}`;
        btn.innerText = type;
        btn.onclick = () => { currentFilter = type; renderFilterBar(); renderSubs(); };
        fragment.appendChild(btn);
    });
    container.appendChild(fragment);
}

function renderSubs() {
    const grid = document.getElementById('subGrid');
    if (!grid) return;
    
    const today = getLocalToday();
    const oneDay = 86400000;

    let filteredSubs = currentFilter === 'All' ? currentSubs : currentSubs.filter(s => (s.type ? s.type.trim() : '未分类') === currentFilter);

    filteredSubs.sort((a, b) => {
        return getNextExpireDate(a) - getNextExpireDate(b);
    });

    const htmlString = filteredSubs.map(sub => {
        const startDate = parseLocalDate(sub.startDate);
        const nextExpireDate = getNextExpireDate(sub);
        
        let remainingDays = Math.ceil((nextExpireDate - today) / oneDay);
        
        let percent = 0;
        let progressColor = 'var(--success)';
        let remainingText = '';
        let statusText = '正常';
        let statusBadgeClass = 'badge-green';

        const isRecurring = sub.repeat && sub.repeat !== 'never';

        if (today < startDate) {
            statusText = '未开始';
            statusBadgeClass = 'badge-blue';
            progressColor = 'var(--primary)';
            percent = 0;
            const diff = Math.ceil((startDate - today) / oneDay);
            remainingText = `${diff}<span style="font-size: 13px; font-weight: normal; margin-left: 4px; color: var(--gray);">天后开始</span>`;
        } else if (remainingDays < 0) {
            statusText = '已过期';
            statusBadgeClass = 'badge-red';
            progressColor = 'var(--danger)';
            percent = 100;
            remainingText = Math.abs(remainingDays) + '<span style="font-size: 13px; font-weight: normal; margin-left: 4px; color: var(--gray);">天前过期</span>';
        } else {
            remainingText = remainingDays + '<span style="font-size: 13px; font-weight: normal; margin-left: 4px; color: var(--gray);">天后到期</span>';
            
            const totalDuration = nextExpireDate - startDate;
            const elapsedTime = today - startDate;
            
            if (totalDuration > 0) {
                percent = (elapsedTime / totalDuration) * 100;
                percent = Math.max(0, Math.min(100, percent));
            } else {
                percent = 100;
            }

            let threshold = sub.notifyDays || 7;
            
            if (remainingDays <= threshold) {
                statusText = '即将到期';
                statusBadgeClass = 'badge-orange';
                progressColor = 'var(--warning)';
            } else if (isRecurring) {
                statusText = '周期中';
                statusBadgeClass = 'badge-purple';
                progressColor = 'var(--purple)';
            }
        }

        let fullUrl = sub.url || '';
        if (fullUrl && !fullUrl.startsWith('http')) fullUrl = 'https://' + fullUrl;
        
        const safeNameUrl = encodeURIComponent(sub.name).replace(/'/g, '%27');
        const textFallback = `https://ui-avatars.com/api/?name=${safeNameUrl}&background=random&color=fff&size=64`;
        let imgTag = '';

        if (sub.url && sub.url.trim() !== '') {
            let hostname = 'localhost';
            try { hostname = new URL(fullUrl).hostname; } catch(e) {}
            const icoUrl = `https://ico.faviconkit.net/favicon/${hostname}?sz=64`;
            const targetUrl = sub.iconUrl || icoUrl;
            imgTag = `<img src="${targetUrl}" class="service-icon" width="36" height="36" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${textFallback}'">`;
        } else {
             const targetUrl = sub.iconUrl || textFallback;
             imgTag = `<img src="${targetUrl}" class="service-icon" width="36" height="36" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.src='${textFallback}'">`;
        }

        const noteText = escapeHtml(sub.note || '');
        const safeName = escapeHtml(sub.name);
        const safeId = sub.id;

        return `
        <div class="sub-card" onclick="openEdit('${safeId}')">
            <div class="card-header">
                ${imgTag}
                <div class="service-info-col">
                    <div class="service-name">${safeName}</div>
                    <div class="service-note">${noteText}</div>
                </div>
                <div class="status-badge ${statusBadgeClass}">${statusText}</div>
            </div>
            <div class="metrics-area">
                <div class="metric-row">
                    <div class="metric-info"><span>${isRecurring ? '下个周期' : '周期进度'}</span><span class="metric-val" style="color: ${progressColor}; font-size: 24px; font-weight: 800;">${remainingText}</span></div>
                    <div class="progress-track"><div class="progress-fill" style="width: ${percent}%; background-color: ${progressColor}"></div></div>
                </div>
            </div>
            <div class="card-footer">
                <div class="info-pill pill-type"><span class="pill-label">类型</span><span class="pill-value">${sub.type || '通用'}</span></div>
                <div class="info-pill pill-notify"><span class="pill-label">提醒</span><span class="pill-value">${sub.notifyDays || 7}天</span></div>
                <div class="info-pill pill-start"><span class="pill-label">开始</span><span class="pill-value">${sub.startDate}</span></div>
                <div class="info-pill pill-expire"><span class="pill-label">到期</span><span class="pill-value">${toLocalDateStr(nextExpireDate)}</span></div>
            </div>
            <div class="card-actions">
                <button type="button" class="action-btn btn-icon-edit" onclick="event.stopPropagation(); openEdit('${safeId}')" title="编辑"><i class="fas fa-pen"></i></button>
                <button type="button" class="action-btn btn-icon-refresh" onclick="event.stopPropagation(); openRenew('${safeId}')" title="续期"><i class="fas fa-history"></i></button>
                <button type="button" class="action-btn btn-icon-notify" onclick="event.stopPropagation(); pushNotify('${safeId}')" title="推送"><i class="fas fa-paper-plane"></i></button>
                <button type="button" class="action-btn btn-icon-link" onclick="event.stopPropagation(); window.open('${fullUrl}', '_blank')" title="访问"><i class="fas fa-external-link-alt"></i></button>
                <button type="button" class="action-btn btn-icon-del" onclick="event.stopPropagation(); deleteSub('${safeId}')" title="删除"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>`;
    }).join('');

    grid.innerHTML = htmlString;
}

function openModal() {
    editingId = null;
    document.getElementById('addSubForm').reset();
    document.querySelector('#addModal h3').innerText = '新增订阅';
    const btnDel = document.getElementById('btnDeleteWrapper');
    if(btnDel) btnDel.style.display = 'none';
    
    document.getElementById('subNote').value = '';

    const today = toLocalDateStr(new Date());
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    document.getElementById('subStartDate').value = today;
    document.getElementById('subExpireDate').value = toLocalDateStr(nextYear);
    document.getElementById('subNotifyDays').value = 7;
    document.getElementById('subRepeat').value = 'never'; 
    document.getElementById('addModal').style.display = 'flex';
}

function openEdit(id) {
    const sub = currentSubs.find(s => s.id == id);
    if (!sub) return;
    editingId = id;
    document.querySelector('#addModal h3').innerText = '编辑订阅';
    document.getElementById('subName').value = sub.name;
    document.getElementById('subType').value = sub.type || '';
    document.getElementById('subNote').value = sub.note || '';
    document.getElementById('subUrl').value = sub.url || '';
    document.getElementById('subIconUrl').value = sub.iconUrl || '';
    document.getElementById('subStartDate').value = sub.startDate;
    document.getElementById('subExpireDate').value = sub.expireDate;
    document.getElementById('subNotifyDays').value = sub.notifyDays || 7;
    document.getElementById('subRepeat').value = sub.repeat || 'never'; 
    const btnDel = document.getElementById('btnDeleteWrapper');
    if(btnDel) btnDel.style.display = 'block';
    document.getElementById('addModal').style.display = 'flex';
}

function closeModal() { document.getElementById('addModal').style.display = 'none'; }

document.getElementById('addSubForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!checkToken()) return;
    const token = localStorage.getItem('token');

    const data = {
        name: document.getElementById('subName').value,
        type: document.getElementById('subType').value,
        note: document.getElementById('subNote').value,
        url: document.getElementById('subUrl').value,
        iconUrl: document.getElementById('subIconUrl').value || '',
        startDate: document.getElementById('subStartDate').value,
        expireDate: document.getElementById('subExpireDate').value,
        notifyDays: parseInt(document.getElementById('subNotifyDays').value, 10) || 7,
        repeat: document.getElementById('subRepeat').value
    };

    try {
        let method = 'POST';
        let url = API_URL;

        if (editingId) {
            method = 'PUT';
            url = `${API_URL}/${editingId}`;
        }

        const res = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            loadSubscriptions();
            closeModal();
        } else {
            const err = await res.json();
            alert('保存失败: ' + (err.message || '未知错误'));
        }
    } catch (e) { console.error(e); alert('请求失败'); }
});

async function deleteSub(id) {
    if (!id) id = editingId;
    if (!confirm('确定删除吗？')) return;
    if (!checkToken()) return;
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            loadSubscriptions();
            if (editingId) closeModal();
        } else {
            alert('删除失败');
        }
    } catch (e) { console.error(e); }
}

let renewId = null;

function openRenew(id) {
    renewId = id;
    const sub = currentSubs.find(s => s.id == id);
    if(sub) {
        document.getElementById('renewName').innerText = sub.name;
        document.getElementById('renewStartDatePicker').value = sub.startDate;
        setRenewUnit('year', document.querySelectorAll('.unit-btn')[0]);
        
        const nextDate = new Date(sub.expireDate);
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        
        document.getElementById('renewDatePicker').value = toLocalDateStr(nextDate);
        updateRenewLabel();
    }
    document.getElementById('renewModal').style.display = 'flex';
}

function closeRenewModal() { document.getElementById('renewModal').style.display = 'none'; }

function adjustRenewDate(amount) {
    const picker = document.getElementById('renewDatePicker');
    const d = parseLocalDate(picker.value);

    if (renewUnit === 'year') {
        d.setFullYear(d.getFullYear() + amount);
    } else if (renewUnit === 'month') {
        d.setMonth(d.getMonth() + amount);
    } else if (renewUnit === 'day') {
        d.setDate(d.getDate() + amount);
    }
    
    picker.value = toLocalDateStr(d);
    updateRenewLabel();
}

function updateRenewLabel() {
    const val = document.getElementById('renewDatePicker').value;
    if(val) {
        document.getElementById('renewUnitLabel').innerText = val.replace(/-/g, '/');
    } else {
        document.getElementById('renewUnitLabel').innerText = '--/--/--';
    }
}

function setRenewUnit(unit, btn) {
    renewUnit = unit;
    document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
}

async function submitRenew() {
    if (!renewId) return;
    if (!checkToken()) return;
    const token = localStorage.getItem('token');
    const newDate = document.getElementById('renewDatePicker').value;
    const newStartDate = document.getElementById('renewStartDatePicker').value;

    try {
        const res = await fetch(`${API_URL}/${renewId}/renew`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ newDate, newStartDate })
        });
        if (res.ok) { alert('续期成功'); closeRenewModal(); loadSubscriptions(); }
        else { alert('续期失败'); }
    } catch (e) { console.error(e); }
}

async function pushNotify(id) {
    if(!confirm('确定推送通知吗？')) return;
    if (!checkToken()) return;
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/${id}/notify`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) alert('✅ 通知已发送'); else alert('❌ 发送失败');
    } catch (e) { console.error(e); }
}

function openSearch() { document.getElementById('searchModal').style.display = 'flex'; document.getElementById('searchInput').focus(); renderSearchResults(); }
function closeSearch() { document.getElementById('searchModal').style.display = 'none'; document.getElementById('searchInput').value = ''; }

function renderSearchResults() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    const container = document.getElementById('searchResults');
    container.innerHTML = '';
    const filtered = currentSubs.filter(s => s.name.toLowerCase().includes(query) || (s.type && s.type.toLowerCase().includes(query)));

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-result"><i class="fas fa-search"></i><span>没有找到相关订阅</span></div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach(sub => {
        const div = document.createElement('div');
        div.className = 'search-result-item';

        const today = getLocalToday();
        const nextDate = getNextExpireDate(sub);
        
        let dotClass = 'dot-green';
        let subText = '状态正常';

        if (sub.startDate && parseLocalDate(sub.startDate) > today) {
            const startDate = parseLocalDate(sub.startDate);
            const diff = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24));
            dotClass = 'dot-blue';
            subText = `${diff} 天后开始`;
        } else {
             const diff = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
             if (diff < 0) {
                 dotClass = 'dot-red';
                 subText = `已过期 ${Math.abs(diff)} 天`;
             } else if (diff <= (sub.notifyDays || 7)) {
                 dotClass = 'dot-orange';
                 subText = `即将到期 (${diff}天)`;
             } else {
                 subText = `${diff} 天后到期`;
             }
        }

        let fullUrl = sub.url || '';
        if (fullUrl && !fullUrl.startsWith('http')) fullUrl = 'https://' + fullUrl;
        
        const safeNameUrl = encodeURIComponent(sub.name).replace(/'/g, '%27');
        const textFallback = `https://ui-avatars.com/api/?name=${safeNameUrl}&background=random&color=fff&size=64`;
        let imgTag = '';

        if (sub.url && sub.url.trim() !== '') {
            let hostname = 'localhost';
            try { hostname = new URL(fullUrl).hostname; } catch(e) {}
            const icoUrl = `https://ico.faviconkit.net/favicon/${hostname}?sz=64`;
            const targetUrl = sub.iconUrl || icoUrl;
            imgTag = `<img src="${targetUrl}" class="search-result-img" width="20" height="20" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${textFallback}'">`;
        } else {
             const targetUrl = sub.iconUrl || textFallback;
             imgTag = `<img src="${targetUrl}" class="search-result-img" width="20" height="20" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.src='${textFallback}'">`;
        }

        div.innerHTML = `
            <div class="result-dot ${dotClass}"></div>
            ${imgTag}
            <div class="result-info">
                <div class="result-name">${escapeHtml(sub.name)}</div>
                <div class="result-sub">${subText}</div>
            </div>
            <div class="search-tag">${escapeHtml(sub.type || '通用')}</div>
        `;
        div.onclick = () => { openEdit(sub.id); closeSearch(); };
        fragment.appendChild(div);
    });
    container.appendChild(fragment);
}

document.getElementById('searchInput').addEventListener('input', renderSearchResults);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });

function autoGetIcon(url) { 
    if (!url) return ''; 
    try { 
        let u = url; 
        if (!u.startsWith('http')) u = 'https://' + u; 
        const hostname = new URL(u).hostname;
        return `https://ico.faviconkit.net/favicon/${hostname}?sz=64`;
    } catch (e) { return ''; } 
}

document.getElementById('subUrl').addEventListener('blur', function() { 
    let url = this.value.trim();
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
        this.value = url;
    }
    if (!document.getElementById('subIconUrl').value) {
        document.getElementById('subIconUrl').value = autoGetIcon(url); 
    }
});

function initTheme() {
    const saved = localStorage.getItem('theme') || 'system';
    setTheme(saved, false);
}

function toggleThemeMenu() { document.getElementById('themeMenu').classList.toggle('show'); }

function toggleAppearance(e) {
    e.stopPropagation();
    const wrapper = document.getElementById('themeOptionsWrapper');
    const arrow = document.getElementById('appearanceArrow');
    if (wrapper) wrapper.classList.toggle('collapsed');
    if (arrow) arrow.classList.toggle('rotate');
}

function setTheme(mode, save = true) {
    if (save) localStorage.setItem('theme', mode);

    let effective = mode;
    if (mode === 'system') {
        effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', effective);

    const iconClass = effective === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    const icon1 = document.getElementById('themeIcon');
    if(icon1) icon1.className = iconClass;

    const icon2 = document.getElementById('loginThemeIcon');
    if(icon2) icon2.className = iconClass;

    document.querySelectorAll('.theme-option').forEach(o => {
        o.classList.remove('active');
        if(o.dataset.mode === mode) o.classList.add('active');
    });
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if(localStorage.getItem('theme')==='system') setTheme('system', false);
});

function startOverviewClock() {
    function update() {
        const now = new Date();
        const timeStr = `当前时间 ${now.toLocaleTimeString('zh-CN', {hour12: false})}`;
        const el = document.getElementById('overviewTime');
        if (el) el.innerText = timeStr;
        const elLogin = document.getElementById('loginTime');
        if(elLogin) elLogin.innerText = timeStr;
    }
    setInterval(update, 1000);
    update();
}

function openCalendar() {
    calDate = new Date();
    renderCalendar();
    selectDay(toLocalDateStr(getLocalToday()));
    document.getElementById('calendarModal').style.display = 'flex';
}

function closeCalendar() {
    document.getElementById('calendarModal').style.display = 'none';
}

function changeMonth(delta) {
    calDate.setMonth(calDate.getMonth() + delta);
    renderCalendar();
}

function jumpToToday() {
    calDate = new Date();
    renderCalendar();
    selectDay(toLocalDateStr(new Date()));
}

function renderCalendar() {
    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    const todayStr = toLocalDateStr(getLocalToday()); 
    
    document.getElementById('calMonthLabel').innerText = `${year}年 ${month + 1}月`;
    
    const headerRow = document.querySelector('.calendar-header-row');
    if (headerRow) {
        headerRow.innerHTML = '<span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>';
    }
    
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const firstDayObj = new Date(year, month, 1);
    const startDayIndex = (firstDayObj.getDay() + 6) % 7; 

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    for (let i = startDayIndex - 1; i >= 0; i--) {
        const dayNum = prevMonthLastDay - i;
        const div = document.createElement('div');
        div.className = 'cal-day other-month';
        
        const dateStr = toLocalDateStr(new Date(year, month - 1, dayNum));
        const dObj = new Date(year, month - 1, dayNum);
        let lunarText = '';
        if (typeof Lunar !== 'undefined') {
            try { lunarText = Lunar.fromDate(dObj).getDayInChinese(); } catch(e) {}
        }
        
        div.innerHTML = `<span class="cal-day-num">${dayNum}</span><span class="cal-lunar">${lunarText}</span>`;
        renderDots(div, dateStr);
        
        div.onclick = () => {
             calDate = new Date(year, month - 1, 1); 
             selectDay(dateStr); 
        };
        grid.appendChild(div);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const div = document.createElement('div');
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        div.className = 'cal-day';
        if (dateStr === todayStr) div.classList.add('today');
        if (dateStr === selectedDateStr) div.classList.add('active');
        
        const dObj = new Date(year, month, d);
        let lunarText = '';
        if (typeof Lunar !== 'undefined') {
            try { lunarText = Lunar.fromDate(dObj).getDayInChinese(); } catch(e) {}
        }
        
        div.innerHTML = `<span class="cal-day-num">${d}</span><span class="cal-lunar">${lunarText}</span>`;
        renderDots(div, dateStr);

        div.onclick = () => selectDay(dateStr);
        grid.appendChild(div);
    }

    const totalCellsFilled = grid.children.length;
    const totalSlots = 42; 
    const remainingSlots = totalSlots - totalCellsFilled;

    for (let d = 1; d <= remainingSlots; d++) {
        const div = document.createElement('div');
        div.className = 'cal-day other-month';
        
        const dateStr = toLocalDateStr(new Date(year, month + 1, d));
        const dObj = new Date(year, month + 1, d);
        let lunarText = '';
        if (typeof Lunar !== 'undefined') {
            try { lunarText = Lunar.fromDate(dObj).getDayInChinese(); } catch(e) {}
        }
        
        div.innerHTML = `<span class="cal-day-num">${d}</span><span class="cal-lunar">${lunarText}</span>`;
        renderDots(div, dateStr);

        div.onclick = () => {
             calDate = new Date(year, month + 1, 1);
             selectDay(dateStr);
        };
        grid.appendChild(div);
    }
}

function renderDots(container, dateStr) {
    const subs = getSubsForDate(dateStr);
    if (subs.length > 0) {
        let dotsHtml = '<div class="cal-dots">';
        subs.slice(0, 4).forEach(s => {
            let dotClass = '';
            
            if (s.startDate === dateStr) {
                dotClass = 'bg-blue';
            } else if ((!s.repeat || s.repeat === 'never') && s.expireDate === dateStr) {
                dotClass = 'bg-red';
            } else if (isRecurrenceDate(s, dateStr)) {
                dotClass = 'bg-red';
            }

            if (dotClass) {
                dotsHtml += `<span class="cal-dot ${dotClass}"></span>`;
            }
        });
        dotsHtml += '</div>';
        container.innerHTML += dotsHtml;
    }
}

function getSubsForDate(dateStr) {
    return currentSubs.map(s => {
        let isMatch = false;
        
        if (s.startDate === dateStr) {
            isMatch = true;
        } else if ((!s.repeat || s.repeat === 'never') && s.expireDate === dateStr) {
            isMatch = true;
        } else if (isRecurrenceDate(s, dateStr)) {
            isMatch = true;
        }
        
        return isMatch ? s : null;
    }).filter(Boolean);
}

function selectDay(dateStr) {
    selectedDateStr = dateStr;
    renderCalendar();
    
    const listEl = document.getElementById('selDateList');
    const titleEl = document.getElementById('selDateTitle');
    listEl.innerHTML = '';
    titleEl.innerText = `${dateStr} 订阅详情`;
    
    const subs = getSubsForDate(dateStr);
    
    if (subs.length === 0) {
        listEl.innerHTML = '<div style="font-size:12px; color:var(--gray); text-align:center; padding:10px;">本日无到期或开始项目</div>';
        return;
    }

    subs.forEach(s => {
        const div = document.createElement('div');
        let dotClass = 'bg-green';
        let typeText = '正常';

        if (s.startDate === dateStr) {
             dotClass = 'bg-blue';
             typeText = '开始';
        } else if ((!s.repeat || s.repeat === 'never') && s.expireDate === dateStr) {
             dotClass = 'bg-red';
             typeText = '到期';
        } else if (isRecurrenceDate(s, dateStr)) {
             dotClass = 'bg-red';
             typeText = '到期(循环)';
        }

        div.className = 'cal-list-item';
        div.onclick = () => { openEdit(s.id); closeCalendar(); };
        div.innerHTML = `
            <div class="cal-item-dot ${dotClass}"></div>
            <div class="cal-item-name">${escapeHtml(s.name)}</div>
            <div class="cal-item-type">${typeText}</div>
        `;
        listEl.appendChild(div);
    });
}

async function openNotifyModal() {
    document.getElementById('notifyModal').style.display = 'flex';
    const tokenInput = document.getElementById('tgToken');
    const chatInput = document.getElementById('tgChatId');

    tokenInput.value = '';
    tokenInput.placeholder = '加载中...';
    chatInput.value = '';
    chatInput.placeholder = '加载中...';

    try {
        const res = await fetch('/api/settings/notify', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            
            if (data.source_token === 'env') {
                tokenInput.value = '';
                tokenInput.placeholder = `例如: ${data.tg_token.substring(0, 20)}...`;
            } else {
                tokenInput.value = data.tg_token || '';
                tokenInput.placeholder = '输入 Token';
            }

            if (data.source_chat_id === 'env') {
                chatInput.value = '';
                chatInput.placeholder = `例如: ${data.tg_chat_id.substring(0, 6)}...`;
            } else {
                chatInput.value = data.tg_chat_id || '';
                chatInput.placeholder = '输入 Chat ID';
            }
        }
    } catch (e) {
        console.error(e);
        tokenInput.placeholder = '加载失败';
        chatInput.placeholder = '加载失败';
    }
}

async function testNotify() {
    const token = document.getElementById('tgToken').value;
    const chatId = document.getElementById('tgChatId').value;
    const btn = document.querySelector('#notifyModal .btn-test');
    const originalText = btn.innerText;

    btn.disabled = true;
    btn.innerText = '发送中...';

    try {
        const res = await fetch('/api/settings/notify/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ tg_token: token, tg_chat_id: chatId })
        });
        
        const data = await res.json();
        if (res.ok) {
            alert('✅ 测试消息已发送，请检查 Telegram');
        } else {
            alert('❌ 测试失败: ' + (data.message || '未知错误'));
        }
    } catch (e) {
        alert('❌ 请求失败');
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

async function saveNotifySettings() {
    const token = document.getElementById('tgToken').value;
    const chatId = document.getElementById('tgChatId').value;
    const btn = document.querySelector('#notifyModal .btn-submit');
    const originalText = btn.innerText;

    btn.disabled = true;
    btn.innerText = '保存中...';

    try {
        const res = await fetch('/api/settings/notify', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ tg_token: token, tg_chat_id: chatId })
        });

        if (res.ok) {
            alert('✅ 配置已更新');
            closeNotifyModal();
        } else {
            alert('❌ 保存失败');
        }
    } catch (e) {
        alert('❌ 请求失败');
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

function closeNotifyModal() {
    document.getElementById('notifyModal').style.display = 'none';
}

function setupModalClosers() {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        const handler = function(e) {
            if (e.target === this) {
                if (e.type === 'touchend') e.preventDefault();

                if (this.id === 'addModal') closeModal();
                else if (this.id === 'renewModal') closeRenewModal();
                else if (this.id === 'searchModal') closeSearch();
                else if (this.id === 'calendarModal') closeCalendar();
                else if (this.id === 'notifyModal') closeNotifyModal();
                else this.style.display = 'none';
            }
        };
        modal.addEventListener('click', handler);
        modal.addEventListener('touchend', handler);
    });
}

const closeMenuHandler = (event) => {
    const themeMenu = document.getElementById('themeMenu');
    if (themeMenu && themeMenu.classList.contains('show')) {
        if (!event.target.closest('.theme-dropdown')) {
            themeMenu.classList.remove('show');
        }
    }
};

window.addEventListener('click', closeMenuHandler);
window.addEventListener('touchstart', closeMenuHandler);

async function exportConfig() {
    if (!checkToken()) return;
    
    if (!confirm('确认要导出当前的订阅配置吗？\n导出后将下载 .json 格式的备份文件。')) {
        return;
    }

    const token = localStorage.getItem('token');
    
    const btn = document.querySelector('button[title="导出配置"]');
    const originalContent = btn ? btn.innerHTML : ''; 
    
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    
    try {
        const res = await fetch('/api/subs/backup', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `subscription-backup-${toLocalDateStr(new Date())}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } else {
            let errMsg = `状态码: ${res.status}`;
            try {
                const errData = await res.json();
                if (errData.message) errMsg += `\n原因: ${errData.message}`;
            } catch (e) {
                errMsg += `\n原因: ${res.statusText}`;
            }
            alert(`❌ 导出失败\n${errMsg}`);
        }
    } catch (e) {
        console.error(e);
        alert('❌ 导出出错：网络连接失败或服务器未响应');
    } finally {
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

function triggerImport() {
    document.getElementById('importFile').click();
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadSubscriptions();
    startOverviewClock();
    setupModalClosers();
    
    const importFileBtn = document.getElementById('importFile');
    if (importFileBtn) {
        importFileBtn.addEventListener('change', async function(e) {
            if (!e.target.files.length) return;
            
            const file = e.target.files[0];
            const reader = new FileReader();
            
            reader.onload = async function(e) {
                try {
                    const json = JSON.parse(e.target.result);
                    if (!checkToken()) return;
                    
                    const token = localStorage.getItem('token');
                    const res = await fetch('/api/subs/restore', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(json)
                    });
                    
                    if (res.ok) {
                        alert('✅ 配置已恢复，页面将刷新');
                        window.location.reload();
                    } else {
                        const err = await res.json();
                        alert('❌ 恢复失败: ' + (err.message || '格式错误'));
                    }
                } catch (err) {
                    console.error(err);
                    alert('❌ 文件解析失败：请确保上传的是正确的 JSON 文件');
                }
            };
            
            reader.readAsText(file);
            e.target.value = ''; 
        });
    }
});