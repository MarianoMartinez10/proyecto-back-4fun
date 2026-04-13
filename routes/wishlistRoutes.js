const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { getWishlist, toggleWishlist } = require('../controllers/wishlistController');

/**
 * Capa de Enrutamiento: Lista de Deseos (Wishlist)
 * --------------------------------------------------------------------------
 * Gestiona el repositorio personal de artículos de interés.
 * 
 * RN - Personalización: Todas las rutas requieren 'protect' ya que la 
 * colección es privada y atada a la identidad del cliente. (MVC / Router)
 */

router.use(protect);

/** @route GET /api/wishlist - Obtiene la colección completa de favoritos del usuario. */
router.get('/', getWishlist);

/** @route POST /api/wishlist/toggle - Alterna la presencia de un producto en la lista. */
router.post('/toggle', toggleWishlist);

module.exports = router;
