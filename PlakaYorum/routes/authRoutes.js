/**
 * ==========================================================
 * PlakaYorum - Kimlik Doğrulama Route'ları (Auth Routes)
 * ==========================================================
 * Kullanıcı kayıt, giriş ve profil endpoint'leri.
 * KVKK onayı kayıt için zorunludur.
 * Sahiplenme talebi gönderme (belge yükleme dahil).
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const validator = require('validator');
const multer = require('multer');
const path = require('path');

const User = require('../models/User');
const { authLimiter } = require('../middleware/rateLimiter');
const authMiddleware = require('../middleware/auth');
const crypto = require('crypto');
const { sendVerificationEmail, sendAdminNotification } = require('../utils/mailer');

// Turnstile Doğrulama Fonksiyonu
async function verifyTurnstile(token, ip) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return true; // Geliştirme ortamında key yoksa bypass et

  if (!token) return false;

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    formData.append('remoteip', ip);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const outcome = await result.json();
    return outcome.success;
  } catch (error) {
    console.error('[TURNSTILE HATASI]:', error);
    return false;
  }
}

// =========================================================
// MULTER AYARLARI - Belge yükleme
// =========================================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'public', 'uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'doc-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece JPG, PNG, WebP ve PDF dosyaları yüklenebilir.'));
    }
  },
});

/**
 * JWT token üretici
 */
function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// =========================================================
// POST /api/auth/register
// Yeni kullanıcı kaydı (KVKK onaylı)
// =========================================================
const DISPOSABLE_DOMAINS = [
  'tempmail.com', '10minutemail.com', 'yopmail.com', 'guerrillamail.com',
  'mailinator.com', 'getnada.com', 'temp-mail.org', 'throwawaymail.com',
  'maildrop.cc', 'dispostable.com', 'sharklasers.com', 'fakemail.net',
  'tempail.com', 'mohmal.com', 'my10minutemail.com', 'tempmailaddress.com',
  'generator.email', 'trashmail.com'
];

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, kvkkApproved, marketingApproved, turnstileToken } = req.body;

    // IP ve User-Agent alımı
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Turnstile Kontrolü
    const isHuman = await verifyTurnstile(turnstileToken, ipAddress);
    if (!isHuman) {
      return res.status(400).json({
        success: false,
        message: 'Güvenlik doğrulaması başarısız. Lütfen bot olmadığınızı onaylayın.',
      });
    }

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'E-posta ve şifre zorunludur.',
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Geçerli bir e-posta adresi giriniz.',
      });
    }

    // Sahte/Geçici mail engelleme
    const domain = email.split('@')[1].toLowerCase();
    if (DISPOSABLE_DOMAINS.includes(domain)) {
      return res.status(400).json({
        success: false,
        message: 'Geçici (disposable) e-posta adresleri ile kayıt olunamaz. Lütfen geçerli bir e-posta kullanın.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Şifre en az 6 karakter olmalıdır.',
      });
    }

    if (!kvkkApproved || kvkkApproved !== true) {
      return res.status(400).json({
        success: false,
        message: "Kayıt olmak için KVKK Aydınlatma Metni'ni onaylamanız zorunludur.",
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Bu e-posta adresi zaten kayıtlı.',
      });
    }

    // 6 haneli doğrulama kodu oluştur
    const verificationCode = crypto.randomInt(100000, 999999).toString();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 dakika geçerli

    const user = await User.create({
      email: email.toLowerCase().trim(),
      password,
      kvkkApproved: true,
      marketingApproved: !!marketingApproved,
      isEmailVerified: false,
      emailVerificationCode: verificationCode,
      emailVerificationExpires: verificationExpires,
      registrationIp: ipAddress,
      registrationUserAgent: userAgent,
      loginHistory: [{
        action: 'Kayıt Oldu',
        ipAddress,
        userAgent,
        date: new Date()
      }]
    });

    // Doğrulama e-postası gönder
    try {
      await sendVerificationEmail(user.email, verificationCode);
    } catch(err) {
      console.error('[MAİL GÖNDERME HATASI]:', err.message);
    }

    console.log(`[YENİ KAYIT] ${user.email} - Doğrulama bekliyor`);

    return res.status(201).json({
      success: true,
      message: 'Kayıt alındı. Lütfen e-postanıza gönderilen doğrulama kodunu girin.',
      requiresVerification: true,
      email: user.email
    });

  } catch (error) {
    console.error('[KAYIT HATASI]:', error.message);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Bu e-posta adresi zaten kayıtlı.',
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(' '),
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Sunucu hatası.',
    });
  }
});

