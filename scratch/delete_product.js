const prisma = require('../lib/prisma');

async function main() {
  console.log("Buscando 'Far Cry 5' para eliminación...");
  
  const product = await prisma.product.findFirst({
    where: { nombre: { contains: 'Far Cry 5', mode: 'insensitive' } },
    include: { _count: { select: { orderItems: true } } }
  });

  if (!product) {
    console.log("❌ No se encontró el producto 'Far Cry 5' en la base de datos.");
    return;
  }

  console.log(`✅ Encontrado: ${product.nombre} (ID: ${product.id})`);
  console.log(`📊 Órdenes asociadas: ${product._count.orderItems}`);

  if (product._count.orderItems > 0) {
    console.log("⚠️ El producto tiene órdenes asociadas. Procediendo a DESACTIVAR (Soft Delete) para mantener integridad.");
    await prisma.product.update({
      where: { id: product.id },
      data: { activo: false }
    });
    console.log("✔️ Producto desactivado correctamente.");
  } else {
    console.log("🗑️ El producto no tiene órdenes. Procediendo a ELIMINACIÓN FÍSICA.");
    await prisma.product.delete({
      where: { id: product.id }
    });
    console.log("✔️ Producto eliminado físicamente de la base de datos.");
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
