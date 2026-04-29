/**
 * Capa de Controladores: Reseñas y Calificaciones (Feedback)
 * --------------------------------------------------------------------------
 * Orquesta la captura de calificaciones de los clientes. Delega
 * la pesada carga de ponderación matemática y validaciones anti-spam al
 * `ReviewService`, respetando los límites MVC.
 */

const ReviewService = require('../services/reviewService');

/**
 * Ingresa una nueva reseña de usuario para un producto.
 * RN (Integridad): Interceptará por medio del ErrorHandler si el usuario
 * ya había calificado el mismo ítem.
 */
exports.createReview = async (req, res, next) => {
  try {
    const { rating, title, text } = req.body;
    const review = await ReviewService.createReview(
      req.user.id,
      req.params.productId,
      { rating, title, text }
    );
    res.status(201).json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
};

/**
 * Sirve el histórico paginado de opiniones ordenadas según peso.
 */
exports.getProductReviews = async (req, res, next) => {
  try {
    const { page, limit, sort } = req.query;
    const result = await ReviewService.getProductReviews(
      req.params.productId,
      { page, limit, sort }
    );
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * Procesa la analítica estática (Ej: Promedio, histograma de estrellas).
 */
exports.getProductRatingStats = async (req, res, next) => {
  try {
    const stats = await ReviewService.getProductRatingStats(req.params.productId);
    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

/**
 * Voto de utilidad (Upvote) para el sistema de ranking de comentarios.
 */
exports.voteHelpful = async (req, res, next) => {
  try {
    const result = await ReviewService.voteHelpful(req.params.id, req.user.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Módulo de censura/borrado de reseña (Requiere ser dueño o Admin).
 */
exports.deleteReview = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const result = await ReviewService.deleteReview(req.params.id, req.user.id, isAdmin);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};
