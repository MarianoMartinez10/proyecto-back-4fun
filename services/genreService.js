const MetadataService = require('./metadataService');

class GenreService extends MetadataService {
    constructor() {
        super('genre', {
            singular: 'género',
            plural: 'géneros',
            notFoundMsg: 'Género no encontrado',
            productField: 'genreId',
        });
    }

    // Aliases mapped explicitly for controller clarity, or controller can just call standard methods.
    async getGenres() { return this.getAll(); }
    async getGenreById(id) { return this.getById(id); }
    async createGenre(data) { return this.create(data); }
    async updateGenre(id, data) { return this.update(id, data); }
    async deleteGenre(id) { return this.deleteOne(id); }
    async deleteGenres(ids) { return this.deleteMany(ids); }
}

module.exports = new GenreService();
