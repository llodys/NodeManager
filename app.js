require('dotenv').config();
const path = require('path');
const fs = require('fs');
const https = require('https');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const cron = require('node-cron');
const runCronJob = require('./services/cronJob');

process.env.PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
process.env.DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'default_secret_key_123';
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
process.env.TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID || '';
process.env.HTTP_PROXY = process.env.HTTP_PROXY || '';

const authRoutes = require('./routes/authRoutes');
const subRoutes = require('./routes/subRoutes');

const app = express();

app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static('public', {
    maxAge: '0',
    etag: false
}));

function getDynamicConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error(e);
    }
    return {};
}

function getEffectiveConfig() {
    const dynamic = getDynamicConfig();
    return {
        tg_token: dynamic.tg_token || process.env.TELEGRAM_BOT_TOKEN || '',
        tg_chat_id: dynamic.tg_chat_id || process.env.TELEGRAM_ADMIN_ID || ''
    };
}

app.get('/api/settings/notify', (req, res) => {
    const dynamic = getDynamicConfig();
    const effective = getEffectiveConfig();
    
    res.json({
        tg_token: effective.tg_token,
        tg_chat_id: effective.tg_chat_id,
        source_token: dynamic.tg_token ? 'manual' : 'env',
        source_chat_id: dynamic.tg_chat_id ? 'manual' : 'env'
    });
});

app.post('/api/settings/notify', (req, res) => {
    const { tg_token, tg_chat_id } = req.body;
    
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        let config = getDynamicConfig();

        if (!tg_token) delete config.tg_token;
        else config.tg_token = tg_token.trim();

        if (!tg_chat_id) delete config.tg_chat_id;
        else config.tg_chat_id = tg_chat_id.trim();

        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

        res.json({ message: 'ok', config: getEffectiveConfig() });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'error' });
    }
});

app.post('/api/settings/notify/test', async (req, res) => {
    const { tg_token, tg_chat_id } = req.body;
    
    const effective = getEffectiveConfig();
    const token = tg_token ? tg_token.trim() : effective.tg_token;
    const chatId = tg_chat_id ? tg_chat_id.trim() : effective.tg_chat_id;

    if (!token || !chatId) {
        return res.status(400).json({ message: '缺少 Token 或 Chat ID' });
    }

    const message = "🔔 NodeManager 通知测试\n\n恭喜！您的通知配置正确。";
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const data = JSON.stringify({
        chat_id: chatId,
        text: message
    });

    const request = https.request(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    }, (response) => {
        let body = '';
        response.on('data', (chunk) => body += chunk);
        response.on('end', () => {
            if (response.statusCode === 200) {
                res.json({ message: 'ok' });
            } else {
                try {
                    const err = JSON.parse(body);
                    res.status(400).json({ message: err.description || 'Telegram API 报错' });
                } catch (e) {
                    res.status(400).json({ message: '发送失败' });
                }
            }
        });
    });

    request.on('error', (e) => {
        res.status(500).json({ message: '网络请求失败' });
    });

    request.write(data);
    request.end();
});

app.use('/api/auth', authRoutes);
app.use('/api/subs', subRoutes);

cron.schedule('0 30 9 * * *', () => {
    const config = getEffectiveConfig();
    if(config.tg_token) process.env.TELEGRAM_BOT_TOKEN = config.tg_token;
    if(config.tg_chat_id) process.env.TELEGRAM_ADMIN_ID = config.tg_chat_id;
    
    runCronJob();
});

const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`-----------------------------------------`);
    console.log(`System Started`);
    console.log(`http://localhost:${PORT}`);
    console.log(`-----------------------------------------`);
});