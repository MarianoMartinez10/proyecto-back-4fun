/**
 * Patrón GoF: Composite — Componente Base (ProductComponent)
 * --------------------------------------------------------------------------
 * Define la interfaz común para todos los objetos en la composición, tanto
 * nodos hoja (productos individuales) como nodos compuestos (combos/bundles).
 *
 * GoF §Composite — Participant: Component
 *   "Declares the interface for objects in the composition."
 *
 * Justificación GoF: "Composite lets clients treat individual objects and
 * compositions of objects uniformly".
 * → OrderService tratará tanto a un 'LeafProduct' como a un 'ProductBundle'
 *   exclusivamente a través de esta interfaz.
 */

class ProductComponent {
    /**
     * @param {string} id
     * @param {string} name
     */
    constructor(id, name) {
        if (new.target === ProductComponent) {
            throw new Error("ProductComponent es una interfaz abstracta y no puede instanciarse directamente.");
        }
        this.id = id;
        this.name = name;
    }

    /**
     * Devuelve el precio del componente.
     * @returns {number}
     * @abstract
     */
    getPrice() {
        throw new Error("El método getPrice() debe ser implementado.");
    }

    /**
     * Devuelve el nombre del componente.
     * @returns {string}
     */
    getName() {
        return this.name;
    }

    /**
     * Devuelve el contenido del componente.
     * @returns {Array}
     * @abstract
     */
    getContents() {
        throw new Error("El método getContents() debe ser implementado.");
    }

    // ── Métodos opcionales de gestión de hijos (GoF) ──
    add(component) {
        throw new Error("Operación no soportada.");
    }

    remove(component) {
        throw new Error("Operación no soportada.");
    }
}

module.exports = ProductComponent;
