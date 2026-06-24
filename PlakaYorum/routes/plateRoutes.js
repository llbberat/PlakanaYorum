/**
 * ==========================================================
 * PlakaYorum - Plaka Route'ları
 * ==========================================================
 * Plaka sorgulama, yorum yazma, sahiplenme ve kaldırma talebi.
 * Yorumlar artık 'Pending' olarak oluşturulur (admin onayı gerekli).
 */

const express = require('express');
const router = express.Router();

const Plate = require('../models/Plate');
const Comment = require('../models/Comment');
const { sendAdminNotification } = require('../utils/mailer');
const User = require('../models/User');
const { plateFormatCheck } = require('../middleware/plateFormatCheck');
const { badWordFilter } = require('../middleware/badWordFilter');
const { commentLimiter, plateCommentThrottle } = require('../middleware/rateLimiter');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer upload ayarı (Ruhsat fotoğrafı için)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../public/uploads/claims');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, req.user._id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Sadece resim veya PDF dosyaları yüklenebilir.'), false);
  }
});

// =========================================================
// GET /api/plate/:number
// Plaka sorgulama: Temizle, doğrula, DB'de yoksa oluştur
// Sadece onaylanmış (Approved) yorumları döndürür
// =========================================================
router.get('/:number', plateFormatCheck, async (req, res) => {
  try {
    const plateNumber = req.cleanPlate;

    // DB'de ara, yoksa otomatik oluştur
    let plate = await Plate.findOne({ plateNumber });

    if (!plate) {
      plate = await Plate.create({ plateNumber });
    }

    // Plaka pasif (Uyar-Kaldır) ise bilgi mesajı döndür
    if (!plate.isActive) {
      return res.status(200).json({
        success: true,
        message: 'Bu plaka sahibinin talebi üzerine kaldırılmıştır.',
        data: {
          plate: {
            plateNumber: plate.plateNumber,
            isActive: false,
            isClaimed: plate.isClaimed,
          },
          comments: [],
          commentCount: 0,
        },
      });
    }

    // Plakaya ait ONAYLANMIŞ ve ŞİKAYET EDİLMİŞ yorumları getir
    // OwnerReported olan yorumlar geçici olarak gizlenir (admin onayı bekler)
    const comments = await Comment.find({
      plateId: plate._id,
      status: { $in: ['Approved', 'Reported'] },
    })
      .sort({ createdAt: -1 })
      .select('-ipAddress')
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        plate: {
          _id: plate._id,
          plateNumber: plate.plateNumber,
          isClaimed: plate.isClaimed,
          claimStatus: plate.claimStatus,
          isActive: plate.isActive,
          isCommentsClosed: plate.isCommentsClosed || false,
          verificationExpiry: plate.verificationExpiry,
          verificationStatus: plate.verificationStatus,
          ownerId: plate.ownerId,
          createdAt: plate.createdAt,
        },
        comments,
        commentCount: comments.length,
      },
    });
  } catch (error) {
    console.error('[PLAKA SORGULAMA HATASI]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.',
    });
  }
});

