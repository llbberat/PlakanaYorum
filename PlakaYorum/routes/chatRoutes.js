/**
 * ==========================================================
 * PlakaYorum - Chat Route'ları (chatRoutes.js)
 * ==========================================================
 * Kullanıcılar arası şifreli mesajlaşma sistemi.
 * Mesajlar AES-256-GCM ile şifrelenir, sadece katılımcılar okuyabilir.
 * 
 * Endpoint'ler:
 *  - GET /api/chat/conversations     → Kullanıcının konuşma listesi
 *  - GET /api/chat/messages/:userId  → Belirli kullanıcıyla olan mesajlar
 *  - POST /api/chat/send             → Mesaj gönder
 *  - PUT /api/chat/read/:userId      → Mesajları okundu işaretle
 *  - GET /api/chat/search-users      → Kullanıcı arama (chat başlatmak için)
 *  - GET /api/chat/unread-count      → Okunmamış mesaj sayısı
 */

const express = require('express');
const router = express.Router();

const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { checkBadWordsAsync } = require('../middleware/badWordFilter');

// Tüm chat route'ları auth gerektirir
router.use(authMiddleware);

// =========================================================
// GET /api/chat/conversations
// Kullanıcının tüm konuşma listesini getir
// =========================================================
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user._id;

    // Bu kullanıcının katıldığı tüm mesajları bul
    const messages = await ChatMessage.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .sort({ createdAt: -1 })
      .lean();

    // Konuşma partnerleri bazında grupla
    const conversationMap = {};
    messages.forEach((msg) => {
      const partnerId =
        msg.sender.toString() === userId.toString()
          ? msg.receiver.toString()
          : msg.sender.toString();

      if (!conversationMap[partnerId]) {
        conversationMap[partnerId] = {
          partnerId,
          lastMessage: msg,
          unreadCount: 0,
        };
      }

      // Okunmamış mesaj sayısı (sadece bana gelenler)
      if (
        msg.receiver.toString() === userId.toString() &&
        !msg.isRead
      ) {
        conversationMap[partnerId].unreadCount++;
      }
    });

    // Partnerlerin bilgilerini çek
    const partnerIds = Object.keys(conversationMap);
    const partners = await User.find({ _id: { $in: partnerIds } })
      .select('username')
      .lean();

    const partnerMap = {};
    partners.forEach((p) => {
      partnerMap[p._id.toString()] = p.username || 'Bilinmeyen Kullanıcı';
    });

    // Sonuç listesi
    const conversations = partnerIds.map((pid) => {
      const conv = conversationMap[pid];
      const lastMsg = conv.lastMessage;
      let lastMessagePreview;
      try {
        const decrypted = ChatMessage.decryptMessage(
          lastMsg.encryptedContent,
          lastMsg.iv,
          lastMsg.authTag
        );
        lastMessagePreview =
          decrypted.length > 50 ? decrypted.substring(0, 50) + '...' : decrypted;
      } catch (e) {
        lastMessagePreview = '[Şifreli mesaj]';
      }

      return {
        partnerId: pid,
        partnerUsername: partnerMap[pid] || 'Bilinmeyen Kullanıcı',
        lastMessagePreview,
        lastMessageDate: lastMsg.createdAt,
        unreadCount: conv.unreadCount,
        isSentByMe: lastMsg.sender.toString() === userId.toString(),
      };
    });

    // Tarihe göre sırala (en son mesaj en üstte)
    conversations.sort(
      (a, b) => new Date(b.lastMessageDate) - new Date(a.lastMessageDate)
    );

    return res.status(200).json({ success: true, data: conversations });
  } catch (error) {
    console.error('[CHAT KONUŞMALAR HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/chat/messages/:userId
// Belirli kullanıcıyla olan mesajları getir
// =========================================================
router.get('/messages/:userId', async (req, res) => {
  try {
    const myId = req.user._id;
    const otherId = req.params.userId;

    const messages = await ChatMessage.find({
      $or: [
        { sender: myId, receiver: otherId },
        { sender: otherId, receiver: myId },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    // Mesajları çöz
    const decryptedMessages = messages.map((msg) => {
      let content;
      try {
        content = ChatMessage.decryptMessage(
          msg.encryptedContent,
          msg.iv,
          msg.authTag
        );
      } catch (e) {
        content = '[Mesaj çözülemedi]';
      }

      return {
        _id: msg._id,
        sender: msg.sender,
        receiver: msg.receiver,
        content,
        isRead: msg.isRead,
        isMine: msg.sender.toString() === myId.toString(),
        createdAt: msg.createdAt,
      };
    });

    return res.status(200).json({ success: true, data: decryptedMessages });
  } catch (error) {
    console.error('[CHAT MESAJLAR HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// POST /api/chat/send
// Mesaj gönder
// =========================================================
router.post('/send', async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    const senderId = req.user._id;

    if (!receiverId || !content) {
      return res
        .status(400)
        .json({ success: false, message: 'Alıcı ve mesaj içeriği zorunludur.' });
    }

    if (content.trim().length < 1 || content.trim().length > 500) {
      return res
        .status(400)
        .json({ success: false, message: 'Mesaj 1-500 karakter arasında olmalıdır.' });
    }

    // Kendine mesaj gönderemez
    if (senderId.toString() === receiverId) {
      return res
        .status(400)
        .json({ success: false, message: 'Kendinize mesaj gönderemezsiniz.' });
    }

    // Alıcı var mı kontrol et
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ success: false, message: 'Alıcı bulunamadı.' });
    }

    // Küfür kontrolü (Yapay Zeka Destekli)
    const badWordResult = await checkBadWordsAsync(content);
    if (badWordResult && badWordResult.hasBadWord) {
      return res
        .status(400)
        .json({ success: false, message: badWordResult.reason || 'Mesajınız uygunsuz içerik barındırmaktadır.' });
    }

    // Mesajı şifrele
    const encrypted = ChatMessage.encryptMessage(content.trim());

    // Kaydet
    const chatMsg = await ChatMessage.create({
      sender: senderId,
      receiver: receiverId,
      encryptedContent: encrypted.encryptedContent,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    });

    return res.status(201).json({
      success: true,
      message: 'Mesaj gönderildi.',
      data: {
        _id: chatMsg._id,
        sender: chatMsg.sender,
        receiver: chatMsg.receiver,
        content: content.trim(),
        isMine: true,
        createdAt: chatMsg.createdAt,
      },
    });
  } catch (error) {
    console.error('[CHAT GÖNDERME HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// PUT /api/chat/read/:userId
// Belirli kullanıcıdan gelen mesajları okundu işaretle
// =========================================================
router.put('/read/:userId', async (req, res) => {
  try {
    const myId = req.user._id;
    const otherId = req.params.userId;

    await ChatMessage.updateMany(
      { sender: otherId, receiver: myId, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({ success: true, message: 'Mesajlar okundu.' });
  } catch (error) {
    console.error('[CHAT OKUNDU HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/chat/search-users?q=username
// Chat başlatmak için kullanıcı adı arama
// =========================================================
router.get('/search-users', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.length < 3) {
      return res
        .status(400)
        .json({ success: false, message: 'En az 3 karakter giriniz.' });
    }

    const users = await User.find({
      username: { $regex: query, $options: 'i' },
      _id: { $ne: req.user._id }, // Kendini hariç tut
    })
      .select('username _id')
      .limit(10)
      .lean();

    return res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error('[CHAT KULLANICI ARAMA HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

// =========================================================
// GET /api/chat/unread-count
// Toplam okunmamış mesaj sayısı
// =========================================================
router.get('/unread-count', async (req, res) => {
  try {
    const count = await ChatMessage.countDocuments({
      receiver: req.user._id,
      isRead: false,
    });
    return res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
});

module.exports = router;
