// routes/pair.js
const express = require('express');
const router = express.Router();
const { generatePairCode } = require('../services/whatsapp');

/**
 * POST /generate-code
 * Receives a phone number, generates a WhatsApp pairing code,
 * and returns it as JSON.
 *
 * Expected body: { phone: string }
 * Success response: { pairingCode: string, expiresIn: number }
 */
router.post('/generate-code', async (req, res) => {
    try {
        const { phone } = req.body;

        // ── Input validation ────────────────────
        if (!phone || typeof phone !== 'string') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'A valid phone number string is required.'
            });
        }

        const cleaned = phone.replace(/\D/g, ''); // digits only
        if (cleaned.length < 7 || cleaned.length > 15) {
            return res.status(400).json({
                error: 'Invalid phone number',
                message: 'Phone number must contain 7 to 15 digits.'
            });
        }

        // ── Call the WhatsApp AI service ────────
        const pairingCode = await generatePairCode(cleaned);

        // ── Return successful response ──────────
        return res.status(200).json({
            pairingCode,
            expiresIn: 300          // 5 minutes (adjust to match actual logic)
        });

    } catch (error) {
        // ── Centralised error handling ─────────
        console.error('Pairing code generation error:', error.message);

        // Distinguish between known errors and unexpected ones
        if (error.code === 'WHATSAPP_API_ERROR') {
            return res.status(502).json({
                error: 'Service unavailable',
                message: 'WhatsApp API is currently unreachable.'
            });
        }

        if (error.code === 'RATE_LIMIT') {
            return res.status(429).json({
                error: 'Too many requests',
                message: 'Please wait before requesting another code.'
            });
        }

        return res.status(500).json({
            error: 'Internal server error',
            message: 'Could not generate pairing code.'
        });
    }
});

module.exports = router;