// =========================================================
// POST /api/plate/:number/comment
// Plakaya yorum yazma - Yorum 'Pending' olarak kaydedilir
// Giriş yapmış veya anonim kullanıcı yazabilir
// =========================================================
router.post(
  '/:number/comment',
  plateFormatCheck,
  commentLimiter,
  plateCommentThrottle,
  badWordFilter,
  async (req, res) => {
    try {
      const plateNumber = req.cleanPlate;
      const { content, category, kvkkApproved } = req.body;

      // KVKK onayı kontrolü
      if (!kvkkApproved || kvkkApproved !== true) {
        return res.status(400).json({
          success: false,
          message: 'Yorum yapmak için KVKK ve sorumluluk onayı zorunludur.',
        });
      }

      // Kategori kontrolü
      const validCategories = ['Hatalı Park', 'Açık Far', 'Tehlikeli Sürüş', 'Övgü/Teşekkür', 'Diğer'];
      if (!category || !validCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: 'Geçerli bir yorum kategorisi seçiniz.',
        });
      }

      // İçerik uzunluk kontrolü
      if (!content || content.trim().length < 5) {
        return res.status(400).json({
          success: false,
          message: 'Yorum en az 5 karakter olmalıdır.',
        });
      }

      if (content.length > 280) {
        return res.status(400).json({
          success: false,
          message: 'Yorum en fazla 280 karakter olabilir.',
        });
      }

      // Plakayı bul veya oluştur
      let plate = await Plate.findOne({ plateNumber });
      if (!plate) {
        plate = await Plate.create({ plateNumber });
      }

      // Plaka pasif mi kontrol et
      if (!plate.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Bu plaka kaldırılmıştır. Yorum yapılamaz.',
        });
      }

      // Plaka sahibi yorumları kapattı mı kontrol et
      if (plate.isCommentsClosed) {
        return res.status(403).json({
          success: false,
          message: 'Bu plaka sahibi yorumları kapatmıştır. Yorum yapılamaz.',
        });
      }

      // 5651 kanunu gereği IP adresini logla
      const ipAddress =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.connection?.remoteAddress ||
        req.ip;
      
      const userAgent = req.headers['user-agent'] || 'unknown';

      // JWT token varsa userId al (anonim yorum da olabilir)
      let userId = null;
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const jwt = require('jsonwebtoken');
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          userId = decoded.userId;
        }
      } catch (e) {
        // Token yoksa veya geçersizse anonim olarak devam et
      }

      // Yorumu 'Pending' olarak oluştur
      const comment = await Comment.create({
        plateId: plate._id,
        userId,
        content: content.trim(),
        category,
        status: 'Pending',
        ipAddress,
        userAgent,
        kvkkApproved: true,
        kvkkApprovedAt: new Date(),
      });

      // Eğer kullanıcı giriş yapmışsa, log geçmişine bu işlemi kaydet
      if (userId) {
        const User = require('../models/User');
        const user = await User.findById(userId);
        if (user) {
          user.loginHistory.push({
            action: `Yorum Gönderdi (ID: ${comment._id})`,
            ipAddress,
            userAgent,
            date: new Date()
          });
          await user.save();
        }
      }

      // Plaka başına yorum throttle kaydı
      if (req.recordComment) {
        req.recordComment();
      }

      // Admin'e mail gönder
      try {
        const adminHtml = `
          <h3>Yeni Bir Yorum Onayı Bekliyor!</h3>
          <p><strong>Plaka:</strong> ${plateNumber}</p>
          <p><strong>Kategori:</strong> ${category}</p>
          <p><strong>Yorum:</strong> "${content}"</p>
          <p>Lütfen Admin Paneline girip yorumu onaylayın veya reddedin.</p>
        `;
        await sendAdminNotification('🚨 Yeni Yorum Onayı Bekliyor - PlakaYorum', adminHtml);
      } catch(err) {
        console.error('Admin maili gönderilemedi:', err);
      }

      return res.status(201).json({
        success: true,
        message: 'Yorumunuz alındı, admin onayından sonra yayınlanacaktır.',
        data: {
          _id: comment._id,
          content: comment.content,
          category: comment.category,
          status: comment.status,
          createdAt: comment.createdAt,
        },
      });
    } catch (error) {
      console.error('[YORUM EKLEME HATASI]:', error.message);

      // Mongoose validation hatası
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((e) => e.message);
        return res.status(400).json({
          success: false,
          message: messages.join(' '),
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.',
      });
    }
  }
);

// =========================================================
// POST /api/plate/claim
// Plaka sahiplenme talebi (JWT gerekli + Ruhsat yüklemesi)
// =========================================================
router.post('/claim', authMiddleware, upload.single('document'), async (req, res) => {
  try {
    const { plateNumber } = req.body;

    if (!plateNumber) {
      return res.status(400).json({
        success: false,
        message: 'Plaka numarası zorunludur.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Sahiplenme işlemi için ruhsat fotoğrafı (veya ilgili belge) yüklemeniz zorunludur.',
      });
    }

    // Plaka formatını temizle ve doğrula
    const { cleanPlateNumber, isValidTurkishPlate } = require('../middleware/plateFormatCheck');
    const cleaned = cleanPlateNumber(plateNumber);

    if (!isValidTurkishPlate(cleaned)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz plaka formatı.',
      });
    }

    // Plakayı bul
    let plate = await Plate.findOne({ plateNumber: cleaned });
    if (!plate) {
      plate = await Plate.create({ plateNumber: cleaned });
    }

    // Zaten sahiplenilmiş mi kontrol et
    if (plate.isClaimed || plate.claimStatus !== 'none') {
      return res.status(400).json({
        success: false,
        message: 'Bu plaka zaten sahiplenilmiş veya sahiplenme talebi beklemede.',
      });
    }

    // Sahiplenme talebini oluştur (Admin onayı bekleyecek)
    plate.claimStatus = 'pending';
    // ownerId admin onayından sonra eklenecek, şu anlık eklemiyoruz
    await plate.save();

    // Kullanıcının "requests" array'ine ekle (Admin paneli buradan okuyor)
    req.user.requests.push({
      plateNumber: cleaned,
      status: 'Pending',
      documentPath: `/uploads/claims/${req.file.filename}` // Yüklenen belgenin yolu
    });

    // Kullanıcı loguna işlemi kaydet
    req.user.loginHistory.push({
      action: `Plaka Sahiplenme Talebi (${cleaned})`,
      ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection?.remoteAddress || req.ip,
      userAgent: req.headers['user-agent'] || 'unknown',
      date: new Date()
    });

    await req.user.save();

    console.log(`[SAHİPLENME TALEBİ] Kullanıcı ${req.user.email} -> Plaka: ${cleaned}`);

    return res.status(200).json({
      success: true,
      message: 'Sahiplenme talebiniz alındı. Admin onayından sonra plakanın sahibi olacak ve e-posta bildirimleri alacaksınız.',
      data: {
        plateNumber: cleaned,
        claimStatus: 'pending',
      },
    });
  } catch (error) {
    console.error('[SAHİPLENME HATASI]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Sunucu hatası.',
    });
  }
});

