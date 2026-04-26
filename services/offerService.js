const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

class OfferService {
    /**
     * Mantiene sincronizado el precio mínimo y stock total del producto base
     * para facilitar búsquedas y filtros sin consultas complejas.
     */
    async updateProductCache(productId) {
        const offers = await prisma.productOffer.findMany({
            where: { productId, activo: true }
        });

        // Si no hay ofertas, el precio es 0. Si hay, calculamos el mínimo.
        const minPrice = offers.length > 0 
            ? Math.min(...offers.map(o => Number(o.precio)))
            : 0;
            
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) return;

        let totalStock = 0;
        
        if (product.tipo === 'Digital') {
            // El stock digital es la cantidad de keys disponibles en TODAS las ofertas de este producto
            const keysCount = await prisma.digitalKey.count({
                where: { offer: { productId }, estado: 'DISPONIBLE', activo: true }
            });
            totalStock = keysCount;
        } else {
            // Producto físico suma el stock de todas sus ofertas
            totalStock = offers.reduce((acc, curr) => acc + curr.stock, 0);
        }

        await prisma.product.update({
            where: { id: productId },
            data: { precio: minPrice, stock: totalStock }
        });
        
        logger.info(`[OfferService] Caché de producto ${productId} actualizado (Precio Min: ${minPrice}, Stock Total: ${totalStock})`);
    }

    async getOffersByProduct(productId) {
        const offers = await prisma.productOffer.findMany({
            where: { productId, activo: true },
            include: {
                seller: { include: { sellerProfile: true } },
                _count: { select: { digitalKeys: { where: { estado: 'DISPONIBLE' } } } }
            },
            orderBy: { precio: 'asc' }
        });

        return offers.map(o => ({
            id: o.id,
            productId: o.productId,
            sellerId: o.sellerId,
            sellerName: o.seller.name,
            storeName: o.seller.sellerProfile?.storeName || o.seller.name,
            price: Number(o.precio),
            stock: o.stock + (o._count?.digitalKeys || 0), // Digital keys + Physical stock
            active: o.activo,
            createdAt: o.createdAt
        }));
    }

    async createOffer(sellerId, data) {
        const { productId, price, stock } = data;

        if (!productId || price === undefined) {
            throw new ErrorResponse('Producto y precio son obligatorios', 400);
        }

        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new ErrorResponse('Producto no encontrado', 404);

        const existing = await prisma.productOffer.findFirst({
            where: { productId, sellerId }
        });

        if (existing) {
             throw new ErrorResponse('Ya tienes una oferta para este producto. Puedes editarla desde tu panel.', 400);
        }

        const offer = await prisma.productOffer.create({
            data: {
                productId,
                sellerId,
                precio: price,
                stock: stock || 0,
                activo: true
            }
        });

        await this.updateProductCache(productId);
        return offer;
    }

    async updateOffer(offerId, sellerId, userRole, data) {
        const offer = await prisma.productOffer.findUnique({ where: { id: offerId } });
        if (!offer) throw new ErrorResponse('Oferta no encontrada', 404);

        if (offer.sellerId !== sellerId && userRole !== 'admin') {
            throw new ErrorResponse('No tienes permiso para editar esta oferta', 403);
        }

        const updated = await prisma.productOffer.update({
            where: { id: offerId },
            data: {
                precio: data.price !== undefined ? data.price : offer.precio,
                stock: data.stock !== undefined ? data.stock : offer.stock,
                activo: data.active !== undefined ? data.active : offer.activo
            }
        });

        await this.updateProductCache(offer.productId);
        return updated;
    }

    async deleteOffer(offerId, sellerId, userRole) {
        const offer = await prisma.productOffer.findUnique({ where: { id: offerId } });
        if (!offer) throw new ErrorResponse('Oferta no encontrada', 404);

        if (offer.sellerId !== sellerId && userRole !== 'admin') {
            throw new ErrorResponse('No tienes permiso para eliminar esta oferta', 403);
        }

        // Eliminación lógica (soft delete) para mantener historial de órdenes
        await prisma.productOffer.update({ 
            where: { id: offerId },
            data: { activo: false }
        });
        
        await this.updateProductCache(offer.productId);
        return true;
    }
}

module.exports = new OfferService();
