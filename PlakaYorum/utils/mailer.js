/**
 * ==========================================================
 * PlakaYorum - E-posta Bildirim Modülü (Mailer)
 * ==========================================================
 * Premium plaka sahiplerine yeni yorum bildirimi gönderir.
 * nodemailer kullanır. Geliştirme ortamında konsola log yapar.
 * Üretim ortamında gerçek SMTP ayarları kullanılmalıdır.
 */

// Nodemailer yerine Resend API kullanılacak
// process.env.RESEND_API_KEY render ortam değişkenlerinden gelecek.

/**
 * Premium plaka sahibine yorum bildirimi gönderir.
 * @param {string} toEmail - Alıcı e-posta
 * @param {string} plateNumber - Plaka numarası
 * @param {string} commentContent - Yorum içeriği
 * @param {string} category - Yorum kategorisi
 */
async function sendNotificationEmail(toEmail, plateNumber, commentContent, category) {
  const subject = `🚗 PlakaYorum - ${plateNumber} plakasına yeni yorum yapıldı`;
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
      <div style="background: #1d4ed8; color: white; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 20px;">🚗 PlakaYorum</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">Plaka Bildirim Sistemi</p>
      </div>
      <div style="padding: 24px;">
        <h2 style="font-size: 18px; margin-bottom: 16px; color: #1e293b;">Plakanıza yeni yorum yapıldı!</h2>
        <div style="background: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">Plaka</p>
          <p style="margin: 0; font-size: 22px; font-weight: bold; color: #0f172a; letter-spacing: 2px;">${plateNumber}</p>
        </div>
        <div style="background: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 4px; font-size: 13px; color: #64748b;">Kategori: <strong>${category}</strong></p>
          <p style="margin: 8px 0 0; font-size: 14px; color: #334155;">"${commentContent}"</p>
        </div>
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px;">
          Bu e-posta PlakaYorum Premium üyeliğiniz kapsamında gönderilmiştir.<br>
          © ${new Date().getFullYear()} PlakaYorum - Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'PlakaYorum <noreply@plakanayorum.com.tr>',
          to: toEmail,
          subject: subject,
          html: html
        })
      });
      const data = await response.json();
      if (!response.ok) console.error('[RESEND HATASI]:', data);
    } catch (err) {
      console.error('[RESEND FETCH HATASI]:', err);
    }
  } else {
    // Geliştirme ortamı: konsol simülasyonu
    console.log('═══════════════════════════════════════════');
    console.log('📧 E-POSTA BİLDİRİMİ (Simülasyon)');
    console.log(`   Alıcı: ${toEmail}`);
    console.log(`   Konu: ${subject}`);
    console.log(`   Plaka: ${plateNumber}`);
    console.log(`   Kategori: ${category}`);
    console.log(`   Yorum: "${commentContent}"`);
    console.log('═══════════════════════════════════════════');
  }
}

/**
 * İletişim formundan gelen mesaja admin yanıtını gönderir.
 */
async function sendContactReplyEmail(toEmail, replyMessage) {
  const subject = `🚗 PlakaYorum - İletişim Talebiniz Hakkında`;
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
      <div style="background: #1d4ed8; color: white; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 20px;">🚗 PlakaYorum Destek</h1>
      </div>
      <div style="padding: 24px;">
        <h2 style="font-size: 18px; margin-bottom: 16px; color: #1e293b;">Bize ulaştığınız için teşekkürler!</h2>
        <div style="background: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 0; font-size: 15px; color: #334155; white-space: pre-wrap;">${replyMessage}</p>
        </div>
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px;">
          © ${new Date().getFullYear()} PlakaYorum - Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'PlakaYorum Destek <destek@plakanayorum.com.tr>',
          to: toEmail,
          subject: subject,
          html: html
        })
      });
    } catch (err) {
      console.error('[RESEND HATASI]:', err);
    }
  } else {
    console.log('═══════════════════════════════════════════');
    console.log('📧 İLETİŞİM CEVABI (Simülasyon)');
    console.log(`   Alıcı: ${toEmail}`);
    console.log(`   Mesaj: "${replyMessage}"`);
    console.log('═══════════════════════════════════════════');
  }
}
/**
 * Kayıt doğrulama kodu e-postası gönderir.
 */
