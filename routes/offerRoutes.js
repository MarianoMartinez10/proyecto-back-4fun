const express = require('express');
const router = express.Router({ mergeParams: true }); // Importante para soportar /api/products/:productId/offers
const {
  getOffers,
  createOffer,
  updateOffer,
  deleteOffer
} = require('../controllers/offerController');
const { protect, authorize } = require('../middlewares/auth');

/**
 * Capa de Enrutamiento: Ofertas de Productos (G2A Style)
 * Puede ser montado en /api/offers y en /api/products/:productId/offers
 */

router
  .route('/')
  .get(getOffers)
  .post(protect, authorize('seller', 'admin'), createOffer);

router
  .route('/:id')
  .put(protect, authorize('seller', 'admin'), updateOffer)
  .delete(protect, authorize('seller', 'admin'), deleteOffer);

module.exports = router;
