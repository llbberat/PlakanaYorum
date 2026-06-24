const mongoose = require('mongoose');

const escapeHTML = (str) => {
  if (!str) return str;
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
};

const MessageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [50, 'Ad Soyad en fazla 50 karakter olabilir.'],
      set: escapeHTML
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: [100, 'E-posta en fazla 100 karakter olabilir.']
    },
    message: {
      type: String,
      required: true,
      maxlength: [1000, 'Mesaj en fazla 1000 karakter olabilir.'],
      set: escapeHTML
    },
    adminReply: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['Pending', 'Replied'],
      default: 'Pending',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Message', MessageSchema);
