/**
 * PlakaYorum - Frontend App (app.js)
 * SPA yönetimi, API istekleri, Admin paneli
 */

const API = '/api';
const state = {
  token: localStorage.getItem('py_token') || null,
  user: JSON.parse(localStorage.getItem('py_user') || 'null'),
  currentPlate: null,
  adminUsers: [],
};

// ── SAYFA YÖNETİMİ ──
function showSection(name) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('section-' + name);
  if (el) el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'admin') loadAdminTab('dashboard');
  if (name === 'profile') loadProfile();
  if (name === 'chat') loadChatConversations();
}
function showHome() { showSection('home'); state.currentPlate = null; document.getElementById('search-input').value = ''; }

// ── TOAST ──
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast toast-' + type + ' show';
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 4000);
}

// ── DROPDOWN ──
function toggleDropdown() { document.getElementById('user-dropdown').classList.toggle('hidden'); }
function closeDropdown() { document.getElementById('user-dropdown').classList.add('hidden'); }
document.addEventListener('click', e => { if (!e.target.closest('.dropdown')) closeDropdown(); });

// ── AUTH UI ──
function updateAuthUI() {
  const btn = document.getElementById('nav-auth-btn');
  const info = document.getElementById('nav-user-info');
  const email = document.getElementById('nav-email');
  const adminLink = document.getElementById('admin-link');
  const chatBtn = document.getElementById('nav-chat-btn');
  if (state.token && state.user) {
    btn.classList.add('hidden'); info.classList.remove('hidden');
    email.textContent = state.user.email;
    if (state.user.isAdmin) adminLink.classList.remove('hidden'); else adminLink.classList.add('hidden');
    chatBtn.classList.remove('hidden');
    checkUnreadMessages();
  } else {
    btn.classList.remove('hidden'); info.classList.add('hidden');
    adminLink.classList.add('hidden');
    chatBtn.classList.add('hidden');
  }
}
function saveAuth(token, user) {
  state.token = token; state.user = user;
  localStorage.setItem('py_token', token); localStorage.setItem('py_user', JSON.stringify(user));
  updateAuthUI();
}
function logout() {
  state.token = null; state.user = null;
  localStorage.removeItem('py_token'); localStorage.removeItem('py_user');
  updateAuthUI(); showHome(); showToast('Çıkış yapıldı.', 'info');
}
function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
  if (document.getElementById('form-verify')) {
    document.getElementById('form-verify').classList.add('hidden');
  }
}

// ── API ──
async function apiRequest(url, options = {}) {
  const headers = { ...options.headers };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API + url, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Bir hata oluştu.');
  return data;
}

// ── PLAKA ARAMA ──
function cleanPlate(v) { return v.replace(/\s+/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
async function handleSearch(e) {
  e.preventDefault();
  const raw = cleanPlate(document.getElementById('search-input').value);
  if (!raw || raw.length < 4) { showToast('Geçerli bir plaka giriniz.', 'error'); return; }
  const btn = document.getElementById('search-btn');
  btn.innerHTML = '<span class="spinner"></span>'; btn.disabled = true;
  try {
    const data = await apiRequest('/plate/' + raw);
    state.currentPlate = data.data;
    renderPlateDetail();
    showSection('results');
  } catch (err) { showToast(err.message, 'error'); }
  finally { btn.textContent = 'Sorgula'; btn.disabled = false; }
}

// ── PLAKA DETAY ──
function renderPlateDetail() {
  const { plate, comments, commentCount } = state.currentPlate;
  document.getElementById('plate-display').textContent = formatPlate(plate.plateNumber);
  const cb = document.getElementById('plate-claimed-badge');
  const claimBtn = document.getElementById('claim-plate-btn');
  const claimPending = document.getElementById('claim-plate-pending');
  
  if (plate.isClaimed && plate.claimStatus === 'approved') {
    cb.classList.remove('hidden');
    claimBtn.classList.add('hidden');
    claimPending.classList.add('hidden');
  } else if (plate.claimStatus === 'pending') {
    cb.classList.add('hidden');
    claimBtn.classList.add('hidden');
    claimPending.classList.remove('hidden');
  } else {
    cb.classList.add('hidden');
    claimPending.classList.add('hidden');
    claimBtn.classList.remove('hidden');
  }

  // Plaka sahibi kontrolleri
  const ownerControls = document.getElementById('plate-owner-controls');
  if (ownerControls) {
    if (state.token && state.user && plate.ownerId && plate.ownerId === state.user._id) {
      ownerControls.classList.remove('hidden');
      const toggleBtn = document.getElementById('toggle-comments-btn');
      if (toggleBtn) {
        toggleBtn.textContent = plate.isCommentsClosed ? '🔓 Yorumları Aç' : '🔒 Yorumları Kapat';
        toggleBtn.className = plate.isCommentsClosed ? 'btn btn-green' : 'btn btn-red-outline';
      }
      // Doğrulama durumu
      const verifyInfo = document.getElementById('plate-verify-info');
      if (verifyInfo && plate.verificationExpiry) {
        const expiry = new Date(plate.verificationExpiry);
        const now = new Date();
        const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 0) {
          verifyInfo.innerHTML = '<span class="badge badge-red">⚠️ Doğrulama süresi dolmuş! Lütfen yeniden doğrulama yapın.</span>';
          document.getElementById('reverify-form-area').classList.remove('hidden');
        } else if (daysLeft <= 14) {
          verifyInfo.innerHTML = `<span class="badge badge-orange">⏰ Doğrulama süresi ${daysLeft} gün sonra doluyor!</span>`;
          document.getElementById('reverify-form-area').classList.remove('hidden');
        } else {
          verifyInfo.innerHTML = `<span class="badge badge-green">✅ Doğrulama: ${expiry.toLocaleDateString('tr-TR')} tarihine kadar geçerli</span>`;
          document.getElementById('reverify-form-area').classList.add('hidden');
        }
      }
    } else {
      ownerControls.classList.add('hidden');
    }
  }

  // Yorumlar kapalıysa uyarı göster
  const commentFormCard = document.getElementById('comment-form-card');
  const closedMsg = document.getElementById('comments-closed-msg');
  if (plate.isCommentsClosed) {
    if (commentFormCard) commentFormCard.classList.add('hidden');
    if (closedMsg) closedMsg.classList.remove('hidden');
  } else {
    if (commentFormCard) commentFormCard.classList.remove('hidden');
    if (closedMsg) closedMsg.classList.add('hidden');
  }
  
  document.getElementById('comment-count-badge').textContent = commentCount + ' yorum';
  const noMsg = document.getElementById('no-comments-msg');
  const listEl = document.getElementById('comments-list');
  if (!comments || comments.length === 0) {
    noMsg.classList.remove('hidden'); listEl.innerHTML = '';
  } else {
    noMsg.classList.add('hidden');
    // Plaka sahibi ise owner-report butonu göster
    const isOwner = state.token && state.user && plate.ownerId && plate.ownerId === state.user._id;
    listEl.innerHTML = comments.map(c => renderComment(c, isOwner, plate.plateNumber)).join('');
  }
  document.getElementById('comment-form').reset();
  document.getElementById('char-count').textContent = '0 / 280';
}
function formatPlate(p) { const m = p.match(/^(\d{2})([A-Z]{1,3})(\d{1,4})$/); return m ? m[1]+' '+m[2]+' '+m[3] : p; }
function getCatClass(c) {
  const m = {'Hatalı Park':'cat-park','Açık Far':'cat-far','Tehlikeli Sürüş':'cat-tehlike','Övgü/Teşekkür':'cat-ovgu','Diğer':'cat-diger'};
  return m[c]||'cat-diger';
}
function getCatIcon(c) {
  const m = {'Hatalı Park':'🅿️','Açık Far':'💡','Tehlikeli Sürüş':'⚠️','Övgü/Teşekkür':'👏','Diğer':'💬'};
  return m[c]||'💬';
}
function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function renderComment(c, isOwner = false, plateNumber = '') {
  const d = new Date(c.createdAt).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const ownerReportBtn = isOwner ? `<button onclick="ownerReportComment('${plateNumber}','${c._id}')" class="comment-owner-report" title="Sahibi Olarak Şikayet Et">🛡️</button>` : '';
  return `<div class="comment-card"><div class="comment-header"><span class="category-badge ${getCatClass(c.category)}">${getCatIcon(c.category)} ${c.category}</span><div style="display:flex;align-items:center;gap:.5rem"><span class="comment-date">${d}</span>${ownerReportBtn}<button onclick="reportComment('${c._id}')" class="comment-report" title="Şikayet Et">🚩</button></div></div><p class="comment-text">${escapeHtml(c.content)}</p></div>`;
}

function claimPlate() {
  if (!state.currentPlate) return;
  if (!state.token) {
    showToast('Plaka sahiplenmek için giriş yapmalısınız.', 'warning');
    switchAuthTab('login');
    showSection('auth');
    return;
  }
  document.getElementById('claim-modal').classList.remove('hidden');
}

function closeClaimModal() {
  document.getElementById('claim-modal').classList.add('hidden');
  document.getElementById('claim-form').reset();
}

async function submitClaim(e) {
  e.preventDefault();
  if (!state.currentPlate) return;
  
  const fileInput = document.getElementById('claim-document');
  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Lütfen bir belge seçin.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('plateNumber', state.currentPlate.plate.plateNumber);
  formData.append('document', fileInput.files[0]);

  const btn = document.getElementById('claim-submit-btn');
  btn.disabled = true;
  btn.textContent = 'İşleniyor... Yükleniyor...';
  
  try {
    const res = await fetch('/api/auth/claim-request', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + state.token
      },
      body: formData
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Sahiplenme talebi oluşturulamadı.');
    
    showToast(data.message, 'success');
    closeClaimModal();
    
    // Refresh plate
    document.getElementById('search-plate').value = state.currentPlate.plate.plateNumber;
    searchPlate();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Gönder ve Onaya Sun';
  }
}

// ── YORUM GÖNDERME ──
async function handleComment(e) {
  e.preventDefault();
  if (!state.currentPlate) return;
  const content = document.getElementById('comment-content').value.trim();
  const category = document.getElementById('comment-category').value;
  const kvkk = document.getElementById('comment-kvkk').checked;
  const btn = document.getElementById('comment-submit-btn');
  if (!kvkk) { showToast('KVKK onayı zorunludur.', 'error'); return; }
  if (!category) { showToast('Kategori seçiniz.', 'error'); return; }
  if (content.length < 5) { showToast('Yorum en az 5 karakter olmalıdır.', 'error'); return; }
  btn.innerHTML = '<span class="spinner"></span> Gönderiliyor...'; btn.disabled = true;
  try {
    const pn = state.currentPlate.plate.plateNumber;
    await apiRequest('/plate/' + pn + '/comment', { method: 'POST', body: JSON.stringify({ content, category, kvkkApproved: true }) });
    showToast('Yorumunuz alındı, admin onayından sonra yayınlanacaktır.', 'success');
    document.getElementById('comment-form').reset();
    document.getElementById('comment-content').style.height = 'auto';
    updateCharCount();
    const data = await apiRequest('/plate/' + pn);
    state.currentPlate = data.data; renderPlateDetail();
  } catch (err) { showToast(err.message, 'error'); }
  finally { btn.textContent = 'Yorum Gönder'; btn.disabled = false; }
}
function updateCharCount() {
  const ta = document.getElementById('comment-content');
  document.getElementById('char-count').textContent = ta.value.length + ' / 280';
  
  // Otomatik yükseklik (Aşağı doğru genişleme)
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
async function reportComment(id) {
  if (!confirm('Bu yorumu şikayet etmek istediğinize emin misiniz?')) return;
  try { await apiRequest('/comment/' + id + '/report', { method: 'POST' }); showToast('Şikayetiniz alındı.', 'success'); }
  catch (err) { showToast(err.message, 'error'); }
}

// Plaka sahibi olarak yorum şikayet etme
async function ownerReportComment(plateNumber, commentId) {
  const reason = prompt('Şikayet sebebinizi yazın (opsiyonel):');
  if (reason === null) return; // İptal ettiyse
  try {
    await apiRequest('/plate/' + plateNumber.replace(/\s+/g, '') + '/owner-report/' + commentId, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || '' })
    });
    showToast('Şikayetiniz alındı. Yorum geçici olarak gizlendi ve admin incelemesine gönderildi.', 'success');
    // Plakayı yeniden yükle
    const data = await apiRequest('/plate/' + plateNumber.replace(/\s+/g, ''));
    state.currentPlate = data.data;
    renderPlateDetail();
  } catch (err) { showToast(err.message, 'error'); }
}

