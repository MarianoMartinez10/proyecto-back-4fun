const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL.replace(':5432/', ':6543/').replace('?pgbouncer=true', '') + '?pgbouncer=true',
});

async function main() {
  await client.connect();
  
  try {
    const res = await client.query(`TRUNCATE "ShippingAddress"`);
    console.log(`Truncated ShippingAddress table.`);
  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    await client.end();
  }
}

main();
