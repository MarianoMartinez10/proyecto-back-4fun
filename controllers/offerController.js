const OfferService = require('../services/offerService');
const asyncHandler = require('../middlewares/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

exports.getOffers = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    if (!productId) throw new ErrorResponse('El ID del producto es obligatorio', 400);

    const offers = await OfferService.getOffersByProduct(productId);

    res.status(200).json({
        success: true,
        count: offers.length,
        data: offers
    });
});

exports.createOffer = asyncHandler(async (req, res) => {
    // Si viene dentro de /products/:productId/offers
    const productId = req.params.productId || req.body.productId;
    
    const offerData = {
        ...req.body,
        productId
    };

    const offer = await OfferService.createOffer(req.user.id, offerData);

    res.status(201).json({
        success: true,
        data: offer
    });
});

exports.updateOffer = asyncHandler(async (req, res) => {
    const offer = await OfferService.updateOffer(req.params.id, req.user.id, req.user.role, req.body);

    res.status(200).json({
        success: true,
        data: offer
    });
});

exports.deleteOffer = asyncHandler(async (req, res) => {
    await OfferService.deleteOffer(req.params.id, req.user.id, req.user.role);

    res.status(200).json({
        success: true,
        data: {}
    });
});
