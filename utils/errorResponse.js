class ErrorResponse extends Error {
    constructor(message, statusCode, name = 'Error de Validación') {
        super(message);
        this.statusCode = statusCode;
        this.name = name;
    }
}

module.exports = ErrorResponse;
