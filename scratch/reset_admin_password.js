const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  const email = 'admin@4funstore.com';
  const newPassword = 'admin123';

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const updatedUser = await prisma.user.update({
      where: { email },
      data: { password: hashedPassword }
    });

    console.log(`✅ Contraseña de ${email} reseteada exitosamente.`);
    console.log(`🔑 Nueva contraseña: ${newPassword}`);
  } catch (error) {
    if (error.code === 'P2025') {
      console.error(`❌ Error: No se encontró el usuario con email ${email}`);
    } else {
      console.error('❌ Error al resetear la contraseña:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
