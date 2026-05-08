// services/whatsapp.js
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────
const AUTH_DIR = path.join(__dirname, '..', 'auth_state');  // directory to store session files
const RECONNECT_INTERVAL = 5000;  // ms

// ──────────────────────────────────────────────
// Logger (silent in production, debug in dev)
// ──────────────────────────────────────────────
const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'silent' : 'info',
    transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

// ──────────────────────────────────────────────
// WhatsApp Client Singleton
// ──────────────────────────────────────────────
class WhatsAppClient {
    constructor() {
        this.sock = null;
        this.authState = null;
        this.saveCreds = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectTimer = null;
        this.pairingPhone = null;   // phone number used for current pairing attempt
        this.pairingResolve = null; // resolve function for the pairing promise
    }

    // Initialize connection (called once on startup)
    async initialize() {
        // Create auth directory if it doesn't exist
        if (!fs.existsSync(AUTH_DIR)) {
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        }

        // Load multi-file auth state
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
        this.authState = state;
        this.saveCreds = saveCreds;

        // Fetch latest Baileys version to reduce warnings
        const { version } = await fetchLatestBaileysVersion();

        // Start connection
        await this.connect(version);
    }

    // Connect / Reconnect the socket
    async connect(version) {
        if (this.isConnecting || this.isConnected) return;

        this.isConnecting = true;
        logger.info('🟡 Connecting to WhatsApp...');

        this.sock = makeWASocket({
            version,
            auth: this.authState,
            logger,
            printQRInTerminal: false, // we'll handle pairing manually
            browser: ['WhatsApp AI', 'Chrome', '1.0.0'],
        });

        // Listen to connection updates
        this.sock.ev.on('connection.update', (update) => this.handleConnectionUpdate(update));

        // Store credentials on change
        this.sock.ev.on('creds.update', this.saveCreds);
    }

    // Handle connection state changes
    handleConnectionUpdate(update) {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            this.isConnected = true;
            this.isConnecting = false;
            logger.info('🟢 WhatsApp connected successfully');

            // If we were waiting for a pairing, the code was already sent;
            // no further action needed here (the promise already resolved).
        }

        if (connection === 'close') {
            this.isConnected = false;
            this.isConnecting = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = lastDisconnect?.error?.message || statusCode;

            logger.warn(`🔴 Connection closed. Reason: ${reason} (status ${statusCode})`);

            // Reject any pending pairing request if connection closes unexpectedly
            if (this.pairingResolve) {
                this.pairingResolve(Promise.reject(new Error('Connection closed before pairing could complete.')));
                this.pairingResolve = null;
                this.pairingPhone = null;
            }

            // Reconnect unless the session was logged out
            if (statusCode !== DisconnectReason.loggedOut) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_INTERVAL);
            } else {
                logger.info('👋 Session logged out – delete auth files to start fresh.');
                // Optionally clear auth files to allow fresh pairing next time.
            }
        }
    }

    // Generate a pairing code for the given phone number
    async generatePairingCode(phone) {
        // Ensure we have a socket instance
        if (!this.sock) {
            await this.initialize();
        }

        // If not connected yet, wait for the socket to be ready (or time out)
        if (!this.isConnected) {
            // We can request a pairing code even before full "open" state,
            // because the socket might be in 'connecting' state but already capable
            // of generating a code (Baileys allows it during QR phase).
            // However, for safety, we'll wait a short moment.
            await new Promise((resolve, reject) => {
                let attempts = 0;
                const interval = setInterval(() => {
                    if (this.isConnected || this.sock?.user) {
                        clearInterval(interval);
                        resolve();
                    } else if (attempts++ > 20) {
                        clearInterval(interval);
                        reject(new Error('WhatsApp client not ready. Please try again.'));
                    }
                }, 500);
            });
        }

        // Request the pairing code (Baileys 6.x+ syntax)
        try {
            // Store phone for potential reuse
            this.pairingPhone = phone;

            // requestPairingCode returns a promise that resolves with the code (string)
            const code = await this.sock.requestPairingCode(phone);
            logger.info(`🔢 Pairing code generated for ${phone}: ${code}`);

            // If a previous pairing attempt was pending, reject it
            if (this.pairingResolve) {
                this.pairingResolve(null);
            }

            // The code is returned immediately; the actual connection will be completed
            // when the user enters this code on their phone.
            return code;
        } catch (err) {
            logger.error('Failed to generate pairing code:', err);
            throw err;
        }
    }

    // Clean shutdown
    async shutdown() {
        clearTimeout(this.reconnectTimer);
        if (this.sock) {
            await this.sock.end(new Error('Server shutting down'));
            this.sock = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
    }
}

// ──────────────────────────────────────────────
// Singleton instance
// ──────────────────────────────────────────────
const client = new WhatsAppClient();

// Initialize on module load (fire and forget)
client.initialize().catch((err) => {
    logger.fatal('Failed to initialize WhatsApp client:', err);
    process.exit(1);
});

// Graceful shutdown on process exit
process.on('SIGINT', async () => {
    logger.info('Shutting down WhatsApp client...');
    await client.shutdown();
    process.exit(0);
});

// ──────────────────────────────────────────────
// Exported service function
// ──────────────────────────────────────────────
/**
 * Generates a WhatsApp pairing code for the given phone number.
 * The phone number should be in international format without '+' (e.g., '1234567890').
 * @param {string} phone - Cleaned phone number (digits only)
 * @returns {Promise<string>} Pairing code (e.g., "ABCD-EFGH")
 */
async function generatePairCode(phone) {
    return client.generatePairingCode(phone);
}

module.exports = { generatePairCode, WhatsAppClient }; // client exported for potential direct access