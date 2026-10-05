/* ==========================================================================
   LinkHub - URL 단축기 JavaScript
   TinyURL API 기반 URL 단축 · 복사 · 기록 관리
   ========================================================================== */

(function () {
  'use strict';

  /* ── DOM References ── */
  const urlInput        = document.getElementById('url-input');
  const clearBtn        = document.getElementById('clear-btn');
  const shortenBtn      = document.getElementById('shorten-btn');
  const loadingRow      = document.getElementById('loading-row');
  const outputRow       = document.getElementById('output-row');
  const outputInput     = document.getElementById('output-input');
  const openLinkBtn     = document.getElementById('open-link-btn');
  const copyBtn         = document.getElementById('copy-btn');
  const errorRow        = document.getElementById('error-row');
  const errorMsg        = document.getElementById('error-msg');
  const samplePills     = document.querySelectorAll('.sample-pill');
  const toastContainer  = document.getElementById('toast-container');
  const historySection  = document.getElementById('history-section');
  const historyList     = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const mouseGlow       = document.getElementById('mouse-glow');

  /* ── State ── */
  const HISTORY_KEY = 'linkhub_url_history';
  let history = loadHistory();

  /* ── Mouse Interactive Glow ── */
  document.addEventListener('mousemove', (e) => {
    if (mouseGlow) {
      mouseGlow.style.left = e.clientX + 'px';
      mouseGlow.style.top  = e.clientY + 'px';
    }
  });

  /* ── Input Handlers ── */
  urlInput.addEventListener('input', onInputChange);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !shortenBtn.disabled) shortenUrl();
  });

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    onInputChange();
    urlInput.focus();
  });

  function onInputChange() {
    const val = urlInput.value.trim();
    const isEmpty = val.length === 0;

    // Clear button visibility
    if (isEmpty) {
      clearBtn.classList.add('hidden');
    } else {
      clearBtn.classList.remove('hidden');
    }

    // Shorten button state
    shortenBtn.disabled = isEmpty;

    // Hide output/error when input changes
    if (!isEmpty) {
      hideError();
    }
  }

  /* ── Sample Pills ── */
  samplePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      urlInput.value = pill.dataset.url;
      onInputChange();
      urlInput.focus();
    });
  });

  /* ── Shorten Button ── */
  shortenBtn.addEventListener('click', shortenUrl);

  async function shortenUrl() {
    const originalUrl = urlInput.value.trim();
    if (!originalUrl) return;

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(originalUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('invalid protocol');
    } catch {
      showError('올바른 URL 형식이 아닙니다. https://... 형태로 입력해 주세요.');
      return;
    }

    // UI: loading state
    hideError();
    hideOutput();
    showLoading(true);
    shortenBtn.disabled = true;

    try {
      const shortUrl = await callShortenApi(originalUrl);
      showOutput(shortUrl, originalUrl);
      saveHistory(shortUrl, originalUrl);
      renderHistory();
    } catch (err) {
      showError(err.message || 'URL 단축 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      showLoading(false);
      shortenBtn.disabled = urlInput.value.trim().length === 0;
    }
  }

  /* ── URL Shortener API (6개 외부 서비스 + 로컬 폴백) ── */
  async function callShortenApi(longUrl) {

    const attempts = [
      // ① cleanuri.com — POST, JSON, CORS 공식 지원
      async () => {
        const body = new URLSearchParams({ url: longUrl });
        const res = await fetch('https://cleanuri.com/api/v1/shorten', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`cleanuri HTTP ${res.status}`);
        const data = await res.json();
        if (!data.result_url) throw new Error(`cleanuri: ${JSON.stringify(data)}`);
        return data.result_url;
      },

      // ② spoo.me — POST, JSON, CORS 지원
      async () => {
        const body = new URLSearchParams({ url: longUrl });
        const res = await fetch('https://spoo.me/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: body.toString(),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`spoo.me HTTP ${res.status}`);
        const data = await res.json();
        if (!data.short_url) throw new Error(`spoo.me: ${JSON.stringify(data)}`);
        return data.short_url;
      },

      // ③ shrtco.de — GET, JSON
      async () => {
        const params = new URLSearchParams({ url: longUrl });
        const res = await fetch(`https://api.shrtco.de/v2/shorten?${params}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`shrtco.de HTTP ${res.status}`);
        const data = await res.json();
        if (!data.ok) throw new Error(`shrtco.de: ${data.error || 'error'}`);
        return data.result.full_short_link;
      },

      // ④ is.gd — GET, CORS 공식 지원
      async () => {
        const params = new URLSearchParams({ format: 'simple', url: longUrl });
        const res = await fetch(`https://is.gd/create.php?${params}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`is.gd HTTP ${res.status}`);
        const text = await res.text();
        if (!text.startsWith('http')) throw new Error(`is.gd: ${text.slice(0, 80)}`);
        return text.trim();
      },

      // ⑤ v.gd — GET, is.gd 자매 서비스
      async () => {
        const params = new URLSearchParams({ format: 'simple', url: longUrl });
        const res = await fetch(`https://v.gd/create.php?${params}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`v.gd HTTP ${res.status}`);
        const text = await res.text();
        if (!text.startsWith('http')) throw new Error(`v.gd: ${text.slice(0, 80)}`);
        return text.trim();
      },

      // ⑥ da.gd — GET, 단순 텍스트 응답
      async () => {
        const params = new URLSearchParams({ url: longUrl });
        const res = await fetch(`https://da.gd/shorten?${params}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`da.gd HTTP ${res.status}`);
        const text = await res.text();
        if (!text.startsWith('http')) throw new Error(`da.gd: ${text.slice(0, 80)}`);
        return text.trim();
      },
    ];

    // 외부 API 모두 시도
    for (const attempt of attempts) {
      try {
        return await attempt();
      } catch (err) {
        console.warn('[LinkHub] 단축 시도 실패 →', err.message);
      }
    }

    // ⑦ 최후 수단: 로컬 단축 (외부 서비스 불필요, 같은 브라우저에서만 작동)
    console.info('[LinkHub] 외부 API 전부 실패 → 로컬 단축 모드로 전환');
    return makeLocalShortUrl(longUrl);
  }

  /* ── 로컬 단축 URL 생성 (localStorage 기반) ── */
  const LOCAL_MAP_KEY = 'linkhub_local_map';

  function makeLocalShortUrl(longUrl) {
    const map = JSON.parse(localStorage.getItem(LOCAL_MAP_KEY) || '{}');

    // 이미 단축된 URL이 있으면 재사용
    const existing = Object.entries(map).find(([, v]) => v === longUrl);
    if (existing) {
      return buildLocalUrl(existing[0]);
    }

    // 새 6자리 코드 생성
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    map[code] = longUrl;
    localStorage.setItem(LOCAL_MAP_KEY, JSON.stringify(map));
    return buildLocalUrl(code);
  }

  function buildLocalUrl(code) {
    // r.html?c=XXXXXX 형태의 로컬 리다이렉트 URL
    const base = location.href.replace(/\/[^/]*$/, '/');
    return `${base}r.html?c=${code}`;
  }


  /* ── UI State Helpers ── */
  function showLoading(show) {
    if (show) {
      loadingRow.classList.remove('hidden');
    } else {
      loadingRow.classList.add('hidden');
    }
  }

  function showOutput(shortUrl, originalUrl) {
    outputInput.value = shortUrl;
    openLinkBtn.href = shortUrl;
    outputRow.classList.remove('hidden');
    // Reset copy button
    copyBtn.classList.remove('copied');
    copyBtn.querySelector('span').textContent = '복사';

    // 로컬 단축 URL인 경우 레이블 안내 변경
    const label = outputRow.querySelector('.output-label');
    if (shortUrl.includes('r.html?c=')) {
      label.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        로컬 링크 (이 브라우저에서만 작동)`;
      label.style.color = '#D97706';
    } else {
      label.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        단축된 URL`;
      label.style.color = '';
    }
  }

  function hideOutput() {
    outputRow.classList.add('hidden');
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorRow.classList.remove('hidden');
  }

  function hideError() {
    errorRow.classList.add('hidden');
  }

  /* ── Copy Button ── */
  copyBtn.addEventListener('click', async () => {
    const text = outputInput.value;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      // Visual feedback on button
      copyBtn.classList.add('copied');
      copyBtn.querySelector('span').textContent = '복사됨!';

      // Toast notification
      showToast('복사하였습니다 ✓', 'success');

      // Reset button after 2.5s
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.querySelector('span').textContent = '복사';
      }, 2500);
    } catch {
      // Fallback for older browsers
      try {
        outputInput.select();
        document.execCommand('copy');
        showToast('복사하였습니다 ✓', 'success');
      } catch {
        showToast('복사에 실패했습니다. 직접 복사해 주세요.', 'error');
      }
    }
  });

  /* ── Toast ── */
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success'
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    toast.innerHTML = `${icon}<span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('exiting');
      setTimeout(() => toast.remove(), 320);
    }, 2200);
  }

  /* ── History ── */
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveHistory(shortUrl, originalUrl) {
    // Keep max 10 entries, no duplicates
    history = history.filter((h) => h.shortUrl !== shortUrl);
    history.unshift({ shortUrl, originalUrl, createdAt: Date.now() });
    if (history.length > 10) history = history.slice(0, 10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function renderHistory() {
    if (history.length === 0) {
      historySection.classList.add('hidden');
      return;
    }
    historySection.classList.remove('hidden');
    historyList.innerHTML = '';

    history.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
        <span class="history-short">${escapeHtml(item.shortUrl)}</span>
        <span class="history-original" title="${escapeHtml(item.originalUrl)}">${escapeHtml(item.originalUrl)}</span>
        <button type="button" class="history-copy-btn" aria-label="복사" title="복사">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      `;
      const btn = li.querySelector('.history-copy-btn');
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(item.shortUrl);
          showToast('복사하였습니다 ✓', 'success');
        } catch {
          showToast('복사에 실패했습니다.', 'error');
        }
      });
      historyList.appendChild(li);
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    history = [];
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });

  function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(str).replace(/[&<>"']/g, (m) => map[m]);
  }

  /* ── Init ── */
  renderHistory();
  urlInput.focus();

})();
