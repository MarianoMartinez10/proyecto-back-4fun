const express = require('express');
const router = express.Router();
const {
  createReview,
  getProductReviews,
  getProductRatingStats,
  voteHelpful,
  deleteReview
} = require('../controllers/reviewController');
const { protect } = require('../middlewares/auth');

/**
 * Capa de Enrutamiento: Interacciones y Reseñas (Reviews)
 * --------------------------------------------------------------------------
 * Gestiona el feedback de la comunidad sobre el catálogo.
 * Implementa seguridad por 'protect' para acciones que implican autoría.
 */

// ─── CONSULTORIA DE COMUNIDAD ───

/** @route GET /api/reviews/product/:productId - Obtiene el feed de opiniones por bien. */
router.get('/product/:productId', getProductReviews);

/** @route GET /api/reviews/product/:productId/stats - Histogramas de satisfacción. */
router.get('/product/:productId/stats', getProductRatingStats);


// ─── ACCIONES DE USUARIO (PROTECTED) ───

/** @route POST /api/reviews/product/:productId - Emisión de nueva opinión verificada. */
router.post('/product/:productId', protect, createReview);

/** @route POST /api/reviews/:id/helpful - Voto de utilidad (Ranking social). */
router.post('/:id/helpful', protect, voteHelpful);

/** @route DELETE /api/reviews/:id - Baja de contenido (Autor o Admin). */
router.delete('/:id', protect, deleteReview);

module.exports = router;
