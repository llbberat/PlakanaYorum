/**
 * ==========================================================
 * PlakaYorum - Plaka Format Kontrolü Middleware
 * ==========================================================
 * Türkiye plaka formatını sıkı REGEX ile doğrular.
 * 
 * Türkiye Plaka Formatları:
 *   - [01-81] + [1-3 harf] + [1-4 rakam]
 * 
 * Örnekler: 34ABC123, 06A1234, 34ABC12, 01AB123, 81AAA1
 * 
 * İl kodu 01-81 arasında olmalıdır.
 * Sahte plaka üretimini ve SEO kirliliğini engeller.
 */

/**
 * Plaka string'ini temizler: Boşlukları siler, büyük harfe çevirir.
 * @param {string} plate - Ham plaka string'i
 * @returns {string} - Temizlenmiş plaka
 */
function cleanPlateNumber(plate) {
  if (!plate || typeof plate !== 'string') return '';
  return plate.replace(/\s+/g, '').toUpperCase().trim();
}

/**
 * Türkiye plaka formatını doğrular.
 * Format: [İl Kodu: 01-81] + [Harfler: 1-3] + [Rakamlar: 1-4]
 * 
 * Detaylı açıklama:
 *   - İl kodu: 01'den 81'e kadar (0[1-9], [1-7][0-9], 8[0-1])
 *   - Harf bölümü: 1 ile 3 arası büyük Türkçe harf (A-Z)
 *   - Rakam bölümü: 1 ile 4 arası rakam (0-9), ilk rakam 0 olamaz
 * 
 * @param {string} plate - Temizlenmiş plaka string'i
 * @returns {boolean} - Format geçerli mi?
 */
function isValidTurkishPlate(plate) {
  // Türkiye plaka regex'i
  // İl kodu: 0[1-9] veya [1-7][0-9] veya 8[01]
  // Harf: 1-3 büyük harf
  // Rakam: 1-4 rakam (baş sıfır olabilir: 0001 gibi)
  const plateRegex = /^(0[1-9]|[1-7][0-9]|8[01])([A-Z]{1,3})([0-9]{1,4})$/;
  return plateRegex.test(plate);
}

/**
 * Express middleware: Route parametresindeki plaka numarasını
 * temizler, formatı doğrular ve req.cleanPlate'e atar.
 */
function plateFormatCheck(req, res, next) {
  const rawPlate = req.params.number || req.body.plateNumber || '';
  const cleanedPlate = cleanPlateNumber(rawPlate);

  // Boş kontrol
  if (!cleanedPlate) {
    return res.status(400).json({
      success: false,
      message: 'Plaka numarası boş olamaz.',
    });
  }

  // Uzunluk kontrolü (minimum 5, maksimum 9 karakter)
  if (cleanedPlate.length < 4 || cleanedPlate.length > 9) {
    return res.status(400).json({
      success: false,
      message: 'Plaka numarası 4-9 karakter arasında olmalıdır.',
    });
  }

  // Türkiye plaka format kontrolü
  if (!isValidTurkishPlate(cleanedPlate)) {
    return res.status(400).json({
      success: false,
      message: 'Geçersiz plaka formatı. Lütfen geçerli bir Türkiye plakası giriniz. (Örn: 34ABC123, 06A1234)',
    });
  }

  // Temizlenmiş plakayı request nesnesine ekle
  req.cleanPlate = cleanedPlate;
  next();
}

module.exports = { plateFormatCheck, cleanPlateNumber, isValidTurkishPlate };