// =========================================================
// POST /api/auth/login
// Kullanıcı girişi
// =========================================================
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password, turnstileToken } = req.body;

    // IP ve User-Agent alımı
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Turnstile Kontrolü
    const isHuman = await verifyTurnstile(turnstileToken, ipAddress);
    if (!isHuman) {
      return res.status(400).json({
        success: false,
        message: 'Güvenlik doğrulaması başarısız. Lütfen bot olmadığınızı onaylayın.',
      });
    }

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'E-posta ve şifre zorunludur.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'E-posta veya şifre hatalı.',
      });
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Hesabınız yönetici tarafından engellenmiştir.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'E-posta veya şifre hatalı.',
      });
    }

    // Email doğrulama kontrolü
    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Hesabınız henüz doğrulanmamış. Lütfen e-postanıza gelen kodu girin.',
        requiresVerification: true,
        email: user.email
      });
    }

    // Son giriş loglarını güncelle
    user.lastLoginIp = ipAddress;
    user.lastLoginDate = new Date();
    user.lastLoginUserAgent = userAgent;

    // Giriş geçmişine ekle
    user.loginHistory.push({
      action: 'Giriş Yaptı',
      ipAddress,
      userAgent,
      date: new Date()
    });

    // 50'den fazla log birikmesini engellemek isterseniz (opsiyonel):
    if (user.loginHistory.length > 50) {
      user.loginHistory.shift(); // En eski logu sil
    }

    await user.save();

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Giriş başarılı!',
      data: {
        token,
        user: {
          _id: user._id,
          email: user.email,
          isPremium: user.isPremium,
          isAdmin: user.isAdmin,
          claimedPlates: user.claimedPlates,
        },
      },
    });
  } catch (error) {
    console.error('[GİRİŞ HATASI]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Sunucu hatası.',
    });
  }
});

