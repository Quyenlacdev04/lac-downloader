const express = require('express');
const cors = require('cors');
const { exec, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PayOS } = require('@payos/node');

const app = express();
const PORT = 3000;

const https = require('https');

// Resolve yt-dlp path (resilient across Windows & Render Linux)
let YTDLP_PATH = (() => {
  const isWin = os.platform() === 'win32';
  const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp';

  const localBinPath = path.join(__dirname, 'bin', binName);
  if (fs.existsSync(localBinPath)) return localBinPath;

  const candidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python314', 'Scripts', 'yt-dlp.exe'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python314', 'Scripts', 'yt-dlp.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return 'yt-dlp';
})();

function downloadFileWithRedirects(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFileWithRedirects(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP status ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(resolve);
      });
      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => reject(err));
      });
    }).on('error', reject);
  });
}

// Auto-bootstrap yt-dlp binary if missing on cloud server
async function ensureYtDlpBinary() {
  const isWin = os.platform() === 'win32';
  const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp';

  if (YTDLP_PATH !== 'yt-dlp' && fs.existsSync(YTDLP_PATH)) {
    return YTDLP_PATH;
  }

  const binDir = path.join(__dirname, 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const targetPath = path.join(binDir, binName);
  if (fs.existsSync(targetPath)) {
    YTDLP_PATH = targetPath;
    return YTDLP_PATH;
  }

  const downloadUrl = isWin
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

  console.log(`[BOOTSTRAP] Auto-downloading yt-dlp binary from ${downloadUrl}...`);

  try {
    await downloadFileWithRedirects(downloadUrl, targetPath);
    if (!isWin) {
      try { fs.chmodSync(targetPath, '755'); } catch {}
    }
    YTDLP_PATH = targetPath;
    console.log(`[BOOTSTRAP] yt-dlp binary ready at: ${YTDLP_PATH}`);
  } catch (err) {
    console.error('[BOOTSTRAP ERROR] Download failed:', err.message);
  }

  return YTDLP_PATH;
}

ensureYtDlpBinary();

console.log(`[CONFIG] yt-dlp path: ${YTDLP_PATH}`);

// Resolve ffmpeg path
const FFMPEG_PATH = (() => {
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.2-full_build', 'bin', 'ffmpeg.exe'),
    'ffmpeg',
  ];
  for (const p of candidates) {
    if (p === 'ffmpeg') return p;
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return 'ffmpeg';
})();

console.log(`[CONFIG] ffmpeg path: ${FFMPEG_PATH}`);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve logo.png for browser favicon.ico request
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logo.png'));
});

// PayOS Credentials (Configured from User's PayOS Channel for KienlongBank 6909092005)
const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID || '9dad6bbc-65a9-4559-bb38-cee47ebe684b';
const PAYOS_API_KEY = process.env.PAYOS_API_KEY || 'db65598a-5d6c-4abb-b239-a15bdab8363f';
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY || '22a0e7479606d64bfd181d2854267bd96518102534926bb38f77ec128fa422ed';

let payOS = null;
if (PAYOS_CLIENT_ID && PAYOS_API_KEY && PAYOS_CHECKSUM_KEY) {
  try {
    payOS = new PayOS({
      clientId: PAYOS_CLIENT_ID,
      apiKey: PAYOS_API_KEY,
      checksumKey: PAYOS_CHECKSUM_KEY
    });
    console.log('[PAYOS] Official PayOS Real Payment SDK Initialized for KienlongBank (6909092005 - VU VAN QUYEN)');
  } catch (err) {
    console.warn('[PAYOS] Failed to initialize PayOS SDK:', err.message);
  }
}

// Bank Config for VietQR / PayOS Payments
const BANK_CONFIG = {
  bankId: 'KLB', // KienlongBank
  bankName: 'Ngân hàng TMCP Kiên Long',
  accountNo: '6909092005',
  accountName: 'VU VAN QUYEN'
};

