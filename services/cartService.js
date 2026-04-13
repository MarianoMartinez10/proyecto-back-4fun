const prisma = require('../lib/prisma');
const productServiceInstance = require('./productService');
const ProductService = productServiceInstance.constructor; // Accede a la Clase para métodos estáticos
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

class CartService {
    // Helper: fetch cart with populated products and return DTO
    async getCartWithDTO(userId) {
        const cart = await prisma.cart.findUnique({
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

        if (!cart) return { items: [] };

        const transformedItems = cart.items.map(item => ({
            _id: item.id,
            id: item.id,
            quantity: item.quantity,
            product: ProductService.productToDTO(item.product)
        }));

        return { ...cart, _id: cart.id, items: transformedItems };
    }

    async getCart(userId) {
        return this.getCartWithDTO(userId);
    }

    async addToCart(userId, productId, quantity) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new ErrorResponse('Producto no encontrado', 404);
        if (!product.activo) throw new ErrorResponse('Este producto ya no está disponible', 400);

        let cart = await prisma.cart.findUnique({
            where: { userId },
            include: { items: true }
        });

        let currentQty = 0;
        if (cart) {
            const existingItem = cart.items.find(i => i.productId === productId);
            if (existingItem) currentQty = existingItem.quantity;
        }

        if (product.stock < currentQty + quantity) {
            throw new ErrorResponse(`Stock insuficiente. Disponible: ${product.stock}, en carrito: ${currentQty}`, 400);
        }

        if (!cart) {
            await prisma.cart.create({
                data: { userId, items: { create: [{ productId, quantity }] } }
            });
        } else {
            const existingItem = cart.items.find(i => i.productId === productId);
            if (existingItem) {
                await prisma.cartItem.update({
                    where: { id: existingItem.id },
                    data: { quantity: existingItem.quantity + quantity }
                });
            } else {
                await prisma.cartItem.create({ data: { cartId: cart.id, productId, quantity } });
            }
        }

        logger.info(`Item agregado al carrito para usuario: ${userId}`);
        return this.getCartWithDTO(userId);
    }

    async updateCartItem(userId, itemId, quantity) {
        const cart = await prisma.cart.findUnique({ where: { userId }, include: { items: true } });
        if (!cart) throw new ErrorResponse('Carrito no encontrado', 404);

        const item = cart.items.find(i => i.id === itemId);
        if (!item) throw new ErrorResponse('Item no encontrado', 404);

        await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
        logger.info(`Item actualizado en carrito para usuario: ${userId}`);
        return this.getCartWithDTO(userId);
    }

    async removeFromCart(userId, itemId) {
        const cart = await prisma.cart.findUnique({ where: { userId }, include: { items: true } });
        if (!cart) throw new ErrorResponse('Carrito no encontrado', 404);

        await prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
        logger.info(`Item eliminado del carrito para usuario: ${userId}`);
        return this.getCartWithDTO(userId);
    }

    async clearCart(userId) {
        const cart = await prisma.cart.findUnique({ where: { userId } });
        if (!cart) throw new ErrorResponse('Carrito no encontrado', 404);

        await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
        logger.info(`Carrito vaciado para usuario: ${userId}`);
        return { items: [] };
    }
}

module.exports = new CartService();
