/**
 * ==========================================================
 * PlakaYorum - Plaka Modeli (Plate Schema)
 * ==========================================================
 * Her araç plakası için bir kayıt tutar.
 * Plaka numarası benzersiz (unique) ve büyük harfe zorlanmıştır.
 * Sahiplenme (claim) süreci: none -> pending -> approved
 * isActive: false yapılarak "Uyar-Kaldır" mekanizması sağlanır.
 */

const mongoose = require('mongoose');

const PlateSchema = new mongoose.Schema(
  {
    // Plaka numarası: Boşluksuz, büyük harf, benzersiz
    plateNumber: {
      type: String,
      required: [true, 'Plaka numarası zorunludur.'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    // Plaka sahiplenildi mi?
    isClaimed: {
      type: Boolean,
      default: false,
    },

    // Sahiplenme durumu: none (yok), pending (beklemede), approved (onaylandı)
    claimStatus: {
      type: String,
      enum: {
        values: ['none', 'pending', 'approved'],
        message: 'Geçersiz sahiplenme durumu: {VALUE}',
      },
      default: 'none',
    },

    // Plakayı sahiplenen kullanıcı (opsiyonel)
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Plaka aktif mi? (Uyar-Kaldır mekanizması)
    // false ise yorumlar gösterilmez
    isActive: {
      type: Boolean,
      default: true,
    },

    // Plaka sahibi yorumları kapattı mı?
    isCommentsClosed: {
      type: Boolean,
      default: false,
    },

    // 3 aylık doğrulama süresi sonu
    // Sahiplenme onaylandığında 3 ay sonrasına ayarlanır
    verificationExpiry: {
      type: Date,
      default: null,
    },

    // Doğrulama durumu: verified, pending_reverification, expired
    verificationStatus: {
      type: String,
      enum: ['verified', 'pending_reverification', 'expired'],
      default: null,
    },
  },
  {
    timestamps: true, // createdAt ve updatedAt otomatik eklenir
  }
);

// Plaka numarası kaydedilmeden önce boşlukları temizle
PlateSchema.pre('save', function (next) {
  if (this.plateNumber) {
    this.plateNumber = this.plateNumber.replace(/\s+/g, '').toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Plate', PlateSchema);