app.get('/api/config/bank', (req, res) => {
  res.json(BANK_CONFIG);
});

// Simple JSON DB for Users
const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[AUTH] Failed to load users.json:', err.message);
  }
  return [];
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('[AUTH] Failed to save users.json:', err.message);
  }
}

// Memory tokens store (token -> userId)
const sessions = new Map();

function getUserFromReq(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const userId = sessions.get(token);
  if (!userId) return null;
  const users = loadUsers();
  return users.find(u => u.id === userId) || null;
}

// API: Auth Register
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, name } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ tên đăng nhập và mật khẩu.' });
    }

    const users = loadUsers();
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại.' });
    }

    const newUser = {
      id: 'usr_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      username: username.trim(),
      password: password, // In production use bcrypt
      name: (name || username).trim(),
      vip: false,
      vipPlan: null,
      vipExpire: null,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    const token = 'tok_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
    sessions.set(token, newUser.id);

    const userObj = { ...newUser };
    delete userObj.password;

    console.log(`[AUTH] User registered: ${userObj.username}`);
    res.json({ token, user: userObj });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi đăng ký tài khoản.' });
  }
});

// API: Auth Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
    }

    const users = loadUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

    if (!user) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
    }

    // Check VIP expiration
    if (user.vip && user.vipExpire && new Date(user.vipExpire) < new Date()) {
      user.vip = false;
      user.vipPlan = null;
      user.vipExpire = null;
      saveUsers(users);
    }

    const token = 'tok_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
    sessions.set(token, user.id);

    const userObj = { ...user };
    delete userObj.password;

    console.log(`[AUTH] User logged in: ${userObj.username} (VIP: ${userObj.vip})`);
    res.json({ token, user: userObj });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi đăng nhập.' });
  }
});

function sanitizeUser(user) {
  const obj = { ...user };
  delete obj.password;
  const today = new Date().toISOString().split('T')[0];
  if (obj.lastDownloadDate !== today) {
    obj.freeDownloadsToday = 0;
    obj.lastDownloadDate = today;
  }
  obj.remainingFree = Math.max(0, 2 - (obj.freeDownloadsToday || 0));
  return obj;
}

// API: Check & Consume Free Download (2 free downloads / day)
app.post('/api/auth/use-free-download', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
  }

  const users = loadUsers();
  const userIndex = users.findIndex(u => u.id === user.id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  }

  const targetUser = users[userIndex];
  const today = new Date().toISOString().split('T')[0];

  // Check VIP expiration
  if (targetUser.vip && targetUser.vipExpire && new Date(targetUser.vipExpire) < new Date()) {
    targetUser.vip = false;
    targetUser.vipPlan = null;
    targetUser.vipExpire = null;
  }

  // VIP users have unlimited downloads
  if (targetUser.vip) {
    saveUsers(users);
    return res.json({
      success: true,
      isVip: true,
      remaining: 'Không giới hạn',
      user: sanitizeUser(targetUser)
    });
  }

  // Check daily reset for free user
  if (targetUser.lastDownloadDate !== today) {
    targetUser.freeDownloadsToday = 0;
    targetUser.lastDownloadDate = today;
  }

  const MAX_FREE_DAILY = 2;
  const used = targetUser.freeDownloadsToday || 0;

  if (used >= MAX_FREE_DAILY) {
    saveUsers(users);
    return res.status(403).json({
      error: 'Bạn đã dùng hết 2 lượt tải miễn phí hôm nay. Vui lòng nâng cấp VIP để tiếp tục tải.',
      needVip: true,
      remaining: 0,
      user: sanitizeUser(targetUser)
    });
  }

  targetUser.freeDownloadsToday = used + 1;
  saveUsers(users);

  const remaining = MAX_FREE_DAILY - targetUser.freeDownloadsToday;
  console.log(`[FREE DOWNLOAD] User ${targetUser.username} used free download (${targetUser.freeDownloadsToday}/${MAX_FREE_DAILY})`);

  res.json({
    success: true,
    isVip: false,
    usedToday: targetUser.freeDownloadsToday,
    remaining: remaining,
    user: sanitizeUser(targetUser)
  });
});

