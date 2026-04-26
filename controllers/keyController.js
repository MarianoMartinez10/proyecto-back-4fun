/**
 * Capa de Controladores: Gestión de Llaves Digitales (Inventory)
 * --------------------------------------------------------------------------
 * Concentra la operativa del inventario físico/digital. Su diseño protege
 * el acceso desde clientes, ya que todas las interacciones aquí son de 
 * dominio Administrativo o de Vendedor para sus ofertas.
 */

const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');
const OfferService = require('../services/offerService');

/**
 * Inserta un lote de claves digitales a una Oferta específica y actualiza el caché.
 */
exports.addKeys = async (req, res, next) => {
    try {
        const { offerId, keys } = req.body;

        if (!offerId) throw new ErrorResponse('OfferId requerido', 400);
        if (!keys || !Array.isArray(keys) || keys.length === 0) {
            throw new ErrorResponse('Se requiere un array de keys no vacío', 400);
        }

        const offer = await prisma.productOffer.findUnique({ 
            where: { id: offerId },
            include: { product: true }
        });

        if (!offer) throw new ErrorResponse('Oferta no encontrada', 404);
        if (offer.product.tipo !== 'Digital') throw new ErrorResponse('El producto no es digital', 400);

        // RN (Seguridad Marketplace): Un vendedor solo puede cargar keys a sus propias ofertas.
        if (req.user.role !== 'admin' && offer.sellerId !== req.user.id) {
            throw new ErrorResponse('No tienes permiso para gestionar el inventario de esta oferta', 403);
        }

        const uniqueKeys = [...new Set(keys)];

        const existingKeysDocs = await prisma.digitalKey.findMany({
            where: { clave: { in: uniqueKeys } },
            select: { clave: true }
        });
        const existingKeysSet = new Set(existingKeysDocs.map(k => k.clave));

        const newKeysToInsert = uniqueKeys
            .filter(k => !existingKeysSet.has(k))
            .map(k => ({
                offerId: offerId,
                clave: k,
                estado: 'DISPONIBLE'
            }));

        if (newKeysToInsert.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No se agregaron keys nuevas (todas ya existían)',
                addedCount: 0
            });
        }

        await prisma.digitalKey.createMany({
            data: newKeysToInsert,
            skipDuplicates: true
        });

        // Actualizamos caché del producto
        await OfferService.updateProductCache(offer.productId);

        const currentTotal = await prisma.digitalKey.count({
            where: { offerId: offerId, estado: 'DISPONIBLE' }
        });

        logger.info(`🔑 ${newKeysToInsert.length} keys agregadas para oferta de ${offer.product.nombre}`);

        res.status(201).json({
            success: true,
            message: `Se agregaron ${newKeysToInsert.length} keys exitosamente`,
            addedCount: newKeysToInsert.length,
            ignoredCount: uniqueKeys.length - newKeysToInsert.length,
            currentStock: currentTotal
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Revoca y expulsa del sistema una llave específica.
 */
exports.deleteKey = async (req, res, next) => {
    try {
        const { id } = req.params;
        const key = await prisma.digitalKey.findUnique({ 
            where: { id },
            include: { offer: { include: { product: true } } } 
        });

        if (!key) throw new ErrorResponse('Key no encontrada', 404);

        if (req.user.role !== 'admin' && key.offer.sellerId !== req.user.id) {
            throw new ErrorResponse('Acceso denegado: No eres el dueño de la oferta asociada', 403);
        }

        if (key.estado === 'VENDIDA') {
            logger.warn(`🗑️ Borrando key VENDIDA: ${key.clave} (Orden: ${key.orderId})`);
        }

        const offerId = key.offerId;
        const productId = key.offer.productId;
        
        await prisma.digitalKey.delete({ where: { id } });

        await OfferService.updateProductCache(productId);

        const count = await prisma.digitalKey.count({
            where: { offerId: offerId, estado: 'DISPONIBLE' }
        });

        res.json({ success: true, message: 'Key eliminada', currentStock: count });
    } catch (error) {
        next(error);
    }
};

/**
 * Sirve al Panel Admin/Vendedor las licencias de una oferta.
 */
exports.getKeysByProduct = async (req, res, next) => {
    // Nota: Aunque la ruta se llame getKeysByProduct, en realidad recibe un offerId en la nueva arq.
    try {
        const { productId: offerId } = req.params; // Re-mapeo para mantener compatibilidad temporal

        const offer = await prisma.productOffer.findUnique({ where: { id: offerId } });
        if (!offer) throw new ErrorResponse('Oferta no encontrada', 404);
        
        if (req.user.role !== 'admin' && offer.sellerId !== req.user.id) {
            throw new ErrorResponse('Acceso denegado: No tienes acceso a esta oferta', 403);
        }
        
        const keys = await prisma.digitalKey.findMany({
            where: { offerId: offerId },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        res.json({ success: true, count: keys.length, data: keys });
    } catch (error) {
        next(error);
    }
};
