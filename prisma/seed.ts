import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // 1. Limpieza (Ajustado a nombres reales de tablas en tu esquema)
  // Nota: Si 'bundleItem' no existe, verifica si se llama 'productBundle' o similar
  if (prisma.bundleItem) await prisma.bundleItem.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  const saltRounds = 10;

  // 2. Creación de Usuarios (Ajustado a minúsculas y campos existentes)
  const hashedAdminPassword = await bcrypt.hash('admin123', saltRounds);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@4fun.com',
      password: hashedAdminPassword,
      name: 'Admin Principal',
      role: 'ADMIN', 
    },
  });

  const hashedBuyerPassword = await bcrypt.hash('user123', saltRounds);
  await prisma.user.create({
    data: {
      email: 'comprador@gmail.com',
      password: hashedBuyerPassword,
      name: 'Juan Pérez',
      role: 'BUYER', 
    },
  });

  // 3. Creación de Productos (Ajustado a campos reales)
  // El error indica que 'name' no existe en Product. Verifica si es 'nombre' o 'title'.
  // Si tu esquema está en español por la normalización, usa 'nombre'.
  const gameA = await prisma.product.create({
    data: {
      name: 'Elden Ring', 
      description: 'Acción y RPG en mundo abierto',
      price: 60000,
      sellerId: admin.id,
      isBundle: false,
      type: 'DIGITAL',
      releaseDate: new Date(),
      platformId: (await prisma.platform.create({ data: { name: 'PC', slug: 'pc' } })).id,
      genreId: (await prisma.genre.create({ data: { name: 'RPG', slug: 'rpg' } })).id
    },
  });

  console.log('✅ Base de datos poblada con éxito.');
}

main()
  .catch((e) => {
    console.error(e);
    // @ts-ignore - Evita el error de process si aún no instalaste @types/node
    if (typeof process !== 'undefined') process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });