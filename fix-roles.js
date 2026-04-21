const prisma = require('./lib/prisma');

async function main() {
    try {
        const users = await prisma.$queryRaw`SELECT id, role::text FROM "User"`;
        console.log("Users in DB:", users);

        const res = await prisma.$executeRaw`UPDATE "User" SET role = 'user'::"Role" WHERE role::text = 'buyer'`;
        console.log(`Updated ${res} rows successfully.`);
    } catch (e) {
        console.error("Error executing query:", e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
