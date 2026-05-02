/**
 * Patrón GoF: Composite — Factory
 * --------------------------------------------------------------------------
 * Convierte un producto crudo de la Base de Datos en un ProductComponent
 * (LeafProduct o ProductBundle), construyendo el árbol recursivamente si
 * es necesario.
 */

const LeafProduct = require('./LeafProduct');
const ProductBundle = require('./ProductBundle');

const logger = require('../../utils/logger');

class ProductComponentFactory {
    /**
     * @param {object} p - Entidad de producto de Prisma
     * @returns {import('./ProductComponent')}
     */
    static create(p) {
        try {
            if (!p) throw new Error("Entidad de producto nula o indefinida.");

            // En una implementación completa con base de datos, los combos
            // tendrían un flag o tipo especial (ej. p.tipo === 'Bundle')
            // y una relación de hijos. Simulamos esa lógica aquí para
            // mantener el polimorfismo intacto en OrderService.
            
            if (p.isBundle && p.bundleChildren) {
                const bundle = new ProductBundle(p.id, p.nombre);
                for (const child of p.bundleChildren) {
                    // Recursión para soportar "combos dentro de combos"
                    bundle.add(ProductComponentFactory.create(child.childProduct));
                }
                return bundle;
            }

            // Caso base: Producto individual (Hoja)
            // RN (Robustez): Aseguramos que el precio sea un número válido.
            const price = p.precio ? Number(p.precio) : 0;
            if (isNaN(price)) {
                logger.warn(`[ProductComponentFactory] Precio inválido para producto ${p.id}. Usando 0.`);
            }

            return new LeafProduct(p.id, p.nombre, isNaN(price) ? 0 : price);
        } catch (error) {
            // Manejo de Excepciones (UTN): Logueamos el error de construcción del árbol
            // pero devolvemos un objeto Hoja "vacío" o de fallback para no romper la facturación.
            logger.error(`[ProductComponentFactory] Error construyendo componente para ${p?.id || 'unknown'}:`, error.message);
            return new LeafProduct(p?.id || 'error', p?.nombre || 'Error de Carga', 0);
        }
    }
}

module.exports = ProductComponentFactory;
