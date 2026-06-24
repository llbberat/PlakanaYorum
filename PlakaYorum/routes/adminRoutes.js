/**
 * ==========================================================
 * PlakaYorum - Admin Route'ları
 * ==========================================================
 * Admin paneli API endpoint'leri:
 *  - Dashboard istatistikleri
 *  - Bekleyen yorumları yönetme (Onayla/Reddet)
 *  - Sahiplenme taleplerini yönetme
 *  - Yorum onaylandığında Premium plaka sahibine e-posta bildirimi
 *  - Ziyaretçi istatistikleri
 *  - Bakım modu yönetimi
 *  - Admin hesap yönetimi (ekleme, düzenleme, listeleme)
 */

const express = require('express');
const router = express.Router();

const Plate = require('../models/Plate');
const Comment = require('../models/Comment');
const User = require('../models/User');
const Message = require('../models/Message');
const PrivateMessage = require('../models/PrivateMessage');
const Visitor = require('../models/Visitor');
const SiteSettings = require('../models/SiteSettings');
const { sendNotificationEmail, sendContactReplyEmail } = require('../utils/mailer');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

// Tüm admin route'ları için auth + admin kontrolü
router.use(authMiddleware, adminMiddleware);

// =========================================================
// GET /api/admin/dashboard
// Admin dashboard istatistikleri
// =========================================================
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalPlates,
      totalComments,
      pendingComments,
      approvedComments,
      rejectedComments,
      totalUsers,
      premiumUsers,
      ownerReportedComments,
    ] = await Promise.all([
      Plate.countDocuments(),
      Comment.countDocuments(),
      Comment.countDocuments({ status: 'Pending' }),
      Comment.countDocuments({ status: 'Approved' }),
      Comment.countDocuments({ status: 'Rejected' }),
      User.countDocuments(),
      User.countDocuments({ isPremium: true }),
      Comment.countDocuments({ status: 'OwnerReported' }),
    ]);

    // Bekleyen sahiplenme talepleri
    const usersWithPendingRequests = await User.find({
      'requests.status': 'Pending',
    });
    let pendingClaimRequests = 0;
    usersWithPendingRequests.forEach((u) => {
      pendingClaimRequests += u.requests.filter((r) => r.status === 'Pending').length;
    });

    // Bekleyen yeniden doğrulama talepleri
    const usersWithPendingReverifications = await User.find({
      'reverificationRequests.status': 'Pending',
    });
    let pendingReverifications = 0;
    usersWithPendingReverifications.forEach((u) => {
      pendingReverifications += u.reverificationRequests.filter((r) => r.status === 'Pending').length;
    });

    return res.status(200).json({
      success: true,
      data: {
        totalPlates,
        totalComments,
        pendingComments,
        approvedComments,
        rejectedComments,
        totalUsers,
        premiumUsers,
        pendingClaimRequests,
        ownerReportedComments,
        pendingReverifications,
      },
    });
  } catch (error) {
    console.error('[ADMIN DASHBOARD HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/admin/visitors
// Ziyaretçi istatistikleri (son 30 gün)
// =========================================================
router.get('/visitors', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const visitors = await Visitor.find({
      date: { $gte: startDateStr },
    })
      .sort({ date: -1 })
      .lean();

    // Toplam istatistikler
    let totalPageViews = 0;
    let totalUniqueVisitors = 0;
    const allIps = new Set();

    visitors.forEach((v) => {
      totalPageViews += v.pageViews;
      if (v.uniqueIps) {
        v.uniqueIps.forEach((ip) => allIps.add(ip));
      }
    });
    totalUniqueVisitors = allIps.size;

    // Bugünkü veriler
    const today = new Date().toISOString().split('T')[0];
    const todayData = visitors.find((v) => v.date === today);

    // Günlük özet listesi (IP'leri gizle)
    const dailyStats = visitors.map((v) => ({
      date: v.date,
      pageViews: v.pageViews,
      uniqueVisitors: v.uniqueIps ? v.uniqueIps.length : 0,
    }));

    return res.status(200).json({
      success: true,
      data: {
        totalPageViews,
        totalUniqueVisitors,
        todayPageViews: todayData ? todayData.pageViews : 0,
        todayUniqueVisitors: todayData && todayData.uniqueIps ? todayData.uniqueIps.length : 0,
        dailyStats,
      },
    });
  } catch (error) {
    console.error('[ADMIN ZİYARETÇİ HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/admin/maintenance
// Bakım modu durumunu getir
// =========================================================
router.get('/maintenance', async (req, res) => {
  try {
    const settings = await SiteSettings.getSettings();
    return res.status(200).json({
      success: true,
      data: {
        maintenanceMode: settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMessage,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/maintenance
// Bakım modunu aç/kapat
// =========================================================
router.put('/maintenance', async (req, res) => {
  try {
    const { maintenanceMode, maintenanceMessage } = req.body;
    const settings = await SiteSettings.getSettings();

    if (maintenanceMode !== undefined) settings.maintenanceMode = maintenanceMode;
    if (maintenanceMessage !== undefined) settings.maintenanceMessage = maintenanceMessage;

    await settings.save();

    console.log(`[BAKIM MODU] ${settings.maintenanceMode ? 'AKTİF' : 'PASİF'}`);

    return res.status(200).json({
      success: true,
      message: settings.maintenanceMode
        ? 'Bakım modu aktif edildi.'
        : 'Bakım modu kapatıldı.',
      data: {
        maintenanceMode: settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMessage,
      },
    });
  } catch (error) {
    console.error('[BAKIM MODU HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/admin/admins
// Tüm adminleri listele
// =========================================================
router.get('/admins', async (req, res) => {
  try {
    const admins = await User.find({ isAdmin: true })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    const data = admins.map((a) => ({
      _id: a._id,
      email: a.email,
      createdAt: a.createdAt,
      isCurrent: a._id.toString() === req.user._id.toString(),
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[ADMIN LİSTELEME HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// POST /api/admin/admins
// Yeni admin ekle
// =========================================================
router.post('/admins', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'E-posta ve şifre zorunludur.' });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: 'Şifre en az 6 karakter olmalıdır.' });
    }

    // Var olan kullanıcı kontrolü
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      // Zaten kayıtlıysa admin yap
      if (existingUser.isAdmin) {
        return res
          .status(400)
          .json({ success: false, message: 'Bu kullanıcı zaten admin.' });
      }
      existingUser.isAdmin = true;
      await existingUser.save();
      console.log(`[ADMIN EKLEME] Mevcut kullanıcı admin yapıldı: ${email}`);
      return res.status(200).json({
        success: true,
        message: `${email} admin olarak yetkilendirildi.`,
      });
    }

    // Yeni admin kullanıcı oluştur
    const newAdmin = await User.create({
      email: email.toLowerCase().trim(),
      password,
      isAdmin: true,
      kvkkApproved: true,
    });

    console.log(`[ADMIN EKLEME] Yeni admin oluşturuldu: ${email}`);

    return res.status(201).json({
      success: true,
      message: `Yeni admin oluşturuldu: ${newAdmin.email}`,
    });
  } catch (error) {
    console.error('[ADMIN EKLEME HATASI]:', error.message);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ success: false, message: 'Bu e-posta adresi zaten kayıtlı.' });
    }
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/admins/:id
// Admin bilgilerini güncelle (e-posta ve/veya şifre)
// =========================================================
router.put('/admins/:id', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findById(req.params.id).select('+password');

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin bulunamadı.' });
    }

    if (!admin.isAdmin) {
      return res
        .status(400)
        .json({ success: false, message: 'Bu kullanıcı admin değil.' });
    }

    // E-posta güncelleme
    if (email && email !== admin.email) {
      // E-posta benzersizlik kontrolü
      const emailExists = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: admin._id },
      });
      if (emailExists) {
        return res
          .status(400)
          .json({ success: false, message: 'Bu e-posta adresi başka bir kullanıcıya ait.' });
      }
      admin.email = email.toLowerCase().trim();
    }

    // Şifre güncelleme
    if (password) {
      if (password.length < 6) {
        return res
          .status(400)
          .json({ success: false, message: 'Şifre en az 6 karakter olmalıdır.' });
      }
      admin.password = password; // pre-save hook hashleyecek
    }

    await admin.save();

    console.log(`[ADMIN GÜNCELLEME] Admin güncellendi: ${admin.email}`);

    return res.status(200).json({
      success: true,
      message: 'Admin bilgileri güncellendi.',
    });
  } catch (error) {
    console.error('[ADMIN GÜNCELLEME HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// DELETE /api/admin/admins/:id
// Admin yetkisini kaldır
// =========================================================
router.delete('/admins/:id', async (req, res) => {
  try {
    // Kendini silemez
    if (req.params.id === req.user._id.toString()) {
      return res
        .status(400)
        .json({ success: false, message: 'Kendi admin yetkinizi kaldıramazsınız.' });
    }

    const admin = await User.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    admin.isAdmin = false;
    await admin.save();

    console.log(`[ADMIN SİLME] Admin yetkisi kaldırıldı: ${admin.email}`);

    return res.status(200).json({
      success: true,
      message: `${admin.email} admin yetkisi kaldırıldı.`,
    });
  } catch (error) {
    console.error('[ADMIN SİLME HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/admin/users
// Sistemdeki tüm kullanıcıları ve sahip oldukları plakaları listele
// =========================================================
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().populate('claimedPlates').select('-password').sort({ createdAt: -1 }).lean();
    
    // Her ihtimale karşı ownerId'den de eşleşenleri bulalım (Eğer claimedPlates arrayine eklenmeyi kaçırmışsa)
    const userIds = users.map(u => u._id);
    const plates = await Plate.find({ ownerId: { $in: userIds }, isClaimed: true }).lean();
    
    // Plakaları kullanıcılara eşle
    const platesByUser = {};
    plates.forEach(p => {
      const oId = p.ownerId ? p.ownerId.toString() : null;
      if (oId) {
        if (!platesByUser[oId]) platesByUser[oId] = [];
        platesByUser[oId].push(p.plateNumber);
      }
    });

    const data = users.map(u => {
      // populate() ile gelen plakalar
      const populatedPlates = (u.claimedPlates || []).map(p => p.plateNumber).filter(Boolean);
      // ownerId eşleşmesiyle gelen plakalar
      const matchingPlates = platesByUser[u._id.toString()] || [];
      
      // Tekrarsız (unique) listeyi oluştur
      const allPlates = [...new Set([...populatedPlates, ...matchingPlates])];

      return {
        _id: u._id,
        email: u.email,
        isEmailVerified: u.isEmailVerified,
        registrationIp: u.registrationIp,
        registrationUserAgent: u.registrationUserAgent,
        lastLoginIp: u.lastLoginIp,
        lastLoginDate: u.lastLoginDate,
        lastLoginUserAgent: u.lastLoginUserAgent,
        isPremium: u.isPremium,
        premiumExpiresAt: u.premiumExpiresAt,
        kvkkApproved: u.kvkkApproved,
        marketingApproved: u.marketingApproved,
        isBanned: u.isBanned || false,
        createdAt: u.createdAt,
        loginHistory: u.loginHistory || [],
        ownedPlates: allPlates
      };
    });

    return res.status(200).json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('[ADMIN KULLANICILAR HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/users/:id/ban
// Kullanıcıyı yasakla / yasağını kaldır
// =========================================================
router.put('/users/:id/ban', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }
    
    // Kendini banlayamaz
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Kendi hesabınızı engelleyemezsiniz.' });
    }

    user.isBanned = !user.isBanned;
    await user.save();

    const action = user.isBanned ? 'engellendi' : 'engeli kaldırıldı';
    return res.status(200).json({
      success: true,
      message: `Kullanıcı hesabı başarıyla ${action}.`
    });
  } catch (error) {
    console.error('[KULLANICI BANLAMA HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// DELETE /api/admin/users/:id
// Kullanıcıyı tamamen sil
// =========================================================
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    // Kendini silemez
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Kendi hesabınızı silemezsiniz.' });
    }

    // Kullanıcının attığı yorumları veya ona ait verileri de silebiliriz
    // Şu anlık sadece kullanıcıyı siliyoruz
    await User.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Kullanıcı başarıyla silindi.'
    });
  } catch (error) {
    console.error('[KULLANICI SİLME HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/admin/comments/pending
// Bekleyen yorumları listele
// =========================================================
router.get('/comments/pending', async (req, res) => {
  try {
    const comments = await Comment.find({ status: 'Pending' })
      .populate('plateId', 'plateNumber')
      .populate('userId', 'email')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: comments,
    });
  } catch (error) {
    console.error('[ADMIN YORUMLAR HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/admin/comments/reported
// Şikayet edilen yorumları listele
// =========================================================
router.get('/comments/reported', async (req, res) => {
  try {
    const comments = await Comment.find({ status: 'Reported' })
      .populate('plateId', 'plateNumber')
      .populate('userId', 'email')
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: comments,
    });
  } catch (error) {
    console.error('[ADMIN ŞİKAYETLER HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/comments/:id/hide
// Yorumu gizle (yayından kaldır) -> 'Hidden'
// =========================================================
router.put('/comments/:id/hide', async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Yorum bulunamadı.' });
    }

    comment.status = 'Hidden';
    await comment.save();

    return res.status(200).json({
      success: true,
      message: 'Yorum yayından kaldırıldı (Gizlendi).',
    });
  } catch (error) {
    console.error('[YORUM GİZLEME HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/comments/:id/approve
// Yorumu onayla -> 'Approved'
// Premium plaka sahibine e-posta bildirimi gönder
// =========================================================
router.put('/comments/:id/approve', async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id).populate('plateId');
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Yorum bulunamadı.' });
    }

    comment.status = 'Approved';
    await comment.save();

    // Yorumu yazan kullanıcıya puan ver (10 Puan) ve Rozetini güncelle
    if (comment.userId) {
      const author = await User.findById(comment.userId);
      if (author) {
        author.points = (author.points || 0) + 10;
        
        // Rozet Mantığı
        if (author.points >= 50 && !author.badges.includes('Acemi Raporlayıcı')) {
          author.badges.push('Acemi Raporlayıcı');
        }
        if (author.points >= 150 && !author.badges.includes('Güvenilir Raporlayıcı')) {
          author.badges.push('Güvenilir Raporlayıcı');
        }
        if (author.points >= 500 && !author.badges.includes('Fahri Müfettiş')) {
          author.badges.push('Fahri Müfettiş');
        }
        
        await author.save();
      }
    }

    // Premium plaka sahibine bildirim gönder
    if (comment.plateId && comment.plateId.isClaimed && comment.plateId.ownerId) {
      const owner = await User.findById(comment.plateId.ownerId);
      if (owner && owner.isPremium) {
        // E-posta bildirimi gönder
        try {
          const { sendNotificationEmail } = require('../utils/mailer');
          await sendNotificationEmail(
            owner.email,
            comment.plateId.plateNumber,
            comment.content,
            comment.category
          );
          console.log(`[E-POSTA BİLDİRİM] ${owner.email} -> Plaka: ${comment.plateId.plateNumber}`);
        } catch (mailErr) {
          console.error('[E-POSTA HATASI]:', mailErr.message);
          // E-posta hatası yorum onayını engellemez
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Yorum onaylandı ve yazara 10 puan verildi.',
    });
  } catch (error) {
    console.error('[YORUM ONAY HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/comments/:id/reject
// Yorumu reddet -> 'Rejected'
// =========================================================
router.put('/comments/:id/reject', async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Yorum bulunamadı.' });
    }

    comment.status = 'Rejected';
    await comment.save();

    return res.status(200).json({
      success: true,
      message: 'Yorum reddedildi.',
    });
  } catch (error) {
    console.error('[YORUM RED HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/admin/claims
// Bekleyen sahiplenme taleplerini listele
// =========================================================
router.get('/claims', async (req, res) => {
  try {
    const users = await User.find({ 'requests.status': 'Pending' }).lean();

    const claims = [];
    users.forEach((user) => {
      user.requests
        .filter((r) => r.status === 'Pending')
        .forEach((request) => {
          claims.push({
            _id: request._id,
            userId: user._id,
            userEmail: user.email,
            plateNumber: request.plateNumber,
            documentPath: request.documentPath,
            status: request.status,
            createdAt: request.createdAt,
          });
        });
    });

    // Tarihe göre sırala (yeniden eskiye)
    claims.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({
      success: true,
      data: claims,
    });
  } catch (error) {
    console.error('[ADMIN TALEPLER HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/claims/:userId/:requestId/approve
// Sahiplenme talebini onayla
// =========================================================
router.put('/claims/:userId/:requestId/approve', async (req, res) => {
  try {
    const { userId, requestId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    const request = user.requests.id(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Talep bulunamadı.' });
    }

    // Talebi onayla
    request.status = 'Approved';

    // Plakayı güncelle
    let plate = await Plate.findOne({ plateNumber: request.plateNumber });
    if (!plate) {
      plate = await Plate.create({ plateNumber: request.plateNumber });
    }
    plate.isClaimed = true;
    plate.claimStatus = 'approved';
    plate.ownerId = user._id;
    await plate.save();

    // Kullanıcıyı Premium yap
    user.isPremium = true;
    if (!user.claimedPlates.includes(plate._id)) {
      user.claimedPlates.push(plate._id);
    }
    await user.save();

    // 3 aylık doğrulama süresini ayarla
    const threeMonthsLater = new Date();
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
    plate.verificationExpiry = threeMonthsLater;
    plate.verificationStatus = 'verified';
    await plate.save();

    console.log(`[SAHİPLENME ONAY] Kullanıcı: ${user.email} -> Plaka: ${request.plateNumber} -> Premium aktif, Doğrulama süresi: ${threeMonthsLater.toISOString()}`);

    return res.status(200).json({
      success: true,
      message: `Sahiplenme onaylandı. ${user.email} artık Premium kullanıcı.`,
    });
  } catch (error) {
    console.error('[SAHİPLENME ONAY HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/claims/:userId/:requestId/reject
// Sahiplenme talebini reddet
// =========================================================
router.put('/claims/:userId/:requestId/reject', async (req, res) => {
  try {
    const { userId, requestId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    const request = user.requests.id(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Talep bulunamadı.' });
    }

    request.status = 'Rejected';
    await user.save();

    // Plaka durumunu geri 'none' yap (Eğer başkasına ait değilse)
    const Plate = require('../models/Plate');
    const plate = await Plate.findOne({ plateNumber: request.plateNumber });
    if (plate && plate.claimStatus === 'pending') {
      plate.claimStatus = 'none';
      await plate.save();
    }

    console.log(`[SAHİPLENME RED] Kullanıcı: ${user.email} -> Plaka: ${request.plateNumber}`);

    return res.status(200).json({
      success: true,
      message: 'Sahiplenme talebi reddedildi.',
    });
  } catch (error) {
    console.error('[SAHİPLENME RED HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/admin/settings
// Site ayarlarını getir
// =========================================================
router.get('/settings', async (req, res) => {
  try {
    const settings = await SiteSettings.getSettings();
    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('[AYARLAR HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/settings
// Site ayarlarını güncelle (iletişim + sosyal medya)
// =========================================================
router.put('/settings', async (req, res) => {
  try {
    const settings = await SiteSettings.getSettings();
    const { contactEmail, contactPhone, removalEmail, address, socialLinks, domain } = req.body;

    if (contactEmail !== undefined) settings.contactEmail = contactEmail;
    if (contactPhone !== undefined) settings.contactPhone = contactPhone;
    if (removalEmail !== undefined) settings.removalEmail = removalEmail;
    if (address !== undefined) settings.address = address;
    if (socialLinks !== undefined) settings.socialLinks = socialLinks;
    if (domain !== undefined) settings.domain = domain;

    await settings.save();
    console.log('[AYARLAR GÜNCELLENDİ]');
    return res.status(200).json({ success: true, message: 'Ayarlar kaydedildi.', data: settings });
  } catch (error) {
    console.error('[AYARLAR GÜNCELLEME HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/admin/messages
// =========================================================
router.get('/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, data: messages });
  } catch (error) {
    console.error('[ADMIN MESAJ GETİRME HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// POST /api/admin/messages/:id/reply
// =========================================================
router.post('/messages/:id/reply', async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply) return res.status(400).json({ success: false, message: 'Cevap metni boş olamaz.' });
    
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ success: false, message: 'Mesaj bulunamadı.' });
    
    message.adminReply = reply;
    message.status = 'Replied';
    await message.save();
    
    // Uygulama içi (Inbox) mesaj gönderimi
    try {
      const user = await User.findOne({ email: message.email.toLowerCase() });
      if (user) {
        await PrivateMessage.create({
          sender: req.user._id,
          receiver: user._id,
          subject: 'İletişim Talebiniz Hakkında (Destek)',
          content: reply
        });
      }
    } catch (e) {
      console.log('Site içi mesaj oluşturulurken hata:', e.message);
    }
    
    // E-posta gönderimi
    try {
      await sendContactReplyEmail(message.email, reply);
    } catch (e) {
      console.log('İletişim cevabı maili gönderilirken hata:', e.message);
    }
    
    return res.status(200).json({ success: true, message: 'Yanıtınız kullanıcıya iletildi.' });
  } catch (error) {
    console.error('[ADMIN MESAJ CEVAPLAMA HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/admin/comments/owner-reported
// Plaka sahibi tarafından şikayet edilen yorumları listele
// =========================================================
router.get('/comments/owner-reported', async (req, res) => {
  try {
    const comments = await Comment.find({ status: 'OwnerReported' })
      .populate('plateId', 'plateNumber')
      .populate('userId', 'email')
      .populate('reportedByOwner', 'email')
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: comments });
  } catch (error) {
    console.error('[ADMIN SAHİP ŞİKAYETLER HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/comments/:id/owner-report-approve
// Plaka sahibi şikayetini onayla → yorum kaldırılır (Hidden)
// =========================================================
router.put('/comments/:id/owner-report-approve', async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Yorum bulunamadı.' });
    }

    comment.status = 'Hidden';
    await comment.save();

    return res.status(200).json({
      success: true,
      message: 'Plaka sahibi şikayeti onaylandı. Yorum kaldırıldı.',
    });
  } catch (error) {
    console.error('[SAHİP ŞİKAYET ONAY HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/comments/:id/owner-report-reject
// Plaka sahibi şikayetini reddet → yorum tekrar yayına alınır
// =========================================================
router.put('/comments/:id/owner-report-reject', async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Yorum bulunamadı.' });
    }

    comment.status = 'Approved';
    comment.reportedByOwner = null;
    comment.ownerReportReason = null;
    await comment.save();

    return res.status(200).json({
      success: true,
      message: 'Şikayet reddedildi. Yorum tekrar yayında.',
    });
  } catch (error) {
    console.error('[SAHİP ŞİKAYET RED HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/admin/reverifications
// Bekleyen yeniden doğrulama taleplerini listele
// =========================================================
router.get('/reverifications', async (req, res) => {
  try {
    const users = await User.find({ 'reverificationRequests.status': 'Pending' }).lean();

    const requests = [];
    users.forEach((user) => {
      user.reverificationRequests
        .filter((r) => r.status === 'Pending')
        .forEach((request) => {
          requests.push({
            _id: request._id,
            userId: user._id,
            userEmail: user.email,
            plateNumber: request.plateNumber,
            documentPath: request.documentPath,
            dateProofPath: request.dateProofPath,
            status: request.status,
            createdAt: request.createdAt,
          });
        });
    });

    requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({ success: true, data: requests });
  } catch (error) {
    console.error('[ADMIN YENİDEN DOĞRULAMA HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/reverifications/:userId/:requestId/approve
// Yeniden doğrulama talebini onayla
// =========================================================
router.put('/reverifications/:userId/:requestId/approve', async (req, res) => {
  try {
    const { userId, requestId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    const request = user.reverificationRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Talep bulunamadı.' });
    }

    request.status = 'Approved';

    // Plakanın doğrulama süresini 3 ay daha uzat
    const Plate = require('../models/Plate');
    const plate = await Plate.findOne({ plateNumber: request.plateNumber });
    if (plate) {
      const threeMonthsLater = new Date();
      threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
      plate.verificationExpiry = threeMonthsLater;
      plate.verificationStatus = 'verified';
      await plate.save();
    }

    await user.save();

    console.log(`[YENİDEN DOĞRULAMA ONAY] Kullanıcı: ${user.email} -> Plaka: ${request.plateNumber}`);

    return res.status(200).json({
      success: true,
      message: 'Yeniden doğrulama onaylandı. Süre 3 ay uzatıldı.',
    });
  } catch (error) {
    console.error('[YENİDEN DOĞRULAMA ONAY HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/admin/reverifications/:userId/:requestId/reject
// Yeniden doğrulama talebini reddet
// =========================================================
router.put('/reverifications/:userId/:requestId/reject', async (req, res) => {
  try {
    const { userId, requestId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    const request = user.reverificationRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Talep bulunamadı.' });
    }

    request.status = 'Rejected';

    // Plakanın sahiplenme durumunu iptal et (süre dolmuş)
    const Plate = require('../models/Plate');
    const plate = await Plate.findOne({ plateNumber: request.plateNumber });
    if (plate) {
      plate.verificationStatus = 'expired';
      plate.isClaimed = false;
      plate.claimStatus = 'none';
      plate.ownerId = null;
      await plate.save();
    }

    // Kullanıcıdan plakayı kaldır
    if (plate) {
      user.claimedPlates = user.claimedPlates.filter(p => p.toString() !== plate._id.toString());
      if (user.claimedPlates.length === 0) {
        user.isPremium = false;
      }
    }

    await user.save();

    console.log(`[YENİDEN DOĞRULAMA RED] Kullanıcı: ${user.email} -> Plaka: ${request.plateNumber}`);

    return res.status(200).json({
      success: true,
      message: 'Yeniden doğrulama talebi reddedildi. Plaka sahiplenme iptal edildi.',
    });
  } catch (error) {
    console.error('[YENİDEN DOĞRULAMA RED HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

module.exports = router;
