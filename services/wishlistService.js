const prisma = require('../lib/prisma');
const ProductService = require('./productService');
const logger = require('../utils/logger');

class WishlistService {
    async getWishlistByUser(userId) {
        const wishlist = await prisma.wishlist.findUnique({
            where: { userId },
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                platform: true,
                                genre: true,
                                requirements: true
                            }
                        }
                    }
                }
            }
        });

        if (!wishlist) return [];

        const productos = wishlist.items
            .filter(item => item.product)
            .map(item => ProductService.transformDTO(item.product));

        logger.info(`Wishlist obtenida para usuario: ${userId}`);
        return productos;
    }

    async toggleWishlist(userId, productId) {
        let wishlist = await prisma.wishlist.findUnique({
            where: { userId },
            include: { items: true }
        });

        if (!wishlist) {
            await prisma.wishlist.create({
                data: { userId, items: { create: [{ productId }] } }
            });
            logger.info(`Wishlist creada y producto agregado: ${userId}`);
        } else {
            const existingItem = wishlist.items.find(i => i.productId === productId);
            if (existingItem) {
                await prisma.wishlistItem.delete({ where: { id: existingItem.id } });
                logger.info(`Producto removido de wishlist: ${userId}`);
            } else {
                await prisma.wishlistItem.create({ data: { wishlistId: wishlist.id, productId } });
                logger.info(`Producto agregado a wishlist: ${userId}`);
            }
        }

        return true;
    }
}

module.exports = new WishlistService();
