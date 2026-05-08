/**
 * WhatsApp AI Pairing System — Frontend Logic
 * Pure vanilla JavaScript — no frameworks.
 */
(function () {
    'use strict';

    // ──────────────────────────────────────
    // DOM References
    // ──────────────────────────────────────
    const phoneInput = document.getElementById('phoneInput');
    const generateBtn = document.getElementById('generateBtn');
    const clearBtn = document.getElementById('clearBtn');
    const codeDisplay = document.getElementById('codeDisplay');
    const codeValue = document.getElementById('codeValue');
    const codeExpiry = document.getElementById('codeExpiry');
    const copyBtn = document.getElementById('copyBtn');
    const copyFeedback = document.getElementById('copyFeedback');
    const inputError = document.getElementById('inputError');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const btnLoader = document.getElementById('btnLoader');
    const btnContent = document.querySelector('.btn-content');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const particlesContainer = document.getElementById('particlesContainer');

    // ──────────────────────────────────────
    // State
    // ──────────────────────────────────────
    let countdownInterval = null;
    let currentCode = '';

    // ──────────────────────────────────────
    // Utility: Reset UI to default state
    // ──────────────────────────────────────
    function resetUI() {
        clearErrors();
        setStatus('idle', 'Awaiting input');
        codeValue.textContent = '---- ----';
        codeDisplay.classList.remove('code-revealed', 'code-active');
        codeExpiry.textContent = '';
        stopCountdown();
        currentCode = '';
        // No need to toggle button loading here, handle separately
    }

    // ──────────────────────────────────────
    // Status Management
    // ──────────────────────────────────────
    function setStatus(state, message) {
        statusDot.className = 'status-dot'; // reset
        if (state === 'loading') {
            statusDot.classList.add('loading');
        } else if (state === 'active') {
            statusDot.classList.add('active');
        } else if (state === 'error') {
            statusDot.classList.add('error');
        }
        // idle (default) no extra class
        statusText.textContent = message;
    }

    // ──────────────────────────────────────
    // Error Handling (input)
    // ──────────────────────────────────────
    function showError(message) {
        inputError.textContent = message;
        inputError.classList.add('visible');
        phoneInput.parentElement.classList.add('input-error-state');
    }

    function clearErrors() {
        inputError.textContent = '';
        inputError.classList.remove('visible');
        phoneInput.parentElement.classList.remove('input-error-state');
    }

    // ──────────────────────────────────────
    // Validation: Extract & clean phone number
    // ──────────────────────────────────────
    function getCleanPhoneNumber() {
        const raw = phoneInput.value.trim();
        // Remove everything except digits and a leading '+'
        let cleaned = raw.replace(/[^\d+]/g, '');
        // If starts with '+' keep it, but we might want just digits for backend
        if (cleaned.startsWith('+')) {
            cleaned = cleaned.substring(1); // remove the plus for sending
        }
        // Remove any remaining non-digits (just in case)
        cleaned = cleaned.replace(/\D/g, '');
        return cleaned;
    }

    function isValidPhone(phoneDigits) {
        return phoneDigits.length >= 7 && phoneDigits.length <= 15;
    }

    // ──────────────────────────────────────
    // Loading State Toggle
    // ──────────────────────────────────────
    function setLoading(isLoading) {
        if (isLoading) {
            generateBtn.disabled = true;
            generateBtn.classList.add('loading');
            btnLoader.style.display = ''; // CSS handles via .loading class, but ensure none style override
            // The CSS already hides btn-content when .loading, and shows btn-loader
            setStatus('loading', 'Generating...');
        } else {
            generateBtn.disabled = false;
            generateBtn.classList.remove('loading');
            setStatus('idle', 'Awaiting input');
        }
    }

    // ──────────────────────────────────────
    // Countdown Timer (5 minutes)
    // ──────────────────────────────────────
    function startCountdown(seconds = 300) {
        stopCountdown();
        let remaining = seconds;
        updateCountdownDisplay(remaining);

        countdownInterval = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                stopCountdown();
                codeExpiry.textContent = 'Code expired';
                // Optionally reset code display after expiry
                setTimeout(() => {
                    resetUI();
                }, 1500);
                setStatus('error', 'Expired');
                return;
            }
            updateCountdownDisplay(remaining);
        }, 1000);
    }

    function stopCountdown() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    function updateCountdownDisplay(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        codeExpiry.textContent = `Expires in ${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // ──────────────────────────────────────
    // Copy to Clipboard
    // ──────────────────────────────────────
    async function copyCodeToClipboard() {
        if (!currentCode) return;
        try {
            await navigator.clipboard.writeText(currentCode);
            // Show feedback near button
            copyFeedback.classList.add('show');
            setTimeout(() => copyFeedback.classList.remove('show'), 1800);

            // Show toast notification
            showToast('Pairing code copied!');
        } catch (err) {
            // Fallback: select text manually
            const textArea = document.createElement('textarea');
            textArea.value = currentCode;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showToast('Code copied (manual)');
            } catch (e) {
                showToast('Failed to copy', true);
            }
            document.body.removeChild(textArea);
        }
    }

    // ──────────────────────────────────────
    // Toast Notification
    // ──────────────────────────────────────
    let toastTimeout;
    function showToast(message, isError = false) {
        toastMessage.textContent = message;
        const icon = toast.querySelector('.toast-icon');
        if (icon) {
            icon.innerHTML = isError ? '&#10007;' : '&#10003;';
            icon.style.color = isError ? 'var(--status-error)' : 'var(--wa-green)';
        }
        toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2800);
    }

    // ──────────────────────────────────────
    // API Request: POST /generate-code
    // ──────────────────────────────────────
    async function fetchPairingCode(phoneDigits) {
        const payload = { phone: phoneDigits };

        try {
            const response = await fetch('/generate-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Add any other required headers (e.g., CSRF token if needed)
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                // Attempt to parse error message from backend
                let errorMessage = 'Failed to generate code.';
                try {
                    const errorData = await response.json();
                    if (errorData && errorData.message) {
                        errorMessage = errorData.message;
                    }
                } catch (e) {
                    // Could not parse JSON, use status text
                    errorMessage = `Error ${response.status}: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (!data || !data.pairingCode) {
                throw new Error('Invalid response format (missing pairingCode).');
            }

            return data;
        } catch (error) {
            // Network error or thrown error
            console.error('API Error:', error);
            throw error; // rethrow to be handled by caller
        }
    }

    // ──────────────────────────────────────
    // Display Generated Code
    // ──────────────────────────────────────
    function displayCode(pairingCode) {
        currentCode = pairingCode;
        codeValue.textContent = pairingCode;
        // Trigger reveal animation
        codeDisplay.classList.add('code-revealed');
        // Force reflow to restart animation if already revealed
        void codeValue.offsetWidth;
        codeValue.style.animation = 'none';
        codeValue.offsetHeight; // trigger reflow
        codeValue.style.animation = '';

        setStatus('active', 'Code active');
        startCountdown(300); // 5 minutes
    }

    // ──────────────────────────────────────
    // Button Click Handler
    // ──────────────────────────────────────
    async function onGenerateClick() {
        // Reset previous state (except input)
        clearErrors();
        stopCountdown();
        setStatus('idle', '');

        const phoneDigits = getCleanPhoneNumber();
        if (!isValidPhone(phoneDigits)) {
            showError('Enter a valid phone number (7-15 digits).');
            setStatus('error', 'Invalid number');
            return;
        }

        // Start loading
        setLoading(true);
        setStatus('loading', 'Connecting to AI...');

        try {
            const data = await fetchPairingCode(phoneDigits);
            // Success
            displayCode(data.pairingCode);
        } catch (error) {
            // Error
            showError(error.message || 'Something went wrong. Try again.');
            setStatus('error', 'Generation failed');
            // Optionally clear code display
            codeValue.textContent = '---- ----';
            codeDisplay.classList.remove('code-revealed');
            currentCode = '';
        } finally {
            setLoading(false);
            // If successful, status will be 'active' set inside displayCode
        }
    }

    // ──────────────────────────────────────
    // Input Clear Button Logic
    // ──────────────────────────────────────
    function toggleClearButton() {
        if (phoneInput.value.trim().length > 0) {
            clearBtn.classList.add('visible');
        } else {
            clearBtn.classList.remove('visible');
        }
    }

    function clearInput() {
        phoneInput.value = '';
        toggleClearButton();
        clearErrors();
        phoneInput.focus();
        // Don't reset everything, just input
    }

    // ──────────────────────────────────────
    // Background Particles (floating effect)
    // ──────────────────────────────────────
    function createParticles() {
        const container = particlesContainer;
        if (!container) return;
        const fragment = document.createDocumentFragment();
        const particleCount = 22; // a few subtle particles

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.classList.add('particle');
            // Randomise initial positions & animation delays
            particle.style.left = Math.random() * 100 + '%';
            particle.style.bottom = '0';
            particle.style.animationDelay = Math.random() * 8 + 's';
            particle.style.animationDuration = 5 + Math.random() * 8 + 's';
            fragment.appendChild(particle);
        }
        container.appendChild(fragment);
    }

    // ──────────────────────────────────────
    // Event Listeners
    // ──────────────────────────────────────
    window.addEventListener('DOMContentLoaded', () => {
        createParticles();

        generateBtn.addEventListener('click', onGenerateClick);

        phoneInput.addEventListener('input', () => {
            toggleClearButton();
            clearErrors(); // clear visual error when user types
        });

        clearBtn.addEventListener('click', clearInput);

        copyBtn.addEventListener('click', copyCodeToClipboard);

        // Optional: allow Enter key to generate
        phoneInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onGenerateClick();
            }
        });

        // Initial UI state
        toggleClearButton();
        resetUI();
    });

    // Cleanup intervals if needed (not strictly necessary but good practice)
    window.addEventListener('beforeunload', () => {
        stopCountdown();
    });

})();