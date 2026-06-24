/**
 * PlakaYorum - Site Ayarları Modeli
 * Admin panelinden düzenlenebilir iletişim bilgileri ve sosyal medya linkleri.
 * Tekil kayıt (singleton) - veritabanında sadece 1 adet olur.
 * Bakım modu ve ziyaretçi takibi eklendi.
 */

const mongoose = require('mongoose');

const SocialLinkSchema = new mongoose.Schema({
  platform: { type: String, required: true }, // instagram, twitter, facebook, youtube, tiktok, linkedin
  url: { type: String, required: true },
  icon: { type: String, default: '🔗' },
}, { _id: true });

const SiteSettingsSchema = new mongoose.Schema({
  // İletişim bilgileri
  contactEmail: { type: String, default: 'iletisim@plakayorum.com' },
  contactPhone: { type: String, default: '' },
  removalEmail: { type: String, default: 'kaldir@plakayorum.com' },
  address: { type: String, default: '' },
  domain: { type: String, default: 'plakayorum.com' },

  // Sosyal medya linkleri
  socialLinks: [SocialLinkSchema],

  // Bakım modu
  maintenanceMode: { type: Boolean, default: false },
  maintenanceMessage: { type: String, default: 'Site şu anda bakım modundadır. Lütfen daha sonra tekrar deneyin.' },
}, {
  timestamps: true,
});

// Tekil kayıt getirme
SiteSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('SiteSettings', SiteSettingsSchema);
