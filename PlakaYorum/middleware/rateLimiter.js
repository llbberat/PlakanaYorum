/**
 * ==========================================================
 * PlakaYorum - Rate Limiter (Hız Sınırlayıcı) Middleware
 * ==========================================================
 * Spam saldırılarını engellemek için iki katmanlı koruma:
 *   1. Genel API rate limiter (express-rate-limit)
 *   2. Plaka başına yorum sınırı (aynı IP, aynı plaka)
 * 
 * Bellek tabanlı (in-memory) çözüm - MVP için yeterli.
 * Ölçekleme için Redis kullanılabilir.
 */

const rateLimit = require('express-rate-limit');

// =========================================================
// 1. Genel API Rate Limiter
// Tüm API istekleri için: 15 dakikada max 100 istek/IP
// =========================================================
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100, // Her IP için max 100 istek
  standardHeaders: true, // RateLimit-* header'larını döner
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Çok fazla istek gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin.',
  },
  // IP tespiti: X-Forwarded-For header'ı veya doğrudan IP
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  },
});

// =========================================================
// 2. Yorum Rate Limiter
// Yorum yazma için: 5 dakikada max 5 yorum/IP
// =========================================================
const commentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 dakika
  max: 5, // Her IP için max 5 yorum
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Çok fazla yorum gönderdiniz. Lütfen birkaç dakika bekleyin.',
  },
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  },
});

// =========================================================
// 3. Auth Rate Limiter
// Login/Register için: 15 dakikada max 10 deneme/IP
// =========================================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.',
  },
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  },
});

// =========================================================
// 4. Aynı Plakaya Peş Peşe Yorum Engelleme (In-Memory)
// Aynı IP'den aynı plakaya 2 dakika içinde tekrar yorum yapılamaz
// =========================================================
const recentComments = new Map(); // Anahtar: `${ip}:${plateNumber}`

// Bellek temizleme: 10 dakikada bir eski kayıtları sil
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentComments.entries()) {
    if (now - timestamp > 2 * 60 * 1000) {
      recentComments.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Aynı IP'den aynı plakaya kısa sürede tekrar yorum atılmasını engeller.
 */
function plateCommentThrottle(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  const plateNumber = req.cleanPlate || req.params.number || '';
  const key = `${ip}:${plateNumber}`;

  const lastCommentTime = recentComments.get(key);
  if (lastCommentTime && Date.now() - lastCommentTime < 2 * 60 * 1000) {
    return res.status(429).json({
      success: false,
      message: 'Bu plakaya kısa süre önce yorum yaptınız. Lütfen 2 dakika bekleyin.',
    });
  }

  // Yorum başarılı olduktan sonra kaydedilecek (route handler'da çağrılır)
  req.recordComment = () => {
    recentComments.set(key, Date.now());
  };

  next();
}

module.exports = {
  generalLimiter,
  commentLimiter,
  authLimiter,
  plateCommentThrottle,
};