async function sendVerificationEmail(toEmail, code) {
  const subject = `🚗 PlakaYorum - E-posta Doğrulama Kodunuz: ${code}`;
  const html = `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>PlakaYorum'a Hoş Geldiniz</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
              
              <!-- Üst Mavi Panel -->
              <tr>
                <td align="center" style="background-color: #2563eb; padding: 30px 20px;">
                  <h1 style="margin: 0; font-size: 28px; color: #ffffff; letter-spacing: 1px;">🚗 PlakaYorum</h1>
                  <p style="margin: 10px 0 0 0; font-size: 16px; color: #dbeafe;">Aramıza Hoş Geldiniz!</p>
                </td>
              </tr>
              
              <!-- İçerik -->
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="margin: 0 0 20px 0; font-size: 22px; color: #0f172a;">Hesabınız Neredeyse Hazır!</h2>
                  
                  <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                    Aşağıdaki doğrulama kodunu kullanarak hesabınızı aktifleştirebilir ve PlakaYorum dünyasına hızlıca giriş yapıp plaka aramaya başlayabilirsiniz:
                  </p>
                  
                  <!-- Kod Kutusu -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 25px;">
                    <tr>
                      <td align="center" style="background-color: #f1f5f9; border-radius: 8px; padding: 20px;">
                        <span style="font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 6px;">${code}</span>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Buton -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px;">
                    <tr>
                      <td align="center">
                        <a href="https://plakayorum.com" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 8px;">Giriş Yap ve Keşfet</a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #64748b; background-color: #f8fafc; padding: 15px; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0;">
                    <strong>Küçük bir hatırlatma:</strong> Topluluk kurallarımıza uygun, saygılı ve faydalı yorumlar yaparak platformumuzu harika bir yer haline getirmemize yardımcı olabilirsin.
                  </p>
                  
                  <p style="margin: 0 0 5px 0; font-size: 15px; font-weight: bold; color: #1e293b;">Keyifli yolculuklar!</p>
                  <p style="margin: 0; font-size: 15px; color: #475569;">PlakaYorum Ekibi</p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td align="center" style="background-color: #f1f5f9; padding: 20px; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 10px 0; font-size: 12px; color: #94a3b8;">Bu e-postayı siz talep etmediyseniz lütfen dikkate almayın.</p>
                  <p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; ${new Date().getFullYear()} PlakaYorum - Tüm hakları saklıdır.</p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'PlakaYorum <noreply@plakanayorum.com.tr>',
          to: toEmail,
          subject: subject,
          html: html
        })
      });
      const data = await response.json();
      if (!response.ok) console.error('[RESEND HATASI]:', data);
    } catch (err) {
      console.error('[RESEND FETCH HATASI]:', err);
    }
  } else {
    console.log('═══════════════════════════════════════════');
    console.log('📧 E-POSTA DOĞRULAMA (Simülasyon)');
    console.log(`   Alıcı: ${toEmail}`);
    console.log(`   Doğrulama Kodu: ${code}`);
    console.log('═══════════════════════════════════════════');
  }
}

async function sendCrashNotification(errorStack) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const subject = `⚠️ KRİTİK: PlakaYorum Sunucusu Çöktü`;
  
  if (process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'PlakaYorum <noreply@plakanayorum.com.tr>',
          to: adminEmail,
          subject: subject,
          html: `<pre style="color:red;">${errorStack}</pre>`
        })
      });
    } catch (err) {
      console.error('[RESEND HATASI]:', err);
    }
  }
}

/**
 * Yöneticiye sistem bildirimleri gönderir (Yeni yorum onayı, ruhsat onayı vb.)
 */
async function sendAdminNotification(subject, messageHtml) {
  const adminEmail = process.env.ADMIN_EMAIL || 'plakanayorum@gmail.com';
  if (process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'PlakaYorum Admin <noreply@plakanayorum.com.tr>',
          to: adminEmail,
          subject: subject,
          html: messageHtml
        })
      });
    } catch (err) {
      console.error('[RESEND ADMIN BİLDİRİM HATASI]:', err);
    }
  }
}

module.exports = { sendNotificationEmail, sendContactReplyEmail, sendVerificationEmail, sendCrashNotification, sendAdminNotification };
