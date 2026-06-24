const mongoose = require('mongoose');

const PrivateMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Null ise "Sistem" veya "Admin (Genel)" mesajıdır
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      default: 'Yeni Mesaj',
    },
    content: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('PrivateMessage', PrivateMessageSchema);
