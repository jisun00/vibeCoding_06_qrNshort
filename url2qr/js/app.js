/**
 * URL2QR - Application Logic
 * Fast, elegant QR Code generator with fluid state transitions,
 * instant JPG download, and dynamic mouse-reactive aurora gradient
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const body = document.body;
  const qrForm = document.getElementById('qr-form');
  const urlInput = document.getElementById('url-input');
  const clearInputBtn = document.getElementById('clear-input-btn');
  const submitBtn = document.getElementById('submit-btn');
  const resetModeBtn = document.getElementById('reset-mode-btn');
  const logoBtn = document.getElementById('logo-btn');
  
  const qrcodeContainer = document.getElementById('qrcode');
  const qrCard = document.getElementById('qr-card');
  const targetUrlDisplay = document.getElementById('target-url-display');
  const downloadJpgBtn = document.getElementById('download-jpg-btn');
  const copyUrlBtn = document.getElementById('copy-url-btn');
  const samplePills = document.querySelectorAll('.sample-pill');
  const toastContainer = document.getElementById('toast-container');

  let qrCodeInstance = null;
  let currentNormalizedUrl = '';

  // Focus input automatically on load
  setTimeout(() => {
    urlInput.focus();
  }, 300);

  // ==========================================================================
  // Dynamic Mouse-Reactive Aurora Gradient Engine
  // ==========================================================================
  function initInteractiveGradient() {
    const rootStyle = document.documentElement.style;
    
    // Position targets & current states for smooth interpolation (Lerp)
    let currentX = 50;
    let currentY = 40;
    let targetX = 50;
    let targetY = 40;

    // Color targets (Hue in degrees)
    // 46: Logo Warm Yellow, 26: Coral Peach Amber, 64: Golden Lemon
    let currentHue = 46;
    let targetHue = 46;

    let isMouseActive = false;
    let lastMouseMoveTime = Date.now();

    // Track mouse pointer
    window.addEventListener('pointermove', (e) => {
      isMouseActive = true;
      lastMouseMoveTime = Date.now();

      const normX = e.clientX / window.innerWidth;
      const normY = e.clientY / window.innerHeight;

      // Mouse position mapped to percentage
      targetX = normX * 100;
      targetY = normY * 100;

      // Map X position to dynamic color hue:
      // Left side -> Fresh Honey Lime / Golden Lemon (~62°)
      // Center    -> Signature Warm Yellow (~46°)
      // Right side -> Sunset Peach / Coral Amber (~26°)
      targetHue = 46 + (0.5 - normX) * 36;
    });

    // Touch support for mobile / tablet
    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        const touch = e.touches[0];
        const normX = touch.clientX / window.innerWidth;
        const normY = touch.clientY / window.innerHeight;
        targetX = normX * 100;
        targetY = normY * 100;
        targetHue = 46 + (0.5 - normX) * 36;
      }
    }, { passive: true });

    // Smooth animation tick
    let time = 0;
    function renderGradient() {
      time += 0.015;

      // Natural idle breathing wave when mouse is static
      const now = Date.now();
      if (!isMouseActive || now - lastMouseMoveTime > 3000) {
        const idleOffsetX = Math.sin(time * 0.8) * 12;
        const idleOffsetY = Math.cos(time * 0.6) * 10;
        const idleHueOffset = Math.sin(time * 0.5) * 8;

        targetX = 50 + idleOffsetX;
        targetY = 40 + idleOffsetY;
        targetHue = 46 + idleHueOffset;
      }

      // Smooth interpolation (Butter-like lerp damping)
      const ease = 0.07;
      currentX += (targetX - currentX) * ease;
      currentY += (targetY - currentY) * ease;
      currentHue += (targetHue - currentHue) * ease;

      // Compute companion harmonic hues
      const hueSec = currentHue - 18; // Warm Peach/Coral
      const hueTer = currentHue + 14; // Soft Honey Glow

      // Apply to CSS variables
      rootStyle.setProperty('--mouse-x', `${currentX.toFixed(2)}%`);
      rootStyle.setProperty('--mouse-y', `${currentY.toFixed(2)}%`);
      rootStyle.setProperty('--dynamic-hue', currentHue.toFixed(1));
      rootStyle.setProperty('--dynamic-hue-sec', hueSec.toFixed(1));
      rootStyle.setProperty('--dynamic-hue-ter', hueTer.toFixed(1));

      requestAnimationFrame(renderGradient);
    }

    renderGradient();
  }

  // Initialize gradient engine
  initInteractiveGradient();

  // ==========================================================================
  // URL Helpers & QR Logic
  // ==========================================================================

  // Normalize URL helper (adds https:// if missing)
  function normalizeUrl(input) {
    let url = input.trim();
    if (!url) return '';
    if (!/^[a-zA-Z]+:\/\//i.test(url) && !/^(mailto|tel):/i.test(url)) {
      url = 'https://' + url;
    }
    return url;
  }

  // Format filename for JPG download
  function generateFileName(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/[^a-zA-Z0-9]/g, '_');
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      return `QR_${host}_${dateStr}.jpg`;
    } catch {
      return `QR_Code_${Date.now()}.jpg`;
    }
  }

  // Toast Notification System
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast';

    const iconHtml = type === 'success'
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    toast.innerHTML = `
      <div class="toast-icon">${iconHtml}</div>
      <div class="toast-message">${message}</div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => {
        toast.remove();
      }, 350);
    }, 3000);
  }

  // Render QR Code using qrcode.js
  function renderQRCode(url) {
    qrcodeContainer.innerHTML = '';
    
    // Create new QRCode instance with High correction level
    qrCodeInstance = new QRCode(qrcodeContainer, {
      text: url,
      width: 256,
      height: 256,
      colorDark: '#111827',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.H
    });

    currentNormalizedUrl = url;
    targetUrlDisplay.textContent = url;
    targetUrlDisplay.title = url;
  }

  // State Transition: Move Input to Bottom & Reveal QR in Center
  function transitionToGenerated(url) {
    renderQRCode(url);

    // Switch body state class
    body.classList.remove('state-initial');
    body.classList.add('state-generated');

    // Trigger subtle click ripple effect on submit
    submitBtn.classList.add('pulse');
    setTimeout(() => submitBtn.classList.remove('pulse'), 400);
  }

  // State Transition: Back to Initial Center View
  function transitionToInitial() {
    body.classList.remove('state-generated');
    body.classList.add('state-initial');
    urlInput.focus();
    urlInput.select();
  }

  // Convert QR Canvas/Image to High-Resolution JPG and Download
  function downloadQRCodeAsJPG() {
    if (!currentNormalizedUrl) {
      showToast('생성된 QR 코드가 없습니다.', 'error');
      return;
    }

    // Look for canvas rendered by qrcode.js
    const sourceCanvas = qrcodeContainer.querySelector('canvas');
    const sourceImg = qrcodeContainer.querySelector('img');

    if (!sourceCanvas && !sourceImg) {
      showToast('QR 코드를 준비 중입니다. 잠시 후 다시 시도해주세요.', 'error');
      return;
    }

    // High resolution canvas setup (1024x1024)
    const exportSize = 1024;
    const quietZone = 96; // Margin padding in pixels
    const qrSize = exportSize - (quietZone * 2);

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = exportSize;
    offscreenCanvas.height = exportSize;
    const ctx = offscreenCanvas.getContext('2d');

    // Essential for JPG: Fill solid pure white background (JPG lacks alpha channel)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, exportSize, exportSize);

    // Turn off smoothing for crisp, razor-sharp QR blocks
    ctx.imageSmoothingEnabled = false;

    const executeDownload = (drawable) => {
      // Draw QR centered with quiet zone margin
      ctx.drawImage(drawable, quietZone, quietZone, qrSize, qrSize);

      // Convert to JPG data URL with maximum quality
      const jpgDataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.98);

      // Trigger automatic download
      const downloadLink = document.createElement('a');
      downloadLink.download = generateFileName(currentNormalizedUrl);
      downloadLink.href = jpgDataUrl;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      showToast('고해상도 JPG 파일이 다운로드되었습니다! 🎉');
    };

    if (sourceCanvas) {
      executeDownload(sourceCanvas);
    } else if (sourceImg && sourceImg.src) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => executeDownload(img);
      img.src = sourceImg.src;
    }
  }

  // Handle Form Submission
  function handleSubmit() {
    const rawVal = urlInput.value.trim();
    if (!rawVal) {
      showToast('변환할 URL 주소를 입력해주세요.', 'error');
      urlInput.focus();
      return;
    }

    const normalized = normalizeUrl(rawVal);
    urlInput.value = normalized;
    toggleClearButton();
    transitionToGenerated(normalized);
  }

  // Toggle clear button visibility
  function toggleClearButton() {
    if (urlInput.value.trim().length > 0) {
      clearInputBtn.classList.remove('hidden');
    } else {
      clearInputBtn.classList.add('hidden');
    }
  }

  // Event Listeners
  qrForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSubmit();
  });

  submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleSubmit();
  });

  urlInput.addEventListener('input', () => {
    toggleClearButton();
  });

  clearInputBtn.addEventListener('click', () => {
    urlInput.value = '';
    toggleClearButton();
    urlInput.focus();
  });

  // Click QR Code to download JPG
  qrCard.addEventListener('click', () => {
    downloadQRCodeAsJPG();
  });

  // Keyboard accessibility for QR Card
  qrCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      downloadQRCodeAsJPG();
    }
  });

  // Action Buttons
  downloadJpgBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadQRCodeAsJPG();
  });

  copyUrlBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentNormalizedUrl) {
      navigator.clipboard.writeText(currentNormalizedUrl)
        .then(() => showToast('URL이 클립보드에 복사되었습니다! 📋'))
        .catch(() => showToast('클립보드 복사에 실패했습니다.', 'error'));
    }
  });

  // Reset to initial center position
  resetModeBtn.addEventListener('click', () => {
    transitionToInitial();
  });

  logoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    transitionToInitial();
  });

  // Sample quick pills
  samplePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const sampleUrl = pill.getAttribute('data-url');
      if (sampleUrl) {
        urlInput.value = sampleUrl;
        toggleClearButton();
        handleSubmit();
      }
    });
  });

  // URL query parameter support (e.g. ?url=...)
  const urlParams = new URLSearchParams(window.location.search);
  const paramUrl = urlParams.get('url');
  if (paramUrl) {
    urlInput.value = paramUrl;
    toggleClearButton();
    setTimeout(() => {
      handleSubmit();
    }, 150);
  }
});