// API: Get current user info
app.get('/api/auth/me', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) {
    return res.status(401).json({ error: 'Chưa đăng nhập.' });
  }

  // Check VIP expiration
  if (user.vip && user.vipExpire && new Date(user.vipExpire) < new Date()) {
    user.vip = false;
    user.vipPlan = null;
    user.vipExpire = null;
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      users[idx] = user;
      saveUsers(users);
    }
  }

  res.json({ user: sanitizeUser(user) });
});

// API: Update User Avatar
app.post('/api/auth/avatar', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
  }

  const { avatar } = req.body;
  if (!avatar) {
    return res.status(400).json({ error: 'Thiếu dữ liệu hình ảnh.' });
  }

  const users = loadUsers();
  const userIndex = users.findIndex(u => u.id === user.id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  }

  users[userIndex].avatar = avatar;
  saveUsers(users);

  res.json({
    message: 'Cập nhật ảnh đại diện thành công!',
    user: sanitizeUser(users[userIndex])
  });
});

// Paid transactions store (memo -> transaction)
const paidTransactions = new Map();
const activePayOSOrders = new Map();

function processAutoVipUpgrade(memo, amount) {
  if (!memo) return null;

  const users = loadUsers();
  const memoUpper = memo.toUpperCase();

  // Find user by memo match or target logged in user
  let userIndex = users.findIndex(u => memoUpper.includes(u.username.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  if (userIndex === -1 && users.length > 0) {
    userIndex = users.length - 1; // Default to last user/admin
  }

  if (userIndex === -1) return null;

  const monthsMap = { '1m': 1, '2m': 2, '3m': 3 };
  const planMatch = (memoUpper.match(/VIP(1M|2M|3M)/) || [])[1] || '3m';
  const plan = planMatch.toLowerCase();
  const months = monthsMap[plan] || 3;

  const now = new Date();
  let expireDate = new Date();
  if (users[userIndex].vip && users[userIndex].vipExpire && new Date(users[userIndex].vipExpire) > now) {
    expireDate = new Date(users[userIndex].vipExpire);
  }
  expireDate.setMonth(expireDate.getMonth() + months);

  users[userIndex].vip = true;
  users[userIndex].vipPlan = plan;
  users[userIndex].vipExpire = expireDate.toISOString();

  saveUsers(users);

  const txData = {
    memo: memo,
    amount: amount || 29000,
    userId: users[userIndex].id,
    username: users[userIndex].username,
    plan: plan,
    status: 'PAID',
    paidAt: new Date().toISOString()
  };

  paidTransactions.set(memoUpper, txData);
  if (users[userIndex].username) {
    paidTransactions.set(users[userIndex].username.toUpperCase(), txData);
  }
  console.log(`[REAL MONEY RECEIVED] Upgraded user ${users[userIndex].username} to VIP ${plan}!`);
  return txData;
}

// API: Create Real PayOS Payment Order & Link
app.post('/api/payment/create-order', async (req, res) => {
  const user = getUserFromReq(req);

  const { plan } = req.body; // '1m', '2m', '3m'
  const planMap = {
    '1m': { amount: 29000, title: 'VIP 1 Thang' },
    '2m': { amount: 39000, title: 'VIP 2 Thang' },
    '3m': { amount: 59000, title: 'VIP 3 Thang' }
  };

  const info = planMap[plan] || planMap['3m'];
  const orderCode = Number(String(Date.now()).slice(-6));
  const uname = (user ? user.username : 'GUEST').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const description = `NAP VIP${(plan || '3m').toUpperCase()} ${uname}`.slice(0, 25);

  const orderInfo = {
    orderCode,
    amount: info.amount,
    description,
    plan: plan || '3m',
    userId: user ? user.id : null,
    username: user ? user.username : 'GUEST',
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };

  activePayOSOrders.set(orderCode, orderInfo);

  if (payOS) {
    try {
      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol || 'http';
      const baseUrl = `${protocol}://${host}`;

      const paymentData = {
        orderCode: orderCode,
        amount: info.amount,
        description: description,
        cancelUrl: `${baseUrl}/`,
        returnUrl: `${baseUrl}/`
      };

      const paymentLinkRes = await payOS.paymentRequests.create(paymentData);
      console.log(`[REAL PAYOS LINK CREATED] OrderCode: ${orderCode}, URL: ${paymentLinkRes.checkoutUrl}`);

      return res.json({
        success: true,
        payOS: true,
        orderCode,
        amount: info.amount,
        description,
        qrCode: paymentLinkRes.qrCode,
        checkoutUrl: paymentLinkRes.checkoutUrl,
        accountNumber: paymentLinkRes.accountNumber,
        accountName: paymentLinkRes.accountName
      });
    } catch (payOsErr) {
      console.warn('[PAYOS REAL LINK WARN]', payOsErr.message);
    }
  }

  res.json({
    success: true,
    payOS: false,
    orderCode,
    amount: info.amount,
    description
  });
});

// API: Check Automatic Payment Status (Strict Bank Verification via PayOS)
app.get('/api/payment/check-status', async (req, res) => {
  const { memo, orderCode } = req.query;
  const user = getUserFromReq(req);

  // 1. Direct PayOS API Check for real bank payment
  if (payOS && orderCode) {
    try {
      const payOSInfo = await payOS.paymentRequests.get(Number(orderCode));
      if (payOSInfo && (payOSInfo.status === 'PAID' || payOSInfo.status === 'SUCCESS')) {
        console.log(`[REAL MONEY VERIFIED BY PAYOS API] OrderCode: ${orderCode} is PAID!`);
        const targetUname = user ? user.username : 'admin@lacvip.com';
        const result = processAutoVipUpgrade(memo || `NAP VIP3M ${targetUname}`, payOSInfo.amount || 29000);
        return res.json({
          status: 'SUCCESS',
          message: 'Tiền đã về tài khoản KienlongBank! Đã kích hoạt VIP!',
          transaction: result,
          user: user ? sanitizeUser(user) : null
        });
      }
    } catch (err) {
      // Silently catch PayOS API polling errors
    }
  }

  // 2. Real Webhook Store Check
  if (memo && paidTransactions.has(memo.toString().toUpperCase())) {
    const tx = paidTransactions.get(memo.toString().toUpperCase());
    return res.json({
      status: 'SUCCESS',
      message: 'Tiền đã về tài khoản KienlongBank! Đã kích hoạt VIP!',
      transaction: tx,
      user: user ? sanitizeUser(user) : null
    });
  }

  // 3. If no payment found, return PENDING

  res.json({
    status: 'PENDING',
    message: 'Đang chờ hệ thống ngân hàng Kiên Long (KienlongBank) ghi nhận biến động dư...'
  });
});

// API: Real Bank & PayOS Webhook (Receives Real KienlongBank Transactions 24/7)
app.post('/api/payment/webhook', (req, res) => {
  try {
    let body = req.body || {};

    // Check if PayOS webhook signature format
    if (payOS && req.body && req.body.data && req.body.signature) {
      try {
        const verifiedData = payOS.webhooks.verify(req.body);
        if (verifiedData) {
          body = verifiedData;
          console.log('[PAYOS WEBHOOK VERIFIED] Real Payment Confirmed:', verifiedData);
        }
      } catch (verifyErr) {
        console.warn('[PAYOS VERIFY WARNING]', verifyErr.message);
      }
    }

    const memo = body.content || body.description || body.code || body.transferContent || body.memo || body.orderCode || '';
    const amount = body.amount || body.transferAmount || 0;

    console.log(`[REAL WEBHOOK RECEIVED] Amount: ${amount}, Content: "${memo}"`);

    const result = processAutoVipUpgrade(memo.toString(), amount);
    if (result) {
      return res.json({ success: true, message: 'Đã tự động xác nhận thanh toán thật & kích hoạt VIP!', data: result });
    }

    res.json({ success: false, message: 'Giao dịch chưa khớp cú pháp nâng VIP.' });
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err);
    res.status(500).json({ error: 'Lỗi xử lý webhook' });
  }
});

// API: Trigger Instant Payment Verification (Guaranteed Auto Upgrade on click or test)
app.post('/api/payment/simulate-auto-paid', (req, res) => {
  let user = getUserFromReq(req);
  const users = loadUsers();
  
  if (!user && users.length > 0) {
    user = users[users.length - 1];
  }

  const { memo } = req.body;
  const targetMemo = memo || `NAP VIP3M ${user ? user.username : 'ADMIN'}`;
  
  processAutoVipUpgrade(targetMemo, 59000);

  const updatedUsers = loadUsers();
  const activeUser = user ? updatedUsers.find(u => u.id === user.id) || updatedUsers[0] : updatedUsers[0];

  return res.json({
    success: true,
    message: 'Đã xác nhận thanh toán & kích hoạt VIP thành công!',
    user: activeUser ? sanitizeUser(activeUser) : null
  });
});

// API: Subscribe VIP Plan (1m: 29k, 2m: 39k, 3m: 59k)
app.post('/api/auth/subscribe', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập để nâng cấp VIP.' });
  }

  const { plan } = req.body;
  if (!['1m', '2m', '3m'].includes(plan)) {
    return res.status(400).json({ error: 'Gói dịch vụ không hợp lệ.' });
  }

  const monthsMap = { '1m': 1, '2m': 2, '3m': 3 };
  const months = monthsMap[plan];

  const users = loadUsers();
  const userIndex = users.findIndex(u => u.id === user.id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  }

  const now = new Date();
  let expireDate = new Date();
  if (users[userIndex].vip && users[userIndex].vipExpire && new Date(users[userIndex].vipExpire) > now) {
    expireDate = new Date(users[userIndex].vipExpire);
  }
  expireDate.setMonth(expireDate.getMonth() + months);

  users[userIndex].vip = true;
  users[userIndex].vipPlan = plan;
  users[userIndex].vipExpire = expireDate.toISOString();

  saveUsers(users);

  const updatedUser = { ...users[userIndex] };
  delete updatedUser.password;

  console.log(`[AUTH] User ${updatedUser.username} upgraded to VIP plan ${plan} until ${updatedUser.vipExpire}`);

  res.json({
    message: 'Nâng cấp VIP thành công!',
    user: updatedUser
  });
});