// =========================================================
// POST /api/plate/:number/remove
// Uyar-Kaldır mekanizması: Plaka pasife alınır (JWT gerekli)
// =========================================================
router.post('/:number/remove', plateFormatCheck, authMiddleware, async (req, res) => {
  try {
    const plateNumber = req.cleanPlate;

    const plate = await Plate.findOne({ plateNumber });
    if (!plate) {
      return res.status(404).json({
        success: false,
        message: 'Plaka bulunamadı.',
      });
    }

    // Plaka zaten pasif mi?
    if (!plate.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Bu plaka zaten kaldırılmış.',
      });
    }

    // Plakayı pasife al
    plate.isActive = false;
    await plate.save();

    console.log(`[UYAR-KALDIR] Plaka ${plateNumber} pasife alındı. Talep eden: ${req.user.email}`);

    return res.status(200).json({
      success: true,
      message: 'Kaldırma talebiniz işleme alındı. Plaka artık görüntülenmeyecektir.',
    });
  } catch (error) {
    console.error('[KALDIR HATASI]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Sunucu hatası.',
    });
  }
});

// =========================================================
// PUT /api/plate/:number/toggle-comments
// Plaka sahibi yorumları açar/kapatır (JWT gerekli)
// =========================================================
router.put('/:number/toggle-comments', plateFormatCheck, authMiddleware, async (req, res) => {
  try {
    const plateNumber = req.cleanPlate;

    const plate = await Plate.findOne({ plateNumber });
    if (!plate) {
      return res.status(404).json({ success: false, message: 'Plaka bulunamadı.' });
    }

    // Sadece plaka sahibi bu işlemi yapabilir
    if (!plate.ownerId || plate.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlemi sadece plaka sahibi yapabilir.',
      });
    }

    plate.isCommentsClosed = !plate.isCommentsClosed;
    await plate.save();

    const status = plate.isCommentsClosed ? 'kapatıldı' : 'açıldı';
    console.log(`[YORUM KONTROL] Plaka ${plateNumber} yorumları ${status}. Sahip: ${req.user.email}`);

    return res.status(200).json({
      success: true,
      message: `Plakanıza yapılacak yorumlar ${status}.`,
      data: { isCommentsClosed: plate.isCommentsClosed },
    });
  } catch (error) {
    console.error('[YORUM KONTROL HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// POST /api/plate/:number/owner-report/:commentId
// Plaka sahibi bir yorumu şikayet eder → Yorum geçici gizlenir
// Admin onayına gider
// =========================================================
router.post('/:number/owner-report/:commentId', plateFormatCheck, authMiddleware, async (req, res) => {
  try {
    const plateNumber = req.cleanPlate;
    const { commentId } = req.params;
    const { reason } = req.body;

    const plate = await Plate.findOne({ plateNumber });
    if (!plate) {
      return res.status(404).json({ success: false, message: 'Plaka bulunamadı.' });
    }

    // Sadece plaka sahibi bu işlemi yapabilir
    if (!plate.ownerId || plate.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlemi sadece plaka sahibi yapabilir.',
      });
    }

    // Yorumu bul
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Yorum bulunamadı.' });
    }

    // Yorum bu plakaya ait mi?
    if (comment.plateId.toString() !== plate._id.toString()) {
      return res.status(400).json({ success: false, message: 'Bu yorum bu plakaya ait değil.' });
    }

    // Zaten şikayet edilmiş veya gizlenmiş mi?
    if (comment.status === 'OwnerReported' || comment.status === 'Hidden' || comment.status === 'Rejected') {
      return res.status(400).json({ success: false, message: 'Bu yorum zaten işleme alınmış.' });
    }

    // Yorumu OwnerReported olarak işaretle (geçici gizlenme)
    comment.status = 'OwnerReported';
    comment.reportedByOwner = req.user._id;
    comment.ownerReportReason = reason || 'Plaka sahibi tarafından şikayet edildi';
    await comment.save();

    // Kullanıcı loguna kaydet
    req.user.loginHistory.push({
      action: `Plaka Sahibi Şikayet (Yorum ID: ${commentId}, Plaka: ${plateNumber})`,
      ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection?.remoteAddress || req.ip,
      userAgent: req.headers['user-agent'] || 'unknown',
      date: new Date()
    });
    await req.user.save();

    console.log(`[SAHİP ŞİKAYET] Plaka ${plateNumber} sahibi ${req.user.email} yorum ${commentId} şikayet etti.`);

    return res.status(200).json({
      success: true,
      message: 'Şikayetiniz alındı. Yorum geçici olarak gizlendi ve admin incelemesine gönderildi.',
    });
  } catch (error) {
    console.error('[SAHİP ŞİKAYET HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// POST /api/plate/reverify
// 3 Aylık Yeniden Doğrulama: Ruhsat + Tarihli kağıt yükleme
// =========================================================
const reverifyStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../public/uploads/reverify');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'reverify-' + req.user._id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const reverifyUpload = multer({
  storage: reverifyStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Sadece resim veya PDF dosyaları yüklenebilir.'), false);
  }
});

