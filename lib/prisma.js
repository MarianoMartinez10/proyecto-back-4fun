require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    throw new Error('❌ ERROR CRÍTICO: La variable de entorno DATABASE_URL no está definida. Configurá la conexión a Supabase en Vercel/Render.');
}

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});
const adapter = new PrismaPg(pool);

let prisma;

if (!global.__prisma) {
    global.__prisma = new PrismaClient({ adapter });
}

prisma = global.__prisma;

module.exports = prisma;
