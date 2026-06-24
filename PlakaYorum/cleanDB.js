require('dotenv').config();
const mongoose = require('mongoose');

// Modeller
const User = require('./models/User');
const Plate = require('./models/Plate');
const Comment = require('./models/Comment');
const Message = require('./models/Message');
const ChatMessage = require('./models/ChatMessage');
const PrivateMessage = require('./models/PrivateMessage');
const Visitor = require('./models/Visitor');
// SiteSettings kalsın ki admin ayarların sıfırlanmasın

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/plakayorum';

async function cleanDatabase() {
  try {
    console.log('⏳ MongoDB veritabanına bağlanılıyor...');
    await mongoose.connect(URI);
    console.log('✅ Bağlantı başarılı!\n');

    // 1. Plaka ve Yorumları Temizle
    console.log('🗑️ Plakalar temizleniyor...');
    await Plate.deleteMany({});
    
    console.log('🗑️ Yorumlar temizleniyor...');
    await Comment.deleteMany({});

    // 2. Mesajlaşma Modüllerini Temizle
    console.log('🗑️ İletişim Formu Mesajları temizleniyor...');
    await Message.deleteMany({});
    
    console.log('🗑️ Genel Chat Mesajları temizleniyor...');
    await ChatMessage.deleteMany({});
    
    console.log('🗑️ Özel Mesajlar temizleniyor...');
    await PrivateMessage.deleteMany({});

    // 3. İstatistikleri Temizle
    console.log('🗑️ Ziyaretçi İstatistikleri sıfırlanıyor...');
    await Visitor.deleteMany({});

    // 4. Kullanıcıları Temizle (topuzb37 Hariç)
    console.log('🗑️ Çöp test kullanıcıları temizleniyor...');
    
    // E-posta adresinde "topuzb37" geçmeyen bütün kullanıcıları sil
    const userDeleteResult = await User.deleteMany({ email: { $not: /topuzb37/i } });
    console.log(`   └─ Toplam ${userDeleteResult.deletedCount} çöp kullanıcı veritabanından kalıcı olarak silindi.`);

    // 5. Admin'in Test Verilerini Temizle
    const admin = await User.findOne({ email: /topuzb37/i });
    if (admin) {
      admin.requests = []; // Adminin test amaçlı attığı plaka sahiplenme taleplerini sıfırla
      await admin.save();
      console.log(`\n👑 Admin hesabı (${admin.email}) başarıyla korundu ve test geçmişi temizlendi.`);
    } else {
      console.log('\n⚠️ UYARI: "topuzb37" adında bir kullanıcı bulunamadı! Siteye admin olmadan girebilirsiniz.');
    }

    console.log('\n=========================================');
    console.log('🚀 TERTEMİZ! Proje Canlıya Alınmaya Hazır.');
    console.log('=========================================');

  } catch (err) {
    console.error('❌ Temizleme sırasında hata oluştu:', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

cleanDatabase();
