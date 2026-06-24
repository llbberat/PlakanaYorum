/**
 * ==========================================================
 * PlakaYorum - Kullanıcı Modeli (User Schema)
 * ==========================================================
 * Araç sahiplerinin kayıt olup plakalarını sahiplenebileceği
 * kullanıcı sistemi. Şifre bcrypt ile hashlenir.
 * KVKK onayı kayıt için zorunludur.
 * isAdmin: Admin paneline erişim yetkisi.
 * requests: Plaka sahiplenme talepleri dizisi.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Sahiplenme talebi alt şeması
const ClaimRequestSchema = new mongoose.Schema(
  {
    plateNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    // Ruhsat belgesi / e-Devlet belgesi dosya yolu
    documentPath: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    adminNote: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// 3 Aylık Yeniden Doğrulama Talebi alt şeması
const ReverificationRequestSchema = new mongoose.Schema(
  {
    plateNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    // Ruhsat belgesi dosya yolu
    documentPath: {
      type: String,
      required: true,
    },
    // Tarih yazılı kağıt belgesi dosya yolu
    dateProofPath: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    adminNote: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const UserSchema = new mongoose.Schema(
  {
    // E-posta adresi (benzersiz)
    email: {
      type: String,
      required: [true, 'E-posta adresi zorunludur.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Geçerli bir e-posta adresi giriniz.',
      ],
    },

    // Kullanıcı Adı (benzersiz)
    username: {
      type: String,
      unique: true,
      trim: true,
      sparse: true, // Eskiden kayıt olanlarda null olabilir diye sparse ekliyoruz (sonradan script ile dolduracağız)
    },

    // Şifre (hashlenir, minimum 6 karakter)
    password: {
      type: String,
      required: [true, 'Şifre zorunludur.'],
      minlength: [6, 'Şifre en az 6 karakter olmalıdır.'],
      select: false, // Sorgularda şifre alanı varsayılan olarak gelmez
    },

    // Premium üyelik durumu
    isPremium: {
      type: Boolean,
      default: false,
    },

    // Premium abonelik bitiş tarihi (Shopier vb. için 30 günlük süreç)
    premiumExpiresAt: {
      type: Date,
      default: null,
    },

    // Admin yetkisi
    isAdmin: {
      type: Boolean,
      default: false,
    },

    // Kayıt Logları
    registrationIp: {
      type: String,
      default: null,
    },
    registrationUserAgent: {
      type: String,
      default: null,
    },

    // Son Giriş Logları (En sonuncu giriş)
    lastLoginIp: {
      type: String,
      default: null,
    },
    lastLoginDate: {
      type: Date,
      default: null,
    },
    lastLoginUserAgent: {
      type: String,
      default: null,
    },

    // Tüm Giriş Geçmişi (Devamlı loglama)
    loginHistory: [
      {
        action: {
          type: String,
          default: 'Giriş Yaptı',
        },
        ipAddress: String,
        userAgent: String,
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Sahiplenilen plakalar
    claimedPlates: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plate',
      },
    ],

    // Sahiplenme talepleri
    requests: [ClaimRequestSchema],

    // 3 Aylık Yeniden Doğrulama Talepleri
    reverificationRequests: [ReverificationRequestSchema],

    // KVKK onayı - kayıt için zorunlu
    kvkkApproved: {
      type: Boolean,
      required: [true, 'KVKK onayı zorunludur.'],
      validate: {
        validator: function (v) {
          return v === true;
        },
        message: 'Kayıt için KVKK onayı verilmelidir.',
      },
    },
    // Tanıtım ve Pazarlama Onayı
    marketingApproved: {
      type: Boolean,
      default: false,
    },

    // Puan Sistemi (Oyunlaştırma)
    points: {
      type: Number,
      default: 0,
    },
    // Kazanılan Rozetler
    badges: [
      {
        type: String,
      }
    ],

    // Şifre Sıfırlama
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpire: {
      type: Date,
      default: null,
    },

    // E-posta doğrulama
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationCode: {
      type: String,
      default: null,
    },
    emailVerificationExpires: {
      type: Date,
      default: null,
    },
    // Son doğrulama kodu gönderim zamanı (Spam koruması için)
    lastVerificationSentAt: {
      type: Date,
      default: null,
    },
    // Ban (Yasaklanma) durumu
    isBanned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Şifre kaydedilmeden önce hashle (bcrypt)
UserSchema.pre('save', async function (next) {
  // Şifre değişmediyse tekrar hashleme
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Şifre doğrulama metodu
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
