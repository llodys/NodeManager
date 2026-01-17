const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    const envUser = process.env.ADMIN_USER;
    const envPass = process.env.ADMIN_PASS;

    if (!envUser || !envPass) {
      console.error('Error: .env ADMIN_USER or ADMIN_PASS not set');
      return res.status(500).json({ message: '服务器内部配置错误：未设置账号密码' });
    }

    if (username === envUser && password === envPass) {
      const token = jwt.sign(
        { id: 'admin', username: envUser }, 
        process.env.JWT_SECRET, 
        { expiresIn: '7d' }
      );
      
      return res.json({ 
        token, 
        username: envUser,
        message: '登录成功' 
      });
    }

    return res.status(401).json({ message: '用户名或密码错误' });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

module.exports = router;