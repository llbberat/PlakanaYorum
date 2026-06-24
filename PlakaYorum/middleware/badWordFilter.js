/**
 * ==========================================================
 * PlakaYorum - Yapay Zeka Destekli Yorum Filtresi (Gemini)
 * ==========================================================
 * Yorumları bağlamsal olarak analiz eden, gereksiz sansürleri önleyen
 * (örn: "tamam" kelimesindeki harfleri küfür sanmayan) ve
 * kişisel verileri (KVKK) tespit eden akıllı sistem.
 */

// Basit Regex Tabanlı Yedek Sistem (API Çalışmazsa Devreye Girer)
const BACKUP_BAD_WORDS = ['orospu', 'piç', 'siktir', 'yavşak', 'götveren', 'pezevenk', 'şerefsiz', 'amk', 'aq', 'yarrak'];
const PHONE_REGEX = /(?:\+?90|0)?[\s-]?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g;
const TC_REGEX = /\b[1-9]\d{10}\b/g;

async function checkWithAI(text) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('No API Key');

    // Prompt: Yorumun içerdiği sorunları tespit et ve sadece JSON dön.
    const prompt = `Aşağıdaki yorum metnini analiz et. İçinde hakaret, küfür, argo kelime var mı kontrol et. Ayrıca içinde kişisel bilgi (gerçek telefon numarası, TC kimlik, açık isim-soyisim) var mı kontrol et. Plaka numaraları veya sıradan kelimeler kişisel bilgi değildir. "tamam", "zaman", "bisiklet", "müzik" gibi içinde tesadüfen hece geçen normal kelimeleri ASLA küfür olarak algılama.
Eğer yorum temizse {"status": "clean"} dön.
Eğer küfür/argo varsa {"status": "rejected", "reason": "Yorumunuz uygunsuz ifade içermektedir."} dön.
Eğer kişisel veri varsa {"status": "rejected", "reason": "Yorumunuzda KVKK gereği yasak olan kişisel bilgiler (Telefon/TC/İsim) tespit edilmiştir."} dön.
Sadece JSON çıktısı ver, başına sonuna hiçbir şey ekleme.

Yorum Metni: "${text}"`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Request Failed: ${response.status} - ${errText}`);
    }
    
    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;
    
    // Clean markdown if present
    const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error('[YAPAY ZEKA FİLTRE HATASI]:', error.message);
    return null; // Fallback to basic regex
  }
}

function backupFilter(text) {
  const lowerText = text.toLowerCase();
  
  // Küfür (Sadece kelime başı eşleşmesi, ek almış haliyle de yakalar örn: şerefsizdir)
  for (const word of BACKUP_BAD_WORDS) {
    // Regex: Kelime sınırı ile başlasın, kelimeyi içersin.
    // Örnek: \bşerefsiz -> "şerefsiz", "şerefsizdir" yakalar, "çokşerefsiz" yakalamaz.
    if (new RegExp(`\\b${word}`, 'gi').test(lowerText)) {
      return { status: 'rejected', reason: 'Yorumunuz uygunsuz ifade içermektedir. Lütfen düzenleyiniz.' };
    }
  }

  // Kişisel Bilgi
  if (PHONE_REGEX.test(text) || TC_REGEX.test(text)) {
    return { status: 'rejected', reason: 'Yorumunuzda kişisel iletişim/kimlik bilgisi tespit edildi. (KVKK İhlali)' };
  }

  return { status: 'clean' };
}

/**
 * Express middleware
 */
async function badWordFilter(req, res, next) {
  const content = req.body.content;

  if (!content) {
    return res.status(400).json({
      success: false,
      message: 'Yorum içeriği boş olamaz.',
    });
  }

  // 1. Yapay Zekaya Sor
  let result = await checkWithAI(content);

  // 2. Eğer AI cevap vermezse/Hata verirse Regex ile temel kontrol yap
  if (!result) {
    result = backupFilter(content);
  }

  // 3. Kararı uygula
  if (result.status === 'rejected') {
    return res.status(400).json({
      success: false,
      message: result.reason,
    });
  }

  next();
}

module.exports = { badWordFilter };
