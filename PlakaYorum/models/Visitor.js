/**
 * ==========================================================
 * PlakaYorum - Ziyaretçi İstatistikleri Modeli (Visitor Schema)
 * ==========================================================
 * Günlük benzersiz ziyaretçi sayısını takip eder.
 * Her gün için bir kayıt oluşturulur (tarih bazlı).
 * IP adresleri Set olarak tutularak benzersiz ziyaretçi hesaplanır.
 */

const mongoose = require('mongoose');

const VisitorSchema = new mongoose.Schema({
  // Tarih (sadece gün, YYYY-MM-DD formatında benzersiz)
  date: {
    type: String,
    required: true,
    unique: true,
  },
  // O gün toplam sayfa görüntüleme
  pageViews: {
    type: Number,
    default: 0,
  },
  // O gün benzersiz IP adresleri
  uniqueIps: {
    type: [String],
    default: [],
  },
}, {
  timestamps: true,
});

// Benzersiz ziyaretçi sayısı virtual
VisitorSchema.virtual('uniqueVisitors').get(function () {
  return this.uniqueIps ? this.uniqueIps.length : 0;
});

// JSON'a dahil et
VisitorSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Visitor', VisitorSchema);
