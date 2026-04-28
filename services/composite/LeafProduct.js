/**
 * Patrón GoF: Composite — Hoja (LeafProduct)
 * --------------------------------------------------------------------------
 * Representa un producto individual sin hijos. Es el elemento atómico
 * de la composición.
 *
 * GoF §Composite — Participant: Leaf
 *   "Represents leaf objects in the composition. A leaf has no children.
 *    Defines behavior for primitive objects in the composition."
 */

const ProductComponent = require('./ProductComponent');

class LeafProduct extends ProductComponent {
    /**
     * @param {string} id
     * @param {string} name
     * @param {number} basePrice
     */
    constructor(id, name, basePrice) {
        super(id, name);
        this.basePrice = basePrice;
    }

    /**
     * El precio de la hoja es simplemente su precio base.
     * @returns {number}
     */
    getPrice() {
        return this.basePrice;
    }

    /**
     * Una hoja solo se contiene a sí misma.
     * @returns {Array}
     */
    getContents() {
        return [this];
    }
}

module.exports = LeafProduct;
