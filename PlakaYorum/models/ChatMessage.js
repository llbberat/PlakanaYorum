/**
 * ==========================================================
 * PlakaYorum - Chat Mesajı Modeli (ChatMessage Schema)
 * ==========================================================
 * Kullanıcılar arası şifreli mesajlaşma sistemi.
 * Mesajlar AES-256-GCM ile sunucu taraflı şifrelenir.
 * Sadece mesajın katılımcıları (sender/receiver) okuyabilir.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

// Şifreleme anahtarı (.env'den alınır, yoksa rastgele üretilir)
const CHAT_ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

const ChatMessageSchema = new mongoose.Schema(
  {
    // Gönderen kullanıcı
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Alıcı kullanıcı
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Şifrelenmiş mesaj içeriği (AES-256-GCM)
    encryptedContent: {
      type: String,
      required: true,
    },
    // Şifreleme IV (Initialization Vector)
    iv: {
      type: String,
      required: true,
    },
    // GCM auth tag
    authTag: {
      type: String,
      required: true,
    },
    // Okundu bilgisi
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Güvenli 32 byte (256-bit) anahtar üretici (Kullanıcı .env'e ne yazarsa yazsın çalışmasını sağlar)
function getValidKey() {
  return crypto.createHash('sha256').update(String(CHAT_ENCRYPTION_KEY)).digest();
}

// Mesajı şifrele (statik metod)
ChatMessageSchema.statics.encryptMessage = function (plainText) {
  const key = getValidKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    encryptedContent: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag,
  };
};

// Mesajı çöz (statik metod)
ChatMessageSchema.statics.decryptMessage = function (encryptedContent, iv, authTag) {
  try {
    const key = getValidKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return '[Mesaj çözülemedi]';
  }
};

// 90 gün sonra otomatik sil (KVKK uyumu - TTL index)
ChatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
