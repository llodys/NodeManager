const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/db.json');
let CACHED_DATA = null;

function initCache() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
            const initData = { subscriptions: [] };
            fs.writeFileSync(DB_PATH, JSON.stringify(initData));
            CACHED_DATA = initData;
        } else {
            CACHED_DATA = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        }
    } catch (err) {
        console.error(err);
        CACHED_DATA = { subscriptions: [] };
    }
}

initCache();

const readDb = () => {
    if (!CACHED_DATA) initCache();
    return CACHED_DATA;
};

const writeDb = (data) => {
    CACHED_DATA = data;
    fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf8', (err) => {
        if(err) console.error(err);
    });
};

module.exports = { readDb, writeDb };