router.post('/reverify', authMiddleware, reverifyUpload.fields([
  { name: 'document', maxCount: 1 },
  { name: 'dateProof', maxCount: 1 }
]), async (req, res) => {
  try {
    const { plateNumber } = req.body;

    if (!plateNumber) {
      return res.status(400).json({ success: false, message: 'Plaka numarası zorunludur.' });
    }

    if (!req.files || !req.files.document || !req.files.dateProof) {
      return res.status(400).json({
        success: false,
        message: 'Hem ruhsat belgesi hem de tarih yazılı kağıt fotoğrafı yüklenmelidir.',
      });
    }

    // Plaka formatını temizle ve doğrula
    const { cleanPlateNumber, isValidTurkishPlate } = require('../middleware/plateFormatCheck');
    const cleaned = cleanPlateNumber(plateNumber);

    if (!isValidTurkishPlate(cleaned)) {
      return res.status(400).json({ success: false, message: 'Geçersiz plaka formatı.' });
    }

    // Plakayı bul
    const plate = await Plate.findOne({ plateNumber: cleaned });
    if (!plate) {
      return res.status(404).json({ success: false, message: 'Plaka bulunamadı.' });
    }

    // Sadece plaka sahibi yapabilir
    if (!plate.ownerId || plate.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlemi sadece plaka sahibi yapabilir.',
      });
    }

    // Bekleyen talep var mı?
    const pendingReq = req.user.reverificationRequests.find(
      r => r.plateNumber === cleaned && r.status === 'Pending'
    );
    if (pendingReq) {
      return res.status(400).json({
        success: false,
        message: 'Bu plaka için zaten bekleyen bir doğrulama talebiniz var.',
      });
    }

    // Plaka durumunu güncelle
    plate.verificationStatus = 'pending_reverification';
    await plate.save();

    // Kullanıcının reverificationRequests'ine ekle
    req.user.reverificationRequests.push({
      plateNumber: cleaned,
      documentPath: `/uploads/reverify/${req.files.document[0].filename}`,
      dateProofPath: `/uploads/reverify/${req.files.dateProof[0].filename}`,
      status: 'Pending',
    });

    req.user.loginHistory.push({
      action: `Yeniden Doğrulama Talebi (${cleaned})`,
      ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection?.remoteAddress || req.ip,
      userAgent: req.headers['user-agent'] || 'unknown',
      date: new Date()
    });

    await req.user.save();

    console.log(`[YENİDEN DOĞRULAMA] Kullanıcı ${req.user.email} -> Plaka: ${cleaned}`);

    return res.status(200).json({
      success: true,
      message: 'Doğrulama talebiniz alındı. Admin incelemesinden sonra onaylanacaktır.',
    });
  } catch (error) {
    console.error('[YENİDEN DOĞRULAMA HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

module.exports = router;
