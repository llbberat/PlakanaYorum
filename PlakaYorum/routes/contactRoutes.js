const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

// POST /api/contact
// İletişim sayfasından yeni mesaj gönderme
router.post('/', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lütfen tüm alanları doldurun.' 
      });
    }
    
    await Message.create({ name, email, message });
    
    return res.status(201).json({ 
      success: true, 
      message: 'Mesajınız başarıyla gönderildi, en kısa sürede dönüş yapılacaktır.' 
    });
  } catch (error) {
    console.error('[CONTACT ERROR]:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Mesaj gönderilirken sunucu tarafında bir hata oluştu.' 
    });
  }
});

module.exports = router;
