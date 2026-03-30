const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');

// Crear Cupón (Admin)
exports.createCoupon = async (req, res, next) => {
    try {
        const { code, discountType, value, minPurchase, usageLimit, expiryDate, isActive } = req.body;
        const coupon = await prisma.coupon.create({
            data: {
                code: code?.toUpperCase(),
                discountType: discountType || 'percentage',
                value: value !== undefined ? value : 0,
                minPurchase: minPurchase !== undefined ? minPurchase : 0,
                usageLimit: usageLimit || null,
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                isActive: isActive !== undefined ? isActive : true
            }
        });
        res.status(201).json({ success: true, data: coupon });
    } catch (error) {
        next(error);
    }
};

// Obtener todos los cupones (Admin)
exports.getCoupons = async (req, res, next) => {
    try {
        const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: coupons });
    } catch (error) {
        next(error);
    }
};

// Validar cupón (Público - Checkout)
exports.validateCoupon = async (req, res, next) => {
    try {
        const { code } = req.params;
        const { cartTotal } = req.query;

        const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });

        if (!coupon) {
            throw new ErrorResponse('Cupón no encontrado', 404);
        }

        // Validación manual
        if (!coupon.isActive) {
            throw new ErrorResponse('Este cupón ya no está activo', 400);
        }
        if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
            throw new ErrorResponse('Este cupón ha expirado', 400);
        }
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            throw new ErrorResponse('Límite de uso excedido para este cupón', 400);
        }

        if (cartTotal && parseFloat(coupon.minPurchase) > parseFloat(cartTotal)) {
            throw new ErrorResponse(`Compra mínima requerida: $${coupon.minPurchase}`, 400);
        }

        res.json({
            success: true,
            data: {
                code: coupon.code,
                discountType: coupon.discountType,
                value: coupon.value,
                minPurchase: coupon.minPurchase
            }
        });
    } catch (error) {
        next(error);
    }
};

// Usar cupón (llamado después de una compra exitosa)
exports.useCoupon = async (code) => {
    try {
        await prisma.coupon.update({
            where: { code: code.toUpperCase() },
            data: { usedCount: { increment: 1 } }
        });
    } catch (error) {
        // Ignorar si no lo encuentra o falla
        console.error('Error updating coupon usage:', error.message);
    }
};

// Eliminar cupón (Admin)
exports.deleteCoupon = async (req, res, next) => {
    try {
        await prisma.coupon.delete({ where: { id: req.params.id } }).catch(err => {
            if (err.code === 'P2025') throw new ErrorResponse('Cupón no encontrado', 404);
            throw err;
        });
        res.json({ success: true, message: 'Cupón eliminado' });
    } catch (error) {
        next(error);
    }
};
