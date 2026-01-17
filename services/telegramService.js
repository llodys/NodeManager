const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const sendToAdmin = async (message) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_ID;
  const proxyAddress = process.env.HTTP_PROXY;

  if (!token || !chatId) {
    console.error('Missing config: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_ID');
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const axiosConfig = {
    chat_id: chatId,
    text: message,
    parse_mode: 'Markdown'
  };

  let requestOptions = {};
  if (proxyAddress) {
    const agent = new HttpsProxyAgent(proxyAddress);
    requestOptions.httpsAgent = agent;
    requestOptions.proxy = false;
  }

  try {
    await axios.post(url, axiosConfig, requestOptions);
    console.log('[Telegram] Notification sent successfully.');
  } catch (error) {
    const errorMsg = error.response ? error.response.data.description : error.message;
    console.error(`[Telegram] Send failed: ${errorMsg}`);
  }
};

module.exports = { sendToAdmin };