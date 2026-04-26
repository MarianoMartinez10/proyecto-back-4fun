const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');

async function main() {
    console.log("Iniciando llenado de la base de datos (Seeding)...");

    const salt = await bcrypt.genSalt(10);
    const password = await bcrypt.hash('123456', salt);

    // 1. Crear Administrador
    const admin = await prisma.user.create({
        data: {
            name: 'Administrador TFI',
            email: 'admin@4fun.com',
            password: password,
            role: 'admin',
            isVerified: true
        }
    });
    console.log("✅ Admin creado: admin@4fun.com / 123456");

    // 2. Crear Vendedor
    const seller = await prisma.user.create({
        data: {
            name: 'Vendedor Pro',
            email: 'vendedor@4fun.com',
            password: password,
            role: 'seller',
            isVerified: true,
            sellerProfile: {
                create: {
                    storeName: 'Gaming Store VIP',
                    storeDescription: 'La mejor tienda de juegos',
                    isApproved: true
                }
            }
        }
    });
    console.log("✅ Vendedor creado: vendedor@4fun.com / 123456");

    // 3. Crear Producto Base (Catálogo Maestro)
    const platform = await prisma.platform.create({ data: { nombre: 'PC', slug: 'pc', imageId: 'pc' } });
    const genre = await prisma.genre.create({ data: { nombre: 'Acción', slug: 'accion', imageId: 'accion' } });

    const game = await prisma.product.create({
        data: {
            nombre: 'Elden Ring',
            descripcion: 'Un mundo abierto increíble creado por Hidetaka Miyazaki y George R.R. Martin.',
            tipo: 'Digital',
            platformId: platform.id,
            genreId: genre.id,
            precio: 50.00,
            stock: 0,
            fechaLanzamiento: new Date('2022-02-25'),
            desarrollador: 'FromSoftware',
            imagenUrl: 'https://placehold.co/600x800/222/FFF?text=Elden+Ring'
        }
    });
    console.log("✅ Producto Base creado: Elden Ring");

    // 4. Crear Oferta para el Vendedor
    const offer = await prisma.productOffer.create({
        data: {
            productId: game.id,
            sellerId: seller.id,
            precio: 45.00,
            stock: 10,
            activo: true
        }
    });
    console.log("✅ Oferta creada: Elden Ring por $45.00 (Vendedor Pro)");

    // 5. Actualizar el caché del producto
    await prisma.product.update({
        where: { id: game.id },
        data: { stock: 10 }
    });

    console.log("🎉 Seeding finalizado con éxito.");
}

main()
  .catch(e => {
    console.error("Error al hacer seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
