const prisma = require('../lib/prisma');

async function main() {
  console.log('🚀 Iniciando migración de roles: user -> buyer...');
  
  try {
    const result = await prisma.user.updateMany({
      where: { role: 'user' },
      data: { role: 'buyer' }
    });

    console.log(`✅ Migración completada. ${result.count} usuarios actualizados.`);
  } catch (error) {
    console.error('❌ Error Prisma:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ Error durante la migración:', e);
    process.exit(1);
  })
  .finally(async () => {
    // Nota: El adaptador mantiene el pool, desconectamos si es necesario.
    await prisma.$disconnect();
  });
