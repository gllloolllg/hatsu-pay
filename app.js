const API = 'https://script.google.com/macros/s/AKfycbzB1qe-cL3yuODT0JVm30OpXMMjzR7nko0aaJAbV5y5dg6IC2bbLyox5x0ZhXGZ6lgjkw/exec';
const LS_KEY = 'hapay_id';

let currentId = null;
let sheetData = null;

// ===== JSONPヘルパ =====
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = 'cb_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const cleanup = () => { try { delete window[cb]; } catch(_) {} s.remove(); };
    window[cb] = (data) => { cleanup(); resolve(data); };
    s.onerror = (e) => { cleanup(); reject(e); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.body.appendChild(s);
  });
}

// ===== DOM参照 =====
const el = {
    loginModal: () => document.getElementById('loginModal'),
    loginOverlay: () => document.getElementById('loginOverlay'),
    loginPanel: () => document.getElementById('loginPanel'),
    loginSpinner: () => document.getElementById('loginSpinner'),
    loginId: () => document.getElementById('loginId'),
    loginBtn: () => document.getElementById('loginBtn'),
    loginMsg: () => document.getElementById('loginMsg'),
    logoutBtn: () => document.getElementById('logoutBtn'),
    balance: () => document.getElementById('balance'),
    zandaka: () => document.getElementById('zandaka'),
    kingaku: () => document.getElementById('kingaku'),
    bikou: () => document.getElementById('bikou'),
    meisaiBtn: () => document.getElementById('meisaiBtn'),
    meisaiModal: () => document.getElementById('meisaiModal'),
    meisaiClose: () => document.getElementById('meisaiClose'),
    meisaiTableWrap: () => document.getElementById('meisaiTableWrap'),
    meisaiTbody: () => document.getElementById('meisaiTbody'),

};


