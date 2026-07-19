// ==========================================
// SoundCloud Downloader - Frontend Logic
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Splash Screen Intro Timer (Logo 3 seconds)
  const splashScreen = document.getElementById('splashScreen');
  if (splashScreen) {
    setTimeout(() => {
      splashScreen.classList.add('fade-out');
      setTimeout(() => {
        splashScreen.style.display = 'none';
      }, 800);
    }, 3000);
  }

  // Main Elements
  const urlInput = document.getElementById('urlInput');
  const clearBtn = document.getElementById('clearBtn');
  const fetchBtn = document.getElementById('fetchBtn');
  const errorMsg = document.getElementById('errorMsg');
  const errorText = document.getElementById('errorText');
  const resultSection = document.getElementById('resultSection');
  const downloadBtn = document.getElementById('downloadBtn');

  // Track info elements
  const trackThumbnail = document.getElementById('trackThumbnail');
  const trackTitle = document.getElementById('trackTitle');
  const trackArtist = document.getElementById('trackArtist');
  const trackDuration = document.getElementById('trackDuration');
  const trackFormat = document.getElementById('trackFormat');
  const trackSize = document.getElementById('trackSize');
  const trackSizeMeta = document.getElementById('trackSizeMeta');
  const trackViews = document.getElementById('trackViews');
  const trackViewsMeta = document.getElementById('trackViewsMeta');

  // Auth & Profile Elements
  const userGuest = document.getElementById('userGuest');
  const userProfile = document.getElementById('userProfile');
  const loginOpenBtn = document.getElementById('loginOpenBtn');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');
  const userBadge = document.getElementById('userBadge');
  const logoutBtn = document.getElementById('logoutBtn');

  // Auth Modal Elements
  const authModal = document.getElementById('authModal');
  const authModalClose = document.getElementById('authModalClose');
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginUsername = document.getElementById('loginUsername');
  const loginPassword = document.getElementById('loginPassword');
  const regName = document.getElementById('regName');
  const regUsername = document.getElementById('regUsername');
  const regPassword = document.getElementById('regPassword');
  const loginError = document.getElementById('loginError');
  const regError = document.getElementById('regError');
  const quickDemoBtn = document.getElementById('quickDemoBtn');

  // VIP Modal Elements
  const vipModal = document.getElementById('vipModal');
  const vipModalClose = document.getElementById('vipModalClose');
  const planCards = document.querySelectorAll('.plan-card');
  const confirmVipBtn = document.getElementById('confirmVipBtn');

  // Payment Modal Elements
  const paymentModal = document.getElementById('paymentModal');
  const paymentModalClose = document.getElementById('paymentModalClose');
  const paymentPlanInfo = document.getElementById('paymentPlanInfo');
  const simulatePayBtn = document.getElementById('simulatePayBtn');

  // State Variables
  let currentUrl = '';
  let currentTrackInfo = null;
  let selectedFormat = 'original';
  let currentUser = null;
  let authToken = localStorage.getItem('sc_auth_token') || null;
  let selectedVipPlan = '3m'; // Default selected package: 3 months (59k)
  let pendingDownloadAfterVip = false;

  const planPriceMap = {
    '1m': { price: '29.000đ', title: 'Gói 1 Tháng (Tháng đầu)' },
    '2m': { price: '39.000đ', title: 'Gói 2 Tháng' },
    '3m': { price: '59.000đ', title: 'Gói 3 Tháng (Cao nhất)' }
  };

  // Format selection buttons
  const formatBtns = document.querySelectorAll('.format-btn');
  formatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      formatBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFormat = btn.dataset.format || 'original';
    });
  });

  // Initialize background & auth
  createParticles();
  initAuth();

  // ---- Auth Functions ----
  async function initAuth() {
    if (authToken) {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          currentUser = data.user;
        } else {
          authToken = null;
          localStorage.removeItem('sc_auth_token');
        }
      } catch (e) {
        console.warn('Auth check failed:', e);
      }
    }
    updateUserUI();
  }

  const changeAvatarBtn = document.getElementById('changeAvatarBtn');
  const avatarFileInput = document.getElementById('avatarFileInput');
  const userInfoClickArea = document.getElementById('userInfoClickArea');

  function updateUserUI() {
    if (currentUser) {
      userGuest.classList.add('hidden');
      userProfile.classList.remove('hidden');

      if (currentUser.avatar) {
        userAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="Avatar">`;
      } else {
        userAvatar.textContent = (currentUser.name || currentUser.username).charAt(0).toUpperCase();
      }

      userName.textContent = currentUser.name || currentUser.username;

      if (currentUser.vip) {
        const planTextMap = { '1m': 'VIP 1T', '2m': 'VIP 2T', '3m': 'VIP 3T' };
        const badgeText = planTextMap[currentUser.vipPlan] || 'VIP';
        userBadge.textContent = badgeText;
        userBadge.className = 'user-badge badge-vip';
      } else {
        const freeLeft = currentUser.remainingFree !== undefined ? currentUser.remainingFree : (2 - (currentUser.freeDownloadsToday || 0));
        userBadge.textContent = `🎁 Còn ${Math.max(0, freeLeft)}/2 lượt hôm nay`;
        userBadge.className = 'user-badge badge-free';
      }
    } else {
      userGuest.classList.remove('hidden');
      userProfile.classList.add('hidden');
    }
  }

  // Click on Avatar or User Info -> Open VIP Subscription Modal!
  if (userAvatar) {
    userAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      openVipModal();
    });
  }

  if (userInfoClickArea) {
    userInfoClickArea.addEventListener('click', () => {
      openVipModal();
    });
  }

  // Change Avatar Image Handler
  if (changeAvatarBtn && avatarFileInput) {
    changeAvatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      avatarFileInput.click();
    });

    avatarFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        alert('Kích thước ảnh đại diện quá lớn (tối đa 2MB).');
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Avatar = event.target.result;
        try {
          const res = await fetch('/api/auth/avatar', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ avatar: base64Avatar })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Không thể đổi ảnh đại diện.');

          currentUser = data.user;
          updateUserUI();
        } catch (err) {
          alert(err.message);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function openAuthModal(tab = 'login') {
    authModal.classList.remove('hidden');
    switchAuthTab(tab);
  }

  function closeAuthModal() {
    authModal.classList.add('hidden');
    loginError.classList.add('hidden');
    regError.classList.add('hidden');
  }

  function switchAuthTab(tab) {
    if (tab === 'login') {
      tabLoginBtn.classList.add('active');
      tabRegisterBtn.classList.remove('active');
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
    } else {
      tabRegisterBtn.classList.add('active');
      tabLoginBtn.classList.remove('active');
      registerForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
    }
  }

  // Auth Event Listeners
  loginOpenBtn.addEventListener('click', () => openAuthModal('login'));
  authModalClose.addEventListener('click', closeAuthModal);
  tabLoginBtn.addEventListener('click', () => switchAuthTab('login'));
  tabRegisterBtn.addEventListener('click', () => switchAuthTab('register'));

  logoutBtn.addEventListener('click', () => {
    currentUser = null;
    authToken = null;
    localStorage.removeItem('sc_auth_token');
    updateUserUI();
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Đăng nhập thất bại.');

      authToken = data.token;
      localStorage.setItem('sc_auth_token', authToken);
      currentUser = data.user;
      updateUserUI();
      closeAuthModal();

      if (pendingDownloadAfterVip) {
        checkVipAndDownload();
      }
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    regError.classList.add('hidden');
    const name = regName.value.trim();
    const username = regUsername.value.trim();
    const password = regPassword.value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Đăng ký thất bại.');

      authToken = data.token;
      localStorage.setItem('sc_auth_token', authToken);
      currentUser = data.user;
      updateUserUI();
      closeAuthModal();

      if (pendingDownloadAfterVip) {
        checkVipAndDownload();
      }
    } catch (err) {
      regError.textContent = err.message;
      regError.classList.remove('hidden');
    }
  });

  // Quick Demo Login (if element exists)
  if (quickDemoBtn) {
    quickDemoBtn.addEventListener('click', async () => {
    const demoUsername = 'demouser';
    const demoPassword = 'password123';

    try {
      // Try login first
      let res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: demoUsername, password: demoPassword })
      });

      if (!res.ok) {
        // If not existing, register demo account
        res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Demo User', username: demoUsername, password: demoPassword })
        });
      }

      const data = await res.json();
      if (res.ok) {
        authToken = data.token;
        localStorage.setItem('sc_auth_token', authToken);
        currentUser = data.user;
        updateUserUI();
        closeAuthModal();

        if (pendingDownloadAfterVip) {
          checkVipAndDownload();
        }
      }
    } catch (e) {
      console.error('Demo login error:', e);
    }
  });
  }

  // ---- VIP Modal & Subscription Logic ----
  function openVipModal() {
    vipModal.classList.remove('hidden');
    updateVipCheckoutBtn();
  }

  function closeVipModal() {
    vipModal.classList.add('hidden');
  }

  function updateVipCheckoutBtn() {
    const info = planPriceMap[selectedVipPlan] || planPriceMap['3m'];
    confirmVipBtn.querySelector('span').textContent = `Kích Hoạt VIP Ngay (${info.price})`;
  }

  planCards.forEach(card => {
    card.addEventListener('click', () => {
      planCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectedVipPlan = card.dataset.plan || '3m';
      updateVipCheckoutBtn();
    });
  });

  vipModalClose.addEventListener('click', closeVipModal);

  confirmVipBtn.addEventListener('click', () => {
    if (!currentUser) {
      closeVipModal();
      openAuthModal('login');
      return;
    }
    closeVipModal();
    openPaymentModal();
  });

  // VietQR Generation & Auto Polling Payment System (PayOS Style)
  const vietqrImg = document.getElementById('vietqrImg');
  const amountVal = document.getElementById('amountVal');
  const memoVal = document.getElementById('memoVal');
  const noteAmountVal = document.getElementById('noteAmountVal');
  const noteMemoVal = document.getElementById('noteMemoVal');
  const copyAmountBtn = document.getElementById('copyAmountBtn');
  const copyMemoBtn = document.getElementById('copyMemoBtn');
  const autoPollingText = document.getElementById('autoPollingText');
  const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');

  // Elements for Payment Success View
  const payosBody = document.querySelector('.payos-body');
  const paymentSuccessBox = document.getElementById('paymentSuccessBox');
  const finishPaymentBtn = document.getElementById('finishPaymentBtn');
  const successTxId = document.getElementById('successTxId');
  const successPlanName = document.getElementById('successPlanName');
  const successAmount = document.getElementById('successAmount');

  function showPaymentSuccessView(info) {
    if (paymentPollingInterval) {
      clearInterval(paymentPollingInterval);
      paymentPollingInterval = null;
    }

    if (payosBody) payosBody.classList.add('hidden');
    if (paymentSuccessBox) paymentSuccessBox.classList.remove('hidden');

    const randId = 'KLB-' + Math.floor(100000 + Math.random() * 900000);
    if (successTxId) successTxId.textContent = randId;
    if (successPlanName) successPlanName.textContent = info ? info.title : 'Gói VIP';
    if (successAmount) successAmount.textContent = info ? info.priceStr : '59,000 vnđ';
  }

  function resetPaymentModalViews() {
    if (payosBody) payosBody.classList.remove('hidden');
    if (paymentSuccessBox) paymentSuccessBox.classList.add('hidden');
  }

  if (finishPaymentBtn) {
    finishPaymentBtn.addEventListener('click', () => {
      closePaymentModal();
      if (currentUrl) {
        executeTrackDownload();
      }
    });
  }

  let currentOrderCode = null;

  async function openPaymentModal() {
    resetPaymentModalViews();

    const planMap = {
      '1m': { amount: 29000, priceStr: '29,000 vnđ', title: 'VIP 1 Tháng' },
      '2m': { amount: 39000, priceStr: '39,000 vnđ', title: 'VIP 2 Tháng' },
      '3m': { amount: 59000, priceStr: '59,000 vnđ', title: 'VIP 3 Tháng' }
    };

    const info = planMap[selectedVipPlan] || planMap['3m'];
    const uname = (currentUser ? currentUser.username : 'GUEST').toUpperCase().replace(/[^A-Z0-9]/g, '');
    currentPaymentMemo = `NAP VIP${selectedVipPlan.toUpperCase()} ${uname}`;

    if (paymentPlanInfo) paymentPlanInfo.textContent = `${info.title} - ${info.priceStr}`;
    if (amountVal) amountVal.textContent = info.priceStr;
    if (memoVal) memoVal.textContent = currentPaymentMemo;
    if (noteAmountVal) noteAmountVal.textContent = info.priceStr.replace(' vnđ', '');
    if (noteMemoVal) noteMemoVal.textContent = currentPaymentMemo;

    if (copyAmountBtn) copyAmountBtn.dataset.copy = info.amount.toString();
    if (copyMemoBtn) copyMemoBtn.dataset.copy = currentPaymentMemo;

    if (autoPollingText) {
      autoPollingText.textContent = '🔄 Tự động kiểm tra chuyển khoản từ KienlongBank...';
    }

    // Default VietQR fallback image
    const bankId = 'KLB';
    const accountNo = '6909092005';
    const accountName = 'VU VAN QUYEN';
    let qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${info.amount}&addInfo=${encodeURIComponent(currentPaymentMemo)}&accountName=${encodeURIComponent(accountName)}`;

    // Call server to create real PayOS order link
    try {
      const orderRes = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ plan: selectedVipPlan })
      });
      const orderData = await orderRes.json();
      if (orderData.success) {
        currentOrderCode = orderData.orderCode;
        if (orderData.qrCode) {
          qrUrl = orderData.qrCode;
        }
      }
    } catch (e) {
      console.warn('PayOS order creation warning:', e);
    }

    if (vietqrImg) {
      vietqrImg.src = qrUrl;
    }

    paymentModal.classList.remove('hidden');

    // Start 24/7 Automatic Bank Transfer Status Polling (Every 2.5 seconds)
    if (paymentPollingInterval) clearInterval(paymentPollingInterval);

    paymentPollingInterval = setInterval(async () => {
      try {
        const pollUrl = `/api/payment/check-status?memo=${encodeURIComponent(currentPaymentMemo)}` + (currentOrderCode ? `&orderCode=${currentOrderCode}` : '');
        const res = await fetch(pollUrl, {
          headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
        });
        const data = await res.json();

        if (data.status === 'SUCCESS') {
          if (data.user) {
            currentUser = data.user;
            updateUserUI();
          }

          showPaymentSuccessView(info);
        }
      } catch (err) {
        console.warn('Auto polling check warning:', err);
      }
    }, 2500);
  }

  // Copy buttons handler for both .btn-copy and .btn-payos-copy
  document.querySelectorAll('.btn-copy, .btn-payos-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const textToCopy = btn.dataset.copy;
      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          btn.classList.add('copied');
          const origHtml = btn.innerHTML;
          btn.innerHTML = '✓ Đã chép';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = origHtml;
          }, 1500);
        }).catch(err => {
          console.error('Failed to copy:', err);
        });
      }
    });
  });

  function closePaymentModal() {
    if (paymentPollingInterval) {
      clearInterval(paymentPollingInterval);
      paymentPollingInterval = null;
    }
    paymentModal.classList.add('hidden');
    resetPaymentModalViews();
  }

  paymentModalClose.addEventListener('click', closePaymentModal);
  if (cancelPaymentBtn) cancelPaymentBtn.addEventListener('click', closePaymentModal);

  simulatePayBtn.addEventListener('click', async () => {
    if (!authToken) {
      closePaymentModal();
      openAuthModal('login');
      return;
    }

    try {
      simulatePayBtn.disabled = true;
      const res = await fetch('/api/payment/simulate-auto-paid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ memo: currentPaymentMemo })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Nâng cấp thất bại.');

      if (data.user) {
        currentUser = data.user;
        updateUserUI();
      }

      const planMap = {
        '1m': { amount: 29000, priceStr: '29,000 vnđ', title: 'VIP 1 Tháng' },
        '2m': { amount: 39000, priceStr: '39,000 vnđ', title: 'VIP 2 Tháng' },
        '3m': { amount: 59000, priceStr: '59,000 vnđ', title: 'VIP 3 Tháng' }
      };
      const info = planMap[selectedVipPlan] || planMap['3m'];
      showPaymentSuccessView(info);

    } catch (err) {
      alert(err.message);
    } finally {
      simulatePayBtn.disabled = false;
    }
  });

  // ---- Main Search & Download Event Listeners ----

  urlInput.addEventListener('input', () => {
    clearBtn.classList.toggle('hidden', !urlInput.value);
  });

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearBtn.classList.add('hidden');
    hideError();
    resultSection.classList.add('hidden');
    urlInput.focus();
  });

  urlInput.addEventListener('paste', (e) => {
    setTimeout(() => {
      const val = urlInput.value.trim();
      if (val && isValidSoundCloudUrl(val)) {
        fetchTrackInfo();
      }
    }, 100);
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchTrackInfo();
    }
  });

  fetchBtn.addEventListener('click', fetchTrackInfo);

  // Trigger Download button click: Check auth & VIP status first!
  downloadBtn.addEventListener('click', () => {
    pendingDownloadAfterVip = true;
    checkVipAndDownload();
  });

  async function checkVipAndDownload() {
    if (!currentUser) {
      openAuthModal('login');
      return;
    }

    if (currentUser.vip) {
      // User is VIP -> Execute download directly!
      executeTrackDownload();
      return;
    }

    // Non-VIP user: try consuming 1 free daily download
    try {
      setButtonLoading(downloadBtn, true);
      hideError();

      const res = await fetch('/api/auth/use-free-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.needVip) {
          // Used up 2 free downloads today -> Open VIP Modal!
          if (data.user) {
            currentUser = data.user;
            updateUserUI();
          }
          openVipModal();
          return;
        }
        throw new Error(data.error || 'Lỗi kiểm tra lượt tải.');
      }

      // Success! Update remaining free downloads count in user UI
      if (data.user) {
        currentUser = data.user;
        updateUserUI();
      }

      // Execute actual file download!
      executeTrackDownload();

    } catch (err) {
      showError(err.message);
    } finally {
      setButtonLoading(downloadBtn, false);
    }
  }

  // ---- Functions ----

  function isValidSoundCloudUrl(url) {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === 'soundcloud.com' ||
        parsed.hostname === 'www.soundcloud.com' ||
        parsed.hostname === 'm.soundcloud.com' ||
        parsed.hostname === 'on.soundcloud.com'
      );
    } catch {
      return false;
    }
  }

  function showError(message) {
    errorText.textContent = message;
    errorMsg.classList.remove('hidden');
    errorMsg.style.animation = 'none';
    errorMsg.offsetHeight;
    errorMsg.style.animation = '';
  }

  function hideError() {
    errorMsg.classList.add('hidden');
  }

  function setButtonLoading(btn, loading) {
    const content = btn.querySelector('.btn-content');
    const loader = btn.querySelector('.btn-loader');

    if (loading) {
      content.classList.add('hidden');
      loader.classList.remove('hidden');
      btn.disabled = true;
    } else {
      content.classList.remove('hidden');
      loader.classList.add('hidden');
      btn.disabled = false;
    }
  }

  function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatFileSize(bytes) {
    if (!bytes) return null;
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    const kb = bytes / 1024;
    return `${kb.toFixed(0)} KB`;
  }

  function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  }

  // Fetch track info (works 100% free for all users!)
  async function fetchTrackInfo() {
    const url = urlInput.value.trim();

    if (!url) {
      showError('Vui lòng nhập link SoundCloud.');
      return;
    }

    if (!isValidSoundCloudUrl(url)) {
      showError('Link không hợp lệ. Vui lòng nhập đúng link SoundCloud (ví dụ: https://soundcloud.com/artist/track)');
      return;
    }

    hideError();
    resultSection.classList.add('hidden');
    setButtonLoading(fetchBtn, true);

    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Lỗi không xác định');
      }

      currentUrl = url;
      currentTrackInfo = {
        title: data.title || 'Unknown',
        artist: data.artist || 'Unknown',
        ext: data.format ? data.format.ext : 'mp3'
      };

      if (data.thumbnail) {
        trackThumbnail.src = data.thumbnail;
        trackThumbnail.alt = data.title;
      } else {
        trackThumbnail.src = 'data:image/svg+xml,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140" fill="none">
            <rect width="140" height="140" fill="#1a1a3a"/>
            <circle cx="70" cy="70" r="30" stroke="#ff6a00" stroke-width="2" fill="none"/>
            <path d="M62 58v24l20-12-20-12z" fill="#ff6a00"/>
          </svg>
        `);
      }

      trackTitle.textContent = data.title;
      trackArtist.textContent = data.artist;
      trackDuration.textContent = formatDuration(data.duration);

      const qualityBadge = document.getElementById('qualityBadge');
      const qualityText = document.getElementById('qualityText');
      const qualityIcon = document.getElementById('qualityIcon');

      if (data.format) {
        const codec = data.format.acodec !== 'unknown' ? data.format.acodec.toUpperCase() : data.format.ext.toUpperCase();
        const abr = data.format.abr || 0;
        const ext = (data.format.ext || '').toLowerCase();
        trackFormat.textContent = `${codec} • ${abr}kbps`;

        const size = formatFileSize(data.format.filesize);
        if (size) {
          trackSize.textContent = size;
          trackSizeMeta.classList.remove('hidden');
        } else {
          trackSizeMeta.classList.add('hidden');
        }

        const losslessFormats = ['wav', 'flac', 'aiff', 'alac'];
        const isLossless = losslessFormats.includes(ext) || losslessFormats.includes(codec.toLowerCase());

        qualityBadge.classList.remove('quality-high', 'quality-lossless', 'quality-low');

        if (isLossless) {
          qualityBadge.classList.add('quality-lossless');
          qualityText.textContent = `Lossless • ${codec}`;
          qualityIcon.innerHTML = '<path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>';
        } else if (abr >= 256) {
          qualityBadge.classList.add('quality-high');
          qualityText.textContent = `Chất lượng cao • ${abr}kbps`;
          qualityIcon.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>';
        } else {
          qualityBadge.classList.add('quality-low');
          qualityText.textContent = `Chất lượng gốc • ${abr}kbps (thấp)`;
          qualityIcon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
        }
      } else {
        trackFormat.textContent = 'MP3';
        trackSizeMeta.classList.add('hidden');
        qualityBadge.classList.remove('quality-high', 'quality-lossless', 'quality-low');
        qualityBadge.classList.add('quality-low');
        qualityText.textContent = 'Không rõ chất lượng';
        qualityIcon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
      }

      if (data.view_count) {
        trackViews.textContent = `${formatNumber(data.view_count)} lượt nghe`;
        trackViewsMeta.classList.remove('hidden');
      } else {
        trackViewsMeta.classList.add('hidden');
      }

      resultSection.classList.remove('hidden');

      setTimeout(() => {
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);

    } catch (error) {
      showError(error.message);
    } finally {
      setButtonLoading(fetchBtn, false);
    }
  }

  // Actual Download Execution
  async function executeTrackDownload() {
    if (!currentUrl) return;

    setButtonLoading(downloadBtn, true);
    hideError();

    try {
      const prepareResponse = await fetch('/api/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: currentUrl, format: selectedFormat })
      });

      const prepareData = await prepareResponse.json();

      if (!prepareResponse.ok) {
        throw new Error(prepareData.error || 'Không thể tải bài hát.');
      }

      const a = document.createElement('a');
      a.href = `/api/serve/${prepareData.token}`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      downloadBtn.classList.add('download-success');
      setTimeout(() => downloadBtn.classList.remove('download-success'), 600);

    } catch (error) {
      showError(error.message);
    } finally {
      setButtonLoading(downloadBtn, false);
      pendingDownloadAfterVip = false;
    }
  }

  // Create floating particles
  function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    const count = 20;

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';

      const size = Math.random() * 4 + 1;
      const left = Math.random() * 100;
      const duration = Math.random() * 15 + 10;
      const delay = Math.random() * 15;

      particle.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${left}%;
        animation-duration: ${duration}s;
        animation-delay: ${delay}s;
      `;

      container.appendChild(particle);
    }
  }
});

