const prisma = require('../lib/prisma');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../utils/logger');

class ReviewService {

    async analyzeSentiment(text) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            logger.warn('[ReviewService] OPENAI_API_KEY no configurada, omitiendo análisis de sentimiento.');
            return null;
        }
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini', temperature: 0.1, max_tokens: 150,
                    messages: [
                        { role: 'system', content: `Eres un analizador de sentimiento para reseñas de videojuegos en español.\nResponde SOLO con un JSON válido con esta estructura exacta:\n{\n  "sentiment": "positive" | "neutral" | "negative" | "mixed",\n  "score": 0.0 a 1.0,\n  "keywords": ["palabra1", "palabra2", "palabra3"]\n}\n- score: 1.0 = muy positivo, 0.5 = neutral, 0.0 = muy negativo\n- keywords: 3 palabras clave que resuman el sentimiento (en español)\nNo incluyas texto adicional, solo el JSON.` },
                        { role: 'user', content: text }
                    ]
                })
            });
            if (!response.ok) return null;
            const data = await response.json();
            const parsed = JSON.parse(data.choices?.[0]?.message?.content?.trim());
            const valid = ['positive', 'neutral', 'negative', 'mixed'];
            if (!valid.includes(parsed.sentiment)) return null;
            return {
                sentiment: parsed.sentiment,
                sentimentScore: Math.max(0, Math.min(1, Number(parsed.score) || 0.5)),
                sentimentKeywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : []
            };
        } catch { return null; }
    }

    async isVerifiedPurchase(userId, productId) {
        const order = await prisma.order.findFirst({
            where: { userId, isPaid: true, orderItems: { some: { productId } } }
        });
        return !!order;
    }

    async createReview(userId, productId, { rating, title, text }) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new ErrorResponse('Producto no encontrado', 404);

        const existing = await prisma.review.findFirst({ where: { userId, productId } });
        if (existing) throw new ErrorResponse('Ya dejaste una reseña para este producto', 400);

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

        await this.updateProductRating(productId);
        return this.transformReview(review);
    }

    async getProductReviews(productId, { page = 1, limit = 10, sort = 'recent' } = {}) {
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

        const sortMap = {
            helpful: { helpfulCount: 'desc' },
            highest: { rating: 'desc' },
            lowest: { rating: 'asc' },
            recent: { createdAt: 'desc' }
        };
        const orderBy = sortMap[sort] || { createdAt: 'desc' };

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

    async getProductRatingStats(productId) {
        const reviews = await prisma.review.findMany({ where: { productId }, select: { rating: true, sentiment: true } });

        if (!reviews.length) {
            return { averageRating: 0, totalReviews: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, sentiment: { positive: 0, neutral: 0, negative: 0, mixed: 0 } };
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

    async voteHelpful(reviewId, userId) {
        const review = await prisma.review.findUnique({
            where: { id: reviewId },
            include: { helpfulVotes: true }
        });
        if (!review) throw new ErrorResponse('Reseña no encontrada', 404);
        if (review.userId === userId) throw new ErrorResponse('No podés votar tu propia reseña', 400);

        const alreadyVoted = review.helpfulVotes.some(v => v.userId === userId);

        if (alreadyVoted) {
            await prisma.reviewHelpfulVote.deleteMany({ where: { reviewId, userId } });
            const updated = await prisma.review.update({
                where: { id: reviewId },
                data: { helpfulCount: Math.max(0, review.helpfulCount - 1) }
            });
            return { helpfulCount: updated.helpfulCount, voted: false };
        } else {
            await prisma.reviewHelpfulVote.create({ data: { reviewId, userId } });
            const updated = await prisma.review.update({
                where: { id: reviewId },
                data: { helpfulCount: review.helpfulCount + 1 }
            });
            return { helpfulCount: updated.helpfulCount, voted: true };
        }
    }

    async deleteReview(reviewId, userId, isAdmin = false) {
        const review = await prisma.review.findUnique({ where: { id: reviewId } });
        if (!review) throw new ErrorResponse('Reseña no encontrada', 404);
        if (!isAdmin && review.userId !== userId) throw new ErrorResponse('No tenés permiso para eliminar esta reseña', 403);

        const productId = review.productId;
        await prisma.review.delete({ where: { id: reviewId } });
        await this.updateProductRating(productId);
        return { message: 'Reseña eliminada correctamente' };
    }

    async updateProductRating(productId) {
        const reviews = await prisma.review.findMany({ where: { productId }, select: { rating: true } });
        const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
        await prisma.product.update({
            where: { id: productId },
            data: { calificacion: Math.round(avg * 10) / 10 }
        });
    }

    transformReview(review) {
        return {
            id: review.id,
            _id: review.id,
            user: {
                id: review.user?.id || review.userId,
                _id: review.user?.id || review.userId,
                name: review.user?.name || 'Usuario',
                avatar: review.user?.avatar || null
            },
            productId: review.productId,
            rating: review.rating,
            title: review.title || '',
            text: review.text,
            sentiment: review.sentiment || null,
            sentimentScore: review.sentimentScore ?? null,
            sentimentKeywords: (review.keywords || []).map(k => k.keyword),
            verified: review.verified,
            helpfulCount: review.helpfulCount || 0,
            createdAt: review.createdAt
        };
    }
}

module.exports = new ReviewService();