// Plaka sahibi yorumları aç/kapat
async function togglePlateComments() {
  if (!state.currentPlate) return;
  const pn = state.currentPlate.plate.plateNumber;
  try {
    const data = await apiRequest('/plate/' + pn + '/toggle-comments', { method: 'PUT' });
    showToast(data.message, 'success');
    // Plakayı yeniden yükle
    const refreshed = await apiRequest('/plate/' + pn);
    state.currentPlate = refreshed.data;
    renderPlateDetail();
  } catch (err) { showToast(err.message, 'error'); }
}

// 3 Aylık Yeniden Doğrulama Formu Gönderimi
async function submitReverification(e) {
  e.preventDefault();
  if (!state.currentPlate) return;
  const pn = state.currentPlate.plate.plateNumber;
  const docInput = document.getElementById('reverify-document');
  const dateInput = document.getElementById('reverify-date-proof');

  if (!docInput.files[0] || !dateInput.files[0]) {
    showToast('Hem ruhsat hem de tarihli kağıt fotoğrafı yükleyin.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('plateNumber', pn);
  formData.append('document', docInput.files[0]);
  formData.append('dateProof', dateInput.files[0]);

  try {
    const res = await fetch('/api/plate/reverify', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + state.token },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Hata oluştu.');
    showToast(data.message, 'success');
    document.getElementById('reverify-form').reset();
    document.getElementById('reverify-form-area').classList.add('hidden');
  } catch (err) { showToast(err.message, 'error'); }
}

// ── AUTH ──
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const kvkk = document.getElementById('login-kvkk').checked;
  const turnstileToken = document.querySelector('#form-login [name="cf-turnstile-response"]')?.value;
  
  if (!kvkk) { showToast('KVKK onayı zorunludur.', 'error'); return; }
  const btn = e.target.querySelector('button[type="submit"]');
  const oldHtml = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = 'Bekleyin...';
  
  try {
    const data = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, turnstileToken }) });
    saveAuth(data.data.token, data.data.user);
    showToast('Giriş başarılı!', 'success'); showHome();
  } catch (err) {
    if (err.message && err.message.includes('doğrulanmamış') && document.getElementById('form-verify')) {
      showToast(err.message, 'warning');
      document.getElementById('form-login').classList.add('hidden');
      document.getElementById('form-register').classList.add('hidden');
      document.getElementById('form-verify').classList.remove('hidden');
      document.getElementById('verify-email').value = email;
    } else {
      showToast(err.message, 'error');
    }
  } finally {
    btn.disabled = false; btn.innerHTML = oldHtml;
  }
}
async function handleRegister(e) {
  e.preventDefault();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const kvkk = document.getElementById('reg-kvkk').checked;
  const marketingApproved = document.getElementById('reg-marketing') ? document.getElementById('reg-marketing').checked : false;
  const turnstileToken = document.querySelector('#form-register [name="cf-turnstile-response"]')?.value;

  if (!kvkk) { showToast('KVKK onayı zorunludur.', 'error'); return; }
  const btn = e.target.querySelector('button[type="submit"]');
  const oldHtml = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = 'Bekleyin...';

  try {
    const data = await apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, kvkkApproved: true, marketingApproved, turnstileToken }) });
    if (data.requiresVerification) {
      showToast(data.message, 'success');
      document.getElementById('form-register').classList.add('hidden');
      document.getElementById('form-login').classList.add('hidden');
      document.getElementById('form-verify').classList.remove('hidden');
      document.getElementById('verify-email').value = data.email || email;
    } else {
      saveAuth(data.data.token, data.data.user);
      showToast('Kayıt başarılı! Hoş geldiniz.', 'success'); showHome();
    }
  } catch (err) { showToast(err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = oldHtml; }
}

