/**
 * ==========================================================
 * PlakaYorum - Shopier Ödeme Route'ları (paymentRoutes.js)
 * ==========================================================
 * Shopier API entegrasyonu ile aylık (30 günlük) Premium
 * abonelik satışı ve Webhook (Callback) işlemleri.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// Shopier ayarları (.env dosyasından çekilecek)
const SHOPIER_API_KEY = process.env.SHOPIER_API_KEY || '';
const SHOPIER_API_SECRET = process.env.SHOPIER_API_SECRET || '';
const SHOPIER_WEBSITE_INDEX = process.env.SHOPIER_WEBSITE_INDEX || '1'; // Shopier panelinizdeki site indexiniz

// =========================================================
// POST /api/payment/shopier/start
// Shopier ödeme formunu oluştur ve frontend'e dön
// =========================================================
router.post('/shopier/start', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    // Sipariş bilgileri (Aylık Premium Üyelik)
    const price = 49.0; // 49 TL
    // Sipariş ID benzersiz olmalı, kullanıcı id ve timestamp birleştirilebilir
    const orderId = `PREM-${user._id}-${Date.now()}`;
    const buyerName = 'PlakaYorum';
    const buyerSurname = 'Kullanıcısı';
    const buyerEmail = user.email;
    const buyerPhone = user.phoneNumber || '05555555555';
    // Shopier Callback URL'si (bunu sunucuda dışarıdan erişilebilir bir domain yapmalısınız)
    const callbackUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/payment/shopier/callback`;

    // Shopier hash oluşturma mantığı:
    // orderId + price + currency (0 = TL) + websiteIndex + API_SECRET -> SHA256 ile şifrele
    const currency = '0'; // 0 = TRY
    const hashString = `${orderId}${price}${currency}${SHOPIER_WEBSITE_INDEX}${SHOPIER_API_SECRET}`;
    
    // Crypto hash'i
    const hash = crypto.createHash('sha256').update(hashString).digest('base64');

    // Frontend'in submit edebileceği Shopier HTML formu (Gizli form)
    // Frontend bu verileri alıp otomatik bir HTML formu oluşturarak "https://shopier.com/ShowProduct/api_pay4.php" adresine postlayacaktır.
    const shopierData = {
      API_key: SHOPIER_API_KEY,
      website_index: SHOPIER_WEBSITE_INDEX,
      platform_order_id: orderId,
      product_name: 'Aylık Premium Üyelik (PlakaYorum)',
      product_type: '0', // 0 = Fiziksel değil (Dijital/Hizmet)
      buyer_name: buyerName,
      buyer_surname: buyerSurname,
      buyer_email: buyerEmail,
      buyer_account_age: '0',
      buyer_id_nr: '11111111111', // Opsiyonel (bireysel için uydurma girilebilir)
      buyer_phone: buyerPhone,
      billing_address: 'Türkiye', // Hizmet olduğu için önemli değil
      billing_city: 'İstanbul',
      billing_country: 'TR',
      billing_postcode: '34000',
      shipping_address: 'Türkiye',
      shipping_city: 'İstanbul',
      shipping_country: 'TR',
      shipping_postcode: '34000',
      total_order_value: price,
      currency: currency,
      platform: '0',
      is_in_frame: '0',
      current_language: 'tr',
      modul_version: '1.0.4',
      random_nr: crypto.randomBytes(4).toString('hex'),
      signature: hash,
      callbackUrl: callbackUrl,
    };

    return res.status(200).json({
      success: true,
      message: 'Ödeme verileri oluşturuldu.',
      data: shopierData
    });
  } catch (error) {
    console.error('[SHOPIER BAŞLATMA HATASI]:', error.message);
    return res.status(500).json({ success: false, message: 'Ödeme başlatılamadı.' });
  }
});

// =========================================================
// POST /api/payment/shopier/callback
// Shopier ödeme başarılı/başarısız olduğunda bu rotaya post atar.
// DİKKAT: Shopier bu isteği arka planda atar (sunucudan sunucuya).
// =========================================================
router.post('/shopier/callback', async (req, res) => {
  try {
    const { status, invoice_id, order_id, installment, signature, random_nr } = req.body;

    // Beklenen hash değerini oluştur
    const expectedHashString = `${random_nr}${order_id}${SHOPIER_API_SECRET}`;
    const expectedHash = crypto.createHash('sha256').update(expectedHashString).digest('base64');

    if (signature !== expectedHash) {
      console.error('[SHOPIER CALLBACK] Geçersiz imza!');
      return res.status(400).send('Geçersiz imza');
    }

    if (status === 'success') {
      // Ödeme başarılı!
      // order_id formatı: PREM-UserId-Timestamp -> Buradan UserId'yi parçalayalım
      const parts = order_id.split('-');
      if (parts.length >= 2) {
        const userId = parts[1];
        
        // Kullanıcıyı bul
        const user = await User.findById(userId);
        if (user) {
          // 30 gün premium süresi ekle
          user.isPremium = true;
          user.premiumExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Şu an + 30 gün
          await user.save();

          console.log(`[SHOPIER ÖDEME BAŞARILI] Kullanıcı ${user.email} 30 gün premium oldu.`);
        }
      }
    } else {
      console.log(`[SHOPIER ÖDEME BAŞARISIZ] OrderID: ${order_id}`);
    }

    // Shopier bizden OK yanıtı bekler
    return res.status(200).send('OK');
  } catch (error) {
    console.error('[SHOPIER CALLBACK HATASI]:', error.message);
    return res.status(500).send('Sunucu hatası');
  }
});

module.exports = router;
