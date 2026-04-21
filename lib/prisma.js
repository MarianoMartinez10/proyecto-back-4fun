require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    throw new Error('❌ ERROR CRÍTICO: La variable de entorno DATABASE_URL no está definida. Configurá la conexión a Supabase en Vercel/Render.');
}

// Convert session connection string to transaction mode connection string to prevent max clients error.
const transactionDbUrl = process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(':5432/', ':6543/').replace('?pgbouncer=true', '') + '?pgbouncer=true'
    : '';

const pool = new Pool({ 
    connectionString: transactionDbUrl,
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