// ===== シート全データから最終残高（最終行D）を計算 =====
function calcBalanceFromData(data) {
  if (!Array.isArray(data) || data.length <= 1) return 0; // ヘッダのみ
  for (let i = data.length - 1; i >= 1; i--) {
    const a = data[i] && data[i][0];
    if (a !== '' && a !== null && typeof a !== 'undefined') {
      const d = data[i][3];
      const n = Number(d);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

function renderBalance(balance) {
  el.balance().textContent = balance;
  if (el.zandaka()) el.zandaka().textContent = balance;
}

// ===== ログイン状態UI（モーダル）=====
function showLoginModal(message) {
  el.loginModal().style.display = 'block';
  el.loginPanel().style.display = 'block';
  el.loginSpinner().style.display = 'none';
  el.loginMsg().textContent = message || '';

  // 念のため（失敗時にdisabledが残る事故を潰す）
  el.loginBtn().disabled = false;

  setTimeout(() => el.loginId().focus(), 50);
}


function showLoginLoading() {
  el.loginModal().style.display = 'block';
  el.loginPanel().style.display = 'none';     // パネルは隠す
  el.loginSpinner().style.display = 'block';  // クルクルだけ出す
  el.loginMsg().textContent = '';
}

function hideLoginModal() {
  el.loginModal().style.display = 'none';
  el.loginPanel().style.display = 'block';
  el.loginSpinner().style.display = 'none';
  el.loginMsg().textContent = '';
}

function setAuthUi(loggedIn) {
  el.logoutBtn().style.display = loggedIn ? 'block' : 'none';
  el.meisaiBtn().style.display = loggedIn ? 'block' : 'none';
  if (loggedIn) {
    hideLoginModal();     // ログイン成功 → モーダル閉じる
  } else {
    showLoginModal('');   // 未ログイン → パネル表示
  }
}


// ===== ログイン（GAS検証＋全データ受信）=====
async function login(id, save) {
  const url = `${API}?action=login&id=${encodeURIComponent(id)}`;
  const data = await jsonp(url);
  if (!data || data.ok !== true) throw new Error('login failed');

  currentId = data.id;
  sheetData = data.data;

  renderBalance(calcBalanceFromData(sheetData));
  if (save) localStorage.setItem(LS_KEY, currentId);
  setAuthUi(true);
}

// ===== ログアウト =====
function logout() {
  localStorage.removeItem(LS_KEY);
  currentId = null;
  sheetData = null;
  renderBalance('_____');
  setAuthUi(false);
}

// ===== ポップアップ（元のまま）=====
function openPopup(){
  document.getElementById('popup-wrapper').style.display='block';
  el.kingaku().focus();
}
function closePopup(){
  document.getElementById('popup-wrapper').style.display='none';
}

// グローバルに残す（HTMLのonclickが参照するため）
window.openPopup = openPopup;
window.closePopup = closePopup;

// ===== 入出金モード切替（元のまま）=====
let changemode = 1; // 1=出金, 2=入金

function changenyukin() {
  changemode = 2;
  document.getElementById('shukkinmode').style.backgroundColor = '#aaa';
  document.getElementById('nyukinmode').style.backgroundColor = '#54bb80';
  document.getElementById('kingaku').style.borderColor = '#54bb80';
  el.kingaku().focus();
}
function changeshukkin() {
  changemode = 1;
  document.getElementById('shukkinmode').style.backgroundColor = '#c44545';
  document.getElementById('nyukinmode').style.backgroundColor = '#aaa';
  document.getElementById('kingaku').style.borderColor = '#c44545';
  el.kingaku().focus();
}
window.changenyukin = changenyukin;
window.changeshukkin = changeshukkin;

// ===== 入出金実行（GASがD列残高を計算して書く）=====
async function jikkou() {
  const btns = document.querySelectorAll('button');
  btns.forEach(b => b.disabled = true);
  el.balance().textContent = '_____';

  try {
    if (!currentId) {
      alert('ログインしてください');
        setAuthUi(false);
      return;
    }

    const amount = Number(el.kingaku().value);
    const memo = encodeURIComponent(el.bikou().value || '');
    if (!amount || amount <= 0) {
      alert('金額を正しく入力してください');
      renderBalance(calcBalanceFromData(sheetData));
      return;
    }

    const action = (changemode === 1) ? 'withdraw' : 'deposit';
    const url = `${API}?action=${action}&id=${encodeURIComponent(currentId)}&amount=${amount}&memo=${memo}`;
    const data = await jsonp(url);

    if (!data || data.ok !== true) throw new Error('failed');

    sheetData = data.data;
    if (el.meisaiModal().style.display === 'block') renderMeisaiTable();

    renderBalance(calcBalanceFromData(sheetData));

    closePopup();
    el.kingaku().value = '';
    el.bikou().value = '';
  } catch (e) {
    alert('処理に失敗しました');
    if (sheetData) renderBalance(calcBalanceFromData(sheetData));
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}
window.jikkou = jikkou;

// ===== 管理モードポップアップ=====
let step = 0;
let timer = null;
const TIMEOUT = 1000;

let audioCtx;
let audioBuffer;

async function initWebAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    const res = await fetch("se/01.mp3");
    const buf = await res.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(buf);
  } catch (e) {
    console.error(e);
  }
}
initWebAudio();

function playWebAudio() {
  if (!audioCtx || !audioBuffer) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  const src = audioCtx.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(audioCtx.destination);
  src.start(0);
}

function resetTimer() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => reset(), TIMEOUT);
}
function reset() {
  step = 0;
  if (timer) clearTimeout(timer);
  timer = null;
}

function setupSecretOpen() {
  document.getElementById('logoimg').addEventListener('touchstart', () => {
    step = 1;
    resetTimer();
  });
  document.getElementById('codeimg').addEventListener('touchstart', () => {
    if (step === 1) {
      step = 2;
      resetTimer();
    } else {
      playWebAudio();
      reset();
    }
  });
  document.getElementById('balanceBox').addEventListener('touchstart', () => {
    if (step === 2) {
      openPopup();
      reset();
    } else {
      reset();
    }
  });
}

