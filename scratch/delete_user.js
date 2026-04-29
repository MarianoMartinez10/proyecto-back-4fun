const prisma = require('../lib/prisma');

const email = 'emartinez.03@hotmail.com';

async function main() {
    console.log(`Buscando usuario: ${email}`);
    const user = await prisma.user.findUnique({
        where: { email },
        include: {
            _count: {
                select: {
                    products: true,
                    orders: true,
                    reviews: true,
                    helpfulVotes: true,
                    sellerTransactions: true
                }
            }
        }
    });

    if (!user) {
        console.log('Usuario no encontrado.');
        return;
    }

    console.log('Usuario encontrado:', {
        id: user.id,
        name: user.name,
        email: user.email,
        counts: user._count
    });

    // Si tiene productos u órdenes, no lo borramos sin preguntar (integridad)
    if (user._count.products > 0 || user._count.orders > 0) {
        console.error('ERROR: El usuario tiene productos u órdenes asociadas. No se puede eliminar automáticamente por seguridad.');
        process.exit(1);
    }

    console.log('Eliminando usuario...');
    
    // El borrado en cascada debería encargarse de sellerProfile, cart, wishlist, sellerTransactions.
    // Pero reviews y helpfulVotes no tienen cascade en el schema (aparentemente).
    
    await prisma.reviewHelpfulVote.deleteMany({ where: { userId: user.id } });
    await prisma.review.deleteMany({ where: { userId: user.id } });

    await prisma.user.delete({
        where: { id: user.id }
    });

    console.log('✅ Usuario eliminado exitosamente.');
}

main()
    .catch((e) => {
        console.error('❌ Error:', e.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
