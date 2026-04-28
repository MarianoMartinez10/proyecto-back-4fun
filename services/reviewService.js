const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');

/**
 * Capa de Servicios: Gestión de Reseñas y Feedback
 * --------------------------------------------------------------------------
 * Gestiona el ciclo de vida de las opiniones de usuarios,
 * sus métricas de reputación y el ranking social de utilidad. (MVC / Dominio)
 */

class ReviewService {

    /**
     * Verifica si un usuario posee la licencia del producto antes de permitir reseñar.
     * RN - Verificación de Compra: Solo usuarios con órdenes pagadas pueden marcarse como "Compra Verificada".
     */
    async isVerifiedPurchase(userId, productId) {
        const order = await prisma.order.findFirst({
            where: { userId, isPaid: true, orderItems: { some: { productId } } }
        });
        return !!order;
    }

    /**
     * Persiste una nueva reseña en el sistema.
     * 
     * @param {string} userId - ID del autor.
     * @param {string} productId - ID del bien.
     * @param {Object} data - { rating, title, text }.
     * @returns {Object} Reseña transformada a DTO.
     */
    async createReview(userId, productId, { rating, title, text }) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new ErrorResponse('Producto no encontrado', 404);

        // RN - Unicidad: Impedir que un usuario sature de spam un mismo producto.
        const existing = await prisma.review.findFirst({ where: { userId, productId } });
        if (existing) throw new ErrorResponse('Ya has calificado este artículo', 400);

        const verified = await this.isVerifiedPurchase(userId, productId);

        const review = await prisma.review.create({
            data: {
                userId,
                productId,
                rating,
                title: title || '',
                text,
                verified
            },
            include: { user: { select: { id: true, name: true, avatar: true } } }
        });

        // RN - Recalibración: La calificación ahora se calcula al vuelo al consultar productos.
        
        return this.transformReview(review);
    }

    /**
     * Obtiene el feed de opiniones con ordenamiento inteligente.
     */
    async getProductReviews(productId, { page = 1, limit = 10, sort = 'helpful' } = {}) {
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

        const sortMap = {
            helpful: { helpfulCount: 'desc' },
            highest: { rating: 'desc' },
            lowest: { rating: 'asc' },
            recent: { createdAt: 'desc' }
        };
        const orderBy = sortMap[sort] || { helpfulCount: 'desc' };

        const [reviews, total] = await Promise.all([
            prisma.review.findMany({
                where: { productId },
                orderBy,
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                include: { user: { select: { id: true, name: true, avatar: true } } }
            }),
            prisma.review.count({ where: { productId } })
        ]);

        return {
            reviews: reviews.map(r => this.transformReview(r)),
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
        };
    }

    /**
     * Calcula histogramas de satisfacción.
     * @returns {Object} { averageRating, distribution }.
     */
    async getProductRatingStats(productId) {
        const reviews = await prisma.review.findMany({ where: { productId }, select: { rating: true } });

        if (!reviews.length) {
            return { averageRating: 0, totalReviews: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
        }

        const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let sum = 0;

        for (const r of reviews) {
            sum += r.rating;
            if (dist[r.rating] !== undefined) dist[r.rating]++;
        }

        return {
            averageRating: Math.round((sum / reviews.length) * 10) / 10,
            totalReviews: reviews.length,
            distribution: dist
        };
    }

    /**
     * Gestión de votos de utilidad.
     * RN - Autoría: Prohíbe el auto-upvote por integridad de ranking.
     */
    async voteHelpful(reviewId, userId) {
        const review = await prisma.review.findUnique({
            where: { id: reviewId },
            include: { helpfulVotes: true }
        });
        if (!review) throw new ErrorResponse('Reseña no encontrada', 404);
        
        if (review.userId === userId) throw new ErrorResponse('Infracción: No puedes votar tu propio contenido', 400);

        const alreadyVoted = review.helpfulVotes.some(v => v.userId === userId);

        if (alreadyVoted) {
            await prisma.reviewHelpfulVote.deleteMany({ where: { reviewId, userId } });
        } else {
            await prisma.reviewHelpfulVote.create({ data: { reviewId, userId } });
        }
        
        // RN - Contador Sincrónico: Recalcula en BDD el total de utilidad para indexación.
        const count = await prisma.reviewHelpfulVote.count({ where: { reviewId } });
        const updated = await prisma.review.update({ where: { id: reviewId }, data: { helpfulCount: count } });

        return { helpfulCount: updated.helpfulCount, voted: !alreadyVoted };
    }

    /**
     * Eliminación de reseñas con validación de facultades.
     */
    async deleteReview(reviewId, userId, isAdmin = false) {
        const review = await prisma.review.findUnique({ where: { id: reviewId } });
        if (!review) throw new ErrorResponse('Reseña no encontrada', 404);
        
        // RN - Seguridad: Solo el autor o un administrador con rol privilegiado pueden destruir el contenido.
        if (!isAdmin && review.userId !== userId) throw new ErrorResponse('Autorización insuficiente', 403);

        const productId = review.productId;
        await prisma.review.delete({ where: { id: reviewId } });
        
        // RN - Recalibración: La calificación se calcula en runtime.
        
        return { message: 'Contenido eliminado exitosamente' };
    }



    /**
     * Mapeador DTO para privacidad y formato.
     * @private
     */
    transformReview(review) {
        return {
            id: review.id,
            user: {
                id: review.user?.id || review.userId,
                name: review.user?.name || 'Usuario',
                avatar: review.user?.avatar || null
            },
            productId: review.productId,
            rating: review.rating,
            title: review.title,
            text: review.text,
            verified: review.verified,
            helpfulCount: review.helpfulCount || 0,
            createdAt: review.createdAt
        };
    }
}

module.exports = new ReviewService();
