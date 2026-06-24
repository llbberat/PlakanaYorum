const express = require('express');
const router = express.Router();
const PrivateMessage = require('../models/PrivateMessage');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// =========================================================
// GET /api/messages/inbox
// Giriş yapmış kullanıcının gelen mesajları
// =========================================================
router.get('/inbox', authMiddleware, async (req, res) => {
  try {
    const messages = await PrivateMessage.find({ receiver: req.user._id })
      .populate('sender', 'email isPremium isAdmin')
      .sort({ createdAt: -1 })
      .lean();
      
    return res.status(200).json({ success: true, data: messages });
  } catch (error) {
    console.error('[INBOX ERROR]:', error.message);
    return res.status(500).json({ success: false, message: 'Mesajlar alınırken hata oluştu.' });
  }
});

// =========================================================
// PUT /api/messages/:id/read
// Mesajı okundu olarak işaretle
// =========================================================
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const msg = await PrivateMessage.findOneAndUpdate(
      { _id: req.params.id, receiver: req.user._id },
      { isRead: true },
      { new: true }
    );
    if (!msg) {
      return res.status(404).json({ success: false, message: 'Mesaj bulunamadı veya yetkiniz yok.' });
    }
    return res.status(200).json({ success: true, data: msg });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'İşlem başarısız.' });
  }
});

// =========================================================
// POST /api/messages/send
// Kullanıcılar arası (veya admin'e) mesaj gönderme
// =========================================================
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { receiverId, subject, content } = req.body;
    if (!receiverId || !content) {
      return res.status(400).json({ success: false, message: 'Lütfen alıcı ve içerik bilgilerini eksiksiz girin.' });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ success: false, message: 'Alıcı kullanıcı bulunamadı.' });
    }

    const newMsg = await PrivateMessage.create({
      sender: req.user._id,
      receiver: receiver._id,
      subject: subject || 'Yeni Mesaj',
      content
    });

    return res.status(201).json({ success: true, message: 'Mesaj başarıyla gönderildi.', data: newMsg });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Mesaj gönderilemedi.' });
  }
});

module.exports = router;
