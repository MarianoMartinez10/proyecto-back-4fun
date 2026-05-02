import { PrismaClient, Role, ProductType, PaymentMethod, OrderStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🧹 Limpiando la base de datos...');
  await prisma.bundleItem.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.sellerProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.platform.deleteMany();
  await prisma.genre.deleteMany();

  const saltRounds = 10;

  console.log('👤 Creando usuarios (Admin y Buyer)...');
  const hashedAdminPassword = await bcrypt.hash('admin123', saltRounds);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@4fun.com',
      password: hashedAdminPassword,
      name: 'Admin Principal',
      role: Role.ADMIN,
      sellerProfile: {
        create: {
          storeName: 'Tienda Oficial 4Fun',
          isApproved: true,
        }
      }
    },
  });

  const hashedBuyerPassword = await bcrypt.hash('buyer123', saltRounds);
  const buyer = await prisma.user.create({
    data: {
      email: 'buyer@4fun.com',
      password: hashedBuyerPassword,
      name: 'Juan Pérez (Comprador)',
      role: Role.BUYER,
    },
  });

  console.log('🎮 Creando referencias (Platform y Genre)...');
  const platform = await prisma.platform.create({ data: { name: 'PC', slug: 'pc' } });
  const genre = await prisma.genre.create({ data: { name: 'RPG', slug: 'rpg' } });

  console.log('📦 Creando Productos y Bundles (Patrón Composite)...');
  const gameA = await prisma.product.create({
    data: {
      name: 'Elden Ring',
      description: 'Acción y RPG en mundo abierto',
      price: 60000,
      sellerId: admin.id,
      isBundle: false,
      type: ProductType.DIGITAL,
      releaseDate: new Date('2022-02-25'),
      platformId: platform.id,
      genreId: genre.id,
      developer: 'FromSoftware',
      stock: 100,
    },
  });

  const gameB = await prisma.product.create({
    data: {
      name: 'The Witcher 3',
      description: 'RPG clásico',
      price: 30000,
      sellerId: admin.id,
      isBundle: false,
      type: ProductType.DIGITAL,
      releaseDate: new Date('2015-05-19'),
      platformId: platform.id,
      genreId: genre.id,
      developer: 'CD Projekt Red',
      stock: 50,
    },
  });

  const bundle = await prisma.product.create({
    data: {
      name: 'RPG Ultimate Bundle',
      description: 'Los mejores RPG en un solo paquete',
      price: 80000, // Strategy: Precio con descuento respecto a la suma
      sellerId: admin.id,
      isBundle: true,
      type: ProductType.DIGITAL,
      releaseDate: new Date(),
      platformId: platform.id,
      genreId: genre.id,
      developer: 'Múltiples',
      bundleChildren: {
        create: [
          { productId: gameA.id },
          { productId: gameB.id }
        ]
      }
    },
  });

  console.log('🛒 Creando Órdenes (Patrón Strategy)...');
  const order = await prisma.order.create({
    data: {
      userId: buyer.id,
      totalPrice: gameA.price,
      shippingPrice: 0,
      status: OrderStatus.PROCESSING,
      isPaid: true,
      paymentMethod: PaymentMethod.MERCADOPAGO,
      orderItems: {
        create: [
          {
            productId: gameA.id,
            quantity: 1,
            unitPriceAtPurchase: gameA.price, // Strategy: Snapshot Inmutable
          }
        ]
      }
    }
  });

  console.log('✅ Base de datos poblada con éxito. (3NF, Composite y Strategy validados).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });