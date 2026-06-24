/**
 * ==========================================================
 * PlakaYorum - JWT Auth Middleware
 * ==========================================================
 * Korumalı route'larda JWT token doğrulaması yapar.
 * Token, Authorization header'ından "Bearer <token>" formatında alınır.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function authMiddleware(req, res, next) {
  try {
    // Token'ı header'dan al
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme gerekli. Lütfen giriş yapın.',
      });
    }

    const token = authHeader.split(' ')[1];

    // Token doğrula
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı bulunamadı. Lütfen tekrar giriş yapın.',
      });
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Hesabınız yönetici tarafından engellenmiştir.',
      });
    }

    // Kullanıcıyı request'e ekle
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz token. Lütfen tekrar giriş yapın.',
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Sunucu hatası.',
    });
  }
}

module.exports = authMiddleware;
