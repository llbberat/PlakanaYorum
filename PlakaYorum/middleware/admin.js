/**
 * ==========================================================
 * PlakaYorum - Admin Middleware
 * ==========================================================
 * Sadece isAdmin: true olan kullanıcıların erişebildiği
 * admin route'larını korur. Auth middleware'den sonra çalışır.
 */

function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Bu işlem için admin yetkisi gereklidir.',
    });
  }
  next();
}

module.exports = adminMiddleware;
