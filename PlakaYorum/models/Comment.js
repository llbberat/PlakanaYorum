/**
 * ==========================================================
 * PlakaYorum - Yorum Modeli (Comment Schema)
 * ==========================================================
 * Plakalara yapılan yorumları tutar.
 * 5651 sayılı kanun gereği IP adresi loglanır.
 * KVKK onayı zorunludur.
 * Admin onay sistemi: Pending -> Approved / Rejected
 */

const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema(
  {
    // Hangi plakaya ait yorum
    plateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plate',
      required: [true, 'Plaka referansı zorunludur.'],
      index: true,
    },

    // Yorumu yazan kullanıcı (null = anonim)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Yorum içeriği (max 280 karakter)
    content: {
      type: String,
      required: [true, 'Yorum içeriği zorunludur.'],
      maxlength: [280, 'Yorum en fazla 280 karakter olabilir.'],
      trim: true,
    },

    // Yorum tipi/kategorisi
    category: {
      type: String,
      enum: {
        values: ['Hatalı Park', 'Açık Far', 'Tehlikeli Sürüş', 'Övgü/Teşekkür', 'Diğer'],
        message: 'Geçersiz yorum kategorisi: {VALUE}',
      },
      required: [true, 'Yorum kategorisi seçilmelidir.'],
    },

    // Admin onay durumu
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Reported', 'Hidden', 'OwnerReported'],
      default: 'Pending',
    },

    // Plaka sahibi tarafından şikayet edildi mi?
    reportedByOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Plaka sahibinin şikayet sebebi
    ownerReportReason: {
      type: String,
      default: null,
    },

    // 5651 sayılı kanun gereği IP adresi kaydı
    ipAddress: {
      type: String,
      required: true,
    },

    // Kullanıcı Tarayıcı Bilgisi (Loglama için)
    userAgent: {
      type: String,
      default: 'unknown',
    },

    // KVKK onayı - zorunlu
    kvkkApproved: {
      type: Boolean,
      required: [true, 'KVKK onayı zorunludur.'],
      validate: {
        validator: function (v) {
          return v === true;
        },
        message: 'KVKK onayı verilmelidir.',
      },
    },

    // KVKK onay tarihi
    kvkkApprovedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

// Yorumları tarihe göre sıralama için index
CommentSchema.index({ plateId: 1, createdAt: -1 });
CommentSchema.index({ status: 1 });

// =========================================================
// İNDEKSLER (Performans için)
// =========================================================
CommentSchema.index({ plateId: 1, status: 1, createdAt: -1 });
CommentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', CommentSchema);
