const { Pool } = require('pg');

// Determine if we need SSL (for cloud databases like Neon)
const isCloudDatabase = process.env.PG_HOST && !process.env.PG_HOST.includes('localhost') && !process.env.PG_HOST.includes('127.0.0.1');

const pool = new Pool({
  host:     process.env.PGHOST     || process.env.PG_HOST     || '127.0.0.1',
  port:     process.env.PGPORT     || process.env.PG_PORT     || 5432,
  database: process.env.PGDATABASE || process.env.PG_DATABASE || 'neopay',
  user:     process.env.PGUSER     || process.env.PG_USER     || 'postgres',
  password: process.env.PGPASSWORD || process.env.PG_PASSWORD || '',
  ssl: isCloudDatabase ? {
    rejectUnauthorized: false
  } : false
});

// Create tables if they don't exist
async function initDB() {
  try {
    console.log('🔌 Connecting to database...');
    console.log(`   Host: ${process.env.PG_HOST || 'localhost'}`);
    console.log(`   Database: ${process.env.PG_DATABASE || 'neopay'}`);
    console.log(`   SSL: ${isCloudDatabase ? 'enabled' : 'disabled'}`);
    
    // Test connection first
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          SERIAL PRIMARY KEY,
        username    VARCHAR(100) UNIQUE NOT NULL,
        email       VARCHAR(255) UNIQUE NOT NULL,
        password    TEXT NOT NULL,
        is_verified BOOLEAN DEFAULT FALSE,
        otp         VARCHAR(10),
        otp_expires TIMESTAMPTZ,
        phone_no    VARCHAR(50) UNIQUE,
        psid        VARCHAR(100) UNIQUE,
        biometric_key TEXT UNIQUE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Users table ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id              SERIAL PRIMARY KEY,
        sender          VARCHAR(100) NOT NULL,
        receiver_name   VARCHAR(100) NOT NULL,
        transfer_method VARCHAR(50)  NOT NULL,
        account_number  VARCHAR(100) NOT NULL,
        amount          NUMERIC(12,2) NOT NULL,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Transactions table ready');
    console.log('✅ PostgreSQL database fully initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    throw error;
  }
}

module.exports = { pool, initDB };
