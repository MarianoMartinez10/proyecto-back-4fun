const prisma = require('./lib/prisma');

async function main() {
    console.log("Modelos disponibles en Prisma:");
    console.log(Object.keys(prisma).filter(k => !k.startsWith('_')));
}

main().finally(() => process.exit());
