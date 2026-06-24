/**
 * ==========================================================
 * PlakaYorum - Ana Sunucu Dosyası (server.js)
 * ==========================================================
 * Express.js tabanlı REST API sunucusu.
 * MongoDB bağlantısı, güvenlik middleware'leri ve route'lar.
 * 
 * Güvenlik Katmanları:
 *   - Helmet (HTTP headers)
 *   - CORS
 *   - Mongo Sanitize (NoSQL injection)
 *   - Rate Limiting
 *   - IP Trust Proxy
 */

// Ortam değişkenlerini yükle
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const morgan = require('morgan');
const { sendCrashNotification } = require('./utils/mailer');

// =========================================================
// WINSTON LOGGER & CRASH HANDLERS
// =========================================================
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({ format: winston.format.simple() }));
}

process.on('uncaughtException', async (err) => {
  logger.error(`[UNCAUGHT EXCEPTION]: ${err.stack}`);
  await sendCrashNotification(err.stack);
  setTimeout(() => process.exit(1), 1000); // E-posta gitmesi için bekle
});

process.on('unhandledRejection', async (reason) => {
  logger.error(`[UNHANDLED REJECTION]: ${reason}`);
  await sendCrashNotification(String(reason));
  setTimeout(() => process.exit(1), 1000);
});

// Rate Limiter'ları içe aktar
const { generalLimiter } = require('./middleware/rateLimiter');

// Route'ları içe aktar
const plateRoutes = require('./routes/plateRoutes');
const commentRoutes = require('./routes/commentRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const contactRoutes = require('./routes/contactRoutes');
const messageRoutes = require('./routes/messageRoutes');
const chatRoutes = require('./routes/chatRoutes');

// Model importları
const Visitor = require('./models/Visitor');
const SiteSettings = require('./models/SiteSettings');

// Express uygulamasını oluştur
const app = express();

// Uploads klasörünü oluştur (yoksa)
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// =========================================================
// GÜVENLİK MIDDLEWARE'LERİ & LOGLAMA
// =========================================================

// HTTP İsteklerini Logla (Morgan + Winston)
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Helmet: HTTP güvenlik header'ları
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com'],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'],
        fontSrc: ["'self'", 'fonts.gstatic.com', 'fonts.googleapis.com', 'cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

// CORS ayarları
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production' ? 'https://plakayorum.com' : '*',
    credentials: true,
  })
);

// Body parser (JSON ve URL-encoded)
app.use(express.json({ limit: '10kb' })); // Max 10KB body (güvenlik)
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// MongoDB NoSQL injection koruması
app.use(mongoSanitize());

// Proxy arkasında gerçek IP tespiti (Nginx, Cloudflare vb.)
app.set('trust proxy', true);

// Genel rate limiter (tüm API istekleri)
app.use('/api', generalLimiter);

// =========================================================
// ZİYARETÇİ TAKİBİ MIDDLEWARE'İ
// =========================================================
app.use(async (req, res, next) => {
  try {
    // Sadece sayfa isteklerini say (API ve statik dosyalar hariç)
    if (!req.path.startsWith('/api') && !req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/i)) {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const ip = req.ip || req.connection.remoteAddress || 'unknown';

      // Upsert: bugünkü kayıt yoksa oluştur, varsa güncelle
      await Visitor.findOneAndUpdate(
        { date: today },
        {
          $inc: { pageViews: 1 },
          $addToSet: { uniqueIps: ip },
        },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    // Ziyaretçi takibi hatası ana işleyişi etkilemesin
    console.error('[ZİYARETÇİ TAKİP HATASI]:', err.message);
  }
  next();
});

// =========================================================
// BAKIM MODU MIDDLEWARE'İ
// =========================================================
app.use(async (req, res, next) => {
  try {
    // Admin API isteklerini bakım modundan muaf tut
    if (req.path.startsWith('/api/admin') || req.path.startsWith('/api/auth/login')) {
      return next();
    }

    // Ayarlar endpoint'ini de muaf tut (frontend bakım durumunu öğrenmeli)
    if (req.path === '/api/settings' || req.path === '/api/auth/login') {
      return next();
    }

    // Statik dosyaları muaf tut
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|html)$/i)) {
      return next();
    }

    // Root sayfayı muaf tut (SPA için index.html lazım)
    if (!req.path.startsWith('/api')) {
      return next();
    }

    const settings = await SiteSettings.getSettings();
    if (settings.maintenanceMode) {
      // Eğer kullanıcı Admin ise bakım modunu es geç
      let isAdmin = false;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const jwt = require('jsonwebtoken');
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded.isAdmin) isAdmin = true;
        } catch (e) {
          // Geçersiz token
        }
      }

      if (!isAdmin) {
        return res.status(503).json({
          success: false,
          maintenance: true,
          message: settings.maintenanceMessage || 'Site bakım modundadır.',
        });
      }
    }
  } catch (err) {
    // Bakım modu kontrolü hatası ana işleyişi etkilemesin
  }
  next();
});

// =========================================================
// STATİK DOSYALAR (Frontend)
// =========================================================
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================
// API ROUTE'LARI
// =========================================================
app.use('/api/plate', plateRoutes);
app.use('/api/comment', commentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/chat', chatRoutes);

// =========================================================
// SAĞLIK KONTROLÜ
// =========================================================
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'PlakaYorum API çalışıyor.',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// =========================================================
// SİTE AYARLARI (Herkese Açık)
// =========================================================
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await SiteSettings.getSettings();
    res.status(200).json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Ayarlar yüklenemedi.' });
  }
});

// =========================================================
// SPA FALLBACK - Tüm bilinmeyen route'lar index.html'e yönlendirilir
// =========================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =========================================================
// HATA YÖNETİMİ
// =========================================================

// 404 - Bulunamadı (API route'ları için)
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'İstediğiniz kaynak bulunamadı.',
  });
});

// Genel hata yakalayıcı
app.use((err, req, res, next) => {
  logger.error(`[SUNUCU HATASI]: ${err.stack || err.message}`);

  // Multer dosya boyutu hatası
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'Dosya boyutu 5MB\'dan büyük olamaz.',
    });
  }

  // Veritabanı bağlantı kopması
  if (err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
    return res.status(503).json({
      success: false,
      message: 'Veritabanı bağlantısı koptu veya geçici bir kesinti yaşanıyor. Lütfen birazdan tekrar deneyin.'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production'
        ? 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.'
        : err.message,
  });
});

// =========================================================
// MONGODB BAĞLANTISI VE SUNUCU BAŞLATMA
// =========================================================
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/plakayorum';

async function startServer() {
  try {
    // MongoDB'ye bağlan
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB bağlantısı başarılı.');

    // Sunucuyu başlat
    app.listen(PORT, () => {
      console.log(`\n🚗 PlakaYorum API çalışıyor: http://localhost:${PORT}`);
      console.log(`📡 Ortam: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📦 Veritabanı: ${MONGODB_URI}`);
      console.log('─'.repeat(50));
    });
  } catch (error) {
    console.error('❌ MongoDB bağlantı hatası:', error.message);
    process.exit(1);
  }
}

// MongoDB bağlantı olaylarını dinle
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB hatası:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB bağlantısı kesildi.');
});

// Uygulama kapatılırken bağlantıyı temizle
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('\n🔌 MongoDB bağlantısı kapatıldı. Uygulama sonlandırılıyor...');
  process.exit(0);
});

// Sunucuyu başlat
startServer();
