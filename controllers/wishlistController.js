/**
 * Capa de Controladores: Lista de Deseos (Wishlist)
 * --------------------------------------------------------------------------
 * Facilita el enrutamiento para almacenar intención de compra diferida.
 * MVC respetado íntegramente (Lógica pesada en WishlistService).
 */

const WishlistService = require('../services/wishlistService');

/**
 * Consulta del estado actual de la alcancía del usuario.
 */
exports.getWishlist = async (req, res, next) => {
  try {
    const wishlist = await WishlistService.getWishlistByUser(req.user.id);
    res.json({ success: true, wishlist });
  } catch (error) {
    next(error); // ErrorHandler unifica 404s/DB Timeouts.
  }
};

/**
 * Switch Toggle Binario. Integra o desecha un ítem dependiendo del estado previo.
 * RN (Performance): Usar un Endpoint único reduce las llamadas de React drásticamente.
 */
exports.toggleWishlist = async (req, res, next) => {
  try {
    const { productId } = req.body;
    const userId = req.user.id;
    
    // Delegación completa al Servicio
    await WishlistService.toggleWishlist(userId, productId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};
