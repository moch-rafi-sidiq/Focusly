// Focusly — app.js
// Timer fokus + target harian + riwayat + statistik (Vanilla JS + localStorage).

(function () {
  'use strict';

  var SESSIONS_KEY = 'focusly_sessions';
  var SETTINGS_KEY = 'focusly_settings';
  var SEEDED_KEY = 'focusly_seeded';
  var BREAK_MINUTES = 5;

  // ---------- State ----------
  var currentMode = 'focus'; // 'focus' | 'break'
  var focusMinutes = 25;
  var dailyTarget = 5;

  var totalSeconds = focusMinutes * 60;
  var remainingSeconds = totalSeconds;
  var endTimestamp = 0;
  var timerInterval = null;
  var isRunning = false;

  var pendingTarget = dailyTarget;

  // ---------- Elements ----------
  var timerDisplay = document.getElementById('timerDisplay');
  var timerStatus = document.getElementById('timerStatus');
  var startPauseBtn = document.getElementById('startPauseBtn');
  var resetBtn = document.getElementById('resetBtn');
  var modeFocusBtn = document.getElementById('modeFocusBtn');
  var modeBreakBtn = document.getElementById('modeBreakBtn');
  var durationBtns = Array.prototype.slice.call(document.querySelectorAll('.duration-btn'));
  var customInput = document.getElementById('customMinutes');
  var customSetBtn = document.getElementById('customSetBtn');

  var todayCountEl = document.getElementById('todayCount');
  var targetCountEl = document.getElementById('targetCount');
  var targetProgressFill = document.getElementById('targetProgressFill');
  var targetProgressBar = document.getElementById('targetProgressBar');
  var targetPercentEl = document.getElementById('targetPercent');
  var targetStatusEl = document.getElementById('targetStatus');

  var summarySessionsEl = document.getElementById('summarySessions');
  var summaryMinutesEl = document.getElementById('summaryMinutes');
  var summaryTargetEl = document.getElementById('summaryTarget');

  var statTotalSessionsEl = document.getElementById('statTotalSessions');
  var statTotalMinutesEl = document.getElementById('statTotalMinutes');
  var statActiveDaysEl = document.getElementById('statActiveDays');
  var statProgressFill = document.getElementById('statProgressFill');
  var statProgressLabel = document.getElementById('statProgressLabel');

  var historyListEl = document.getElementById('historyList');
  var historyEmptyEl = document.getElementById('historyEmpty');
  var clearHistoryBtn = document.getElementById('clearHistoryBtn');

  var sessionModal = document.getElementById('sessionModal');
  var sessionModalTitle = document.getElementById('sessionModalTitle');
  var sessionModalDesc = document.getElementById('sessionModalDesc');
  var modalBreakBtn = document.getElementById('modalBreakBtn');
  var modalAgainBtn = document.getElementById('modalAgainBtn');

  var targetModal = document.getElementById('targetModal');
  var targetOptionsEl = document.getElementById('targetOptions');
  var editTargetBtn = document.getElementById('editTargetBtn');
  var saveTargetBtn = document.getElementById('saveTargetBtn');

  var confirmModal = document.getElementById('confirmModal');
  var confirmClearBtn = document.getElementById('confirmClearBtn');

  var toastContainer = document.getElementById('toast-container');

  // ---------- Helpers tanggal ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function todayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function formatClock(date) {
    return pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function dateLabel(dateKey) {
    var today = todayKey();
    var y = new Date();
    y.setDate(y.getDate() - 1);
    var yesterday = todayKey(y);
    if (dateKey === today) return 'Hari Ini';
    if (dateKey === yesterday) return 'Kemarin';
    var parts = dateKey.split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ---------- Storage ----------
  function getSessions() {
    try {
      var raw = localStorage.getItem(SESSIONS_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveSessions(sessions) {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && typeof s.target === 'number' && s.target > 0) dailyTarget = s.target;
      if (s && typeof s.lastDuration === 'number' && s.lastDuration > 0) focusMinutes = s.lastDuration;
    } catch (e) {
      // abaikan, pakai default
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      target: dailyTarget,
      lastDuration: focusMinutes
    }));
  }

  function seedDemoIfEmpty() {
    try {
      if (localStorage.getItem(SEEDED_KEY)) return;
      if (getSessions().length > 0) {
        localStorage.setItem(SEEDED_KEY, '1');
        return;
      }
      var now = new Date();
      var demo = [240, 150, 60].map(function (minAgo, i) {
        var t = new Date(now.getTime() - minAgo * 60 * 1000);
        return {
          id: 'demo-' + t.getTime() + '-' + i,
          date: todayKey(t),
          time: formatClock(t),
          timestamp: t.getTime(),
          duration: 25,
          mode: 'focus'
        };
      });
      saveSessions(demo);
      localStorage.setItem(SEEDED_KEY, '1');
    } catch (e) {
      // storage tidak tersedia, tetap jalan tanpa demo
    }
  }

  // ---------- Toast ----------
  function showToast(message, type) {
    if (!toastContainer) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'success' ? ' success' : '');
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(function () {
      el.classList.add('hide');
      setTimeout(function () { el.remove(); }, 260);
    }, 2800);
  }

  // ---------- Modal ----------
  var lastFocused = null;

  function openModal(modal) {
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.hidden = false;
    modal.classList.add('open');
    var focusable = modal.querySelector('.btn-primary, .btn-secondary, .modal-close');
    if (focusable) focusable.focus();
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('open');
    modal.hidden = true;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function closeAllModals() {
    [sessionModal, targetModal, confirmModal].forEach(closeModal);
  }

  // ---------- Timer ----------
  function currentDurationMinutes() {
    return currentMode === 'focus' ? focusMinutes : BREAK_MINUTES;
  }

  function updateTimerDisplay() {
    var m = Math.floor(remainingSeconds / 60);
    var s = remainingSeconds % 60;
    var text = pad(m) + ':' + pad(s);
    timerDisplay.textContent = text;
    document.title = (isRunning ? text + ' • ' : '') + 'Focusly — Fokus';
  }

  function updateStartPauseButton() {
    if (isRunning) {
      startPauseBtn.textContent = 'Jeda';
    } else {
      startPauseBtn.textContent = remainingSeconds < totalSeconds && remainingSeconds > 0 ? 'Lanjutkan' : 'Mulai';
    }
  }

  function setMode(mode, silent) {
    currentMode = mode;
    var isFocus = mode === 'focus';

    modeFocusBtn.classList.toggle('active', isFocus);
    modeBreakBtn.classList.toggle('active', !isFocus);
    modeFocusBtn.setAttribute('aria-selected', isFocus ? 'true' : 'false');
    modeBreakBtn.setAttribute('aria-selected', !isFocus ? 'true' : 'false');
    timerDisplay.classList.toggle('break-mode', !isFocus);

    stopInterval();
    isRunning = false;
    totalSeconds = currentDurationMinutes() * 60;
    remainingSeconds = totalSeconds;
    timerStatus.textContent = isFocus ? 'Siap untuk fokus' : 'Waktunya istirahat';
    updateTimerDisplay();
    updateStartPauseButton();
    if (!silent) syncDurationButtons();
  }

  function stopInterval() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function tick() {
    var diff = Math.round((endTimestamp - Date.now()) / 1000);
    remainingSeconds = Math.max(0, diff);
    updateTimerDisplay();
    if (remainingSeconds <= 0) {
      completeSession();
    }
  }

  function startTimer() {
    if (isRunning) return;
    if (remainingSeconds <= 0) {
      totalSeconds = currentDurationMinutes() * 60;
      remainingSeconds = totalSeconds;
    }
    isRunning = true;
    endTimestamp = Date.now() + remainingSeconds * 1000;
    stopInterval();
    timerInterval = setInterval(tick, 250);
    timerStatus.textContent = currentMode === 'focus' ? 'Fokus berjalan…' : 'Istirahat berjalan…';
    updateStartPauseButton();
    updateTimerDisplay();
    showToast(currentMode === 'focus' ? 'Sesi fokus dimulai.' : 'Istirahat dimulai.');
  }

  function pauseTimer() {
    if (!isRunning) return;
    // Bekukan sisa waktu berdasarkan timestamp agar akurat
    remainingSeconds = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000));
    stopInterval();
    isRunning = false;
    timerStatus.textContent = 'Dijeda';
    updateTimerDisplay();
    updateStartPauseButton();
    showToast('Timer dijeda.');
  }

  function resetTimer() {
    stopInterval();
    isRunning = false;
    totalSeconds = currentDurationMinutes() * 60;
    remainingSeconds = totalSeconds;
    timerStatus.textContent = currentMode === 'focus' ? 'Siap untuk fokus' : 'Waktunya istirahat';
    updateTimerDisplay();
    updateStartPauseButton();
    showToast('Timer direset.');
  }

  function completeSession() {
    stopInterval();
    isRunning = false;

    var finishedMode = currentMode;
    var finishedMinutes = currentDurationMinutes();

    if (finishedMode === 'focus') {
      var now = new Date();
      var sessions = getSessions();
      sessions.push({
        id: 's-' + now.getTime(),
        date: todayKey(now),
        time: formatClock(now),
        timestamp: now.getTime(),
        duration: finishedMinutes,
        mode: 'focus'
      });
      saveSessions(sessions);

      var reached = isTargetReached();
      updateDailyProgress();
      updateStatistics();
      renderHistory();

      sessionModalTitle.textContent = 'Fokus selesai.';
      sessionModalDesc.textContent = 'Bagus! Kamu baru saja menyelesaikan satu sesi fokus.';
      modalBreakBtn.style.display = '';
      modalAgainBtn.textContent = 'Mulai Lagi';
      openModal(sessionModal);

      showToast('Sesi berhasil diselesaikan.', 'success');
      if (reached) {
        setTimeout(function () { showToast('Target harian tercapai.', 'success'); }, 400);
      }
    } else {
      sessionModalTitle.textContent = 'Istirahat selesai.';
      sessionModalDesc.textContent = 'Yuk kembali fokus.';
      modalBreakBtn.style.display = 'none';
      modalAgainBtn.textContent = 'Kembali Fokus';
      openModal(sessionModal);
      showToast('Istirahat selesai.', 'success');
    }

    // Siapkan timer berikutnya dalam kondisi berhenti
    totalSeconds = currentDurationMinutes() * 60;
    remainingSeconds = totalSeconds;
    timerStatus.textContent = 'Sesi selesai';
    updateTimerDisplay();
    updateStartPauseButton();
  }

  // ---------- Target & Progress ----------
  function getTodayFocusSessions() {
    var key = todayKey();
    return getSessions().filter(function (s) {
      return s.mode === 'focus' && s.date === key;
    });
  }

  function isTargetReached() {
    return getTodayFocusSessions().length >= dailyTarget;
  }

  function updateDailyProgress() {
    var todaySessions = getTodayFocusSessions();
    var count = todaySessions.length;
    var minutes = todaySessions.reduce(function (sum, s) {
      return sum + (parseInt(s.duration, 10) || 0);
    }, 0);
    var percent = dailyTarget > 0 ? Math.min(100, Math.round((count / dailyTarget) * 100)) : 0;

    todayCountEl.textContent = count;
    targetCountEl.textContent = dailyTarget;
    targetProgressFill.style.width = percent + '%';
    targetProgressBar.setAttribute('aria-valuenow', String(percent));
    targetPercentEl.textContent = percent + '%';
    summarySessionsEl.textContent = count;
    summaryMinutesEl.textContent = minutes;
    summaryTargetEl.textContent = count + ' / ' + dailyTarget;

    if (count >= dailyTarget && dailyTarget > 0) {
      targetStatusEl.textContent = 'Target tercapai!';
      targetStatusEl.classList.add('done');
    } else {
      targetStatusEl.textContent = 'Belum tercapai';
      targetStatusEl.classList.remove('done');
    }

    statProgressFill.style.width = percent + '%';
    statProgressLabel.textContent = percent + '%';
  }

  // ---------- Statistik ----------
  function updateStatistics() {
    var sessions = getSessions().filter(function (s) { return s.mode === 'focus'; });
    var totalMinutes = sessions.reduce(function (sum, s) {
      return sum + (parseInt(s.duration, 10) || 0);
    }, 0);
    var days = {};
    sessions.forEach(function (s) { days[s.date] = true; });

    statTotalSessionsEl.textContent = sessions.length;
    statTotalMinutesEl.textContent = totalMinutes;
    statActiveDaysEl.textContent = Object.keys(days).length;
  }

  // ---------- Riwayat ----------
  function renderHistory() {
    var sessions = getSessions().slice().sort(function (a, b) {
      return (b.timestamp || 0) - (a.timestamp || 0);
    });

    historyListEl.innerHTML = '';

    if (sessions.length === 0) {
      historyEmptyEl.hidden = false;
      return;
    }
    historyEmptyEl.hidden = true;

    var groups = {};
    var order = [];
    sessions.forEach(function (s) {
      var key = s.date || todayKey(new Date(s.timestamp));
      if (!groups[key]) {
        groups[key] = [];
        order.push(key);
      }
      groups[key].push(s);
    });

    order.forEach(function (dateKey) {
      var group = document.createElement('div');
      group.className = 'history-group';

      var title = document.createElement('p');
      title.className = 'history-date';
      title.textContent = dateLabel(dateKey);
      group.appendChild(title);

      groups[dateKey].forEach(function (s) {
        var item = document.createElement('div');
        item.className = 'history-item';

        var left = document.createElement('span');
        left.className = 'm';
        var time = document.createElement('strong');
        time.className = 't';
        time.textContent = s.time || '--:--';
        left.appendChild(time);
        left.appendChild(document.createTextNode('  —  ' + (s.mode === 'break' ? 'Istirahat' : 'Fokus') + '  —  ' + s.duration + ' menit'));

        var badge = document.createElement('span');
        var isBreak = s.mode === 'break';
        badge.className = 'badge' + (isBreak ? ' break' : '');
        badge.textContent = isBreak ? 'Istirahat' : 'Fokus';

        item.appendChild(left);
        item.appendChild(badge);
        group.appendChild(item);
      });

      historyListEl.appendChild(group);
    });
  }

  // ---------- Durasi ----------
  function syncDurationButtons() {
    durationBtns.forEach(function (btn) {
      var mins = parseInt(btn.getAttribute('data-minutes'), 10);
      btn.classList.toggle('active', mins === focusMinutes && currentMode === 'focus');
    });
  }

  function setFocusDuration(minutes) {
    focusMinutes = minutes;
    saveSettings();
    if (currentMode !== 'focus') {
      setMode('focus', true);
      syncDurationButtons();
      return;
    }
    stopInterval();
    isRunning = false;
    totalSeconds = focusMinutes * 60;
    remainingSeconds = totalSeconds;
    timerStatus.textContent = 'Siap untuk fokus';
    updateTimerDisplay();
    updateStartPauseButton();
    syncDurationButtons();
  }

  // ---------- Events ----------
  function bindEvents() {
    startPauseBtn.addEventListener('click', function () {
      if (isRunning) pauseTimer();
      else startTimer();
    });

    resetBtn.addEventListener('click', resetTimer);

    modeFocusBtn.addEventListener('click', function () { setMode('focus'); });
    modeBreakBtn.addEventListener('click', function () { setMode('break'); });

    durationBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mins = parseInt(btn.getAttribute('data-minutes'), 10);
        if (!mins || mins < 1) return;
        if (customInput) customInput.value = '';
        setFocusDuration(mins);
      });
    });

    if (customSetBtn) {
      customSetBtn.addEventListener('click', function () {
        var val = parseInt(customInput.value, 10);
        if (!val || val < 1 || val > 180) {
          showToast('Masukkan durasi 1–180 menit.');
          customInput.focus();
          return;
        }
        setFocusDuration(val);
        showToast('Durasi diatur ke ' + val + ' menit.');
      });
    }

    // Modal sesi selesai
    modalAgainBtn.addEventListener('click', function () {
      closeModal(sessionModal);
      if (sessionModalTitle.textContent.indexOf('Istirahat') !== -1) {
        setMode('focus');
      } else {
        // tetap di mode fokus, siapkan durasi yang sama
        setMode('focus', true);
        syncDurationButtons();
        stopInterval();
        isRunning = false;
        totalSeconds = focusMinutes * 60;
        remainingSeconds = totalSeconds;
        timerStatus.textContent = 'Siap untuk fokus';
        updateTimerDisplay();
        updateStartPauseButton();
      }
      document.getElementById('fokus').scrollIntoView({ behavior: 'smooth' });
    });

    modalBreakBtn.addEventListener('click', function () {
      closeModal(sessionModal);
      setMode('break');
      document.getElementById('fokus').scrollIntoView({ behavior: 'smooth' });
      startTimer();
    });

    // Modal target
    editTargetBtn.addEventListener('click', function () {
      pendingTarget = dailyTarget;
      paintTargetOptions();
      openModal(targetModal);
    });

    targetOptionsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-target]');
      if (!btn) return;
      pendingTarget = parseInt(btn.getAttribute('data-target'), 10);
      paintTargetOptions();
    });

    saveTargetBtn.addEventListener('click', function () {
      dailyTarget = pendingTarget;
      saveSettings();
      updateDailyProgress();
      closeModal(targetModal);
      showToast('Target harian diperbarui.');
    });

    // Hapus riwayat
    clearHistoryBtn.addEventListener('click', function () {
      if (getSessions().length === 0) {
        showToast('Riwayat masih kosong.');
        return;
      }
      openModal(confirmModal);
    });

    confirmClearBtn.addEventListener('click', function () {
      saveSessions([]);
      try { localStorage.setItem(SEEDED_KEY, '1'); } catch (e) {}
      closeModal(confirmModal);
      updateDailyProgress();
      updateStatistics();
      renderHistory();
      showToast('Riwayat dihapus.');
    });

    // Tutup modal: tombol close, klik overlay, ESC
    document.querySelectorAll('[data-close-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeAllModals();
      });
    });

    [sessionModal, targetModal, confirmModal].forEach(function (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal(modal);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllModals();
    });

    // Navigasi sidebar active state
    var navLinks = document.querySelectorAll('[data-nav]');
    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        document.querySelectorAll('[data-nav]').forEach(function (l) {
          var same = l.getAttribute('data-nav') === link.getAttribute('data-nav');
          l.classList.toggle('active', same);
        });
      });
    });
  }

  function paintTargetOptions() {
    Array.prototype.forEach.call(targetOptionsEl.querySelectorAll('button'), function (btn) {
      var val = parseInt(btn.getAttribute('data-target'), 10);
      btn.classList.toggle('active', val === pendingTarget);
    });
  }

  // ---------- Init ----------
  function init() {
    loadSettings();
    seedDemoIfEmpty();

    totalSeconds = focusMinutes * 60;
    remainingSeconds = totalSeconds;

    bindEvents();
    setMode('focus', true);
    syncDurationButtons();
    updateDailyProgress();
    updateStatistics();
    renderHistory();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
