const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

/**
 * Capa de Servicios: Gestión de Reseñas y Feedback (AI Enhanced)
 * --------------------------------------------------------------------------
 * Gestiona el ciclo de vida de las opiniones de usuarios. Integra un motor
 * de Inteligencia Artificial (OpenAI) para el etiquetado automático de
 * sentimiento y keywords. (MVC / Dominio)
 */

class ReviewService {

    /**
     * Motor de Clasificación de Sentimiento (NLP).
     * RN - Inteligencia Artificial: Automatiza la auditoría de contenido 
     * clasificando el tono de la reseña para mejorar el filtrado en el frontend.
     * 
     * @param {string} text - Contenido de la reseña.
     * @returns {Object|null} Análisis con sentimiento, score y palabras clave.
     */
    async analyzeSentiment(text) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            logger.warn('[ReviewService] OPENAI_API_KEY ausente, omitiendo análisis IA.');
            return null;
        }
        try {
            // Manejo de Excepciones Externas: Invocación asíncrona a API de Terceros (LLM)
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini', temperature: 0.1, max_tokens: 150,
                    messages: [
                        { role: 'system', content: `Eres un analizador de sentimiento para reseñas de videojuegos en español.\nResponde SOLO con JSON.` },
                        { role: 'user', content: text }
                    ]
                })
            });
            if (!response.ok) return null;
            const data = await response.json();
            const parsed = JSON.parse(data.choices?.[0]?.message?.content?.trim());
            
            return {
                sentiment: parsed.sentiment,
                sentimentScore: Math.max(0, Math.min(1, Number(parsed.score) || 0.5)),
                sentimentKeywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : []
            };
        } catch (err) {
            // Tolerancia a fallos: Si la IA falla, la reseña se guarda sin metadatos analíticos 
            // para no bloquear la experiencia de usuario.
            return null; 
        }
    }

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
        const sentimentResult = await this.analyzeSentiment(text);

        const review = await prisma.review.create({
            data: {
                userId,
                productId,
                rating,
                title: title || '',
                text,
                verified,
                ...(sentimentResult && {
                    sentiment: sentimentResult.sentiment,
                    sentimentScore: sentimentResult.sentimentScore,
                    keywords: {
                        create: sentimentResult.sentimentKeywords.map(k => ({ keyword: k }))
                    }
                })
            },
            include: { user: { select: { id: true, name: true, avatar: true } } }
        });

        // RN - Recalibración: Actualiza el promedio de estrellas global del producto raíz.
        await this.updateProductRating(productId);
        
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
                include: { user: { select: { id: true, name: true, avatar: true } }, keywords: true }
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
     * @returns {Object} { averageRating, distribution, sentimentStats }.
     */
    async getProductRatingStats(productId) {
        const reviews = await prisma.review.findMany({ where: { productId }, select: { rating: true, sentiment: true } });

        if (!reviews.length) {
            return { averageRating: 0, totalReviews: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
        }

        const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        const sent = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
        let sum = 0;

        for (const r of reviews) {
            sum += r.rating;
            if (dist[r.rating] !== undefined) dist[r.rating]++;
            if (r.sentiment && sent[r.sentiment] !== undefined) sent[r.sentiment]++;
        }

        return {
            averageRating: Math.round((sum / reviews.length) * 10) / 10,
            totalReviews: reviews.length,
            distribution: dist,
            sentiment: sent
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
        
        // Fuerza re-cálculo de calificacion media del producto tras la baja.
        await this.updateProductRating(productId);
        
        return { message: 'Contenido eliminado exitosamente' };
    }

    /**
     * Agregador matemático del rating total.
     * Mantenibilidad: Centraliza el recuento para asegurar consistencia en el catálogo.
     */
    async updateProductRating(productId) {
        const reviews = await prisma.review.findMany({ where: { productId }, select: { rating: true } });
        const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
        await prisma.product.update({
            where: { id: productId },
            data: { calificacion: Math.round(avg * 10) / 10 }
        });
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
            sentiment: review.sentiment,
            sentimentScore: review.sentimentScore,
            sentimentKeywords: (review.keywords || []).map(k => k.keyword),
            verified: review.verified,
            helpfulCount: review.helpfulCount || 0,
            createdAt: review.createdAt
        };
    }
}

module.exports = new ReviewService();