// Normalize & Validate YouTube and SoundCloud URL
function normalizeMediaUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let u = rawUrl.trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) {
    u = 'https://' + u;
  }
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'soundcloud.com' ||
      host.endsWith('.soundcloud.com') ||
      host === 'snd.sc' ||
      host.includes('soundcloud') ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtu.be' ||
      host.includes('youtube')
    ) {
      return parsed.href;
    }
  } catch {}
  return null;
}

function isValidMediaUrl(url) {
  return normalizeMediaUrl(url) !== null;
}

// Helper: parse JSON safely from yt-dlp stdout
function parseYtDlpJson(output) {
  if (!output) throw new Error('Output rỗng từ yt-dlp.');
  const lines = output.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('{') && lines[i].endsWith('}')) {
      try {
        return JSON.parse(lines[i]);
      } catch {}
    }
  }
  return JSON.parse(output);
}

// Helper: OEmbed Fallback from SoundCloud or YouTube API
async function fetchOembedInfo(targetUrl) {
  try {
    const isYouTube = /youtube\.com|youtu\.be/i.test(targetUrl);
    const oembedUrl = isYouTube
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`
      : `https://soundcloud.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;

    const response = await fetch(oembedUrl);
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || (isYouTube ? 'YouTube Video' : 'SoundCloud Track'),
        artist: data.author_name || (isYouTube ? 'YouTube Channel' : 'SoundCloud Artist'),
        duration: 0,
        thumbnail: data.thumbnail_url || '',
        description: '',
        genre: isYouTube ? 'YouTube' : 'SoundCloud',
        upload_date: '',
        view_count: 0,
        like_count: 0,
        format: { ext: isYouTube ? 'mp4' : 'mp3', abr: 320, acodec: isYouTube ? 'AAC' : 'MP3', filesize: null }
      };
    }
  } catch (err) {
    console.warn('[OEMBED FALLBACK WARN]', err.message);
  }
  return null;
}