async function handleVerify(e) {
  e.preventDefault();
  const email = document.getElementById('verify-email').value;
  const code = document.getElementById('verify-code').value.trim();
  
  if (!code || code.length !== 6) { showToast('Lütfen 6 haneli kodu girin.', 'error'); return; }
  
  const btn = e.target.querySelector('button[type="submit"]');
  const oldHtml = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = 'Bekleyin...';

  try {
    const data = await apiRequest('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, code }) });
    saveAuth(data.data.token, data.data.user);
    showToast('Hesabınız başarıyla doğrulandı!', 'success');
    
    // Formu sıfırla ve anasayfaya dön
    document.getElementById('form-verify').classList.add('hidden');
    document.getElementById('form-login').classList.remove('hidden');
    document.getElementById('verify-code').value = '';
    
    showHome();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = oldHtml;
  }
}

// ── PROFİL ──
async function loadProfile() {
  const el = document.getElementById('profile-content');
  if (!state.token) { el.innerHTML = '<p>Profili görmek için giriş yapın.</p>'; return; }
  try {
    const data = await apiRequest('/auth/profile');
    const u = data.data;
    const reqs = (u.requests || []).map(r => `<tr><td>${r.plateNumber}</td><td>${r.status}</td><td>${new Date(r.createdAt).toLocaleDateString('tr-TR')}</td></tr>`).join('');
    
    el.innerHTML = `<div class="profile-info"><div class="profile-row"><span>E-posta</span><span>${u.email}</span></div><div class="profile-row"><span>Kayıt Tarihi</span><span>${new Date(u.createdAt).toLocaleDateString('tr-TR')}</span></div></div>
    ${u.requests&&u.requests.length?'<h3 style="margin-top:1.5rem;margin-bottom:.5rem">Sahiplenme Taleplerim</h3><table class="admin-table"><thead><tr><th>Plaka</th><th>Durum</th><th>Tarih</th></tr></thead><tbody>'+reqs+'</tbody></table>':'<p class="text-muted" style="margin-top:1rem">Henüz sahiplenme talebiniz yok.</p>'}
    
    <div id="user-messages" style="margin-top: 2rem;">
      <h3 style="margin-bottom: 1rem;">📩 Mesajlarım (Gelen Kutusu)</h3>
      <div id="user-messages-list"><p class="text-muted">Mesajlarınız yükleniyor...</p></div>
    </div>`;
    
    // Mesajları yükle
    await loadUserMessages();
  } catch (err) { el.innerHTML = '<p class="text-muted">Profil yüklenemedi.</p>'; }
}

// Kullanıcının mesajlarını çeken fonksiyon
async function loadUserMessages() {
  const container = document.getElementById('user-messages-list');
  if (!container) return;
  
  try {
    const data = await apiRequest('/messages/inbox');
    const messages = data.data;
    
    if (!messages || messages.length === 0) {
      container.innerHTML = '<p class="text-muted">Hiç mesajınız yok.</p>';
      return;
    }
    
    const html = messages.map(m => {
      const isReadHtml = m.isRead ? '<span style="color:#64748b; font-size:0.8rem;">✓ Okundu</span>' : '<span style="color:#ef4444; font-size:0.8rem; font-weight:bold;">! Yeni</span>';
      const actionHtml = m.isRead ? '' : `<button class="btn btn-outline-sm" style="margin-top:10px;" onclick="markMessageAsRead('${m._id}')">Okundu İşaretle</button>`;
      
      return `<div class="card card-item" style="border: 1px solid ${m.isRead ? '#e2e8f0' : '#cbd5e1'}; background: ${m.isRead ? '#fff' : '#f8fafc'}; margin-bottom:1rem; padding:1rem; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <strong>${m.subject}</strong>
          <div>${isReadHtml} <span class="text-muted" style="font-size:0.75rem; margin-left:8px;">${new Date(m.createdAt).toLocaleDateString('tr-TR')}</span></div>
        </div>
        <p style="font-size:0.9rem; color:#334155; white-space:pre-wrap; margin:0;">${m.content}</p>
        ${actionHtml}
      </div>`;
    }).join('');
    
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p class="text-muted">Mesajlar alınamadı: ${err.message}</p>`;
  }
}

async function markMessageAsRead(msgId) {
  try {
    await apiRequest(`/messages/${msgId}/read`, { method: 'PUT' });
    loadUserMessages(); // Tabloyu yenile
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function startShopierPayment() {
  try {
    showToast('Ödeme sayfasına yönlendiriliyorsunuz...', 'info');
    const res = await apiRequest('/payment/shopier/start', { method: 'POST' });
    const sData = res.data;
    
    // Shopier'e post etmek için dinamik form oluştur
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://shopier.com/ShowProduct/api_pay4.php';
    form.style.display = 'none';

    for (const key in sData) {
      if (sData.hasOwnProperty(key)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = sData[key];
        form.appendChild(input);
      }
    }

    document.body.appendChild(form);
    form.submit(); // Shopier'e git
  } catch (err) {
    showToast('Ödeme başlatılamadı: ' + err.message, 'error');
  }
}

// ── SAHİPLENME TALEBİ ──
async function handleClaimRequest(e) {
  e.preventDefault();
  if (!state.token) { showToast('Giriş yapmalısınız.', 'error'); showSection('auth'); return; }
  const plateNumber = document.getElementById('claim-plate').value.trim();
  const fileInput = document.getElementById('claim-doc');
  const formData = new FormData();
  formData.append('plateNumber', plateNumber);
  if (fileInput.files[0]) formData.append('document', fileInput.files[0]);
  try {
    await apiRequest('/auth/claim-request', { method: 'POST', body: formData });
    showToast('Sahiplenme talebiniz alındı!', 'success');
    document.getElementById('claim-form').reset();
  } catch (err) { showToast(err.message, 'error'); }
}

// ── ADMIN PANELİ ──
async function loadAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const el = document.getElementById('admin-content');
  el.innerHTML = '<p class="text-muted">Yükleniyor...</p>';
  try {
    if (tab === 'dashboard') await loadAdminDashboard(el);
    else if (tab === 'visitors') await loadAdminVisitors(el);
    else if (tab === 'users') await loadAdminUsers(el);
    else if (tab === 'comments') await loadAdminComments(el);
    else if (tab === 'claims') await loadAdminClaims(el);
    else if (tab === 'reports') await loadAdminReports(el);
    else if (tab === 'owner-reports') await loadAdminOwnerReports(el);
    else if (tab === 'reverifications') await loadAdminReverifications(el);
    else if (tab === 'messages') await loadAdminMessages(el);
    else if (tab === 'admins') await loadAdminAdmins(el);
    else if (tab === 'maintenance') await loadAdminMaintenance(el);
    else if (tab === 'settings') await loadAdminSettings(el);
  } catch (err) { el.innerHTML = '<p class="text-muted">Hata: ' + err.message + '</p>'; }
}
async function loadAdminDashboard(el) {
  const data = await apiRequest('/admin/dashboard');
  const d = data.data;
  el.innerHTML = `<div class="stat-grid"><div class="stat-card"><div class="stat-number">${d.totalPlates}</div><div class="stat-label">Toplam Plaka</div></div><div class="stat-card"><div class="stat-number">${d.pendingComments}</div><div class="stat-label">Bekleyen Yorum</div></div><div class="stat-card"><div class="stat-number">${d.totalUsers}</div><div class="stat-label">Kullanıcı</div></div><div class="stat-card"><div class="stat-number">${d.pendingClaimRequests}</div><div class="stat-label">Bekleyen Talep</div></div></div><div class="stat-grid"><div class="stat-card"><div class="stat-number">${d.approvedComments}</div><div class="stat-label">Onaylı Yorum</div></div><div class="stat-card"><div class="stat-number">${d.rejectedComments}</div><div class="stat-label">Reddedilen</div></div><div class="stat-card"><div class="stat-number">${d.premiumUsers}</div><div class="stat-label">Premium</div></div><div class="stat-card"><div class="stat-number">${d.totalComments}</div><div class="stat-label">Toplam Yorum</div></div></div><div class="stat-grid"><div class="stat-card" style="border-left:3px solid #f59e0b"><div class="stat-number">${d.ownerReportedComments || 0}</div><div class="stat-label">🛡️ Sahip Şikayetleri</div></div><div class="stat-card" style="border-left:3px solid #8b5cf6"><div class="stat-number">${d.pendingReverifications || 0}</div><div class="stat-label">🔄 Bekleyen Doğrulama</div></div></div>`;
}
async function loadAdminUsers(el) {
  const data = await apiRequest('/admin/users');
  const users = data.data;
  state.adminUsers = users;
  if (!users.length) { el.innerHTML = '<p class="text-muted">Sistemde kullanıcı yok.</p>'; return; }
  
  const rows = users.map(u => {
    const isPremium = u.isPremium ? '⭐ Premium' : 'Standart';
    const date = new Date(u.createdAt).toLocaleDateString('tr-TR');
    const platesHtml = u.ownedPlates && u.ownedPlates.length 
      ? u.ownedPlates.map(p => `<button class="btn-link" style="padding:0;font-weight:700;margin-right:8px" onclick="adminSearchPlate('${p}')">${p}</button>`).join('')
      : '<span class="text-muted">-</span>';
      
    const kvkkHtml = u.kvkkApproved ? '<span style="color:#10b981;font-weight:700">✓ Onaylandı</span>' : '<span class="text-muted">-</span>';
    
    // Güvenlik logları (IP ve Email Doğrulama)
    const emailVerifiedBadge = u.isEmailVerified ? '<span style="color:#10b981;font-size:0.7rem;display:block;">✓ Mail Onaylı</span>' : '<span style="color:#ef4444;font-size:0.7rem;display:block;">✕ Onaysız</span>';
    const ipInfo = `<div style="font-size:0.75rem;line-height:1.2;color:#475569;">
      <strong>Kayıt:</strong> ${u.registrationIp || '-'}<br>
      <strong>Son:</strong> ${u.lastLoginIp || '-'}<br>
      <button class="btn-link" style="padding:0;font-size:0.7rem;margin-top:4px;" onclick="showUserLogs('${u._id}')">[Tüm Geçmişi Gör]</button>
    </div>`;

    let actions = '';
    if (state.user && state.user.email !== u.email) {
      const banText = u.isBanned ? '🟢 Engeli Kaldır' : '🔴 Engelle';
      const banClass = u.isBanned ? 'btn-green' : 'btn-red-outline';
      actions = `<div style="display:flex;gap:0.5rem;"><button class="btn btn-outline-sm ${banClass}" style="padding:0.25rem 0.5rem;font-size:0.75rem" onclick="toggleUserBan('${u._id}', ${u.isBanned}, '${u.email}')">${banText}</button> <button class="btn btn-red-outline" style="padding:0.25rem 0.5rem;font-size:0.75rem" onclick="deleteUser('${u._id}', '${u.email}')">🗑️ Sil</button></div>`;
    } else {
      actions = '<span class="badge badge-blue">Siz</span>';
    }

    const emailDisplay = u.isBanned ? `<span style="text-decoration:line-through;color:#ef4444">${u.email}</span>${emailVerifiedBadge}` : `${u.email}${emailVerifiedBadge}`;

    return `<tr><td>${emailDisplay}</td><td>${ipInfo}</td><td>${isPremium}</td><td>${platesHtml}</td><td>${kvkkHtml}</td><td>${date}</td><td>${actions}</td></tr>`;
  }).join('');
  
  el.innerHTML = `<table class="admin-table"><thead><tr><th>E-posta</th><th>Güvenlik (IP)</th><th>Üyelik</th><th>Plakalar</th><th>KVKK</th><th>Kayıt Tarihi</th><th>İşlem</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function showUserLogs(userId) {
  const user = state.adminUsers.find(u => u._id === userId);
  if(!user) return;
  
  let html = `<div style="max-height:400px;overflow-y:auto;text-align:left;background:#fff;border-radius:8px;">`;
  
  // Kopyalama verisi hazırlığı (Tab-separated)
  let copyData = `E-posta: ${user.email}\n\nİşlem (Action)\tTarih (UTC Timestamp)\tIP Adresi\tTarayıcı/Cihaz (User-Agent)\n`;

  if(!user.loginHistory || user.loginHistory.length === 0) {
    html += `<p class="text-muted" style="padding:1rem;">Bu kullanıcının henüz kaydedilmiş bir giriş geçmişi yok.</p>`;
    copyData = "Kayıt bulunamadı.";
  } else {
    html += `<table class="admin-table" style="font-size:0.8rem;width:100%;">
      <thead><tr><th style="text-align:left;">İşlem (Action)</th><th style="text-align:left;">Tarih (Timestamp)</th><th style="text-align:left;">IP Adresi</th><th style="text-align:left;">Tarayıcı/Cihaz (User-Agent)</th></tr></thead><tbody>`;
    
    // Sort descending
    const history = [...user.loginHistory].sort((a,b) => new Date(b.date) - new Date(a.date));
    history.forEach(h => {
      // Date to UTC formatted string (e.g., 2026-06-23 09:12:41 UTC)
      const dObj = new Date(h.date);
      const dDate = dObj.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      
      const dIp = h.ipAddress || '-';
      const dUa = h.userAgent || '-';
      const actionText = h.action || 'Giriş Yaptı';
      
      html += `<tr><td><strong>${actionText}</strong></td><td><code>${dDate}</code></td><td>${dIp}</td><td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${dUa}">${dUa}</td></tr>`;
      copyData += `${actionText}\t${dDate}\t${dIp}\t${dUa}\n`;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;
  
  const popupContent = document.querySelector('#image-popup .popup-content');
  if(popupContent) {
    document.getElementById('popup-img').classList.add('hidden');
    let logsContainer = document.getElementById('popup-logs');
    if(!logsContainer) {
      logsContainer = document.createElement('div');
      logsContainer.id = 'popup-logs';
      logsContainer.style.padding = '1rem';
      logsContainer.style.marginTop = '2rem';
      popupContent.appendChild(logsContainer);
    }
    
    // Panoya Kopyalama Butonu ve Fonksiyonu
    window.copyLogsToClipboard = function() {
      navigator.clipboard.writeText(copyData).then(() => {
        showToast("Kayıtlar panoya kopyalandı! Excel veya Word'e yapıştırabilirsiniz.", 'success');
      }).catch(err => {
        showToast('Kopyalama başarısız oldu.', 'error');
      });
    };

    logsContainer.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
        <h3 style="margin:0;">${user.email} - Giriş Geçmişi</h3>
        <button class="btn btn-outline-sm" onclick="copyLogsToClipboard()">📋 Kopyala</button>
      </div>
      ${html}`;
    
    logsContainer.classList.remove('hidden');
    document.getElementById('image-popup').classList.remove('hidden');
  }
}

async function toggleUserBan(userId, isBanned, email) {
  const actionText = isBanned ? 'engelini kaldırmak' : 'engellemek';
  if (!confirm(`${email} kullanıcısının ${actionText} istediğinize emin misiniz?`)) return;
  try {
    const data = await apiRequest('/admin/users/' + userId + '/ban', { method: 'PUT' });
    showToast(data.message, 'success');
    loadAdminTab('users');
  } catch(err) { showToast(err.message, 'error'); }
}

async function deleteUser(userId, email) {
  if (!confirm(`DİKKAT! ${email} kullanıcısını tamamen silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`)) return;
  try {
    const data = await apiRequest('/admin/users/' + userId, { method: 'DELETE' });
    showToast(data.message, 'success');
    loadAdminTab('users');
  } catch(err) { showToast(err.message, 'error'); }
}
async function loadAdminComments(el) {
  const data = await apiRequest('/admin/comments/pending');
  const comments = data.data;
  if (!comments.length) { el.innerHTML = '<p class="text-muted">Bekleyen yorum yok. 🎉</p>'; return; }
  const rows = comments.map(c => {
    const plate = c.plateId ? c.plateId.plateNumber : '?';
    const plateEl = plate !== '?' ? `<button class="btn-link" style="padding:0;font-weight:700" onclick="adminSearchPlate('${plate}')">${plate}</button>` : '?';
    const user = c.userId ? c.userId.email : 'Anonim';
    const date = new Date(c.createdAt).toLocaleDateString('tr-TR');
    return `<tr><td>${plateEl}</td><td>${escapeHtml(c.content).substring(0,60)}...</td><td>${c.category}</td><td>${user}</td><td>${date}</td><td class="admin-actions"><button class="btn btn-green" onclick="adminApproveComment('${c._id}')">✓ Onayla</button><button class="btn btn-red-outline" onclick="adminRejectComment('${c._id}')">✕ Reddet</button></td></tr>`;
  }).join('');
  el.innerHTML = `<table class="admin-table"><thead><tr><th>Plaka</th><th>Yorum</th><th>Kategori</th><th>Kullanıcı</th><th>Tarih</th><th>İşlem</th></tr></thead><tbody>${rows}</tbody></table>`;
}
async function adminApproveComment(id) {
  try { await apiRequest('/admin/comments/' + id + '/approve', { method: 'PUT' }); showToast('Yorum onaylandı.', 'success'); loadAdminTab('comments'); }
  catch (err) { showToast(err.message, 'error'); }
}
async function adminRejectComment(id) {
  try { await apiRequest('/admin/comments/' + id + '/reject', { method: 'PUT' }); showToast('Yorum reddedildi.', 'info'); loadAdminTab('comments'); }
  catch (err) { showToast(err.message, 'error'); }
}

async function loadAdminReports(el) {
  const data = await apiRequest('/admin/comments/reported');
  const comments = data.data;
  if (!comments.length) { el.innerHTML = '<p class="text-muted">Şikayet edilen yorum yok. 🎉</p>'; return; }
  const rows = comments.map(c => {
    const plate = c.plateId ? c.plateId.plateNumber : '?';
    const plateEl = plate !== '?' ? `<button class="btn-link" style="padding:0;font-weight:700" onclick="adminSearchPlate('${plate}')">${plate}</button>` : '?';
    const user = c.userId ? c.userId.email : 'Anonim';
    const date = new Date(c.createdAt).toLocaleDateString('tr-TR');
    return `<tr><td>${plateEl}</td><td>${escapeHtml(c.content).substring(0,60)}...</td><td>${c.ipAddress}</td><td>${user}</td><td>${date}</td><td class="admin-actions"><button class="btn btn-red-outline" onclick="adminHideComment('${c._id}')">🗑️ Sil (Gizle)</button><button class="btn btn-outline-sm" onclick="adminApproveReportedComment('${c._id}')">İptal</button></td></tr>`;
  }).join('');
  el.innerHTML = `<table class="admin-table"><thead><tr><th>Plaka</th><th>Yorum</th><th>Yazan IP</th><th>Kullanıcı</th><th>Tarih</th><th>İşlem</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Admin panelinden plakaya tıklayınca arama sayfasına atar
function adminSearchPlate(plateNumber) {
  document.getElementById('search-input').value = plateNumber;
  handleSearch({ preventDefault: () => {} });
  window.scrollTo(0, 0); // Sayfanın üstüne at (Arama sonuçları yukarıdadır)
}

async function adminHideComment(id) {
  if(!confirm('Bu yorumu tamamen kaldırmak istediğinize emin misiniz?')) return;
  try { await apiRequest('/admin/comments/' + id + '/hide', { method: 'PUT' }); showToast('Yorum yayından kaldırıldı.', 'info'); loadAdminTab('reports'); }
  catch (err) { showToast(err.message, 'error'); }
}

async function adminApproveReportedComment(id) {
  try { await apiRequest('/admin/comments/' + id + '/approve', { method: 'PUT' }); showToast('Şikayet yoksayıldı. Yorum tekrar yayında.', 'success'); loadAdminTab('reports'); }
  catch (err) { showToast(err.message, 'error'); }
}

// ── ADMIN: PLAKA SAHİBİ ŞİKAYETLERİ ──
async function loadAdminOwnerReports(el) {
  const data = await apiRequest('/admin/comments/owner-reported');
  const comments = data.data;
  if (!comments.length) { el.innerHTML = '<p class="text-muted">Plaka sahibi şikayeti yok. 🎉</p>'; return; }
  const rows = comments.map(c => {
    const plate = c.plateId ? c.plateId.plateNumber : '?';
    const plateEl = plate !== '?' ? `<button class="btn-link" style="padding:0;font-weight:700" onclick="adminSearchPlate('${plate}')">${plate}</button>` : '?';
    const user = c.userId ? c.userId.email : 'Anonim';
    const owner = c.reportedByOwner ? c.reportedByOwner.email : '?';
    const reason = c.ownerReportReason || '-';
    const date = new Date(c.createdAt).toLocaleDateString('tr-TR');
    return `<tr><td>${plateEl}</td><td>${escapeHtml(c.content).substring(0,60)}...</td><td>${user}</td><td><strong>${owner}</strong></td><td style="font-size:0.8rem;max-width:200px">${escapeHtml(reason)}</td><td>${date}</td><td class="admin-actions"><button class="btn btn-red-outline" onclick="adminApproveOwnerReport('${c._id}')">🗑️ Kaldır</button><button class="btn btn-outline-sm" onclick="adminRejectOwnerReport('${c._id}')">❌ Reddet</button></td></tr>`;
  }).join('');
  el.innerHTML = `<table class="admin-table"><thead><tr><th>Plaka</th><th>Yorum</th><th>Yazan</th><th>Şikayet Eden (Sahip)</th><th>Sebep</th><th>Tarih</th><th>İşlem</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function adminApproveOwnerReport(id) {
  if (!confirm('Bu yorumu kaldırmak istediğinize emin misiniz? (Plaka sahibi şikayeti onaylanacak)')) return;
  try {
    await apiRequest('/admin/comments/' + id + '/owner-report-approve', { method: 'PUT' });
    showToast('Şikayet onaylandı. Yorum kaldırıldı.', 'success');
    loadAdminTab('owner-reports');
  } catch (err) { showToast(err.message, 'error'); }
}

async function adminRejectOwnerReport(id) {
  try {
    await apiRequest('/admin/comments/' + id + '/owner-report-reject', { method: 'PUT' });
    showToast('Şikayet reddedildi. Yorum tekrar yayında.', 'info');
    loadAdminTab('owner-reports');
  } catch (err) { showToast(err.message, 'error'); }
}

// ── ADMIN: YENİDEN DOĞRULAMA TALEPLERİ ──
async function loadAdminReverifications(el) {
  const data = await apiRequest('/admin/reverifications');
  const requests = data.data;
  if (!requests.length) { el.innerHTML = '<p class="text-muted">Bekleyen yeniden doğrulama talebi yok. 🎉</p>'; return; }
  const rows = requests.map(r => {
    const date = new Date(r.createdAt).toLocaleDateString('tr-TR');
    const docBtn = r.documentPath ? `<button class="btn btn-blue-outline" onclick="showDocPopup('${r.documentPath}')">📄 Ruhsat</button>` : '-';
    const dateProofBtn = r.dateProofPath ? `<button class="btn btn-blue-outline" onclick="showDocPopup('${r.dateProofPath}')">📅 Tarihli Kağıt</button>` : '-';
    return `<tr><td>${r.plateNumber}</td><td>${r.userEmail}</td><td>${docBtn}</td><td>${dateProofBtn}</td><td>${date}</td><td class="admin-actions"><button class="btn btn-green" onclick="adminApproveReverification('${r.userId}','${r._id}')">✓ Onayla</button><button class="btn btn-red-outline" onclick="adminRejectReverification('${r.userId}','${r._id}')">✕ Reddet</button></td></tr>`;
  }).join('');
  el.innerHTML = `<table class="admin-table"><thead><tr><th>Plaka</th><th>Kullanıcı</th><th>Ruhsat</th><th>Tarihli Kağıt</th><th>Tarih</th><th>İşlem</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function adminApproveReverification(userId, reqId) {
  try {
    await apiRequest('/admin/reverifications/' + userId + '/' + reqId + '/approve', { method: 'PUT' });
    showToast('Yeniden doğrulama onaylandı. Süre 3 ay uzatıldı.', 'success');
    loadAdminTab('reverifications');
  } catch (err) { showToast(err.message, 'error'); }
}

async function adminRejectReverification(userId, reqId) {
  if (!confirm('DİKKAT! Yeniden doğrulama reddedilirse plaka sahiplenme iptal edilecektir. Emin misiniz?')) return;
  try {
    await apiRequest('/admin/reverifications/' + userId + '/' + reqId + '/reject', { method: 'PUT' });
    showToast('Yeniden doğrulama reddedildi. Plaka sahiplenme iptal edildi.', 'info');
    loadAdminTab('reverifications');
  } catch (err) { showToast(err.message, 'error'); }
}
async function loadAdminClaims(el) {
  const data = await apiRequest('/admin/claims');
  const claims = data.data;
  if (!claims.length) { el.innerHTML = '<p class="text-muted">Bekleyen sahiplenme talebi yok. 🎉</p>'; return; }
  const rows = claims.map(c => {
    const date = new Date(c.createdAt).toLocaleDateString('tr-TR');
    const docBtn = c.documentPath ? `<button class="btn btn-blue-outline" onclick="showDocPopup('${c.documentPath}')">📄 Belge</button>` : '<span class="text-muted">Yok</span>';
    return `<tr><td>${c.plateNumber}</td><td>${c.userEmail}</td><td>${docBtn}</td><td>${date}</td><td class="admin-actions"><button class="btn btn-green" onclick="adminApproveClaim('${c.userId}','${c._id}')">✓ Onayla</button><button class="btn btn-red-outline" onclick="adminRejectClaim('${c.userId}','${c._id}')">✕ Reddet</button></td></tr>`;
  }).join('');
  el.innerHTML = `<table class="admin-table"><thead><tr><th>Plaka</th><th>Kullanıcı</th><th>Belge</th><th>Tarih</th><th>İşlem</th></tr></thead><tbody>${rows}</tbody></table>`;
}
async function adminApproveClaim(userId, reqId) {
  try { await apiRequest('/admin/claims/' + userId + '/' + reqId + '/approve', { method: 'PUT' }); showToast('Sahiplenme onaylandı! Kullanıcı Premium yapıldı.', 'success'); loadAdminTab('claims'); }
  catch (err) { showToast(err.message, 'error'); }
}
async function adminRejectClaim(userId, reqId) {
  try { await apiRequest('/admin/claims/' + userId + '/' + reqId + '/reject', { method: 'PUT' }); showToast('Talep reddedildi.', 'info'); loadAdminTab('claims'); }
  catch (err) { showToast(err.message, 'error'); }
}

async function loadAdminSettings(el) {
  try {
    const data = await apiRequest('/admin/settings');
    const s = data.data;
    const renderSocial = (p, v) => `<div class="social-item"><span style="width:80px;font-size:.8rem;font-weight:600">${p}</span><input type="text" id="set-soc-${p}" value="${v||''}" placeholder="Link giriniz..."></div>`;
    const soc = s.socialLinks || [];
    const getS = (p) => { const f = soc.find(x=>x.platform===p); return f?f.url:''; };
    
    el.innerHTML = `
      <div class="settings-section">
        <h3>İletişim Bilgileri</h3>
        <div class="settings-row"><label>Domain</label><input type="text" id="set-domain" value="${s.domain||'plakayorum.com'}" placeholder="plakayorum.com"></div>
        <div class="settings-row"><label>E-posta</label><input type="email" id="set-email" value="${s.contactEmail||''}"></div>
        <div class="settings-row"><label>Kaldırma Talebi</label><input type="email" id="set-rem" value="${s.removalEmail||''}"></div>
        <div class="settings-row"><label>Telefon</label><input type="text" id="set-phone" value="${s.contactPhone||''}"></div>
      </div>
      <div class="settings-section">
        <h3>Sosyal Medya</h3>
        ${['instagram','twitter','facebook','youtube','tiktok'].map(p => renderSocial(p, getS(p))).join('')}
      </div>
      <button class="btn btn-primary" onclick="saveAdminSettings()">💾 Ayarları Kaydet</button>
    `;
  } catch (err) { el.innerHTML = '<p class="text-muted">Ayarlar yüklenemedi: ' + err.message + '</p>'; }
}
async function saveAdminSettings() {
  const body = {
    domain: document.getElementById('set-domain').value.trim(),
    contactEmail: document.getElementById('set-email').value.trim(),
    removalEmail: document.getElementById('set-rem').value.trim(),
    contactPhone: document.getElementById('set-phone').value.trim(),
    socialLinks: ['instagram','twitter','facebook','youtube','tiktok'].map(p => ({ platform: p, url: document.getElementById('set-soc-'+p).value.trim() })).filter(x => x.url)
  };
  try {
    await apiRequest('/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
    showToast('Ayarlar kaydedildi.', 'success');
    loadSiteSettings(); // Footer'ı güncelle
  } catch (err) { showToast(err.message, 'error'); }
}

// ── SİTE AYARLARI YÜKLE (FOOTER & YASAL SAYFALAR) ──
async function loadSiteSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if(data.success) {
      const s = data.data;
      if(s.contactEmail) {
        document.querySelectorAll('.dynamic-contact-email').forEach(el => {
          if(el.tagName === 'A' && el.classList.contains('dynamic-contact-mailto')) {
            el.href = 'mailto:' + s.contactEmail;
            el.textContent = s.contactEmail;
          } else {
            el.textContent = s.contactEmail;
          }
        });
      }
      if(s.removalEmail) {
        document.querySelectorAll('.dynamic-removal-email').forEach(el => {
          if(el.tagName === 'A' && el.classList.contains('dynamic-removal-mailto')) {
            el.href = 'mailto:' + s.removalEmail;
            el.textContent = s.removalEmail;
          } else {
            el.textContent = s.removalEmail;
          }
        });
      }
      if(s.domain) {
        document.querySelectorAll('.dynamic-domain').forEach(el => {
          el.textContent = s.domain;
        });
      }
      if(s.contactPhone) document.getElementById('footer-phone').innerHTML = '📞 ' + s.contactPhone;
      
      const socEl = document.getElementById('footer-social');
      if(s.socialLinks && s.socialLinks.length) {
        const icons = { instagram: '📸', twitter: '𝕏', facebook: 'f', youtube: '▶', tiktok: '🎵' };
        socEl.innerHTML = s.socialLinks.map(l => `<a href="${l.url}" target="_blank" title="${l.platform}">${icons[l.platform]||'🔗'}</a>`).join('');
      }
    }
  } catch(e) {}
}

// ── POPUP ──
function showDocPopup(path) {
  if (path.toLowerCase().endsWith('.pdf')) {
    window.open(path, '_blank');
  } else {
    document.getElementById('popup-img').src = path;
    document.getElementById('popup-img').classList.remove('hidden');
    const logs = document.getElementById('popup-logs');
    if(logs) logs.classList.add('hidden');
    document.getElementById('image-popup').classList.remove('hidden');
  }
}
function closePopup() { 
  document.getElementById('image-popup').classList.add('hidden'); 
  document.getElementById('popup-img').classList.remove('hidden');
  const logs = document.getElementById('popup-logs');
  if(logs) logs.classList.add('hidden');
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();
  loadSiteSettings();
  const si = document.getElementById('search-input');
  si.addEventListener('input', () => { const p = si.selectionStart; si.value = cleanPlate(si.value); si.setSelectionRange(p, p); });
});

// ── İLETİŞİM (CONTACT) FONKSİYONLARI ──
async function handleContact(e) {
  e.preventDefault();
  const name = document.getElementById('contact-name').value.trim();
  const email = document.getElementById('contact-email').value.trim();
  const message = document.getElementById('contact-message').value.trim();
  
  const btn = e.target.querySelector('button[type="submit"]');
  const oldHtml = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = 'Gönderiliyor...';

  try {
    const data = await apiRequest('/contact', {
      method: 'POST',
      body: JSON.stringify({ name, email, message })
    });
    showToast(data.message || 'Mesajınız gönderildi.', 'success');
    document.getElementById('form-contact').reset();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = oldHtml;
  }
}

async function loadAdminMessages(el) {
  try {
    const data = await apiRequest('/admin/messages');
    const messages = data.data;
    if (!messages.length) { el.innerHTML = '<p class="text-muted">Gelen kutusu boş.</p>'; return; }
    
    const rows = messages.map(m => {
      const date = new Date(m.createdAt).toLocaleString('tr-TR');
      const statusBadge = m.status === 'Pending' ? '<span class="badge badge-red">Bekliyor</span>' : '<span class="badge badge-green">Yanıtlandı</span>';
      const actionHtml = m.status === 'Pending' 
        ? `<button class="btn btn-primary" onclick="adminReplyMessage('${m._id}')">Yanıtla</button>`
        : `<span class="text-muted">Cevaplandı: ${m.adminReply}</span>`;
      
      return `<div class="card card-item" style="border:1px solid var(--border-color); margin-bottom:1rem; padding:1rem; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
          <strong>${escapeHtml(m.name)} (${escapeHtml(m.email)})</strong>
          <div>${statusBadge} <span class="text-muted" style="font-size:0.8rem;">${date}</span></div>
        </div>
        <p style="background:var(--input-bg); padding:10px; border-radius:6px; font-size:0.9rem;">${escapeHtml(m.message)}</p>
        <div style="margin-top:10px; text-align:right;">
          ${actionHtml}
        </div>
      </div>`;
    }).join('');
    
    el.innerHTML = rows;
  } catch (err) {
    el.innerHTML = `<p class="text-muted">Hata: ${err.message}</p>`;
  }
}

async function adminReplyMessage(id) {
  const replyText = prompt('Kullanıcıya iletilecek yanıtınızı yazın: (Bu yanıt kullanıcının e-posta adresine gönderilecektir.)');
  if (!replyText || replyText.trim() === '') return;
  
  try {
    const data = await apiRequest(`/admin/messages/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply: replyText.trim() })
    });
    showToast(data.message, 'success');
    loadAdminTab('messages'); // listeyi yenile
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── BAKIM MODU KONTROLÜ ──
async function checkMaintenanceMode() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success && data.data.maintenanceMode) {
      const overlay = document.getElementById('maintenance-overlay');
      const msg = document.getElementById('maintenance-message');
      if (overlay) {
        msg.textContent = data.data.maintenanceMessage || 'Site bakım modundadır.';
        overlay.classList.remove('hidden');
      }
      // Admin giriş yapmışsa bakım modunu gösterme
      if (state.user && state.user.isAdmin) {
        overlay.classList.add('hidden');
      }
    }
  } catch(e) {}
}

// ── OKUNMAMIŞ MESAJ SAYISI ──
async function checkUnreadMessages() {
  try {
    const data = await apiRequest('/chat/unread-count');
    const badge = document.getElementById('chat-unread-badge');
    if (data.data.count > 0) {
      badge.textContent = data.data.count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch(e) {}
}

// ── ADMIN: ZİYARETÇİ İSTATİSTİKLERİ ──
async function loadAdminVisitors(el) {
  const data = await apiRequest('/admin/visitors?days=30');
  const d = data.data;
  const stats = d.dailyStats || [];
  
  const labels = stats.slice().reverse().map(s => s.date);
  const dataPageViews = stats.slice().reverse().map(s => s.pageViews);
  const dataUnique = stats.slice().reverse().map(s => s.uniqueVisitors);

  const tableRows = stats.map(s =>
    `<tr><td>${s.date}</td><td>${s.pageViews}</td><td>${s.uniqueVisitors}</td></tr>`
  ).join('');

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-number">${d.todayPageViews}</div><div class="stat-label">Bugün Görüntüleme</div></div>
      <div class="stat-card"><div class="stat-number">${d.todayUniqueVisitors}</div><div class="stat-label">Bugün Benzersiz</div></div>
      <div class="stat-card"><div class="stat-number">${d.totalPageViews}</div><div class="stat-label">30 Gün Toplam</div></div>
      <div class="stat-card"><div class="stat-number">${d.totalUniqueVisitors}</div><div class="stat-label">30 Gün Benzersiz</div></div>
    </div>
    <div class="settings-section">
      <h3>📊 Son 30 Gün Grafik</h3>
      <div style="position: relative; height:300px; width:100%;">
        <canvas id="visitorChart"></canvas>
      </div>
    </div>
    <div class="settings-section" style="margin-top:1rem">
      <h3>📋 Günlük Detay</h3>
      <table class="admin-table"><thead><tr><th>Tarih</th><th>Görüntüleme</th><th>Benzersiz Ziyaretçi</th></tr></thead><tbody>${tableRows}</tbody></table>
    </div>`;

  if (window.visitorChartInstance) {
    window.visitorChartInstance.destroy();
  }

  const ctx = document.getElementById('visitorChart').getContext('2d');
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#f8fafc' : '#1e293b';
  const gridColor = isDark ? '#334155' : '#e2e8f0';

  window.visitorChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Görüntüleme (Sayfa Görüntülenmesi)',
          data: dataPageViews,
          borderColor: '#800080',
          backgroundColor: 'rgba(128, 0, 128, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0,
          pointBackgroundColor: '#800080',
          pointRadius: 4
        },
        {
          label: 'Benzersiz Ziyaretçi',
          data: dataUnique,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0,
          pointBackgroundColor: '#2563eb',
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
      },
      plugins: {
        legend: { labels: { color: textColor, font: { family: 'Inter' } } },
        tooltip: { mode: 'index', intersect: false }
      },
      interaction: { mode: 'nearest', axis: 'x', intersect: false }
    }
  });
}

// ── ADMIN: BAKIM MODU YÖNETİMİ ──
async function loadAdminMaintenance(el) {
  const data = await apiRequest('/admin/maintenance');
  const d = data.data;
  el.innerHTML = `
    <div class="settings-section">
      <h3>🔧 Bakım Modu</h3>
      <p class="text-muted" style="margin-bottom:1rem">Bakım modunu aktif ettiğinizde, admin dışında hiçbir kullanıcı siteyi kullanamaz. API istekleri 503 döner.</p>
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">
        <span style="font-weight:600;font-size:.85rem">Durum:</span>
        <span class="badge ${d.maintenanceMode ? 'badge-red' : 'badge-green'}" style="font-size:.8rem">${d.maintenanceMode ? '🔴 AKTİF' : '🟢 PASİF'}</span>
      </div>
      <div class="form-group">
        <label>Bakım Mesajı</label>
        <textarea id="maint-message" rows="3" style="width:100%;padding:.5rem .75rem;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;font-family:inherit">${d.maintenanceMessage || ''}</textarea>
      </div>
      <div style="display:flex;gap:.5rem;margin-top:1rem">
        <button class="btn ${d.maintenanceMode ? 'btn-green' : 'btn-red-outline'}" onclick="toggleMaintenance(${!d.maintenanceMode})" style="padding:.5rem 1.25rem;font-size:.85rem">${d.maintenanceMode ? '✅ Bakımı Kapat' : '🔧 Bakım Modunu Aç'}</button>
      </div>
    </div>`;
}
async function toggleMaintenance(enable) {
  const msg = document.getElementById('maint-message');
  try {
    await apiRequest('/admin/maintenance', { method: 'PUT', body: JSON.stringify({ maintenanceMode: enable, maintenanceMessage: msg ? msg.value : '' }) });
    showToast(enable ? 'Bakım modu aktif edildi.' : 'Bakım modu kapatıldı.', 'success');
    loadAdminTab('maintenance');
  } catch(err) { showToast(err.message, 'error'); }
}

// ── ADMIN: ADMIN YÖNETİMİ ──
async function loadAdminAdmins(el) {
  const data = await apiRequest('/admin/admins');
  const admins = data.data;
  const rows = admins.map(a => {
    const date = new Date(a.createdAt).toLocaleDateString('tr-TR');
    const badge = a.isCurrent ? ' <span class="badge badge-blue">Siz</span>' : '';
    const actions = a.isCurrent
      ? `<button class="btn btn-outline-sm" onclick="editAdmin('${a._id}','${a.email}')">✏️ Düzenle</button>`
      : `<button class="btn btn-outline-sm" onclick="editAdmin('${a._id}','${a.email}')">✏️ Düzenle</button> <button class="btn btn-red-outline" onclick="removeAdmin('${a._id}','${a.email}')">🗑️ Kaldır</button>`;
    return `<tr><td>${a.email}${badge}</td><td>${date}</td><td class="admin-actions">${actions}</td></tr>`;
  }).join('');

  el.innerHTML = `
    <div class="settings-section">
      <h3>🔐 Admin Listesi</h3>
      <table class="admin-table"><thead><tr><th>E-posta</th><th>Kayıt Tarihi</th><th>İşlem</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="settings-section" style="margin-top:1rem">
      <h3>➕ Yeni Admin Ekle</h3>
      <div class="form-group"><label>E-posta</label><input type="email" id="new-admin-email" placeholder="admin@email.com" /></div>
      <div class="form-group"><label>Şifre (min 6 karakter)</label><input type="password" id="new-admin-password" placeholder="••••••" minlength="6" /></div>
      <button class="btn btn-primary" onclick="addNewAdmin()">Admin Ekle</button>
    </div>`;
}
async function addNewAdmin() {
  const email = document.getElementById('new-admin-email').value.trim();
  const password = document.getElementById('new-admin-password').value;
  if (!email || !password) { showToast('E-posta ve şifre zorunludur.', 'error'); return; }
  try {
    const data = await apiRequest('/admin/admins', { method: 'POST', body: JSON.stringify({ email, password }) });
    showToast(data.message, 'success');
    loadAdminTab('admins');
  } catch(err) { showToast(err.message, 'error'); }
}
async function editAdmin(id, currentEmail) {
  const newEmail = prompt('Yeni e-posta (değiştirmek istemiyorsanız boş bırakın):', currentEmail);
  if (newEmail === null) return;
  const newPassword = prompt('Yeni şifre (değiştirmek istemiyorsanız boş bırakın):');
  if (newPassword === null) return;
  const body = {};
  if (newEmail && newEmail !== currentEmail) body.email = newEmail;
  if (newPassword) body.password = newPassword;
  if (Object.keys(body).length === 0) { showToast('Değişiklik yapılmadı.', 'info'); return; }
  try {
    await apiRequest('/admin/admins/' + id, { method: 'PUT', body: JSON.stringify(body) });
    showToast('Admin bilgileri güncellendi.', 'success');
    loadAdminTab('admins');
  } catch(err) { showToast(err.message, 'error'); }
}
async function removeAdmin(id, email) {
  if (!confirm(`${email} adlı adminin yetkisini kaldırmak istediğinize emin misiniz?`)) return;
  try {
    await apiRequest('/admin/admins/' + id, { method: 'DELETE' });
    showToast('Admin yetkisi kaldırıldı.', 'success');
    loadAdminTab('admins');
  } catch(err) { showToast(err.message, 'error'); }
}

// ── CHAT SİSTEMİ ──
let chatCurrentPartnerId = null;
let chatPollInterval = null;

async function loadChatConversations() {
  if (!state.token) { showToast('Chat için giriş yapmalısınız.', 'error'); showSection('auth'); return; }
  const container = document.getElementById('chat-conversations');
  try {
    const data = await apiRequest('/chat/conversations');
    const convs = data.data;
    if (!convs || !convs.length) {
      container.innerHTML = '<p class="text-muted" style="padding:1rem;text-align:center;">Henüz konuşmanız yok.<br>Yukarıdan kullanıcı arayarak başlayın.</p>';
      return;
    }
    container.innerHTML = convs.map(c => {
      const d = new Date(c.lastMessageDate).toLocaleDateString('tr-TR');
      const prefix = c.isSentByMe ? 'Siz: ' : '';
      const unread = c.unreadCount > 0 ? `<span class="chat-conv-unread">${c.unreadCount}</span>` : '';
      const activeClass = chatCurrentPartnerId === c.partnerId ? ' active' : '';
      return `<div class="chat-conv-item${activeClass}" onclick="openChat('${c.partnerId}','${c.partnerEmail}')">
        <span class="conv-email">${c.partnerEmail}</span>
        <span class="conv-preview">${prefix}${c.lastMessagePreview}</span>
        <div class="conv-meta"><span class="conv-date">${d}</span>${unread}</div>
      </div>`;
    }).join('');
  } catch(err) {
    container.innerHTML = '<p class="text-muted" style="padding:1rem">Konuşmalar yüklenemedi.</p>';
  }
}

async function openChat(partnerId, partnerEmail) {
  chatCurrentPartnerId = partnerId;
  const mainEl = document.getElementById('chat-main');
  const sidebar = document.getElementById('chat-sidebar');
  // Mobile: sidebar gizle, main göster
  sidebar.classList.add('hidden-mobile');
  mainEl.classList.remove('hidden-mobile');

  mainEl.innerHTML = `
    <div class="chat-header">
      <button class="chat-header-back" onclick="closeChatView()">←</button>
      <span class="chat-header-email">${partnerEmail}</span>
    </div>
    <div class="chat-messages" id="chat-messages-area"></div>
    <div class="chat-input-area">
      <input type="text" id="chat-msg-input" placeholder="Mesajınızı yazın..." maxlength="500" onkeydown="if(event.key==='Enter')sendChatMessage()" />
      <button class="btn btn-primary" onclick="sendChatMessage()">Gönder</button>
    </div>`;
  await loadChatMessages(partnerId);
  // Mesajları okundu işaretle
  try { await apiRequest('/chat/read/' + partnerId, { method: 'PUT' }); } catch(e) {}
  checkUnreadMessages();
  loadChatConversations();
  // Polling başlat
  clearInterval(chatPollInterval);
  chatPollInterval = setInterval(() => { if (chatCurrentPartnerId === partnerId) loadChatMessages(partnerId); }, 5000);
}

function closeChatView() {
  clearInterval(chatPollInterval);
  chatCurrentPartnerId = null;
  const mainEl = document.getElementById('chat-main');
  const sidebar = document.getElementById('chat-sidebar');
  sidebar.classList.remove('hidden-mobile');
  mainEl.classList.add('hidden-mobile');
  mainEl.innerHTML = '<div class="chat-placeholder"><div class="chat-placeholder-icon">💬</div><p>Bir konuşma seçin veya yeni bir kullanıcı arayarak mesajlaşmaya başlayın.</p></div>';
}

async function loadChatMessages(partnerId) {
  const area = document.getElementById('chat-messages-area');
  if (!area) return;
  try {
    const data = await apiRequest('/chat/messages/' + partnerId);
    const msgs = data.data;
    const wasAtBottom = area.scrollTop + area.clientHeight >= area.scrollHeight - 30;
    area.innerHTML = msgs.map(m => {
      const t = new Date(m.createdAt).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'});
      return `<div class="chat-msg ${m.isMine ? 'mine' : 'theirs'}">${escapeHtml(m.content)}<span class="chat-msg-time">${t}</span></div>`;
    }).join('');
    if (wasAtBottom || msgs.length <= 20) area.scrollTop = area.scrollHeight;
  } catch(e) {}
}

async function sendChatMessage() {
  const input = document.getElementById('chat-msg-input');
  if (!input || !input.value.trim() || !chatCurrentPartnerId) return;
  const content = input.value.trim();
  input.value = '';
  try {
    await apiRequest('/chat/send', { method: 'POST', body: JSON.stringify({ receiverId: chatCurrentPartnerId, content }) });
    await loadChatMessages(chatCurrentPartnerId);
    loadChatConversations();
  } catch(err) { showToast(err.message, 'error'); }
}

let chatSearchTimeout = null;
function debounceSearchChatUser() {
  clearTimeout(chatSearchTimeout);
  chatSearchTimeout = setTimeout(searchChatUser, 400);
}
async function searchChatUser() {
  const q = document.getElementById('chat-user-search').value.trim();
  const results = document.getElementById('chat-search-results');
  if (q.length < 3) { results.classList.add('hidden'); results.innerHTML = ''; return; }
  try {
    const data = await apiRequest('/chat/search-users?q=' + encodeURIComponent(q));
    if (!data.data.length) {
      results.innerHTML = '<div class="chat-search-item" style="color:#94a3b8">Kullanıcı bulunamadı</div>';
    } else {
      results.innerHTML = data.data.map(u =>
        `<div class="chat-search-item" onclick="openChat('${u._id}','${u.email}');document.getElementById('chat-search-results').classList.add('hidden');document.getElementById('chat-user-search').value='';">${u.email}</div>`
      ).join('');
    }
    results.classList.remove('hidden');
  } catch(e) { results.classList.add('hidden'); }
}

// ── .env'e CHAT_ENCRYPTION_KEY ekleme hatırlatması ──
// DOMContentLoaded'a bakım modu kontrolü ekle
const _origDCL = document.addEventListener;
document.addEventListener('DOMContentLoaded', () => {
  checkMaintenanceMode();
  // Her 30 sn'de okunmamış mesaj kontrol
  setInterval(() => { if (state.token) checkUnreadMessages(); }, 30000);
  initTheme();
});

// ── AYARLAR, TEMA VE ŞİFRE YÖNETİMİ ──
function toggleTheme(e) {
  const isDark = e.target.checked;
  if (isDark) {
    document.body.setAttribute('data-theme', 'dark');
    localStorage.setItem('py_theme', 'dark');
  } else {
    document.body.removeAttribute('data-theme');
    localStorage.setItem('py_theme', 'light');
  }
}

function initTheme() {
  const theme = localStorage.getItem('py_theme');
  const toggle = document.getElementById('theme-toggle');
  if (theme === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    if (toggle) toggle.checked = true;
  }
}

// Profil yüklenirken kullanıcı bilgilerini (puan, rozet) getir
async function loadProfile() {
  const el = document.getElementById('profile-content');
  const emailDisplay = document.getElementById('profile-email-display');
  const pointsDisplay = document.getElementById('profile-points-display');
  const badgesDisplay = document.getElementById('profile-badges-display');

  if (!state.token) { el.innerHTML = '<p class="text-muted">Giriş yapmanız gerekiyor.</p>'; return; }
  el.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';
  
  try {
    const data = await apiRequest('/auth/me');
    const u = data.data;
    
    if (emailDisplay) emailDisplay.textContent = u.email;
    if (pointsDisplay) pointsDisplay.textContent = 'Puan: ' + (u.points || 0);
    
    if (badgesDisplay) {
      if (u.badges && u.badges.length > 0) {
        badgesDisplay.innerHTML = u.badges.map(b => {
          let badgeClass = 'badge-outline';
          if(b.includes('Acemi')) badgeClass = 'badge-outline badge-acemi';
          if(b.includes('Güvenilir')) badgeClass = 'badge-outline badge-guvenilir';
          if(b.includes('Fahri')) badgeClass = 'badge-outline badge-fahri';
          return `<span class="${badgeClass}">${b}</span>`;
        }).join('');
      } else {
        badgesDisplay.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">Henüz rozet yok</span>';
      }
    }

    const platesHtml = u.ownedPlates && u.ownedPlates.length 
      ? '<div class="profile-plates" style="display:flex;gap:0.5rem;flex-wrap:wrap;">' + u.ownedPlates.map(p => `<span class="badge badge-blue" style="font-size:1rem;padding:.5rem 1rem">${p}</span>`).join('') + '</div>'
      : '<p class="text-muted">Henüz sahiplendiğiniz bir plaka yok.</p>';
      
    el.innerHTML = `
      <div class="settings-section" style="margin-top: 1.5rem;">
        <h3>Sahiplenilen Plakalar</h3>
        ${platesHtml}
      </div>
      <div class="settings-section" style="margin-top: 1.5rem;">
        <h3>Hesap Detayları</h3>
        <p><strong>Kayıt Tarihi:</strong> ${new Date(u.createdAt).toLocaleDateString('tr-TR')}</p>
        <p><strong>Üyelik Tipi:</strong> ${u.isPremium ? '⭐ Premium' : 'Standart'}</p>
      </div>`;
  } catch (err) {
    el.innerHTML = '<p class="text-muted text-red">Hata: ' + err.message + '</p>';
  }
}

// Şifre Değiştirme
async function handleChangePassword(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('settings-current-password').value;
  const newPassword = document.getElementById('settings-new-password').value;
  const btn = document.getElementById('btn-change-password');

  btn.disabled = true;
  btn.textContent = 'Güncelleniyor...';

  try {
    await apiRequest('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    showToast('Şifreniz başarıyla güncellendi.', 'success');
    document.getElementById('form-change-password').reset();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Şifreyi Güncelle';
  }
}

// Şifremi Unuttum Modalı
function showForgotPasswordModal() {
  document.getElementById('forgot-password-modal').classList.remove('hidden');
  document.getElementById('forgot-password-step1').classList.remove('hidden');
  document.getElementById('forgot-password-step2').classList.add('hidden');
  document.getElementById('forgot-email').value = '';
}
function closeForgotPasswordModal() {
  document.getElementById('forgot-password-modal').classList.add('hidden');
}

// Şifremi Unuttum Adım 1: Kod Gönder
async function handleForgotPasswordSendCode(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  const btn = document.getElementById('btn-forgot-send');
  
  btn.disabled = true;
  btn.textContent = 'Gönderiliyor...';

  try {
    const res = await fetch(API + '/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Bir hata oluştu.');
    
    showToast(data.message, 'success');
    document.getElementById('forgot-password-step1').classList.add('hidden');
    document.getElementById('forgot-password-step2').classList.remove('hidden');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kod Gönder';
  }
}

// Şifremi Unuttum Adım 2: Sıfırla
async function handleForgotPasswordReset(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  const code = document.getElementById('forgot-code').value.trim();
  const newPassword = document.getElementById('forgot-new-password').value;
  const btn = document.getElementById('btn-forgot-reset');
  
  btn.disabled = true;
  btn.textContent = 'Sıfırlanıyor...';

  try {
    const res = await fetch(API + '/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Bir hata oluştu.');
    
    showToast(data.message, 'success');
    closeForgotPasswordModal();
    // Login formuna dön
    switchAuthTab('login');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Şifremi Sıfırla';
  }
}
