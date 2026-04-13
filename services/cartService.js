/**
 * Capa de Servicios: Carrito de Compras (Cart)
 * --------------------------------------------------------------------------
 * Contiene toda la Lógica de Negocio y comunicación con Base de Datos 
 * relativa al carrito. Sigue el patrón Singleton exportando una instancia.
 */

const prisma = require('../lib/prisma');
const productServiceInstance = require('./productService');
const ProductService = productServiceInstance.constructor;
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

class CartService {
    /**
     * Reconstruye el carrito poblado con datos profundos de productos.
     * Centraliza el "Eager Loading" del ORM para evitar repetición de includes en otros métodos.
     * 
     * @param {string} userId - UUID del dueño del carrito.
     * @returns {Object} Carrito con listado de items mapeados a DTO.
     */
    async getCartWithDTO(userId) {
        const cart = await prisma.cart.findUnique({
            where: { userId },
            include: {
                items: {
                    include: {
                        product: {
                            include: { platform: true, genre: true, requirements: true }
                        }
                    }
                }
            }
        });

        // RN de inicialización pasiva: Un usuario sin carrito arroja un listado vacío 
        // en vez de error 404, permitiendo mejor UX en frontend.
        if (!cart) return { items: [] };

        const transformedItems = cart.items.map(item => ({
            _id: item.id,
            id: item.id,
            quantity: item.quantity,
            product: ProductService.productToDTO(item.product)
        }));

        return { ...cart, _id: cart.id, items: transformedItems };
    }

    /**
     * Wrapper de lectura que invoca al formateador DTO.
     */
    async getCart(userId) {
        return this.getCartWithDTO(userId);
    }

    /**
     * Lógica transaccional para inyectar artículos al carrito de un cliente.
     * @param {string} userId - UUID del cliente.
     * @param {string} productId - Producto a adosar.
     * @param {number} quantity - Volúmen de artículos.
     * @returns {Object} Carrito poblado post-modificación.
     */
    async addToCart(userId, productId, quantity) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        
        // Manejo Excepciones: Aborta si se envía un fantasma.
        if (!product) throw new ErrorResponse('Producto no encontrado', 404);
        
        // Regla de Negocio (RN-05): "Disponibilidad Comercial". 
        // Impide anexar artículos temporalmente suspendidos en catálogo.
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

        // Regla de Negocio (RN-07): "Concurrencia y Límite de Stock".
        // Bloquea adicionar una mercadería si excede las existencias físicas en el inventario.
        if (product.stock < currentQty + quantity) {
            throw new ErrorResponse(`Stock insuficiente. Disponible: ${product.stock}, en carrito: ${currentQty}`, 400);
        }

        // Diseño arquitectónico: Lazy Creation del contenedor cart.
        if (!cart) {
            await prisma.cart.create({
                data: { userId, items: { create: [{ productId, quantity }] } }
            });
        } else {
            const existingItem = cart.items.find(i => i.productId === productId);
            // Agregado Incremental: Si el ítem yace en el carro, sumamos qties en bdd.
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

    /**
     * Pisa abruptamente las cantidades solicitadas en el ticket.
     * Aplica cuando el cliente typea en el input numérico directo.
     */
    async updateCartItem(userId, itemId, quantity) {
        const cart = await prisma.cart.findUnique({ where: { userId }, include: { items: true } });
        if (!cart) throw new ErrorResponse('Carrito no encontrado', 404);

        const item = cart.items.find(i => i.id === itemId);
        if (!item) throw new ErrorResponse('Item no encontrado', 404);

        // Actualizamos directo, ya que las validaciones complejas residen en addTo.
        await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
        logger.info(`Item actualizado en carrito para usuario: ${userId}`);
        return this.getCartWithDTO(userId);
    }

    /**
     * Expulsa sin miramientos un artículo de la canasta.
     */
    async removeFromCart(userId, itemId) {
        const cart = await prisma.cart.findUnique({ where: { userId }, include: { items: true } });
        if (!cart) throw new ErrorResponse('Carrito no encontrado', 404);

        await prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
        logger.info(`Item eliminado del carrito para usuario: ${userId}`);
        return this.getCartWithDTO(userId);
    }

    /**
     * Extracción recursiva de los ítems (Drop). 
     * RN: Disparado por Webhooks transaccionales post-efectuar pago cerrado.
     */
    async clearCart(userId) {
        const cart = await prisma.cart.findUnique({ where: { userId } });
        if (!cart) throw new ErrorResponse('Carrito no encontrado', 404);

        // Operacion masiva en BDD.
        await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
        logger.info(`Carrito vaciado para usuario: ${userId}`);
        return { items: [] };
    }
}

module.exports = new CartService();