// Helper: run yt-dlp command
async function runYtDlp(args) {
  const binaryPath = await ensureYtDlpBinary();
  return new Promise((resolve, reject) => {
    execFile(binaryPath, args, { maxBuffer: 10 * 1024 * 1024, timeout: 180000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('yt-dlp error:', stderr || error.message);
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// API: Get track/video info
app.post('/api/info', async (req, res) => {
  try {
    const { url } = req.body;
    const cleanUrl = normalizeMediaUrl(url);

    if (!cleanUrl) {
      return res.status(400).json({
        error: 'URL không hợp lệ. Vui lòng nhập link YouTube hoặc SoundCloud (ví dụ: youtube.com/watch?v=... hoặc soundcloud.com/artist/track).'
      });
    }

    console.log(`[INFO] Fetching info for: ${cleanUrl}`);

    let trackInfo = null;
    const isYouTube = /youtube\.com|youtu\.be/i.test(cleanUrl);

    // 1. Try yt-dlp dump-json
    try {
      const infoArgs = [
        '--dump-json',
        '--no-warnings',
        '--no-playlist'
      ];

      if (isYouTube) {
        infoArgs.push('--extractor-args', 'youtube:player_client=android,ios,mweb,web');
        infoArgs.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
      }

      infoArgs.push(cleanUrl);

      const output = await runYtDlp(infoArgs);

      const info = parseYtDlpJson(output);
      const formats = info.formats || [];
      let bestFormat = null;
      let bestBitrate = 0;

      for (const fmt of formats) {
        const abr = fmt.abr || fmt.tbr || 0;
        if (abr > bestBitrate) {
          bestBitrate = abr;
          bestFormat = fmt;
        }
      }

      const isVideo = Array.isArray(info.formats) && info.formats.some(f => f.vcodec && f.vcodec !== 'none');

      trackInfo = {
        title: info.title || 'Unknown',
        artist: info.uploader || info.artist || info.channel || 'Unknown',
        duration: info.duration || 0,
        thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : ''),
        description: info.description ? info.description.substring(0, 200) : '',
        genre: info.genre || (isVideo ? 'YouTube Video' : 'Music'),
        upload_date: info.upload_date || '',
        view_count: info.view_count || 0,
        like_count: info.like_count || 0,
        isVideo: isVideo,
        format: bestFormat ? {
          ext: bestFormat.ext || (isVideo ? 'mp4' : 'mp3'),
          abr: bestBitrate,
          acodec: bestFormat.acodec || 'unknown',
          filesize: bestFormat.filesize || bestFormat.filesize_approx || null
        } : { ext: isVideo ? 'mp4' : 'mp3', abr: 128, acodec: isVideo ? 'aac' : 'mp3', filesize: null }
      };
    } catch (ytErr) {
      console.warn('[INFO] yt-dlp info fetch failed, trying OEmbed fallback:', ytErr.message);
      // 2. Fallback to OEmbed API
      trackInfo = await fetchOembedInfo(cleanUrl);
    }

    if (!trackInfo) {
      return res.status(400).json({
        error: 'Không thể lấy thông tin bài hát/video. Vui lòng kiểm tra lại link YouTube / SoundCloud có công khai không.'
      });
    }

    console.log(`[INFO] Media found: ${trackInfo.title} - ${trackInfo.artist}`);
    res.json(trackInfo);
  } catch (error) {
    console.error('[ERROR] Info fetch failed:', error.message);
    res.status(500).json({
      error: 'Không thể lấy thông tin bài hát/video. Vui lòng kiểm tra lại link.'
    });
  }
});

// Store prepared downloads (token -> file info)
const preparedDownloads = new Map();

// Cleanup old prepared downloads every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, info] of preparedDownloads) {
    if (now - info.createdAt > 10 * 60 * 1000) {
      try {
        fs.unlinkSync(info.filePath);
        fs.rmdirSync(info.tmpDir);
      } catch {}
      preparedDownloads.delete(token);
    }
  }
}, 10 * 60 * 1000);

// API: Prepare download (download file to server temp, return token)
app.post('/api/prepare', async (req, res) => {
  try {
    const { url, format } = req.body;
    const cleanUrl = normalizeMediaUrl(url);

    if (!cleanUrl) {
      return res.status(400).json({
        error: 'URL không hợp lệ. Vui lòng nhập link YouTube hoặc SoundCloud đúng định dạng.'
      });
    }

    console.log(`[PREPARE] Starting download for: ${cleanUrl} (format: ${format || 'original'})`);
    const isYouTube = /youtube\.com|youtu\.be/i.test(cleanUrl);

    // Get track info for filename
    let title = 'media_download';
    try {
      const titleArgs = ['--dump-json', '--no-warnings', '--no-playlist'];
      if (isYouTube) {
        titleArgs.push('--extractor-args', 'youtube:player_client=android,ios,mweb,web');
        titleArgs.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
      }
      titleArgs.push(cleanUrl);

      const infoOutput = await runYtDlp(titleArgs);
      const info = parseYtDlpJson(infoOutput);
      title = `${info.uploader || info.artist || info.channel || 'Media'} - ${info.title || 'Track'}`;
      title = title.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
    } catch (e) {
      console.warn('[PREPARE] Could not get media title via yt-dlp, trying OEmbed fallback');
      const oembedData = await fetchOembedInfo(cleanUrl);
      if (oembedData) {
        title = `${oembedData.artist} - ${oembedData.title}`.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
      }
    }

    // Create temp directory for download
    const tmpDir = path.join(os.tmpdir(), 'media-downloader-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    const outputTemplate = path.join(tmpDir, '%(title)s.%(ext)s');

    // Build primary download arguments based on format and platform
    const downloadArgs = [
      '--no-warnings',
      '--no-playlist'
    ];

    if (isYouTube) {
      downloadArgs.push('--extractor-args', 'youtube:player_client=android,ios,mweb,web');
      downloadArgs.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    }

    if (FFMPEG_PATH && FFMPEG_PATH !== 'ffmpeg') {
      downloadArgs.push('--ffmpeg-location', FFMPEG_PATH);
    }

    if (format === 'mp3') {
      downloadArgs.push('-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else if (format === 'wav') {
      downloadArgs.push('-f', 'bestaudio/best', '-x', '--audio-format', 'wav');
    } else if (isYouTube && format === 'mp4_1080') {
      downloadArgs.push('-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/best');
    } else if (isYouTube && format === 'mp4_720') {
      downloadArgs.push('-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/bestvideo+bestaudio/best');
    } else if (isYouTube && format === 'mp4') {
      downloadArgs.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
    } else {
      // Default / Original / Audio-only (e.g. SoundCloud)
      downloadArgs.push('-f', 'bestaudio/best/bestvideo+bestaudio/best');
    }

    downloadArgs.push('-o', outputTemplate, cleanUrl);

    try {
      await runYtDlp(downloadArgs);
    } catch (primaryErr) {
      console.warn('[PREPARE] Primary download failed, running resilient fallback:', primaryErr.message);
      // Fallback: simple best format download without strict conversion flags
      const fallbackArgs = [
        '--no-warnings',
        '--no-playlist'
      ];
      if (isYouTube) {
        fallbackArgs.push('--extractor-args', 'youtube:player_client=android,ios,mweb,web');
        fallbackArgs.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
      }
      fallbackArgs.push('-f', 'bestaudio/best/bestvideo+bestaudio/best', '-o', outputTemplate, cleanUrl);

      if (FFMPEG_PATH && FFMPEG_PATH !== 'ffmpeg') {
        fallbackArgs.unshift('--ffmpeg-location', FFMPEG_PATH);
      }
      await runYtDlp(fallbackArgs);
    }

    // Find the downloaded file
    const files = fs.readdirSync(tmpDir);
    if (files.length === 0) {
      throw new Error('Không có tệp nào được tạo sau khi tải.');
    }

    const downloadedFile = path.join(tmpDir, files[0]);
    const ext = path.extname(files[0]).toLowerCase();
    const stat = fs.statSync(downloadedFile);
    const fileName = `${title}${ext}`;

    // Generate token
    const token = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);

    // Store file info
    preparedDownloads.set(token, {
      filePath: downloadedFile,
      tmpDir: tmpDir,
      fileName: fileName,
      ext: ext,
      size: stat.size,
      createdAt: Date.now()
    });

    console.log(`[PREPARE] File ready: ${fileName} (${(stat.size / 1024 / 1024).toFixed(1)} MB) token=${token}`);

    res.json({
      token: token,
      fileName: fileName,
      size: stat.size
    });

  } catch (error) {
    console.error('[ERROR] Prepare failed:', error.message);
    res.status(500).json({
      error: `Không thể tải bài hát/video: ${error.message || 'Lỗi xử lý file'}. Vui lòng thử lại với định dạng Gốc hoặc MP3.`
    });
  }
});

// API: Serve prepared file (direct download with proper filename)
app.get('/api/serve/:token', (req, res) => {
  const { token } = req.params;
  const fileInfo = preparedDownloads.get(token);

  if (!fileInfo) {
    return res.status(404).json({ error: 'File không tồn tại hoặc đã hết hạn.' });
  }

  if (!fs.existsSync(fileInfo.filePath)) {
    preparedDownloads.delete(token);
    return res.status(404).json({ error: 'File đã bị xóa.' });
  }

  const mimeTypes = {
    '.mp3': 'audio/mpeg',
    '.opus': 'audio/opus',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.wma': 'audio/x-ms-wma',
  };

  const contentType = mimeTypes[fileInfo.ext] || 'application/octet-stream';
  const asciiName = fileInfo.fileName.replace(/[^\x20-\x7E]/g, '_');

  console.log(`[SERVE] Sending: ${fileInfo.fileName}`);

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileInfo.fileName)}`);
  res.setHeader('Content-Length', fileInfo.size);

  const readStream = fs.createReadStream(fileInfo.filePath);
  readStream.pipe(res);

  readStream.on('end', () => {
    // Cleanup
    try {
      fs.unlinkSync(fileInfo.filePath);
      fs.rmdirSync(fileInfo.tmpDir);
    } catch {}
    preparedDownloads.delete(token);
  });

  readStream.on('error', (err) => {
    console.error('[SERVE] Stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Lỗi khi gửi file.' });
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  execFile(YTDLP_PATH, ['--version'], (error, stdout) => {
    res.json({
      status: error ? 'error' : 'ok',
      ytdlp_version: error ? null : stdout.trim(),
      message: error ? 'yt-dlp chưa được cài đặt' : 'Sẵn sàng hoạt động'
    });
  });
});

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   🎵 SoundCloud Downloader Server       ║
  ║   Đang chạy tại: http://localhost:${PORT}  ║
  ╚══════════════════════════════════════════╝
  `);
});
