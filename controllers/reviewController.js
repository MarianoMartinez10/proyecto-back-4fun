const ReviewService = require('../services/reviewService');

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

exports.getProductRatingStats = async (req, res, next) => {
  try {
    const stats = await ReviewService.getProductRatingStats(req.params.productId);
    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

exports.voteHelpful = async (req, res, next) => {
  try {
    const result = await ReviewService.voteHelpful(req.params.id, req.user.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.deleteReview = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const result = await ReviewService.deleteReview(req.params.id, req.user.id, isAdmin);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};
