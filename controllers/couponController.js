/**
 * Capa de Controladores: Cupones y Promociones
 * --------------------------------------------------------------------------
 * Expone la API para operaciones de descuento. Al encapsular esta lógica,
 * aseguramos que las integraciones (Checkout, Carrito) no crucen límites MVC,
 * centralizando aquí las restricciones de vigencia y canje de bonificaciones.
 */

const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');

/**
 * Registra un código promocional en sistema (Exclusivo Administradores).
 * @param {Object} req - Body de configuración del cupón.
 * @param {Object} res - JSON resultante.
 * @param {Function} next - Middleware error handler.
 */
exports.createCoupon = async (req, res, next) => {
    try {
        const { code, discountType, value, minPurchase, usageLimit, expiryDate, isActive } = req.body;
        
        // Excepción MVC: Controller interactuando directo con BDD temporalmente
        // Esto debería refactorizarse en CouponService a futuro.
        const coupon = await prisma.coupon.create({
            data: {
                code: code?.toUpperCase(), // RN Normalización: Todos los códigos habitan en Mayúsculas.
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

/**
 * Consulta del catálogo completo de vouchers (Solo Admins).
 */
exports.getCoupons = async (req, res, next) => {
    try {
        const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: coupons });
    } catch (error) {
        next(error);
    }
};

/**
 * Procesa la elegibilidad de canje de un código ingresado por el usuario en el Checkout.
 * RN (Reglas de Negocio): Chequeos condicionales simultáneos de Validez, Vencimiento,
 * Límite Global y Base de Compra.
 */
exports.validateCoupon = async (req, res, next) => {
    try {
        const { code } = req.params;
        const { cartTotal } = req.query;

        const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });

        // Manejo Excepciones (Not Found): Si el código provisto no existe.
        if (!coupon) {
            throw new ErrorResponse('Cupón no encontrado', 404);
        }

        // --- Ejecución Secuencial de Reglas de Negocio Promocionales ---
        
        // RN Comercial 1: ¿Está la campaña suspendida (isActive = false)?
        if (!coupon.isActive) {
            throw new ErrorResponse('Este cupón ya no está activo', 400);
        }
        // RN Comercial 2: ¿Venció la fecha límite?
        if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
            throw new ErrorResponse('Este cupón ha expirado', 400);
        }
        // RN Comercial 3: ¿Se agotó el stock o cupo colectivo del Voucher?
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            throw new ErrorResponse('Límite de uso excedido para este cupón', 400);
        }
        // RN Comercial 4: ¿El carro tiene valor suficiente para calificar?
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
        next(error); // Delega cualquiera de los throw ErrorResponse() al formato general.
    }
};

/**
 * Aplica el efecto de "Consumo Físico" incrementando el contador.
 * Este método omite el MVC request/response porque es disparado internamente
 * desde Webhooks al concretarse el pago, no directo por el usuario frontal.
 */
exports.useCoupon = async (code) => {
    try {
        await prisma.coupon.update({
            where: { code: code.toUpperCase() },
            data: { usedCount: { increment: 1 } }
        });
    } catch (error) {
        // Manejo Excepciones Silencioso: Si falla el incremento (ej. código borrado recién),
        // no impedimos cerrar la compra del usuario al final de su pipeline.
        console.error('Error updating coupon usage:', error.message);
    }
};

/**
 * Destrucción física (Hard delete) de un código desde Panel de Control.
 */
exports.deleteCoupon = async (req, res, next) => {
    try {
        // Manejo Try-Catch delegado al helper .catch local del ORM.
        await prisma.coupon.delete({ where: { id: req.params.id } }).catch(err => {
            if (err.code === 'P2025') throw new ErrorResponse('Cupón no encontrado', 404);
            throw err;
        });
        res.json({ success: true, message: 'Cupón eliminado' });
    } catch (error) {
        next(error);
    }
};
