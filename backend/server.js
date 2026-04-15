require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const path    = require('path');
const { pool, initDB } = require('./db');

const app = express();
app.use(express.json());
app.use(cors());

// Helper: nodemailer transporter
const createTransporter = () => nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Signup ───────────────────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password, biometricKey } = req.body;

    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      if (!user.is_verified) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        await pool.query(
          `UPDATE users SET password=$1, username=$2, biometric_key=$3, otp=$4, otp_expires=$5, updated_at=NOW() WHERE email=$6`,
          [hashedPassword, username, biometricKey || null, otp, otpExpires, email]
        );
        try {
          await createTransporter().sendMail({
            from: process.env.GMAIL_USER, to: email,
            subject: 'NeoPay Pro - Verify Your Email (OTP)',
            text: `Your new OTP for NeoPay Pro registration is: ${otp}. It will expire in 10 minutes.`
          });
        } catch (mailErr) {
          console.warn('Email send failed:', mailErr.message);
        }
        return res.status(200).json({ message: 'Signup updated! OTP resent to email.', email, otp: process.env.NODE_ENV !== 'production' ? otp : undefined });
      }
      return res.status(400).json({ message: 'User already exists' });
    }

    const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) return res.status(400).json({ message: 'Username already taken' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO users (username, email, password, otp, otp_expires, biometric_key) VALUES ($1,$2,$3,$4,$5,$6)`,
      [username, email, hashedPassword, otp, otpExpires, biometricKey || null]
    );

    try {
      await createTransporter().sendMail({
        from: process.env.GMAIL_USER, to: email,
        subject: 'NeoPay Pro - Verify Your Email (OTP)',
        text: `Your OTP for NeoPay Pro registration is: ${otp}. It will expire in 10 minutes.`
      });
    } catch (mailErr) {
      console.warn('Email send failed:', mailErr.message);
    }

    res.status(200).json({ message: 'Signup successful! OTP sent to email.', email, otp: process.env.NODE_ENV !== 'production' ? otp : undefined });
  } catch (error) {
    res.status(500).json({ message: 'Server error during signup', details: error.message });
  }
});

// ── Verify OTP ───────────────────────────────────────────────────────────────
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(400).json({ message: 'User not found' });

    const user = result.rows[0];
    if (user.is_verified) return res.status(400).json({ message: 'User is already verified' });
    if (user.otp !== otp || new Date(user.otp_expires) < new Date())
      return res.status(400).json({ message: 'Invalid or expired OTP' });

    await pool.query(
      `UPDATE users SET is_verified=TRUE, otp=NULL, otp_expires=NULL, updated_at=NOW() WHERE email=$1`,
      [email]
    );
    res.status(200).json({ message: 'Email verified successfully!' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during verification', details: error.message });
  }
});

// ── Login ────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, biometricKey } = req.body;
    let result;

    if (biometricKey) {
      result = await pool.query('SELECT * FROM users WHERE biometric_key = $1', [biometricKey]);
      if (result.rows.length === 0) return res.status(400).json({ message: 'Biometric record not found' });
    } else {
      result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      if (result.rows.length === 0) return res.status(400).json({ message: 'Invalid credentials' });
      const valid = await bcrypt.compare(password, result.rows[0].password);
      if (!valid) return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (!user.is_verified) return res.status(400).json({ message: 'Please verify your email first' });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({ message: 'Login successful', token, username: user.username });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login', details: error.message });
  }
});

// ── User Search ──────────────────────────────────────────────────────────────
app.get('/api/users/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(200).json([]);
    const like = `%${q}%`;
    const result = await pool.query(
      `SELECT username, phone_no, psid FROM users WHERE username ILIKE $1 OR phone_no ILIKE $1 OR psid ILIKE $1 LIMIT 10`,
      [like]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Search error', details: error.message });
  }
});

// ── Transactions ─────────────────────────────────────────────────────────────
app.post('/api/transactions', async (req, res) => {
  try {
    const { sender, receiverName, transferMethod, accountNumber, amount } = req.body;
    if (!sender || !transferMethod || !accountNumber || !amount)
      return res.status(400).json({ message: 'Missing fields' });

    await pool.query(
      `INSERT INTO transactions (sender, receiver_name, transfer_method, account_number, amount) VALUES ($1,$2,$3,$4,$5)`,
      [sender, receiverName || 'Another Person', transferMethod, accountNumber, amount]
    );
    res.status(200).json({ message: 'Transaction successful' });
  } catch (error) {
    res.status(500).json({ message: 'Transaction failed', details: error.message });
  }
});

// ── AI Chatbot ───────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ reply: 'Please provide a message.' });

    const msg = message.toLowerCase();
    let reply = 'I am the NeoPay AI Customer Services ChatBot. How can I help you today?';

    if (msg.includes('transfer') || msg.includes('send') || msg.includes('money'))
      reply = 'To transfer money, go to the Transfer tab, select or search for a contact, and use the numpad to enter the amount.';
    else if (msg.includes('password') || msg.includes('login'))
      reply = "You can change your password by navigating to Profile > Security & Privacy. If you're locked out, use the Contact Us page.";
    else if (msg.includes('secure') || msg.includes('safe') || msg.includes('scam'))
      reply = 'Security is our top priority. NeoPay Pro uses 256-bit encryption and optional biometric locks. Never share your OTP!';
    else if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey'))
      reply = 'Hello there! Welcome to NeoPay Pro Support. I am your specialized AI agent. What can I assist you with?';
    else if (msg.includes('agent') || msg.includes('human'))
      reply = "I can't transfer you to a live chat right now, but you can go to Help Center -> Contact Us to reach our team.";

    setTimeout(() => res.status(200).json({ reply }), 1200);
  } catch (error) {
    res.status(500).json({ reply: "I'm having trouble connecting. Please try again later." });
  }
});

// ── Health Check ─────────────────────────────────────────────────────────────
// Simple health check that always responds (for Railway)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Detailed health check with environment info
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: {
      PG_HOST:     !!process.env.PG_HOST     ? '✅ Set' : '⚠️ Using default',
      PG_DATABASE: !!process.env.PG_DATABASE ? '✅ Set' : '⚠️ Using default',
      PG_USER:     !!process.env.PG_USER     ? '✅ Set' : '⚠️ Using default',
      PG_PASSWORD: !!process.env.PG_PASSWORD ? '✅ Set' : '❌ MISSING',
      JWT_SECRET:  !!process.env.JWT_SECRET  ? '✅ Set' : '❌ MISSING',
      GMAIL_USER:  !!process.env.GMAIL_USER  ? '✅ Set' : '❌ MISSING',
      GMAIL_PASS:  !!process.env.GMAIL_PASS  ? '✅ Set' : '❌ MISSING',
    }
  });
});

// ── Serve frontend ───────────────────────────────────────────────────────────
const fs = require('fs');
const WALLET_PATH_PARENT = path.resolve(__dirname, '..', 'wallet.html');
const WALLET_PATH_CURRENT = path.resolve(__dirname, 'wallet.html');

app.get('/', (req, res) => {
  // Try parent directory first (for local development)
  fs.readFile(WALLET_PATH_PARENT, (err, data) => {
    if (err) {
      console.log('⚠️ wallet.html not found in parent directory, trying current directory...');
      // Try current directory (for Railway deployment)
      fs.readFile(WALLET_PATH_CURRENT, (err2, data2) => {
        if (err2) {
          console.error('❌ Could not find wallet.html in either location');
          console.error('   Tried:', WALLET_PATH_PARENT);
          console.error('   Tried:', WALLET_PATH_CURRENT);
          return res.status(500).send('Could not load wallet.html. Please check deployment configuration.');
        }
        res.setHeader('Content-Type', 'text/html');
        res.end(data2);
      });
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end(data);
    }
  });
});

// ── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Bind to all interfaces for Railway

// Start server first, then initialize database
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
  
  // Initialize database after server starts
  initDB()
    .then(() => console.log('✅ Database initialized successfully'))
    .catch(err => {
      console.error('⚠️ Database initialization failed:', err.message);
      console.error('Server is running but database operations may fail');
      // Don't exit - let the server run for health checks
    });
});

module.exports = app;
