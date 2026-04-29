const prisma = require('./lib/prisma');

async function main() {
    console.log("Iniciando inyección de ventas simuladas (últimos 30 días)...");

    // 1. Obtener datos base
    const users = await prisma.user.findMany({ take: 5, select: { id: true } });
    const products = await prisma.product.findMany({ take: 10, select: { id: true, price: true } });

    if (users.length === 0 || products.length === 0) {
        console.error("No hay usuarios o productos en la BD para generar órdenes.");
        return;
    }

    // 2. Generar órdenes aleatorias en los últimos 30 días
    const numOrders = 45; // Simular 45 compras
    let generated = 0;

    for (let i = 0; i < numOrders; i++) {
        const randomUser = users[Math.floor(Math.random() * users.length)];
        const randomProduct = products[Math.floor(Math.random() * products.length)];
        const qty = Math.floor(Math.random() * 3) + 1; // 1 a 3 unidades
        const totalPrice = Number(randomProduct.price) * qty;

        // Fecha aleatoria en los últimos 30 días
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 30));

        await prisma.order.create({
            data: {
                userId: randomUser.id,
                shippingPrice: 0,
                totalPrice: totalPrice,
                isPaid: true,
                paidAt: date,
                createdAt: date,
                status: "DELIVERED",
                orderItems: {
                    create: [
                        {
                            productId: randomProduct.id,
                            quantity: qty,
                            unitPriceAtPurchase: randomProduct.price
                        }
                    ]
                }
            }
        });
        
        // En 3NF no actualizamos contadores manuales redundantes.
        generated++;
    }

    console.log(`✅ Inyección completada: Se simularon ${generated} órdenes con éxito.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
