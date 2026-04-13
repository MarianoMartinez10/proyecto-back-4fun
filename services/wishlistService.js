const prisma = require('../lib/prisma');
const productServiceInstance = require('./productService');
const ProductService = productServiceInstance.constructor; // Acceso estático
const logger = require('../utils/logger');

/**
 * Capa de Servicios: Lista de Deseos (Wishlist Domain)
 * --------------------------------------------------------------------------
 * Gestiona la intención de compra asíncrona de los usuarios.
 * Mantiene la persistencia de artículos favoritos y su sincronía con las
 * transformaciones DTO del catálogo maestro. (MVC / Dominio)
 */

class WishlistService {
    
    /**
     * Recupera el catálogo de favoritos de un usuario.
     * RN - Integridad: Filtra ítems huérfanos y los transforma usando el 
     * mapper oficial de ProductService para asegurar consistencia en precios/fotos.
     * 
     * @param {string} userId - UUID del dueño.
     * @returns {Promise<Array>} Listado de productos DTO favoritos.
     */
    async getWishlistByUser(userId) {
        const wishlist = await prisma.wishlist.findUnique({
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

        if (!wishlist) return [];

        // RN - Mantenibilidad: Reutiliza la lógica de transformación oficial del catálogo
        // para asegurar que el descuento se calcule igual en favoritos que en la tienda.
        const productos = wishlist.items
            .filter(item => item.product)
            .map(item => ProductService.productToDTO(item.product));

        logger.info(`Wishlist consultada: Usuario ${userId}`);
        return productos;
    }

    /**
     * Implementa la lógica de "Toggle" (Alternar) para un producto.
     * RN - Idempotencia: Crea el registro si no existe, o lo elimina si ya está presente.
     * 
     * @param {string} userId - UUID del autor.
     * @param {string} productId - ID del bien.
     * @returns {Promise<boolean>} Estado de la operación.
     */
    async toggleWishlist(userId, productId) {
        // Manejo de Excepciones: Verifica la existencia de la cabecera de Wishlist para el usuario.
        let wishlist = await prisma.wishlist.findUnique({
            where: { userId },
            include: { items: true }
        });

        if (!wishlist) {
            // Caso 1: Primera vez del usuario en el sistema de favoritos.
            await prisma.wishlist.create({
                data: { userId, items: { create: [{ productId }] } }
            });
            logger.info(`Wishlist inicializada con producto: ${userId}`);
        } else {
            // Caso 2: El usuario ya posee una lista. Verificamos presencia del ítem.
            const existingItem = wishlist.items.find(i => i.productId === productId);
            
            if (existingItem) {
                // RN - Deslistar: Si ya estaba, se interpreta como deseo de remoción. (MVC)
                await prisma.wishlistItem.delete({ where: { id: existingItem.id } });
                logger.info(`Remoción de favorito: ${userId} -> ${productId}`);
            } else {
                // RN - Listar: Alta de nuevo ítem en la colección persistida.
                await prisma.wishlistItem.create({ data: { wishlistId: wishlist.id, productId } });
                logger.info(`Adición a favorito: ${userId} -> ${productId}`);
            }
        }

        return true;
    }
}

module.exports = new WishlistService();
