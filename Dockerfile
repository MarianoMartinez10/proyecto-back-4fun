# 1. Usamos una imagen liviana de Node.js (versión 18 o 20)
FROM node:18-slim

# 2. Creamos el directorio de trabajo dentro del contenedor
WORKDIR /app

# 3. Copiamos los archivos de dependencias primero (para optimizar el cache)
COPY package*.json ./

# 4. Instalamos solo las dependencias de producción (más rápido y ligero)
RUN npm install --omit=dev

# 5. Copiamos el resto del código del proyecto
COPY . .

# 6. Exponemos el puerto que usa tu backend (generalmente el de process.env.PORT)
EXPOSE 5000

# 7. Comando para arrancar la app
CMD ["npm", "start"]
