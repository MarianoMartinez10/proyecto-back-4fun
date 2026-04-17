const prisma = require('../lib/prisma');

async function main() {
  try {
    const admins = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'admin' },
          { name: { contains: 'admin', mode: 'insensitive' } },
          { email: { contains: 'admin', mode: 'insensitive' } }
        ]
      },
      select: {
          id: true,
          email: true,
          name: true,
          role: true,
          // Note: password is not selected for security and because it's hashed anyway
      }
    });
    console.log('--- ADMIN USERS FOUND ---');
    console.log(JSON.stringify(admins, null, 2));
  } catch (error) {
    console.error('Error fetching admin users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
