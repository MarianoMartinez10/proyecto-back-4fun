const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');

class DatabaseSeeder {
    constructor(prismaClient) {
        this.prisma = prismaClient;
    }

    async cleanDatabase() {
        console.log("Limpiando la base de datos...");
        await this.prisma.digitalKey.deleteMany();
        await this.prisma.cartItem.deleteMany();
        await this.prisma.orderItem.deleteMany();
        await this.prisma.productOffer.deleteMany();
        await this.prisma.product.deleteMany();
        await this.prisma.sellerProfile.deleteMany();
        await this.prisma.user.deleteMany();
        await this.prisma.platform.deleteMany();
        await this.prisma.genre.deleteMany();
    }

    async createAdmin(password) {
        const admin = await this.prisma.user.create({
            data: {
                name: 'Administrador TFI',
                email: 'admin@4fun.com',
                password: password,
                role: 'admin',
                isVerified: true
            }
        });
        console.log("✅ Admin creado: admin@4fun.com / 123456");
        return admin;
    }

    async createSeller(password) {
        const seller = await this.prisma.user.create({
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
        return seller;
    }

    async createCatalog() {
        const platform = await this.prisma.platform.create({ data: { nombre: 'PC', slug: 'pc', imageId: 'pc' } });
        const genre = await this.prisma.genre.create({ data: { nombre: 'Acción', slug: 'accion', imageId: 'accion' } });

        const game = await this.prisma.product.create({
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
        return game;
    }

    async createOffer(game, seller) {
        const offer = await this.prisma.productOffer.create({
            data: {
                productId: game.id,
                sellerId: seller.id,
                precio: 45.00,
                stock: 10,
                activo: true
            }
        });
        console.log("✅ Oferta creada: Elden Ring por $45.00 (Vendedor Pro)");
        
        // Actualizar el caché del producto
        await this.prisma.product.update({
            where: { id: game.id },
            data: { stock: 10 }
        });
        
        return offer;
    }

    async run() {
        try {
            console.log("Iniciando llenado de la base de datos (Seeding) con POO...");
            await this.cleanDatabase();

            const salt = await bcrypt.genSalt(10);
            const password = await bcrypt.hash('123456', salt);

            await this.createAdmin(password);
            const seller = await this.createSeller(password);
            const game = await this.createCatalog();
            await this.createOffer(game, seller);

            console.log("🎉 Seeding finalizado con éxito.");
        } catch (e) {
            console.error("Error al hacer seeding:", e);
            process.exit(1);
        } finally {
            await this.prisma.$disconnect();
        }
    }
}

// Inicialización y Ejecución
const seeder = new DatabaseSeeder(prisma);
seeder.run();
