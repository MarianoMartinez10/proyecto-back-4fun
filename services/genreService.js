/**
 * Capa de Servicios: Taxonomías (Géneros)
 * --------------------------------------------------------------------------
 * Especializa la clase abstracta MetadataService para lidiar únicamente con 
 * la tabla de Géneros, logrando una altísima Mantenibilidad (Código DRY).
 */

const MetadataService = require('./metadataService');

class GenreService extends MetadataService {
    /**
     * RN Arquitectura (Herencia de Dominio): Inyecta los parámetros vitales al super(),
     * resolviendo la capa de mensajería ('género no encontrado') dinámicamente.
     */
    constructor() {
        super('genre', {
            singular: 'género',
            plural: 'géneros',
            notFoundMsg: 'Género no encontrado',
            productField: 'genreId',
        });
    }

    // Aliases semánticos puenteados estrictamente para legibilidad del Controlador
    async getGenres() { return this.getAll(); }
    async getGenreById(id) { return this.getById(id); }
    async createGenre(data) { return this.create(data); }
    async updateGenre(id, data) { return this.update(id, data); }
    async deleteGenre(id) { return this.deleteOne(id); }
    async deleteGenres(ids) { return this.deleteMany(ids); }
}

module.exports = new GenreService();
