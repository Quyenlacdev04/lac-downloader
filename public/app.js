// ==========================================
// SoundCloud Downloader - Frontend Logic
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

  // Entry Vector Logo Splash Auto-Dismiss
  const entrySplash = document.getElementById('entrySplash');
  if (entrySplash) {
    setTimeout(() => {
      entrySplash.classList.add('fade-out');
      setTimeout(() => {
        entrySplash.style.display = 'none';
      }, 500);
    }, 2400);
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

  // Platform Tab Elements & State
  const platformTabs = document.querySelectorAll('.platform-tab');
  let currentPlatform = 'soundcloud';

  platformTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      platformTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentPlatform = tab.dataset.platform || 'soundcloud';

      if (currentPlatform === 'soundcloud') {
        urlInput.placeholder = 'Dán link SoundCloud vào đây (ví dụ: https://soundcloud.com/artist/track)...';
      } else {
        urlInput.placeholder = 'Dán link YouTube vào đây (ví dụ: https://www.youtube.com/watch?v=...)...';
      }

      hideError();
    });
  });

  // State Variables
  let currentUrl = '';
  let currentTrackInfo = null;
  let selectedFormat = 'mp3';
  let currentUser = null;
  let authToken = localStorage.getItem('sc_auth_token') || null;

  // Format selection buttons
  const formatBtns = document.querySelectorAll('.format-btn');
  formatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      formatBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFormat = btn.dataset.format || 'mp3';
    });
  });

  // Initialize background & auth
  createParticles();
  initAuth();

  // ---- Auth Functions (Permanent Session Storage) ----
  async function initAuth() {
    // 1. Instantly load cached user profile from localStorage
    const cachedUserData = localStorage.getItem('sc_user_data');
    if (cachedUserData) {
      try {
        currentUser = JSON.parse(cachedUserData);
        updateUserUI();
      } catch (e) {
        console.warn('Failed to parse cached user data:', e);
      }
    }

    // 2. Refresh user state from server
    if (authToken) {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          currentUser = data.user;
          localStorage.setItem('sc_user_data', JSON.stringify(currentUser));
        } else if (res.status === 401) {
          // Only clear if server explicitly says token is invalid
          authToken = null;
          currentUser = null;
          localStorage.removeItem('sc_auth_token');
          localStorage.removeItem('sc_user_data');
        }
      } catch (e) {
        console.warn('Auth network check offline/delayed:', e);
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

      if (userBadge) {
        userBadge.textContent = 'THÀNH VIÊN';
        userBadge.className = 'user-badge badge-vip';
      }
    } else {
      userGuest.classList.remove('hidden');
      userProfile.classList.add('hidden');
    }
  }

  // Avatar & Profile click -> Change Avatar
  if (avatarFileInput) {
    if (userAvatar) {
      userAvatar.addEventListener('click', (e) => {
        e.stopPropagation();
        avatarFileInput.click();
      });
    }
    if (userInfoClickArea) {
      userInfoClickArea.addEventListener('click', () => {
        avatarFileInput.click();
      });
    }
    if (changeAvatarBtn) {
      changeAvatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        avatarFileInput.click();
      });
    }

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
    localStorage.removeItem('sc_user_data');
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
      currentUser = data.user;
      localStorage.setItem('sc_auth_token', authToken);
      localStorage.setItem('sc_user_data', JSON.stringify(currentUser));
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
      currentUser = data.user;
      localStorage.setItem('sc_auth_token', authToken);
      localStorage.setItem('sc_user_data', JSON.stringify(currentUser));
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

  // ---- Copy Text Helper ----
  document.querySelectorAll('.btn-copy').forEach(btn => {
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
      if (val && isValidMediaUrl(val)) {
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

  // Trigger Download button click: Download directly for everyone!
  downloadBtn.addEventListener('click', () => {
    executeTrackDownload();
  });

  // ---- Functions ----

  function isValidMediaUrl(url) {
    if (!url || typeof url !== 'string') return false;
    let u = url.trim();
    if (!u) return false;
    if (!/^https?:\/\//i.test(u)) {
      u = 'https://' + u;
    }
    try {
      const parsed = new URL(u);
      const host = parsed.hostname.toLowerCase();

      if (currentPlatform === 'soundcloud') {
        return (
          host === 'soundcloud.com' ||
          host.endsWith('.soundcloud.com') ||
          host === 'snd.sc' ||
          host.includes('soundcloud')
        );
      } else {
        return (
          host === 'youtube.com' ||
          host.endsWith('.youtube.com') ||
          host === 'youtu.be' ||
          host.includes('youtube')
        );
      }
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

  // Fetch track/video info (works 100% free for all users!)
  async function fetchTrackInfo() {
    const url = urlInput.value.trim();

    if (!url) {
      showError(currentPlatform === 'soundcloud' ? 'Vui lòng nhập link SoundCloud.' : 'Vui lòng nhập link YouTube.');
      return;
    }

    if (!isValidMediaUrl(url)) {
      if (currentPlatform === 'soundcloud') {
        showError('Link không hợp lệ. Vui lòng dán link SoundCloud (ví dụ: https://soundcloud.com/artist/track)');
      } else {
        showError('Link không hợp lệ. Vui lòng dán link YouTube (ví dụ: https://www.youtube.com/watch?v=...)');
      }
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

  // Actual Download Execution (INSTANT 0-SECOND DIRECT DOWNLOAD)
  function executeTrackDownload() {
    if (!currentUrl) return;

    hideError();

    // Instant UI visual response (0s wait time!)
    downloadBtn.classList.add('download-success');
    const content = downloadBtn.querySelector('.btn-content');
    const originalText = content ? content.innerHTML : '';
    if (content) {
      content.innerHTML = '⚡ Đang tải về ngay...';
    }

    // Trigger instant browser download bar immediately (0.01s!)
    const directUrl = `/api/download-direct?url=${encodeURIComponent(currentUrl)}&format=${encodeURIComponent(selectedFormat)}`;
    const a = document.createElement('a');
    a.href = directUrl;
    a.download = '';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      downloadBtn.classList.remove('download-success');
      if (content && originalText) {
        content.innerHTML = originalText;
      }
    }, 1500);
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