// =========================================================
// GET /api/auth/profile
// Kullanıcı profili (JWT gerekli)
// =========================================================
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('claimedPlates');
    return res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        isPremium: user.isPremium,
        isAdmin: user.isAdmin,
        claimedPlates: user.claimedPlates,
        requests: user.requests,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[PROFİL HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// POST /api/auth/claim-request
// Plaka sahiplenme talebi gönderme (Belge yükleme dahil)
// =========================================================
router.post('/claim-request', authMiddleware, upload.single('document'), async (req, res) => {
  try {
    const { plateNumber } = req.body;

    if (!plateNumber) {
      return res.status(400).json({
        success: false,
        message: 'Plaka numarası zorunludur.',
      });
    }

    const { cleanPlateNumber, isValidTurkishPlate } = require('../middleware/plateFormatCheck');
    const cleaned = cleanPlateNumber(plateNumber);

    if (!isValidTurkishPlate(cleaned)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz plaka formatı.',
      });
    }

    // Kullanıcının zaten bu plaka için talebi var mı?
    const existingRequest = req.user.requests.find(
      (r) => r.plateNumber === cleaned && r.status === 'Pending'
    );
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'Bu plaka için zaten bekleyen bir talebiniz var.',
      });
    }

    // Belge yolu
    const documentPath = req.file ? '/uploads/' + req.file.filename : null;

    // Talebi kullanıcıya ekle
    req.user.requests.push({
      plateNumber: cleaned,
      documentPath,
      status: 'Pending',
    });
    await req.user.save();

    console.log(`[SAHİPLENME TALEBİ] Kullanıcı: ${req.user.email} -> Plaka: ${cleaned}`);
    
    // Yöneticiye e-posta bildirimi gönder (Hata atsa bile işlemi durdurma)
    try {
      const adminHtml = `
        <h3>Yeni Bir Ruhsat Onayı Geldi!</h3>
        <p><strong>Kullanıcı:</strong> ${req.user.email}</p>
        <p><strong>Plaka:</strong> ${cleaned}</p>
        <p>Lütfen Admin Paneline girip belgeyi inceleyerek talebi onaylayın veya reddedin.</p>
      `;
      await sendAdminNotification('🚨 Yeni Ruhsat Onayı Bekliyor - PlakaYorum', adminHtml);
    } catch(err) {
      console.error('Admin maili gönderilemedi:', err);
    }

    return res.status(200).json({
      success: true,
      message: 'Sahiplenme talebiniz alındı. Belgeniz incelendikten sonra onaylanacaktır.',
    });
  } catch (error) {
    console.error('[SAHİPLENME TALEBİ HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// POST /api/auth/verify-email
// Doğrulama kodunu onaylar
// =========================================================
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'E-posta ve doğrulama kodu zorunludur.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Hesap zaten doğrulanmış.' });
    }

    if (user.emailVerificationCode !== code.trim()) {
      return res.status(400).json({ success: false, message: 'Hatalı doğrulama kodu.' });
    }

    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'Doğrulama kodunun süresi dolmuş. Lütfen yeni kod isteyin.' });
    }

    // Doğrulamayı tamamla
    user.isEmailVerified = true;
    user.emailVerificationCode = null;
    user.emailVerificationExpires = null;
    await user.save();

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Hesabınız başarıyla doğrulandı!',
      data: {
        token,
        user: {
          _id: user._id,
          email: user.email,
          isPremium: user.isPremium,
          isAdmin: user.isAdmin,
        }
      }
    });

  } catch (err) {
    console.error('[DOĞRULAMA HATASI]:', err.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/auth/me
// Mevcut kullanıcının profil, puan ve rozet bilgilerini getirir
// =========================================================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }
    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error('[PROFİL GETİRME HATASI]:', err.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// POST /api/auth/forgot-password
// Şifremi Unuttum - Kod Gönderir
// =========================================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'E-posta zorunludur.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Güvenlik: Kullanıcı bulunamasa bile bulduk diyerek başarılı dönüyoruz (Email enumeration'ı önlemek için)
      return res.status(200).json({ success: true, message: 'Şifre sıfırlama kodu e-postanıza gönderildi (Kayıtlıysa).' });
    }

    // 6 haneli kod
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = resetCode;
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 dakika geçerli
    await user.save();

    // Mail gönder
    const mailer = require('../utils/mailer');
    if (mailer && typeof mailer.sendVerificationEmail === 'function') {
      await mailer.sendVerificationEmail(user.email, resetCode);
    }

    return res.status(200).json({ success: true, message: 'Şifre sıfırlama kodu e-postanıza gönderildi.' });
  } catch (err) {
    console.error('[ŞİFRE SIFIRLAMA İSTEK HATASI]:', err.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// POST /api/auth/reset-password
// Kod ile yeni şifre belirleme
// =========================================================
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: 'Tüm alanlar zorunludur.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Yeni şifre en az 6 karakter olmalıdır.' });
    }

    // Şifreyi doğrulamak için user'ı password dahil getiriyoruz
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: code.trim(),
      resetPasswordExpire: { $gt: Date.now() } // Süresi dolmamış
    }).select('+password');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Kod geçersiz veya süresi dolmuş.' });
    }

    // Yeni şifre eskiye eşit mi?
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({ success: false, message: 'Yeni şifreniz eski şifrenizle aynı olamaz.' });
    }

    // Şifreyi güncelle (Pre-save hook'u otomatik hashleyecek)
    user.password = newPassword;

    // Kodları temizle
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;

    await user.save();

    return res.status(200).json({ success: true, message: 'Şifreniz başarıyla sıfırlandı. Giriş yapabilirsiniz.' });
  } catch (err) {
    console.error('[ŞİFRE SIFIRLAMA ONAY HATASI]:', err.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/auth/change-password
// Ayarlar sekmesinden şifre değiştirme (JWT Gerekli)
// =========================================================
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Mevcut şifre ve yeni şifre zorunludur.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Yeni şifre en az 6 karakter olmalıdır.' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });

    // Mevcut şifre doğru mu?
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Mevcut şifreniz hatalı.' });
    }

    // Yeni şifre eskisi ile aynı mı?
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({ success: false, message: 'Yeni şifreniz eski şifrenizle aynı olamaz.' });
    }

    // Şifreyi güncelle (Pre-save hook'u otomatik hashleyecek)
    user.password = newPassword;
    await user.save();

    return res.status(200).json({ success: true, message: 'Şifreniz başarıyla güncellendi.' });
  } catch (err) {
    console.error('[ŞİFRE DEĞİŞTİRME HATASI]:', err.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

module.exports = router;
