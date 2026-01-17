const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { readDb, writeDb } = require('../utils/db');
const { sendToAdmin } = require('../services/telegramService');

// 权限验证中间件
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: '无权限' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) { res.status(401).json({ message: 'Token 无效' }); }
};

// ==============================
// 新增：备份与恢复接口
// ==============================

// 导出配置 (备份)
router.get('/backup', authMiddleware, (req, res) => {
  try {
    const db = readDb();
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="subscription-backup-${date}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(db);
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ message: '导出失败' });
  }
});

// 导入配置 (恢复)
router.post('/restore', authMiddleware, (req, res) => {
  try {
    const data = req.body;
    
    // 简单的格式校验
    if (!data || !Array.isArray(data.subscriptions)) {
      return res.status(400).json({ message: '无效的配置文件格式，必须包含 subscriptions 数组' });
    }

    // 写入数据库
    writeDb(data);
    console.log('Database restored from backup via API');
    res.json({ message: '配置已成功恢复' });
  } catch (error) {
    console.error('Restore error:', error);
    res.status(500).json({ message: '恢复失败: ' + error.message });
  }
});

// ==============================
// 原有业务接口
// ==============================

// 测试通知
router.post('/test-notify', authMiddleware, async (req, res) => {
  try {
    await sendToAdmin("🔔 **测试消息**\n\n恭喜！您的 Telegram 通知服务配置成功。");
    res.json({ message: '测试消息已发送' });
  } catch (error) { res.status(500).json({ error: '发送失败' }); }
});

// 获取所有订阅
router.get('/', authMiddleware, async (req, res) => {
  const db = readDb();
  res.json(db.subscriptions);
});

// 新增订阅
router.post('/', authMiddleware, async (req, res) => {
  const { name, type, startDate, expireDate, url, iconUrl, note, notifyDays, repeat } = req.body;
  const db = readDb();

  const newSub = {
    id: Date.now().toString(),
    userId: req.userId,
    name,
    type: type || '未分类',
    startDate,
    expireDate,
    url,
    iconUrl,
    note,
    notifyDays: notifyDays ? parseInt(notifyDays) : 7,
    repeat: repeat || 'never',
    isNotified: false
  };

  db.subscriptions.push(newSub);
  writeDb(db);
  console.log('Added subscription:', name);
  res.status(201).json(newSub);
});

// 编辑订阅
router.put('/:id', authMiddleware, async (req, res) => {
  const { name, type, startDate, expireDate, url, iconUrl, note, notifyDays, repeat } = req.body;
  const db = readDb();
  
  const index = db.subscriptions.findIndex(s => s.id == req.params.id);
  if (index === -1) return res.status(404).json({ message: '未找到该订阅' });

  const oldSub = db.subscriptions[index];
  const newNotifyDays = notifyDays ? parseInt(notifyDays) : 7;
  
  db.subscriptions[index] = {
    ...oldSub,
    name,
    type,
    startDate,
    expireDate,
    url,
    iconUrl,
    note,
    notifyDays: newNotifyDays,
    repeat: repeat || oldSub.repeat || 'never',
    // 如果过期时间或提醒阈值变了，重置通知状态
    isNotified: (expireDate !== oldSub.expireDate || newNotifyDays !== oldSub.notifyDays) ? false : oldSub.isNotified
  };

  writeDb(db);
  console.log('Updated subscription:', name);
  res.json(db.subscriptions[index]);
});

// 手动推送单条订阅通知
router.post('/:id/notify', authMiddleware, async (req, res) => {
  const db = readDb();
  const sub = db.subscriptions.find(s => s.id == req.params.id);
  if (!sub) return res.status(404).json({ message: '未找到该订阅' });

  const today = new Date();
  today.setHours(0,0,0,0);
  const expireDate = new Date(sub.expireDate);
  const diffTime = expireDate - today;
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const notifyDays = sub.notifyDays || 7;

  let statusIcon = '✅';
  if (daysLeft < 0) statusIcon = '❌';
  else if (daysLeft <= notifyDays) statusIcon = '⚠️';

  const message = [
    `📢 **订阅详情推送**`,
    `------------------`,
    `📌 **名称**: ${sub.name}`,
    `🏷️ **类型**: ${sub.type}`,
    `🔗 **链接**: ${sub.url || '无'}`,
    `📅 **到期**: ${sub.expireDate}`,
    `${statusIcon} **剩余**: ${daysLeft} 天`,
    `📝 **备注**: ${sub.note || '无'}`
  ].join('\n');

  try {
    await sendToAdmin(message);
    res.json({ message: '通知已发送' });
  } catch (error) { res.status(500).json({ error: '发送失败' }); }
});

// 续期订阅
router.post('/:id/renew', authMiddleware, async (req, res) => {
  const { years, newDate, newStartDate } = req.body;
  const db = readDb();
  const index = db.subscriptions.findIndex(s => s.id == req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ message: '未找到该订阅' });
  }

  const oldSub = db.subscriptions[index];
  let finalExpireDate = '';

  if (newDate) {
    finalExpireDate = newDate;
  } else {
    const addYears = years ? parseInt(years) : 1;
    const d = new Date(oldSub.expireDate);
    d.setFullYear(d.getFullYear() + addYears);
    finalExpireDate = d.toISOString().split('T')[0];
  }

  const finalStartDate = newStartDate || oldSub.startDate;
  
  db.subscriptions[index] = {
    ...oldSub,
    startDate: finalStartDate,
    expireDate: finalExpireDate,
    isNotified: false
  };

  writeDb(db);
  console.log(`Renewed subscription: ${oldSub.name}`);
  res.json({ message: `续期成功` });
});

// 删除订阅
router.delete('/:id', authMiddleware, async (req, res) => {
  const db = readDb();
  const initialLength = db.subscriptions.length;
  db.subscriptions = db.subscriptions.filter(s => s.id != req.params.id);
  if (db.subscriptions.length === initialLength) return res.status(404).json({ message: '未找到该订阅' });
  writeDb(db);
  console.log('Deleted subscription ID:', req.params.id);
  res.json({ message: '已删除' });
});

module.exports = router;