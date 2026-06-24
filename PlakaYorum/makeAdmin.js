const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/plakayorum';

async function makeAdmin() {
  try {
    const User = require('./models/User');
    
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB bağlandı.');

    const userEmail = 'topuzb37@gmail.com';
    const user = await User.findOne({ email: userEmail });
    
    if (!user) {
      console.log(`HATA: ${userEmail} adresine sahip bir kullanıcı bulunamadı!`);
      console.log('Lütfen önce site üzerinden bu e-posta ile kayıt olun.');
      process.exit(1);
    }

    // Kullanıcıyı admin yap ve doğrula
    user.isAdmin = true;
    user.isEmailVerified = true; 
    user.emailVerificationCode = null;
    user.emailVerificationExpires = null;
    
    await user.save();
    
    console.log(`BAŞARILI: ${userEmail} artık bir Admin ve hesabı onaylandı!`);
    console.log(`Artık bu e-posta ve şifrenizle giriş yapabilirsiniz.`);
    
    process.exit(0);
  } catch (error) {
    console.error('Hata:', error);
    process.exit(1);
  }
}

makeAdmin();
