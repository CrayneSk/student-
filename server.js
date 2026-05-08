// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pairRoutes = require('./routes/pair');

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------
// Middleware
// -------------------------
app.use(cors());                        // Enable CORS for all origins
app.use(express.json());               // Parse JSON request bodies

// -------------------------
// Routes
// -------------------------
app.use('/', pairRoutes);              // Mount pairing routes

// Health check (optional but professional)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// -------------------------
// 404 Handler
// -------------------------
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// -------------------------
// Global Error Handler
// -------------------------
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// -------------------------
// Start Server
// -------------------------
app.listen(PORT, () => {
    console.log(`🚀 WhatsApp AI Backend running on port ${PORT}`);
});