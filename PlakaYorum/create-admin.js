require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/plakayorum';

async function createAdmin() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB bağlandı.');

    const email = 'admin@plakayorum.com';
    const password = 'adminpassword123';

    // Önce eski admin varsa sil (opsiyonel, test için)
    await User.deleteOne({ email });

    const admin = new User({
      email,
      password,
      isAdmin: true,
      isPremium: true,
      kvkkApproved: true
    });

    await admin.save();
    console.log('🎉 Admin başarıyla oluşturuldu!');
    console.log('--------------------------------');
    console.log(`📧 E-posta: ${email}`);
    console.log(`🔑 Şifre: ${password}`);
    console.log('--------------------------------');
    
  } catch (err) {
    console.error('❌ Hata:', err.message);
  } finally {
    mongoose.connection.close();
  }
}

createAdmin();