// ===== 起動処理 =====
function boot() {
  // ボタンイベント（HTMLにonclickを書かない方式へ）
  el.loginBtn().addEventListener('click', async () => {
    const id = (el.loginId().value || '').trim();
    if (!id) { el.loginMsg().textContent = 'IDを入力してください'; return; }

    el.loginBtn().disabled = true;
  showLoginLoading();
    try {
      await login(id, true);
    } catch (e) {
  showLoginModal('IDが見つかりませんでした');
    } finally {
      el.loginBtn().disabled = false;
    }
  });

  el.loginId().addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') el.loginBtn().click();
  });

  el.logoutBtn().addEventListener('click', () => logout());
  el.meisaiBtn().addEventListener('click', () => openMeisai());
  el.meisaiClose().addEventListener('click', () => closeMeisai());

  // カードをタップしてフリップ
  const flipCard = document.getElementById('flipCard');
  if (flipCard) {
    flipCard.addEventListener('click', (e) => {
      // バーコード画像や残高ボックスのタップ時はフリップさせない
      if (e.target.closest('#codeimg') || e.target.closest('#balanceBox')) {
        return;
      }
      flipCard.classList.toggle('flipped');
    });
  }

  setupSecretOpen();

  // localStorageにIDがあれば自動ログイン検証
  const saved = (localStorage.getItem(LS_KEY) || '').trim();
    if (saved) {
    showLoginLoading(); // パネルは出さずクルクルから開始
    login(saved, true).catch(() => {
        localStorage.removeItem(LS_KEY);
        showLoginModal(''); // 自動ログイン失敗時はパネル表示へ
    });
    } else {
    setAuthUi(false); // = パネル表示
    }

}

// ===== 明細表示 =====
function formatDateYYMMDD(v) {
  if (!v) return '';
  const d = (v instanceof Date) ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';

  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
}

function safeNum(v) {
  if (v === '' || v === null || typeof v === 'undefined') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

function renderMeisaiTable() {
  const tbody = el.meisaiTbody();
  tbody.innerHTML = '';

  if (!Array.isArray(sheetData) || sheetData.length <= 1) return;

  // 1行目はヘッダ想定、2行目以降を明細として表示
  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i] || [];
    const a = row[0]; // A 日付
    if (a === '' || a === null || typeof a === 'undefined') continue;

    const memo = row[4];    // E メモ
    const withdraw = row[2]; // C 出金
    const deposit = row[1];  // B 入金
    const balance = row[3];  // D 残高

    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = formatDateYYMMDD(a);

    const tdMemo = document.createElement('td');
    tdMemo.textContent = (memo === null || typeof memo === 'undefined') ? '' : String(memo);

    const tdW = document.createElement('td');
    tdW.textContent = safeNum(withdraw);

    const tdD = document.createElement('td');
    tdD.textContent = safeNum(deposit);

    const tdB = document.createElement('td');
    tdB.textContent = safeNum(balance);

    tr.appendChild(tdDate);
    tr.appendChild(tdMemo);
    tr.appendChild(tdW);
    tr.appendChild(tdD);
    tr.appendChild(tdB);

    tbody.appendChild(tr);
  }
}

function openMeisai() {
  renderMeisaiTable();
  el.meisaiModal().style.display = 'block';

  // CSSのtransitionを効かせるため少し遅らせてクラス追加
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.meisaiModal().classList.add('show');
    });
  });

  // 最新（最下部）を最初に見せる：表示後にスクロール
  setTimeout(() => {
    const w = el.meisaiTableWrap();
    w.scrollTop = w.scrollHeight;
  }, 0);
}

function closeMeisai() {
  el.meisaiModal().classList.remove('show');
  
  // アニメーションが終わってからdisplay:noneにする (0.4秒後)
  setTimeout(() => {
    if (!el.meisaiModal().classList.contains('show')) {
      el.meisaiModal().style.display = 'none';
    }
  }, 400);
}

document.addEventListener('DOMContentLoaded', boot);
