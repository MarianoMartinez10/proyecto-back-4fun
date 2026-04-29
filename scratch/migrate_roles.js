const prisma = require('../lib/prisma');

async function main() {
  console.log('--- Iniciando Migración de Roles 3FN ---');
  
  try {
    // 1. Verificar roles crudos vía queryRaw para evitar el mapeo de tipos de Prisma
    const rolesRows = await prisma.$queryRaw`SELECT DISTINCT role::text as role_str FROM "User"`;
    console.log('Roles encontrados en DB:', rolesRows);

    // 2. Migrar de forma segura forzando el cast al nuevo Enum
    const result = await prisma.$executeRaw`
      UPDATE "User" 
      SET role = 'BUYER'::"Role" 
      WHERE role::text = 'user' OR role::text = 'USER' OR role::text = 'buyer'
    `;
    
    console.log(`Migración completada. Usuarios actualizados: ${result}`);
    
  } catch (error) {
    console.error('Fallo en la migración:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
