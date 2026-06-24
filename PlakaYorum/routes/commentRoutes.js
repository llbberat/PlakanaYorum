/**
 * ==========================================================
 * PlakaYorum - Yorum Route'ları (Comment Routes)
 * ==========================================================
 * Yorum şikayet etme endpoint'i.
 */

const express = require('express');
const router = express.Router();

const Comment = require('../models/Comment');

// =========================================================
// POST /api/comment/:id/report
// Yorum şikayet etme: status'ü 'reported' olarak günceller
// =========================================================
router.post('/:id/report', async (req, res) => {
  try {
    const { id } = req.params;

    // MongoDB ObjectId formatı kontrolü
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz yorum ID formatı.',
      });
    }

    const comment = await Comment.findById(id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Yorum bulunamadı.',
      });
    }

    // Zaten şikayet edilmiş mi?
    if (comment.status === 'Reported') {
      return res.status(400).json({
        success: false,
        message: 'Bu yorum zaten şikayet edilmiş.',
      });
    }

    // Gizlenmiş yorum şikayet edilemez
    if (comment.status === 'Hidden' || comment.status === 'Rejected') {
      return res.status(400).json({
        success: false,
        message: 'Bu yorum zaten kaldırılmış veya gizlenmiş.',
      });
    }

    // IP logla (5651 uyumu)
    const reporterIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.connection?.remoteAddress ||
      req.ip;

    // Yorumu 'Reported' olarak işaretle
    comment.status = 'Reported';
    await comment.save();

    // Eğer JWT ile giriş yapmış biriyse log geçmişine kaydet
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const User = require('../models/User');
        const user = await User.findById(decoded.userId);
        if (user) {
          user.loginHistory.push({
            action: `Şikayette Bulundu (Yorum ID: ${id})`,
            ipAddress: reporterIp,
            userAgent: req.headers['user-agent'] || 'unknown',
            date: new Date()
          });
          await user.save();
        }
      } catch (e) {
        // Token yoksa/geçersizse umursama
      }
    }

    console.log(`[ŞİKAYET] Yorum ${id} şikayet edildi. Şikayet eden IP: ${reporterIp}`);

    return res.status(200).json({
      success: true,
      message: 'Şikayetiniz alındı. Yorum incelenecektir.',
    });
  } catch (error) {
    console.error('[ŞİKAYET HATASI]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Sunucu hatası.',
    });
  }
});

module.exports = router;
