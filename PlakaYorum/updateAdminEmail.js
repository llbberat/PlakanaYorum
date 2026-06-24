const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/plakayorum';

async function updateAdmin() {
  try {
    // Model import
    const User = require('./models/User');
    
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB bağlandı.');

    const admin = await User.findOne({ isAdmin: true });
    if (!admin) {
      console.log('Admin kullanıcısı bulunamadı!');
      process.exit(1);
    }

    const oldEmail = admin.email;
    admin.email = 'topuzb37@gmail.com';
    admin.isEmailVerified = true; 
    
    // Eğer varsa mevcut kodları temizleyelim
    admin.emailVerificationCode = null;
    admin.emailVerificationExpires = null;
    
    await admin.save();
    console.log(`Admin güncellendi!`);
    console.log(`Eski Email: ${oldEmail}`);
    console.log(`Yeni Email: ${admin.email}`);
    console.log(`isEmailVerified: ${admin.isEmailVerified} (Artık kod sormayacak)`);
    
    process.exit(0);
  } catch (error) {
    console.error('Hata:', error);
    process.exit(1);
  }
}

updateAdmin();
