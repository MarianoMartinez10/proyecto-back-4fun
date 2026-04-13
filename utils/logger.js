const winston = require('winston');
const path = require('path');

// Definimos el formato de los logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Opciones comunes para rotación de archivos
const fileOptions = {
  maxsize: 5 * 1024 * 1024, // 5MB por archivo
  maxFiles: 5,               // Mantener 5 archivos rotados
  tailable: true,
};

// Configuramos los transports condicionalmente
const transports = [];

// En la nube (Vercel, Render, etc.) casi siempre dependemos del Console 
// porque los logs del filesystem no persisten o están bloqueados.
transports.push(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  )
}));

// Deshabilitar la escritura en disco (desarrollo local) si estamos en Vercel o en producción
// En producción o en Vercel (read-only filesystem), dependemos de loggers de consola.
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
if (process.env.NODE_ENV !== 'production' && !isVercel) {
  try {
    transports.push(
      new winston.transports.File({
        filename: path.join(__dirname, '../logs/error.log'),
        level: 'error',
        ...fileOptions
      })
    );
    transports.push(
      new winston.transports.File({
        filename: path.join(__dirname, '../logs/combined.log'),
        ...fileOptions
      })
    );
  } catch (error) {
    console.warn("No se pudieron inicializar los logs de archivo:", error);
  }
}

const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: '4fun-backend' },
  transports: transports
});

module.exports = logger;
