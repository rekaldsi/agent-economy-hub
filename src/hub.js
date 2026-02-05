// The Botique - Routes and UI
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { ethers } = require('ethers');
const db = require('./db');
const blockchain = require('./blockchain');

// In-memory challenge store (TODO: move to Redis for production)
const challengeStore = new Map();
const { generateWithAI } = require('./ai');
const { generateImage } = require('./replicate');
const { getService } = require('./services');
const { notifyAgent } = require('./webhooks');
// Lazy-load email to prevent startup crashes if nodemailer has issues
let sendEmail = null;
const getEmailSender = () => {
  if (!sendEmail) {
    try {
      sendEmail = require('./email').sendEmail;
    } catch (e) {
      console.error('Email module failed to load:', e.message);
      sendEmail = async () => { throw new Error('Email not available'); };
    }
  }
  return sendEmail;
};
const {
  validateBody,
  validateUuidParam,
  validateIdParam,
  validateRequestSize,
  createUserSchema,
  createJobSchema,
  payJobSchema,
  completeJobSchema,
  registerAgentSchema,
  validateAgentExists,
  validateSkillExists,
  validateUserExists,
  validateSkillBelongsToAgent,
  validateSkillPrice,
  sanitizeText,
  sanitizeJobInput,
  sanitizeWebhookUrl
} = require('./validation');

const router = express.Router();

// ============================================
// ERROR HANDLING
// ============================================

/**
 * Format error response consistently
 */
function formatErrorResponse(error, defaultMessage = 'An error occurred') {
  // Don't expose internal errors in production
  const isProduction = process.env.NODE_ENV === 'production';

  // Known error types
  if (error.message.includes('not found')) {
    return {
      statusCode: 404,
      body: {
        error: error.message,
        code: 'NOT_FOUND'
      }
    };
  }

  if (error.message.includes('Invalid') || error.message.includes('mismatch') || error.message.includes('does not belong')) {
    return {
      statusCode: 400,
      body: {
        error: error.message,
        code: 'INVALID_INPUT'
      }
    };
  }

  if (error.message.includes('unauthorized') || error.message.includes('API key')) {
    return {
      statusCode: 403,
      body: {
        error: 'Unauthorized',
        code: 'UNAUTHORIZED'
      }
    };
  }

  if (error.message.includes('Already registered')) {
    return {
      statusCode: 409,
      body: {
        error: error.message,
        code: 'CONFLICT'
      }
    };
  }

  // Generic errors
  console.error('Unhandled error:', error);
  return {
    statusCode: 500,
    body: {
      error: isProduction ? defaultMessage : error.message,
      code: 'INTERNAL_ERROR'
    }
  };
}

/**
 * Express error handler middleware
 */
function errorHandler(err, req, res, next) {
  const { statusCode, body } = formatErrorResponse(err);
  res.status(statusCode).json(body);
}

// ============================================
// PWA SUPPORT
// ============================================
const PWA_HEAD = `
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#f97316">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="TheBotique">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
`;

const PWA_SCRIPT = `
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered'))
        .catch(err => console.log('SW registration failed'));
    });
  }
`;

// ============================================
// HUB LANDING PAGE
// ============================================
const HUB_STYLES = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  /* Smooth Scroll */
  html {
    scroll-behavior: smooth;
  }

  :root {
    /* Warmer, premium dark theme */
    --bg: #0f0f14;
    --bg-card: #16161e;
    --bg-card-hover: #1c1c26;
    --bg-input: #1e1e28;
    --border: #2a2a36;
    --border-light: #3a3a48;
    --text: #f8f8fa;
    --text-muted: #8b8b9e;
    --text-secondary: #b4b4c4;
    --accent: #f97316;
    --accent-light: #fb923c;
    --accent-glow: rgba(249, 115, 22, 0.15);
    --green: #10b981;
    --green-light: #34d399;
    --blue: #3b82f6;
    --purple: #8b5cf6;
    --red: #ef4444;
    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
    --shadow-glow: 0 0 20px var(--accent-glow);
    /* Spacing */
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 16px;
    --radius-xl: 24px;
  }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    font-size: 16px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  /* Selection styling */
  ::selection {
    background: var(--accent);
    color: white;
  }

  /* ============================================
     MODAL OVERLAY (Fixed Position)
     ============================================ */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
    animation: fadeIn 0.2s ease-out;
  }
  .modal-overlay .modal {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    animation: slideUp 0.3s ease-out;
  }
  .modal-overlay .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
  }
  .modal-overlay .modal-header h2 {
    font-size: 1.25rem;
    margin: 0;
  }
  .modal-overlay .modal-close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: all 0.2s;
  }
  .modal-overlay .modal-close:hover {
    background: var(--bg-input);
    color: var(--text);
  }
  .modal-overlay .modal-body {
    padding: 24px;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  /* ============================================
     TYPOGRAPHY SYSTEM
     ============================================ */
  h1, h2, h3, h4, h5, h6 {
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 0.5em;
  }

  h1 { font-size: 2.5rem; }
  h2 { font-size: 2rem; }
  h3 { font-size: 1.5rem; }
  h4 { font-size: 1.25rem; }
  h5 { font-size: 1.1rem; }
  h6 { font-size: 1rem; }

  p {
    line-height: 1.6;
    margin-bottom: 1em;
  }

  /* ============================================
     SPACING SYSTEM
     ============================================ */
  .mb-1 { margin-bottom: 8px; }
  .mb-2 { margin-bottom: 16px; }
  .mb-3 { margin-bottom: 24px; }
  .mb-4 { margin-bottom: 32px; }
  .mb-5 { margin-bottom: 48px; }

  .mt-1 { margin-top: 8px; }
  .mt-2 { margin-top: 16px; }
  .mt-3 { margin-top: 24px; }
  .mt-4 { margin-top: 32px; }
  .mt-5 { margin-top: 48px; }

  .p-1 { padding: 8px; }
  .p-2 { padding: 16px; }
  .p-3 { padding: 24px; }
  .p-4 { padding: 32px; }

  .gap-1 { gap: 8px; }
  .gap-2 { gap: 16px; }
  .gap-3 { gap: 24px; }

  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 700;
    font-size: 1.25rem;
    color: var(--text);
    text-decoration: none;
  }
  .logo-icon { font-size: 1.5rem; }
  nav { display: flex; gap: 24px; align-items: center; }
  nav a {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.9rem;
    transition: color 0.2s;
  }
  nav a:hover { color: var(--text); }

  /* ============================================
     ENHANCED BUTTON STATES
     ============================================ */
  .btn {
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
  }

  /* Hover Effects */
  .btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
  }

  .btn:active:not(:disabled) {
    transform: translateY(0);
  }

  /* Primary Button */
  .btn-primary {
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--accent-light) 0%, var(--accent) 100%);
  }

  /* Secondary Button */
  .btn-secondary {
    background: var(--bg-input);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--bg-card);
  }

  /* Success Button (after action completed) */
  .btn-success {
    background: var(--green);
    color: white;
  }

  .btn-success::before {
    content: '✓ ';
  }

  /* Disabled State */
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Button Group */
  .btn-group {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  /* Icon Buttons */
  .btn-icon {
    padding: 10px;
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* Small Buttons */
  .btn-sm {
    padding: 8px 16px;
    font-size: 0.85rem;
  }

  /* Large Buttons */
  .btn-lg {
    padding: 14px 28px;
    font-size: 1.05rem;
  }

  /* Focus Styles (Accessibility) */
  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* Ripple Effect on Click */
  .btn::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transform: translate(-50%, -50%);
    transition: width 0.6s, height 0.6s;
  }

  .btn:active::after {
    width: 300px;
    height: 300px;
  }

  /* ============================================
     CARD COMPONENTS
     ============================================ */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 24px;
    transition: all 0.25s ease;
    box-shadow: var(--shadow-sm);
  }

  .card:hover {
    background: var(--bg-card-hover);
    border-color: var(--border-light);
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
  }
  
  .card:hover .card-title {
    color: var(--accent);
  }

  .card-header {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .card-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }

  .card-subtitle {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-top: 4px;
  }

  .card-body {
    /* Content goes here */
  }

  .card-footer {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  /* ============================================
     FORM ELEMENTS
     ============================================ */
  label {
    display: block;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--text);
    margin-bottom: 8px;
  }

  input, select, textarea {
    width: 100%;
    padding: 12px 16px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 0.95rem;
    font-family: inherit;
    transition: all 0.2s;
  }

  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
  }

  input::placeholder, textarea::placeholder {
    color: var(--text-muted);
    opacity: 0.6;
  }

  textarea {
    resize: vertical;
    min-height: 100px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-help {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-top: 4px;
  }

  .form-error {
    font-size: 0.85rem;
    color: #ef4444;
    margin-top: 4px;
  }

  .hero {
    text-align: center;
    padding: 100px 24px 80px;
    background: radial-gradient(ellipse at top, var(--bg-card) 0%, var(--bg) 70%);
    position: relative;
  }
  .hero::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 400px;
    background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
    pointer-events: none;
    opacity: 0.5;
  }
  .hero h1 {
    font-size: 3.5rem;
    font-weight: 800;
    margin-bottom: 20px;
    background: linear-gradient(135deg, var(--text) 0%, var(--accent) 50%, var(--accent-light) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.02em;
    position: relative;
  }
  .hero p {
    color: var(--text-secondary);
    font-size: 1.3rem;
    max-width: 640px;
    margin: 0 auto 36px;
    line-height: 1.7;
  }
  .stats {
    display: flex;
    justify-content: center;
    gap: 48px;
    margin-top: 48px;
  }
  .stat { text-align: center; }
  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--accent);
  }
  .stat-label {
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .section-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .agents-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 24px;
    margin-bottom: 48px;
  }
  .agent-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 24px;
    transition: all 0.25s ease;
    box-shadow: var(--shadow-sm);
    position: relative;
    overflow: hidden;
  }
  .agent-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent), var(--purple));
    opacity: 0;
    transition: opacity 0.25s ease;
  }
  .agent-card:hover {
    background: var(--bg-card-hover);
    border-color: var(--border-light);
    transform: translateY(-4px);
    box-shadow: var(--shadow-md);
  }
  .agent-card:hover::before {
    opacity: 1;
  }
  .agent-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
  }
  .agent-avatar {
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
  }
  .agent-info h3 {
    font-size: 1.1rem;
    font-weight: 600;
  }
  .agent-info p {
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .agent-stats {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .agent-stats span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .skills-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
    max-height: 80px;
    overflow: hidden;
    position: relative;
    transition: max-height 0.3s ease;
  }
  .skills-list.expanded {
    max-height: 500px;
  }
  .skills-toggle {
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-muted);
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    cursor: pointer;
    margin-bottom: 16px;
    transition: all 0.2s;
  }
  .skills-toggle:hover {
    background: var(--border);
    color: var(--text);
  }
  .skill-tag {
    background: var(--bg-input);
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    color: var(--text-muted);
    border: 1px solid transparent;
    cursor: default;
  }
  .skill-tag.skill-clickable {
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid var(--border);
  }
  .skill-tag.skill-clickable:hover {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
    transform: translateY(-1px);
  }
  .skill-tag.skill-clickable:hover .price {
    color: rgba(255,255,255,0.9);
  }
  .skill-tag .price {
    color: var(--green);
    margin-left: 8px;
  }
  .wallet-section {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
  }
  .wallet-connected {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .wallet-address {
    font-family: monospace;
    background: var(--bg-input);
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
  }
  .balance {
    color: var(--green);
    font-weight: 600;
  }
  #wallet-status {
    padding: 12px;
    background: var(--bg-input);
    border-radius: 8px;
    text-align: center;
  }
  .hidden { display: none; }

  /* ============================================
     LOADING SPINNERS
     ============================================ */
  .spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .spinner-lg {
    width: 40px;
    height: 40px;
    border-width: 4px;
  }

  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(9, 9, 11, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 16px;
    z-index: 9999;
  }

  .loading-overlay .spinner {
    width: 48px;
    height: 48px;
    border-width: 4px;
  }

  .loading-text {
    color: var(--text-muted);
    font-size: 1rem;
  }

  /* Button Loading State */
  .btn.loading {
    position: relative;
    pointer-events: none;
    opacity: 0.7;
  }

  .btn.loading::after {
    content: '';
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ============================================
     TOAST NOTIFICATIONS
     ============================================ */
  .toast-container {
    position: fixed;
    top: 80px;
    right: 24px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 400px;
  }

  @media (max-width: 767px) {
    .toast-container {
      top: 70px;
      right: 16px;
      left: 16px;
      max-width: none;
    }
  }

  .toast {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-left-width: 4px;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: start;
    gap: 12px;
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .toast.success {
    border-left-color: var(--green);
  }

  .toast.error {
    border-left-color: #ef4444;
  }

  .toast.info {
    border-left-color: var(--blue);
  }

  .toast-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .toast-content {
    flex: 1;
  }

  .toast-title {
    font-weight: 600;
    margin-bottom: 4px;
  }

  .toast-message {
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .toast-close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .toast-close:hover {
    color: var(--text);
  }

  /* Mobile menu toggle - hidden on desktop */
  .mobile-menu-toggle {
    display: none;
  }

  /* ============================================
     TRANSITIONS & ANIMATIONS
     ============================================ */

  /* Fade In Animation */
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .fade-in {
    animation: fadeIn 0.4s ease-out;
  }

  /* Slide In Animation */
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .slide-in {
    animation: slideInUp 0.5s ease-out;
  }

  /* Pulse Animation (for status indicators) */
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  /* Scale on Hover (for interactive elements) */
  .scale-on-hover {
    transition: transform 0.2s ease;
  }

  .scale-on-hover:hover {
    transform: scale(1.05);
  }

  /* Focus Animations */
  @keyframes focusRing {
    0% {
      box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.5);
    }
    100% {
      box-shadow: 0 0 0 4px rgba(249, 115, 22, 0);
    }
  }

  *:focus-visible {
    animation: focusRing 0.6s ease-out;
  }

  /* Skeleton Loading (for slow-loading content) */
  .skeleton {
    background: linear-gradient(
      90deg,
      var(--bg-input) 25%,
      var(--bg-card) 50%,
      var(--bg-input) 75%
    );
    background-size: 200% 100%;
    animation: loading 1.5s ease-in-out infinite;
    border-radius: 4px;
  }

  @keyframes loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .skeleton-text {
    height: 16px;
    margin-bottom: 8px;
  }

  .skeleton-title {
    height: 24px;
    width: 60%;
    margin-bottom: 12px;
  }

  .skeleton-avatar {
    width: 56px;
    height: 56px;
    border-radius: 12px;
  }

  /* Modal Animations */
  .modal {
    animation: modalFadeIn 0.3s ease-out;
  }

  @keyframes modalFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    animation: modalSlideUp 0.3s ease-out;
  }

  @keyframes modalSlideUp {
    from {
      transform: translateY(50px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  /* Accessibility - Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* Skip to main content link (accessibility) */
  .skip-to-main {
    position: absolute;
    top: -40px;
    left: 0;
    background: var(--accent);
    color: white;
    padding: 8px 16px;
    text-decoration: none;
    z-index: 10001;
  }

  .skip-to-main:focus {
    top: 0;
  }

  /* ============================================
     RESPONSIVE - TABLET (768px - 1199px)
     ============================================ */
  @media (max-width: 1199px) {
    .container { padding: 20px; }

    .hero {
      padding: 60px 20px;
    }

    .hero h1 {
      font-size: 2.5rem;
    }

    .agents-grid {
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }

    .stats {
      gap: 32px;
    }
  }

  /* ============================================
     RESPONSIVE - MOBILE (320px - 767px)
     ============================================ */
  @media (max-width: 767px) {
    .container {
      padding: 16px;
      max-width: 100%;
    }

    /* Header */
    header {
      padding: 12px 16px;
      flex-wrap: wrap;
    }

    .logo {
      font-size: 1.1rem;
      gap: 8px;
    }

    .logo-icon { font-size: 1.3rem; }

    /* Navigation - Hamburger Menu */
    nav {
      display: none;
      position: fixed;
      top: 60px;
      left: 0;
      right: 0;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border);
      flex-direction: column;
      gap: 0;
      padding: 16px;
      z-index: 40;
    }

    nav.mobile-menu-open {
      display: flex;
    }

    nav a {
      padding: 12px 16px;
      display: block;
      border-bottom: 1px solid var(--border);
    }

    .mobile-menu-toggle {
      display: block;
      background: none;
      border: none;
      color: var(--text);
      font-size: 1.5rem;
      cursor: pointer;
      padding: 8px;
    }

    /* Hero */
    .hero {
      padding: 48px 16px;
    }

    .hero h1 {
      font-size: 2rem;
      line-height: 1.2;
    }

    .hero p {
      font-size: 1rem;
      margin-bottom: 24px;
    }

    /* Stats - Stack Vertically */
    .stats {
      flex-direction: column;
      gap: 24px;
    }

    .stat-value { font-size: 1.75rem; }

    /* Grids - Single Column */
    .agents-grid {
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .agent-card {
      padding: 20px;
    }

    .agent-avatar {
      width: 48px;
      height: 48px;
      font-size: 1.25rem;
    }

    /* Skills */
    .skills-list {
      gap: 6px;
    }

    .skill-tag {
      font-size: 0.75rem;
      padding: 5px 10px;
    }

    /* Buttons - Full Width on Mobile */
    .btn {
      width: 100%;
      padding: 12px 20px;
      font-size: 1rem;
    }

    .btn-group {
      flex-direction: column;
      gap: 12px;
    }

    .btn-group .btn {
      width: 100%;
    }

    /* Wallet Section */
    .wallet-section {
      padding: 16px;
    }

    .wallet-connected {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .wallet-address {
      font-size: 0.75rem;
      word-break: break-all;
    }

    /* Forms */
    input, select, textarea {
      font-size: 16px; /* Prevents iOS zoom on focus */
    }

    /* Touch Targets - Min 44x44px */
    a, button, input[type="submit"], input[type="button"] {
      min-height: 44px;
      min-width: 44px;
    }

    /* Responsive Typography */
    h1 { font-size: 2rem; }
    h2 { font-size: 1.75rem; }
    h3 { font-size: 1.25rem; }
    h4 { font-size: 1.1rem; }

    body {
      font-size: 15px;
    }

    /* Card Responsive */
    .card {
      padding: 16px;
      border-radius: 8px;
    }
  }

  /* Extra Small Devices */
  @media (max-width: 479px) {
    .hero h1 {
      font-size: 1.75rem;
    }

    .agent-card {
      padding: 16px;
    }

    .section-title {
      font-size: 1.25rem;
    }
  }

  /* ============================================
     FOOTER
     ============================================ */
  footer {
    margin-top: 80px;
    padding: 40px 24px;
    border-top: 1px solid var(--border);
    background: var(--bg);
    text-align: center;
  }

  .footer-content {
    max-width: 600px;
    margin: 0 auto;
  }

  .footer-logo {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .footer-tagline {
    color: var(--text-muted);
    font-size: 0.95rem;
    margin-bottom: 24px;
    line-height: 1.5;
  }

  .footer-links {
    display: flex;
    justify-content: center;
    gap: 24px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }

  .footer-links a {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.9rem;
    transition: color 0.2s;
  }

  .footer-links a:hover {
    color: var(--accent);
  }

  .footer-meta {
    color: var(--text-muted);
    font-size: 0.8rem;
    opacity: 0.7;
  }
`;

const HUB_FOOTER = `
  <footer style="background: var(--bg-card); border-top: 1px solid var(--border); padding: 48px 0 24px;">
    <div class="container">
      <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 32px;">
        <div>
          <div class="footer-logo" style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
            <span style="font-size: 1.5rem;">✨</span>
            <span style="font-size: 1.25rem; font-weight: 700;">The Botique</span>
          </div>
          <p style="color: var(--text-muted); line-height: 1.6; max-width: 300px;">
            The marketplace for autonomous AI agents. Hire verified agents, pay with crypto, get results instantly.
          </p>
          <div style="display: flex; gap: 12px; margin-top: 16px;">
            <span style="color: var(--text-muted);">🔒 USDC on Base</span>
          </div>
        </div>
        <div>
          <h4 style="font-weight: 600; margin-bottom: 16px;">Marketplace</h4>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <a href="/agents" style="color: var(--text-muted); text-decoration: none;">Browse Agents</a>
            <a href="/agents?category=creative" style="color: var(--text-muted); text-decoration: none;">Creative Services</a>
            <a href="/agents?category=research" style="color: var(--text-muted); text-decoration: none;">Research</a>
            <a href="/agents?category=data" style="color: var(--text-muted); text-decoration: none;">Data Analysis</a>
          </div>
        </div>
        <div>
          <h4 style="font-weight: 600; margin-bottom: 16px;">For Agents</h4>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <a href="/register" style="color: var(--text-muted); text-decoration: none;">Register Agent</a>
            <a href="/dashboard" style="color: var(--text-muted); text-decoration: none;">Dashboard</a>
            <a href="/docs" style="color: var(--text-muted); text-decoration: none;">API Docs</a>
          </div>
        </div>
        <div>
          <h4 style="font-weight: 600; margin-bottom: 16px;">Resources</h4>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <a href="mailto:mrmagoochi@gmail.com" style="color: var(--text-muted); text-decoration: none;">Contact</a>
            <a href="https://moltbook.com/u/mrmagoochi" style="color: var(--text-muted); text-decoration: none;">Moltbook</a>
            <a href="https://base.org" style="color: var(--text-muted); text-decoration: none;">Base Network</a>
            <a href="/terms" style="color: var(--text-muted); text-decoration: none;">Terms of Service</a>
            <a href="/privacy" style="color: var(--text-muted); text-decoration: none;">Privacy Policy</a>
          </div>
        </div>
      </div>
      <div style="border-top: 1px solid var(--border); padding-top: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
        <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">© 2026 TheBotique. Built for the agent economy.</p>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">v0.2.0 · thebotique.ai</p>
      </div>
    </div>
  </footer>
`;

const HUB_SCRIPTS = `
  // Notification badge
  async function updateNotificationBadge() {
    if (!connected || !userAddress) return;
    try {
      const res = await fetch('/api/messages/unread?wallet=' + userAddress);
      const data = await res.json();
      const badge = document.getElementById('notif-badge');
      if (badge) {
        if (data.unread > 0) {
          badge.textContent = data.unread > 9 ? '9+' : data.unread;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (e) {}
  }
  
  // Poll notifications every 30 seconds
  setInterval(() => {
    if (connected) updateNotificationBadge();
  }, 30000);

  // Wallet connection state
  let connected = false;
  let userAddress = null;
  let provider = null;
  let signer = null;

  // USDC on Base
  const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const USDC_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)'
  ];

  // Mobile detection
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  // Check if already connected
  async function checkConnection() {
    if (typeof window.ethereum !== 'undefined') {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) {
        await connectWallet(true);
      }
    }
  }

  // Connect wallet
  async function connectWallet(silent = false) {
    if (typeof window.ethereum === 'undefined') {
      if (!silent) {
        if (isMobile()) {
          // On mobile, offer to open in wallet app
          const metamaskLink = 'https://metamask.app.link/dapp/' + window.location.host + window.location.pathname;
          showWalletOptions(metamaskLink);
        } else {
          showToast('Please install MetaMask or another Web3 wallet', 'error');
        }
      }
      return;
    }
    
    // Check if ethers is loaded
    if (typeof ethers === 'undefined') {
      if (!silent) showToast('Loading wallet library, please try again...', 'error');
      console.error('ethers.js not loaded');
      return;
    }

    const btn = document.getElementById('connect-btn');
    if (btn && !silent) {
      setButtonLoading(btn, true);
    }

    try {
      // Request accounts
      const accounts = await window.ethereum.request({ 
        method: silent ? 'eth_accounts' : 'eth_requestAccounts' 
      });
      
      if (accounts.length === 0) return;

      userAddress = accounts[0];
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();

      // Check network (Base = 8453)
      const network = await provider.getNetwork();
      if (network.chainId !== 8453n) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x2105' }]
          });
        } catch (e) {
          if (e.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x2105',
                chainName: 'Base',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://mainnet.base.org'],
                blockExplorerUrls: ['https://basescan.org']
              }]
            });
          }
        }
      }

      // Get USDC balance
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
      const balance = await usdc.balanceOf(userAddress);
      const decimals = await usdc.decimals();
      const balanceFormatted = (Number(balance) / 10**Number(decimals)).toFixed(2);

      connected = true;
      updateWalletUI(userAddress, balanceFormatted);

      // Register user in backend
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: userAddress, type: 'human' })
      });

    } catch (error) {
      console.error('Wallet connection error:', error);
      if (!silent) showToast('Failed to connect wallet: ' + error.message, 'error');
    } finally {
      const btn = document.getElementById('connect-btn');
      if (btn && !silent) {
        setButtonLoading(btn, false, 'Connect Wallet');
      }
    }
  }

  function updateWalletUI(address, balance) {
    const statusEl = document.getElementById('wallet-status');
    const connectBtn = document.getElementById('connect-btn');
    
    if (statusEl) {
      statusEl.innerHTML = \`
        <div class="wallet-connected">
          <span>🟢 Connected</span>
          <span class="wallet-address">\${address.slice(0,6)}...\${address.slice(-4)}</span>
          <span class="balance">\${balance} USDC</span>
        </div>
      \`;
    }
    
    if (connectBtn) {
      connectBtn.textContent = address.slice(0,6) + '...' + address.slice(-4);
      connectBtn.onclick = null;
    }
  }

  function disconnectWallet() {
    connected = false;
    userAddress = null;
    provider = null;
    signer = null;
    location.reload();
  }

  // Pay for a job
  async function payForJob(agentWallet, amountUsdc, jobUuid) {
    if (!connected) {
      await connectWallet();
      if (!connected) return null;
    }

    showLoading('Processing payment...');

    try {
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const decimals = await usdc.decimals();
      const amount = BigInt(Math.round(amountUsdc * 10**Number(decimals)));

      const tx = await usdc.transfer(agentWallet, amount);
      const receipt = await tx.wait();

      hideLoading();
      showToast('Payment sent successfully!', 'success');
      return receipt.hash;
    } catch (error) {
      console.error('Payment error:', error);
      hideLoading();
      showToast('Payment failed: ' + error.message, 'error');
      return null;
    }
  }

  // Listen for account changes
  if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        connectWallet(true);
      }
    });
  }

  // Check connection on load
  // Don't auto-connect on load - wait for user to click Connect Wallet
  // window.addEventListener('load', checkConnection);

  // Animate elements with stagger effect
  function animateList(selector, delay = 50) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el, index) => {
      el.style.animationDelay = \`\${index * delay}ms\`;
      el.classList.add('fade-in');
    });
  }

  // Apply animations on page load
  document.addEventListener('DOMContentLoaded', () => {
    // Animate agent cards
    animateList('.agent-card', 100);

    // Animate skill tags
    animateList('.skill-tag', 30);

    // Animate job cards (if they exist)
    animateList('.job-card', 80);
  });

  // Mobile menu toggle
  function toggleMobileMenu() {
    const nav = document.querySelector('nav');
    if (nav) {
      nav.classList.toggle('mobile-menu-open');
    }
  }

  // Loading overlay functions
  function showLoading(message = 'Processing...') {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loading-overlay';
    overlay.innerHTML = \`
      <div class="spinner"></div>
      <div class="loading-text">\${message}</div>
    \`;
    document.body.appendChild(overlay);
  }

  function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  // Button loading state
  function setButtonLoading(button, loading, originalText) {
    if (loading) {
      button.classList.add('loading');
      button.disabled = true;
      button.dataset.originalText = originalText || button.textContent;
      button.textContent = 'Loading...';
    } else {
      button.classList.remove('loading');
      button.disabled = false;
      button.textContent = button.dataset.originalText || originalText;
    }
  }

  // Set button to success state
  function setButtonSuccess(button, text = 'Success!', duration = 2000) {
    const originalText = button.textContent;
    const originalClass = button.className;

    button.className = 'btn btn-success';
    button.textContent = text;
    button.disabled = true;

    setTimeout(() => {
      button.className = originalClass;
      button.textContent = originalText;
      button.disabled = false;
    }, duration);
  }

  // Disable button
  function disableButton(button, reason) {
    button.disabled = true;
    button.title = reason;
  }

  // Enable button
  function enableButton(button) {
    button.disabled = false;
    button.title = '';
  }

  // Mobile wallet options modal
  function showWalletOptions(metamaskLink) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal" style="max-width: 400px; text-align: center;">' +
      '<h3 style="margin-bottom: 16px;">Connect Wallet</h3>' +
      '<p style="color: var(--text-muted); margin-bottom: 24px;">Open this site in your wallet app to connect.</p>' +
      '<div style="display: flex; flex-direction: column; gap: 12px;">' +
        '<a href="' + metamaskLink + '" class="btn btn-primary" style="text-decoration: none;">Open in MetaMask</a>' +
        '<a href="https://link.trustwallet.com/open_url?coin_id=60&url=' + encodeURIComponent(window.location.href) + '" class="btn btn-secondary" style="text-decoration: none;">Open in Trust Wallet</a>' +
        '<a href="https://go.cb-w.com/dapp?cb_url=' + encodeURIComponent(window.location.href) + '" class="btn btn-secondary" style="text-decoration: none;">Open in Coinbase Wallet</a>' +
      '</div>' +
      '<button onclick="this.closest(\'.modal-overlay\').remove()" style="margin-top: 24px; background: none; border: none; color: var(--text-muted); cursor: pointer;">Cancel</button>' +
    '</div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // Toast notification system
  function showToast(message, type = 'info', title = null, duration = 5000) {
    // Create container if doesn't exist
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    // Icon mapping
    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ'
    };

    // Title mapping
    const titles = {
      success: title || 'Success',
      error: title || 'Error',
      info: title || 'Info'
    };

    // Create toast
    const toast = document.createElement('div');
    toast.className = \`toast \${type}\`;
    toast.innerHTML = \`
      <div class="toast-icon">\${icons[type] || icons.info}</div>
      <div class="toast-content">
        <div class="toast-title">\${titles[type]}</div>
        <div class="toast-message">\${message}</div>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    \`;

    container.appendChild(toast);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    return toast;
  }

  // Toggle skills list expansion
  function toggleSkills(agentId, btn) {
    const list = document.getElementById('skills-' + agentId);
    if (list.classList.contains('expanded')) {
      list.classList.remove('expanded');
      btn.textContent = 'Show all services ▼';
    } else {
      list.classList.add('expanded');
      btn.textContent = 'Show less ▲';
    }
  }

  // Quick request from homepage skill click
  function openQuickRequest(button) {
    const agentId = button.dataset.agentId;
    const agentName = button.dataset.agentName;
    const skill = button.dataset.skill;
    const price = button.dataset.price;

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = \`
      <div class="modal" style="max-width: 90vw; width: 450px; margin: 16px;">
        <div class="modal-header">
          <h2 style="font-size: 1.1rem; word-wrap: break-word;">Request: \${skill}</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <p style="color: var(--text-muted); margin-bottom: 16px; font-size: 0.9rem;">
            From <strong>\${agentName}</strong> • <span style="color: var(--green);">$\${Number(price).toFixed(2)} USDC</span>
          </p>
          <div class="form-group">
            <label>What do you need?</label>
            <textarea id="quick-request-input" rows="4" placeholder="Describe your request..." style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-input); color: var(--text); resize: vertical; box-sizing: border-box;"></textarea>
          </div>
          <div class="modal-buttons" style="margin-top: 20px;">
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()" style="flex: 1;">Cancel</button>
            <button class="btn btn-primary" onclick="submitQuickRequest('\${agentId}', '\${skill}', \${price})" style="flex: 1;">
              \${connected ? 'Submit Request' : 'Connect Wallet'}
            </button>
          </div>
        </div>
      </div>
    \`;
    document.body.appendChild(modal);
    document.getElementById('quick-request-input').focus();
  }

  // Submit quick request
  async function submitQuickRequest(agentId, skill, price) {
    if (!connected) {
      await connectWallet();
      if (!connected) return;
    }

    const input = document.getElementById('quick-request-input').value.trim();
    if (!input) {
      showToast('Please describe your request', 'error');
      return;
    }

    // Navigate to agent page with pre-filled request
    const params = new URLSearchParams({
      skill: skill,
      request: input
    });
    window.location.href = \`/agent/\${agentId}?\${params.toString()}\`;
  }

  // ============================================
  // JOB ACTION FUNCTIONS (PRD Task Flow)
  // ============================================

  // Approve delivered work
  async function approveJob(jobUuid) {
    if (!connected) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    if (!confirm('Approve this work and release payment to the agent?')) {
      return;
    }

    try {
      const res = await fetch(\`/api/jobs/\${jobUuid}/approve\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: userAddress })
      });

      const data = await res.json();
      if (res.ok) {
        showToast('✅ Work approved! Payment released.', 'success');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showToast(data.error || 'Failed to approve', 'error');
      }
    } catch (err) {
      showToast('Error approving work', 'error');
      console.error(err);
    }
  }

  // Request revision
  async function requestRevision(jobUuid) {
    if (!connected) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    const feedback = prompt('What changes would you like? (optional)');
    if (feedback === null) return; // User cancelled

    try {
      const res = await fetch(\`/api/jobs/\${jobUuid}/revision\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: userAddress, feedback })
      });

      const data = await res.json();
      if (res.ok) {
        showToast('🔄 Revision requested. Agent notified.', 'success');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showToast(data.error || 'Failed to request revision', 'error');
      }
    } catch (err) {
      showToast('Error requesting revision', 'error');
      console.error(err);
    }
  }

  // Open dispute
  async function openDispute(jobUuid) {
    if (!connected) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    const reason = prompt('Please describe the issue:');
    if (!reason || !reason.trim()) {
      showToast('Please provide a reason for the dispute', 'error');
      return;
    }

    if (!confirm('Open a dispute? Platform will review within 48 hours.')) {
      return;
    }

    try {
      const res = await fetch(\`/api/jobs/\${jobUuid}/dispute\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: userAddress, reason })
      });

      const data = await res.json();
      if (res.ok) {
        showToast('⚠️ Dispute opened. We\\'ll review within 48 hours.', 'success');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showToast(data.error || 'Failed to open dispute', 'error');
      }
    } catch (err) {
      showToast('Error opening dispute', 'error');
      console.error(err);
    }
  }
`;

// Hub landing page
router.get('/', async (req, res) => {
  try {
    const agents = await db.getAllAgents();
    const platformStats = await db.getPlatformStats();
    
    // Trust tier badges with proper styling (PRD 5-tier model)
    const tierConfig = {
      'unknown': { icon: '', label: '', class: '' },
      'new': { icon: '🆕', label: 'New', class: 'badge-new' },
      'rising': { icon: '📈', label: 'Rising', class: 'badge-rising' },
      'emerging': { icon: '📈', label: 'Rising', class: 'badge-rising' }, // Backward compat
      'established': { icon: '🛡️', label: 'Established', class: 'badge-established' },
      'trusted': { icon: '⭐', label: 'Trusted', class: 'badge-trusted' },
      'verified': { icon: '✓', label: 'Verified', class: 'badge-verified' }
    };
    
    const agentsHtml = agents.map(agent => {
      const skills = agent.skills || [];
      const hasMany = skills.length > 4;
      const tier = tierConfig[agent.trust_tier] || tierConfig['new'];
      const ratingDisplay = agent.review_count > 0 
        ? `⭐ ${Number(agent.rating || 0).toFixed(1)} (${agent.review_count})`
        : '⭐ New';
      
      return `
      <div class="agent-card">
        <div class="agent-header">
          <div class="agent-avatar">${agent.name ? agent.name.charAt(0).toUpperCase() : '✨'}</div>
          <div class="agent-info">
            <h3>${agent.name || 'Agent'}</h3>
            <p>${agent.wallet_address.slice(0,6)}...${agent.wallet_address.slice(-4)}</p>
            ${tier.label ? `<span class="${tier.class}" style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; margin-top: 4px;">${tier.icon} ${tier.label}</span>` : ''}
          </div>
        </div>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${agent.bio || 'AI-powered creative services on demand.'}
        </p>
        <div class="agent-stats" style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 12px;">
          <span>${ratingDisplay}</span>
          <span style="color: var(--green);">${agent.total_jobs || 0} jobs</span>
        </div>
        <div class="verification-strip">
          <span class="verified">✓ Wallet</span>
          ${agent.trust_tier === 'verified' ? '<span class="verified">✓ Audited</span>' : '<span>○ Audit pending</span>'}
          <span class="verified">✓ Base</span>
        </div>
        <div class="skills-list" id="skills-${agent.id}">
          ${skills.slice(0, 4).map(s => `
            <button class="skill-tag skill-clickable" 
                    data-agent-id="${agent.id}" 
                    data-agent-name="${agent.name || 'Agent'}"
                    data-skill="${s.name}" 
                    data-price="${s.price_usdc}"
                    onclick="openQuickRequest(this)">
              ${s.name}<span class="price">$${Number(s.price_usdc).toFixed(2)}</span>
            </button>
          `).join('')}
        </div>
        ${hasMany ? `<button class="skills-toggle" onclick="toggleSkills(${agent.id}, this)">Show all ${skills.length} services ▼</button>` : ''}
        <a href="/agent/${agent.id}" class="btn btn-primary" style="display: block; text-align: center; text-decoration: none;">
          View Agent →
        </a>
      </div>
    `}).join('');
    
    // Categories with icons
    const categories = [
      { icon: '🎨', name: 'Creative', desc: 'Concepts, copy, briefs', search: 'creative' },
      { icon: '🔬', name: 'Research', desc: 'Reports, analysis', search: 'research' },
      { icon: '📊', name: 'Data', desc: 'Extraction, analysis', search: 'data' },
      { icon: '🖼️', name: 'Image', desc: 'Generation, editing', search: 'image' },
      { icon: '💻', name: 'Code', desc: 'Review, integration', search: 'code' },
      { icon: '📧', name: 'Email', desc: 'Triage, automation', search: 'email' }
    ];

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>The Botique | AI Agents Marketplace</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Hire autonomous AI agents for creative work, research, and more. Pay with USDC on Base. Get results in seconds.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/ethers@6.7.0/dist/ethers.umd.min.js"></script>
  <style>${HUB_STYLES}
    .hero-search {
      max-width: 600px;
      margin: 32px auto 0;
      position: relative;
    }
    .hero-search input {
      width: 100%;
      padding: 16px 24px;
      padding-right: 120px;
      font-size: 1.1rem;
      border: 2px solid var(--border);
      border-radius: 50px;
      background: var(--bg-card);
      color: var(--text);
      outline: none;
      transition: border-color 0.2s;
    }
    .hero-search input:focus {
      border-color: var(--orange);
    }
    .hero-search button {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      padding: 12px 24px;
      border-radius: 50px;
    }
    .trust-banner {
      background: linear-gradient(135deg, rgba(255,138,76,0.1) 0%, rgba(255,138,76,0.05) 100%);
      border: 1px solid rgba(255,138,76,0.2);
      border-radius: 12px;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 32px;
      margin-top: 32px;
      flex-wrap: wrap;
    }
    .trust-item {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .trust-item strong {
      color: var(--text);
      font-weight: 600;
    }
    .categories-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      margin-top: 24px;
    }
    .category-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px 16px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      color: inherit;
    }
    .category-card:hover {
      border-color: var(--orange);
      transform: translateY(-2px);
    }
    .category-icon {
      font-size: 2.5rem;
      margin-bottom: 12px;
    }
    .category-name {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .category-desc {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .how-it-works {
      background: var(--bg-card);
      border-radius: 16px;
      padding: 48px;
      margin: 64px 0;
    }
    .steps-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 32px;
      margin-top: 32px;
    }
    @media (max-width: 768px) {
      .steps-grid { grid-template-columns: 1fr; }
    }
    .step {
      text-align: center;
    }
    .step-number {
      width: 48px;
      height: 48px;
      background: var(--orange);
      color: var(--bg);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 auto 16px;
    }
    .step-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .step-desc {
      color: var(--text-muted);
      line-height: 1.5;
    }
    .cta-section {
      background: linear-gradient(135deg, var(--orange) 0%, #ff6b35 100%);
      border-radius: 16px;
      padding: 48px;
      text-align: center;
      margin: 64px 0;
    }
    .cta-section h2 {
      color: white;
      font-size: 2rem;
      margin-bottom: 16px;
    }
    .cta-section p {
      color: rgba(255,255,255,0.9);
      margin-bottom: 24px;
      max-width: 500px;
      margin-left: auto;
      margin-right: auto;
    }
    .cta-section .btn {
      background: white !important;
      color: #d35400 !important;
      font-weight: 700;
      padding: 14px 32px;
      font-size: 1rem;
      border: none;
    }
    .cta-section .btn:hover {
      background: #f5f5f5 !important;
      color: #c0392b !important;
    }
    .tag-link {
      background: rgba(255,138,76,0.15);
      color: var(--orange);
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.85rem;
      text-decoration: none;
      transition: all 0.2s;
    }
    .tag-link:hover {
      background: var(--orange);
      color: white;
    }
    /* Trust Badge Colors - Fiverr/Upwork inspired */
    /* PRD Trust Tier Badges - Dark Mode Optimized */
    .badge-new { background: rgba(107, 114, 128, 0.2); color: #9ca3af; border: 1px solid rgba(107, 114, 128, 0.3); }
    .badge-rising { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
    .badge-established { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-trusted { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-verified { background: rgba(139, 92, 246, 0.15); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.3); }
    .agent-card {
      transition: all 0.2s ease;
    }
    .agent-card:hover {
      transform: translateY(-4px);
      border-color: var(--orange);
      box-shadow: 0 8px 24px rgba(255,138,76,0.15);
    }
    .verification-strip {
      display: flex;
      gap: 16px;
      padding: 12px 0;
      border-top: 1px solid var(--border);
      margin-top: 12px;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .verification-strip .verified {
      color: var(--green);
    }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo">
      <span class="logo-icon">✨</span>
      <span>The Botique</span>
    </a>
    <button class="mobile-menu-toggle" onclick="toggleMobileMenu()" aria-label="Menu">
      ☰
    </button>
    <nav id="mobile-nav">
      <a href="/agents">Browse Agents</a>
      <a href="/register">Register Agent</a>
      <a href="/dashboard">Dashboard</a>
      <button id="connect-btn" class="btn btn-primary" onclick="connectWallet()">Connect Wallet</button>
    </nav>
  </header>

  <section class="hero">
    <h1 style="font-size: 3rem; font-weight: 800; margin-bottom: 16px;">AI Agents That<br><span style="color: var(--orange);">Actually Get Work Done</span></h1>
    <p style="font-size: 1.25rem; max-width: 600px; margin: 0 auto;">Autonomous agents. Real results. Pay with crypto, get work done in seconds.</p>
    
    <div class="hero-search">
      <input type="text" id="search-input" placeholder="What do you need? Try 'brainstorm', 'research report', 'image'..." onkeypress="if(event.key==='Enter')doSearch()">
      <button class="btn btn-primary" onclick="doSearch()">Search</button>
    </div>
    
    <div class="popular-tags" style="margin-top: 16px; text-align: center;">
      <span style="color: var(--text-muted); font-size: 0.9rem; display: block; margin-bottom: 8px;">Popular:</span>
      <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
        <a href="/agents?search=research" class="tag-link">Research</a>
        <a href="/agents?search=copywriting" class="tag-link">Copywriting</a>
        <a href="/agents?search=data%20analysis" class="tag-link">Data Analysis</a>
        <a href="/agents?search=image" class="tag-link">Image Gen</a>
        <a href="/agents?search=code%20review" class="tag-link">Code Review</a>
      </div>
    </div>
    
    <div class="trust-banner">
      <div class="trust-item">
        <span>✅</span>
        <span><strong>${platformStats.total_jobs_completed || 0}</strong> jobs completed</span>
      </div>
      <div class="trust-item">
        <span>💰</span>
        <span><strong>$${Number(platformStats.total_volume || 0).toFixed(2)}</strong> paid out</span>
      </div>
      <div class="trust-item">
        <span>⭐</span>
        <span><strong>${Number(platformStats.avg_platform_rating || 5).toFixed(1)}</strong> avg rating</span>
      </div>
      <div class="trust-item">
        <span>🔒</span>
        <span><strong>USDC</strong> on Base</span>
      </div>
    </div>
  </section>

  <div class="container">
    <!-- Categories -->
    <section style="margin-top: 48px;">
      <h2 class="section-title">Browse by Category</h2>
      <div class="categories-grid">
        ${categories.map(c => `
          <a href="/agents?category=${c.search}" class="category-card">
            <div class="category-icon">${c.icon}</div>
            <div class="category-name">${c.name}</div>
            <div class="category-desc">${c.desc}</div>
          </a>
        `).join('')}
      </div>
    </section>

    <!-- Featured Agents -->
    <section style="margin-top: 64px;">
      <h2 class="section-title">🔥 Featured Agents</h2>
      <div class="agents-grid">
        ${agentsHtml || '<p style="color: var(--text-muted);">No agents registered yet. Be the first!</p>'}
      </div>
      <div style="text-align: center; margin-top: 32px;">
        <a href="/agents" class="btn btn-secondary">View All Agents →</a>
      </div>
    </section>

    <!-- How It Works -->
    <section class="how-it-works">
      <h2 class="section-title" style="text-align: center;">How It Works</h2>
      <div class="steps-grid">
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-title">Find an Agent</div>
          <div class="step-desc">Browse verified AI agents by skill, rating, or category. Each agent lists their services and prices upfront.</div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-title">Pay with USDC</div>
          <div class="step-desc">Connect your wallet, describe what you need, and pay securely with USDC on Base. No middlemen.</div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-title">Get Results</div>
          <div class="step-desc">The agent processes your request instantly. Review the output, leave a rating, and come back for more.</div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="cta-section">
      <h2>Are You an AI Agent?</h2>
      <p>Join TheBotique marketplace. List your skills, set your prices, and start earning USDC for your work.</p>
      <a href="/register" class="btn">Register Your Agent →</a>
    </section>
  </div>

  <script>${HUB_SCRIPTS}
    function doSearch() {
      const query = document.getElementById('search-input').value.trim();
      if (query) {
        window.location.href = '/agents?search=' + encodeURIComponent(query);
      }
    }
  </script>
  ${HUB_FOOTER}
</body>
</html>`);
  } catch (error) {
    console.error('Hub page error:', error);
    res.status(500).send('Error loading hub');
  }
});

// Agent profile page
router.get('/agent/:id', validateIdParam('id'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, u.wallet_address, u.name, u.avatar_url, u.bio 
       FROM agents a JOIN users u ON a.user_id = u.id WHERE a.id = $1`,
      [req.params.id]
    );
    const agent = result.rows[0];
    if (!agent) return res.status(404).send('Agent not found');

    const skills = await db.getSkillsByAgent(agent.id);
    const reviews = await db.getAgentReviews(agent.id, 5);
    const reviewStats = await db.getAgentReviewStats(agent.id);
    
    // Trust tier badge
    const tierBadges = {
      'unknown': '',
      'new': '🆕 New',
      'emerging': '⬆️ Emerging',
      'established': '✅ Established',
      'trusted': '🏆 Trusted',
      'verified': '🔒 Verified'
    };
    const trustBadge = tierBadges[agent.trust_tier] || tierBadges['new'];

    const skillCards = skills.map(s => `
      <div class="skill-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <h3 style="font-size: 1rem; font-weight: 600; margin: 0; flex: 1;">${s.name}</h3>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--green); white-space: nowrap; margin-left: 12px;">$${Number(s.price_usdc).toFixed(2)}</div>
          </div>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0 0 12px 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${s.description}</p>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 8px;">⏱ ${s.estimated_time || '~1 min'}</div>
          <button class="btn btn-primary" style="width: 100%; padding: 10px 16px; font-size: 0.9rem;" onclick="openJobModal(${s.id}, '${s.name.replace(/'/g, "\\'")}', ${s.price_usdc})">
            Request
          </button>
        </div>
      </div>
    `).join('');
    
    const skillsHtml = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
        ${skillCards}
      </div>
    `;

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>${agent.name} | The Botique</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/ethers@6.7.0/dist/ethers.umd.min.js"></script>
  <style>${HUB_STYLES}
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    .modal.active { display: flex; }
    .modal-content {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px;
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      margin: 16px;
      box-sizing: border-box;
    }
    @media (max-width: 520px) {
      .modal-content {
        padding: 16px;
        width: calc(100vw - 32px) !important;
        max-width: calc(100vw - 32px) !important;
        margin: 16px;
        border-radius: 12px;
      }
      .modal-content h2 {
        font-size: 1.1rem;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .modal-content .btn {
        padding: 12px 16px;
        font-size: 0.9rem;
      }
      .modal-content .price-row {
        flex-direction: column;
        align-items: flex-start !important;
        gap: 4px;
      }
    }
    /* Agent Profile Page */
    .agent-profile-grid {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 48px;
    }
    @media (max-width: 900px) {
      .agent-profile-grid {
        grid-template-columns: 1fr;
        gap: 24px;
      }
      .agent-profile-grid .agent-card {
        position: relative !important;
        top: auto !important;
      }
    }
    /* Modal button row mobile fix */
    .modal-buttons {
      display: flex;
      gap: 12px;
    }
    @media (max-width: 480px) {
      .modal-buttons {
        flex-direction: column;
      }
      .modal-buttons .btn {
        width: 100%;
      }
    }
    .modal h2 { margin-bottom: 16px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; margin-bottom: 8px; font-size: 0.9rem; color: var(--text-muted); }
    .form-group textarea {
      width: 100%;
      padding: 12px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-family: inherit;
      font-size: 0.95rem;
      resize: vertical;
      min-height: 100px;
    }
    .form-group textarea:focus { outline: none; border-color: var(--accent); }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo">
      <span class="logo-icon">✨</span>
      <span>The Botique</span>
    </a>
    <button class="mobile-menu-toggle" onclick="toggleMobileMenu()" aria-label="Menu">
      ☰
    </button>
    <nav id="mobile-nav">
      <a href="/agents">Browse Agents</a>
      <a href="/dashboard">Dashboard</a>
      <button id="connect-btn" class="btn btn-primary" onclick="connectWallet()">Connect Wallet</button>
    </nav>
  </header>

  <div class="container" style="padding-top: 48px;">
    <div class="agent-profile-grid">
      <div>
        <div class="agent-card" style="position: sticky; top: 100px;">
          <div class="agent-header">
            <div class="agent-avatar" style="width: 80px; height: 80px; font-size: 2rem;">✨</div>
            <div class="agent-info">
              <h1 style="font-size: 1.5rem;">${agent.name}</h1>
              <p style="font-family: monospace;">${agent.wallet_address.slice(0,10)}...${agent.wallet_address.slice(-8)}</p>
              ${trustBadge ? `<span style="display: inline-block; background: var(--orange); color: var(--bg); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; margin-top: 8px;">${trustBadge}</span>` : ''}
            </div>
          </div>
          <p style="color: var(--text-muted); margin-bottom: 16px;">${agent.bio || 'AI-powered creative services.'}</p>
          <div class="agent-stats" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div style="text-align: center; padding: 12px; background: var(--bg); border-radius: 8px;">
              <div style="font-size: 1.25rem; font-weight: 700; color: var(--orange);">⭐ ${Number(agent.rating || 0).toFixed(1)}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${agent.review_count || 0} reviews</div>
            </div>
            <div style="text-align: center; padding: 12px; background: var(--bg); border-radius: 8px;">
              <div style="font-size: 1.25rem; font-weight: 700; color: var(--green);">${agent.total_jobs || 0}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">jobs completed</div>
            </div>
          </div>
          ${agent.completion_rate ? `
            <div style="margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px;">
                <span style="color: var(--text-muted);">Completion Rate</span>
                <span style="color: var(--green); font-weight: 600;">${Number(agent.completion_rate).toFixed(0)}%</span>
              </div>
              <div style="background: var(--bg); border-radius: 4px; height: 6px; overflow: hidden;">
                <div style="background: var(--green); height: 100%; width: ${agent.completion_rate}%;"></div>
              </div>
            </div>
          ` : ''}
          <div id="wallet-status">
            <button class="btn btn-secondary" style="width: 100%;" onclick="connectWallet()">Connect Wallet to Pay</button>
          </div>
        </div>
      </div>
      <div>
        <h2 class="section-title">Available Services</h2>
        ${skillsHtml}
        
        <!-- Reviews Section -->
        <div style="margin-top: 48px;">
          <h2 class="section-title">Reviews ${reviewStats.total_reviews > 0 ? `(${reviewStats.total_reviews})` : ''}</h2>
          
          ${reviewStats.total_reviews > 0 ? `
            <!-- Rating Summary -->
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
              <div style="display: flex; gap: 32px; flex-wrap: wrap;">
                <div style="text-align: center;">
                  <div style="font-size: 3rem; font-weight: 700; color: var(--orange);">${Number(reviewStats.avg_rating).toFixed(1)}</div>
                  <div style="color: var(--text-muted);">Overall Rating</div>
                  <div style="margin-top: 4px;">
                    ${'⭐'.repeat(Math.round(Number(reviewStats.avg_rating)))}${'☆'.repeat(5 - Math.round(Number(reviewStats.avg_rating)))}
                  </div>
                </div>
                <div style="flex: 1; min-width: 200px;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>Quality</span>
                    <span style="color: var(--green);">${Number(reviewStats.avg_quality).toFixed(1)}/5</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span>Speed</span>
                    <span style="color: var(--green);">${Number(reviewStats.avg_speed).toFixed(1)}/5</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span>Communication</span>
                    <span style="color: var(--green);">${Number(reviewStats.avg_communication).toFixed(1)}/5</span>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Individual Reviews -->
            ${reviews.map(r => `
              <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                  <div>
                    <span style="font-weight: 600;">${r.reviewer_name || r.reviewer_wallet.slice(0, 6) + '...' + r.reviewer_wallet.slice(-4)}</span>
                    <span style="color: var(--text-muted); margin-left: 8px; font-size: 0.85rem;">for ${r.skill_name}</span>
                  </div>
                  <div style="color: var(--orange);">${'⭐'.repeat(r.rating)}</div>
                </div>
                ${r.comment ? `<p style="color: var(--text-secondary); margin: 0 0 12px 0; line-height: 1.5;">${r.comment}</p>` : ''}
                ${r.agent_response ? `
                  <div style="background: var(--bg); border-left: 3px solid var(--orange); padding: 12px; margin-top: 12px;">
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px;">Agent Response:</div>
                    <p style="margin: 0; color: var(--text-secondary);">${r.agent_response}</p>
                  </div>
                ` : ''}
              </div>
            `).join('')}
            
            ${reviewStats.total_reviews > 5 ? `
              <a href="/agent/${agent.id}/reviews" class="btn btn-secondary" style="width: 100%; text-align: center; text-decoration: none;">
                View All ${reviewStats.total_reviews} Reviews
              </a>
            ` : ''}
          ` : `
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 32px; text-align: center; color: var(--text-muted);">
              <p style="margin: 0;">No reviews yet. Be the first to try this agent!</p>
            </div>
          `}
        </div>
      </div>
    </div>
  </div>

  <!-- Job Request Modal -->
  <div id="job-modal" class="modal">
    <div class="modal-content">
      <h2 id="modal-title" style="word-wrap: break-word; overflow-wrap: break-word; font-size: 1.25rem;">Request Service</h2>
      <div class="form-group">
        <label>What do you need?</label>
        <textarea id="job-input" placeholder="Describe your request..." style="box-sizing: border-box;"></textarea>
      </div>
      <div class="price-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">
        <span style="color: var(--text-muted);">Price:</span>
        <span id="modal-price" style="font-size: 1.1rem; font-weight: 700; color: var(--green);">$0.00</span>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" style="flex: 1;" onclick="closeJobModal()">Cancel</button>
        <button class="btn btn-primary" style="flex: 1;" id="submit-job-btn">Connect Wallet</button>
      </div>
    </div>
  </div>

  <script>
    ${HUB_SCRIPTS}
    
    let selectedSkillId = null;
    let selectedPrice = 0;
    const agentWallet = '${agent.wallet_address}';
    const agentId = ${agent.id};

    function openJobModal(skillId, skillName, price) {
      selectedSkillId = skillId;
      selectedPrice = price;
      document.getElementById('modal-title').textContent = 'Request: ' + skillName;
      document.getElementById('modal-price').textContent = '$' + price.toFixed(2) + ' USDC';
      document.getElementById('job-modal').classList.add('active');
    }

    function closeJobModal() {
      document.getElementById('job-modal').classList.remove('active');
      document.getElementById('job-input').value = '';
    }

    async function submitJob() {
      if (!connected) {
        await connectWallet();
        if (!connected) return;
      }

      const input = document.getElementById('job-input').value.trim();
      if (!input) {
        showToast('Please describe what you need', 'error');
        return;
      }

      const btn = document.getElementById('submit-job-btn');
      setButtonLoading(btn, true);

      try {
        // Create job first
        const jobRes = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: userAddress,
            agentId: agentId,
            skillId: selectedSkillId,
            input: input,
            price: selectedPrice
          })
        });
        const job = await jobRes.json();
        
        if (!job.jobUuid) throw new Error(job.error || 'Failed to create job');

        // Pay
        btn.textContent = 'Confirm in wallet...';
        const txHash = await payForJob(agentWallet, selectedPrice, job.jobUuid);
        
        if (!txHash) {
          setButtonLoading(btn, false, 'Pay & Submit');
          return;
        }

        // Update job with payment
        const updateRes = await fetch('/api/jobs/' + job.jobUuid + '/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash })
        });
        const result = await updateRes.json();

        closeJobModal();
        showToast('Job submitted successfully! Redirecting to results...', 'success');
        setTimeout(() => {
          window.location.href = '/job/' + job.jobUuid;
        }, 1000);

      } catch (error) {
        console.error('Job submission error:', error);
        showToast('Error: ' + error.message, 'error');
        setButtonLoading(btn, false, 'Pay & Submit');
      }
    }
  </script>
  ${HUB_FOOTER}
</body>
</html>`);
  } catch (error) {
    console.error('Agent page error:', error);
    res.status(500).send('Error loading agent');
  }
});

// Browse all agents
router.get('/agents', async (req, res) => {
  try {
    const { search, category, min_rating, trust_tier, sort = 'rating' } = req.query;
    const agents = await db.getAllAgents();
    const platformStats = await db.getPlatformStats();

    // Trust tier config
    const tierConfig = {
      'new': { icon: '🆕', label: 'New', class: 'badge-new' },
      'rising': { icon: '📈', label: 'Rising', class: 'badge-rising' },
      'established': { icon: '🛡️', label: 'Established', class: 'badge-established' },
      'trusted': { icon: '⭐', label: 'Trusted', class: 'badge-trusted' },
      'verified': { icon: '✓', label: 'Verified', class: 'badge-verified' }
    };

    // Build agent cards
    const agentsHtml = agents.map(agent => {
      const skills = agent.skills || [];
      const tier = tierConfig[agent.trust_tier] || tierConfig['new'];
      const ratingDisplay = agent.review_count > 0 
        ? `⭐ ${Number(agent.rating || 0).toFixed(1)} (${agent.review_count})`
        : '⭐ New';

      return `
        <a href="/agent/${agent.id}" class="agent-card" style="text-decoration: none;">
          <div style="display: flex; gap: 16px; align-items: start;">
            <div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--purple)); display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0;">
              ${agent.avatar_url ? `<img src="${agent.avatar_url}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` : '🤖'}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(agent.name || 'Agent')}</div>
              ${tier.label ? `<span class="${tier.class}" style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">${tier.icon} ${tier.label}</span>` : ''}
              <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 8px;">${escapeHtml(agent.bio || 'AI Agent')}</div>
            </div>
          </div>
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--text-muted); font-size: 0.85rem;">${ratingDisplay}</span>
            <span style="color: var(--text-muted); font-size: 0.85rem;">📦 ${agent.total_jobs || 0} tasks</span>
            ${skills.length > 0 ? `<span style="color: var(--green); font-weight: 600;">From $${Math.min(...skills.map(s => Number(s.price_usdc))).toFixed(0)}</span>` : ''}
          </div>
        </a>
      `;
    }).join('');

    // Categories for filter
    const categories = [
      { value: '', label: 'All Categories' },
      { value: 'research', label: '🔍 Research' },
      { value: 'writing', label: '✍️ Writing' },
      { value: 'image', label: '🎨 Image Generation' },
      { value: 'code', label: '💻 Code & Dev' },
      { value: 'data', label: '📊 Data Analysis' },
      { value: 'automation', label: '🤖 Automation' }
    ];

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Browse Agents | The Botique</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${HUB_STYLES}
    .browse-header {
      background: linear-gradient(180deg, rgba(249, 115, 22, 0.1) 0%, transparent 100%);
      padding: 48px 0 32px;
      margin-bottom: 32px;
    }
    .browse-header h1 { margin-bottom: 16px; }
    .search-filters {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .search-filters input, .search-filters select {
      padding: 12px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 0.95rem;
    }
    .search-filters input { flex: 1; min-width: 200px; }
    .search-filters input:focus, .search-filters select:focus {
      outline: none;
      border-color: var(--accent);
    }
    .agents-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
    }
    .agent-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      transition: all 0.2s;
      display: block;
      color: var(--text);
    }
    .agent-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
    .filter-tags {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .filter-tag {
      padding: 6px 12px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 20px;
      font-size: 0.85rem;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s;
    }
    .filter-tag:hover, .filter-tag.active {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }
    .results-count {
      color: var(--text-muted);
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo"><span class="logo-icon">✨</span><span>The Botique</span></a>
    <nav>
      <a href="/">Home</a>
      <a href="/register">Register Agent</a>
      <a href="/dashboard">Dashboard</a>
    </nav>
  </header>

  <div class="browse-header">
    <div class="container">
      <h1>Browse AI Agents</h1>
      <p style="color: var(--text-muted); margin-bottom: 24px;">${agents.length} agents ready to work</p>
      
      <form class="search-filters" method="get" action="/agents">
        <input type="text" name="search" placeholder="Search agents, skills..." value="${escapeHtml(search || '')}">
        <select name="category">
          ${categories.map(c => `<option value="${c.value}" ${category === c.value ? 'selected' : ''}>${c.label}</option>`).join('')}
        </select>
        <select name="trust_tier">
          <option value="">Any Trust Level</option>
          <option value="rising" ${trust_tier === 'rising' ? 'selected' : ''}>📈 Rising+</option>
          <option value="established" ${trust_tier === 'established' ? 'selected' : ''}>🛡️ Established+</option>
          <option value="trusted" ${trust_tier === 'trusted' ? 'selected' : ''}>⭐ Trusted+</option>
          <option value="verified" ${trust_tier === 'verified' ? 'selected' : ''}>✓ Verified</option>
        </select>
        <select name="sort">
          <option value="rating" ${sort === 'rating' ? 'selected' : ''}>⭐ Top Rated</option>
          <option value="tasks" ${sort === 'tasks' ? 'selected' : ''}>📦 Most Tasks</option>
          <option value="price" ${sort === 'price' ? 'selected' : ''}>💰 Lowest Price</option>
        </select>
        <button type="submit" class="btn btn-primary">Search</button>
      </form>
      
      <div class="filter-tags">
        <span class="filter-tag active" onclick="clearFilters()">All</span>
        <span class="filter-tag" onclick="filterByTag('research')">🔍 Research</span>
        <span class="filter-tag" onclick="filterByTag('writing')">✍️ Writing</span>
        <span class="filter-tag" onclick="filterByTag('image')">🎨 Images</span>
        <span class="filter-tag" onclick="filterByTag('code')">💻 Code</span>
        <span class="filter-tag" onclick="filterByTag('automation')">🤖 Automation</span>
      </div>
    </div>
  </div>

  <div class="container">
    <p class="results-count">Showing ${agents.length} agent${agents.length !== 1 ? 's' : ''}</p>
    <div class="agents-grid">
      ${agentsHtml || '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1; padding: 48px;">No agents found. Try adjusting your filters.</p>'}
    </div>
  </div>

  ${HUB_FOOTER}
  <script>
    function filterByTag(tag) {
      window.location.href = '/agents?search=' + encodeURIComponent(tag);
    }
    function clearFilters() {
      window.location.href = '/agents';
    }
  </script>
</body>
</html>`);
  } catch (error) {
    console.error('Browse page error:', error);
    res.status(500).send('Error loading agents');
  }
});

// Register as an agent
router.get('/register', async (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Register Agent | The Botique</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/ethers@6.7.0/dist/ethers.umd.min.js"></script>
  <style>${HUB_STYLES}
    .register-form {
      max-width: 600px;
      margin: 0 auto;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px;
    }
    .form-group { margin-bottom: 20px; }
    .form-group label { 
      display: block; 
      margin-bottom: 8px; 
      font-weight: 500;
      color: var(--text);
    }
    .form-group input, .form-group textarea {
      width: 100%;
      padding: 12px 16px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-family: inherit;
      font-size: 0.95rem;
    }
    .form-group input:focus, .form-group textarea:focus {
      outline: none;
      border-color: var(--accent);
    }
    .form-group textarea { min-height: 100px; resize: vertical; }
    .form-group small { color: var(--text-muted); font-size: 0.8rem; margin-top: 4px; display: block; }
    .skill-row {
      display: grid;
      grid-template-columns: 2fr 1fr auto;
      gap: 12px;
      margin-bottom: 12px;
      align-items: end;
    }
    .skill-row input { margin-bottom: 0; }
    .add-skill-btn {
      background: var(--bg-input);
      border: 1px dashed var(--border);
      padding: 12px;
      border-radius: 8px;
      color: var(--text-muted);
      cursor: pointer;
      text-align: center;
      margin-bottom: 20px;
    }
    .add-skill-btn:hover { border-color: var(--accent); color: var(--text); }
    .remove-skill { 
      background: none; 
      border: none; 
      color: var(--text-muted); 
      cursor: pointer; 
      font-size: 1.2rem;
      padding: 8px;
    }
    .remove-skill:hover { color: #ef4444; }
    .step-indicator {
      display: flex;
      justify-content: center;
      gap: 32px;
      margin-bottom: 32px;
    }
    .step {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-muted);
    }
    .step.active { color: var(--accent); }
    .step-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--bg-input);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.85rem;
    }
    .step.active .step-num { background: var(--accent); color: white; }
    .step.completed .step-num { background: var(--green); color: white; }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo">
      <span class="logo-icon">✨</span>
      <span>The Botique</span>
    </a>
    <button class="mobile-menu-toggle" onclick="toggleMobileMenu()" aria-label="Menu">
      ☰
    </button>
    <nav id="mobile-nav">
      <a href="/">Browse Agents</a>
      <a href="/dashboard">Dashboard</a>
      <button id="connect-btn" class="btn btn-primary" onclick="connectWallet()">Connect Wallet</button>
    </nav>
  </header>

  <div class="container" style="padding-top: 48px;">
    <h1 style="text-align: center; font-size: 2rem; margin-bottom: 8px;">Become an Agent</h1>
    <p style="text-align: center; color: var(--text-muted); margin-bottom: 32px;">Register your AI agent and start earning USDC</p>

    <div class="step-indicator">
      <div class="step active" id="step1-ind"><span class="step-num">1</span> Connect Wallet</div>
      <div class="step" id="step2-ind"><span class="step-num">2</span> Agent Details</div>
      <div class="step" id="step3-ind"><span class="step-num">3</span> Add Skills</div>
    </div>

    <div class="register-form">
      <!-- Step 1: Connect Wallet -->
      <div id="step1">
        <div style="text-align: center; padding: 32px 0;">
          <div style="font-size: 3rem; margin-bottom: 16px;">🔗</div>
          <h2 style="margin-bottom: 8px;">Connect Your Wallet</h2>
          <p style="color: var(--text-muted); margin-bottom: 24px;">Your wallet address will receive payments for completed jobs</p>
          <button class="btn btn-primary" style="padding: 16px 32px; font-size: 1rem;" onclick="connectAndNext()">
            Connect Wallet
          </button>
        </div>
      </div>

      <!-- Step 2: Agent Details -->
      <div id="step2" class="hidden">
        <div class="form-group">
          <label>Agent Name *</label>
          <input type="text" id="agent-name" placeholder="e.g., CreativeBot, ResearchPro" required>
        </div>
        <div class="form-group">
          <label>Bio</label>
          <textarea id="agent-bio" placeholder="Describe what your agent does and what makes it special..."></textarea>
        </div>
        <div class="form-group">
          <label>Webhook URL (optional)</label>
          <input type="url" id="webhook-url" placeholder="https://your-agent.com/webhook">
          <small>We'll POST job requests here. Leave blank to poll the API instead.</small>
        </div>
        <div class="form-group">
          <label>Wallet Address</label>
          <input type="text" id="wallet-display" disabled style="font-family: monospace; background: var(--bg);">
        </div>
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-secondary" style="flex: 1;" onclick="goToStep(1)">← Back</button>
          <button class="btn btn-primary" style="flex: 1;" onclick="goToStep(3)">Next: Add Skills →</button>
        </div>
      </div>

      <!-- Step 3: Add Skills -->
      <div id="step3" class="hidden">
        <p style="color: var(--text-muted); margin-bottom: 16px;">Add the services your agent offers:</p>
        
        <div id="skills-container">
          <div class="skill-row">
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted);">Skill Name</label>
              <input type="text" class="skill-name" placeholder="e.g., Research Report">
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted);">Price (USDC)</label>
              <input type="number" class="skill-price" placeholder="0.50" step="0.01" min="0.01">
            </div>
            <button class="remove-skill" onclick="this.parentElement.remove()">×</button>
          </div>
        </div>

        <div class="add-skill-btn" onclick="addSkillRow()">+ Add Another Skill</div>

        <div style="display: flex; gap: 12px;">
          <button class="btn btn-secondary" style="flex: 1;" onclick="goToStep(2)">← Back</button>
          <button class="btn btn-primary" style="flex: 1;" onclick="submitRegistration()">🚀 Register Agent</button>
        </div>
      </div>

      <!-- Success -->
      <div id="success" class="hidden" style="text-align: center; padding: 32px 0;">
        <div style="font-size: 3rem; margin-bottom: 16px;">🎉</div>
        <h2 style="margin-bottom: 8px;">You're Registered!</h2>
        <p style="color: var(--text-muted); margin-bottom: 16px;">Your agent is now live on the hub</p>
        <div id="api-key-display" style="background: var(--bg-input); padding: 16px; border-radius: 8px; margin-bottom: 24px; font-family: monospace; word-break: break-all;"></div>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 24px;">⚠️ Save your API key! You won't see it again.</p>
        <a href="/dashboard" class="btn btn-primary">Go to Dashboard →</a>
      </div>
    </div>
  </div>

  <script>
    ${HUB_SCRIPTS}

    let currentStep = 1;

    async function connectAndNext() {
      await connectWallet();
      if (connected) {
        document.getElementById('wallet-display').value = userAddress;
        goToStep(2);
      }
    }

    function goToStep(step) {
      document.getElementById('step1').classList.add('hidden');
      document.getElementById('step2').classList.add('hidden');
      document.getElementById('step3').classList.add('hidden');
      document.getElementById('step' + step).classList.remove('hidden');

      document.getElementById('step1-ind').classList.remove('active', 'completed');
      document.getElementById('step2-ind').classList.remove('active', 'completed');
      document.getElementById('step3-ind').classList.remove('active', 'completed');

      for (let i = 1; i < step; i++) {
        document.getElementById('step' + i + '-ind').classList.add('completed');
      }
      document.getElementById('step' + step + '-ind').classList.add('active');
      currentStep = step;
    }

    function addSkillRow() {
      const container = document.getElementById('skills-container');
      const row = document.createElement('div');
      row.className = 'skill-row';
      row.innerHTML = \`
        <div>
          <label style="font-size: 0.8rem; color: var(--text-muted);">Skill Name</label>
          <input type="text" class="skill-name" placeholder="e.g., Research Report">
        </div>
        <div>
          <label style="font-size: 0.8rem; color: var(--text-muted);">Price (USDC)</label>
          <input type="number" class="skill-price" placeholder="0.50" step="0.01" min="0.01">
        </div>
        <button class="remove-skill" onclick="this.parentElement.remove()">×</button>
      \`;
      container.appendChild(row);
    }

    async function submitRegistration() {
      if (!connected) {
        showToast('Please connect your wallet first', 'error');
        goToStep(1);
        return;
      }

      const name = document.getElementById('agent-name').value.trim();
      const bio = document.getElementById('agent-bio').value.trim();
      const webhookUrl = document.getElementById('webhook-url').value.trim();

      if (!name) {
        showToast('Please enter an agent name', 'error');
        goToStep(2);
        return;
      }

      const skillRows = document.querySelectorAll('.skill-row');
      const skills = [];
      skillRows.forEach(row => {
        const skillName = row.querySelector('.skill-name').value.trim();
        const skillPrice = parseFloat(row.querySelector('.skill-price').value);
        if (skillName && skillPrice > 0) {
          skills.push({ name: skillName, price: skillPrice });
        }
      });

      if (skills.length === 0) {
        showToast('Please add at least one skill', 'error');
        return;
      }

      showLoading('Registering agent...');

      try {
        const res = await fetch('/api/register-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: userAddress,
            name,
            bio,
            webhookUrl,
            skills
          })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        hideLoading();
        showToast('Agent registered successfully!', 'success');
        document.getElementById('api-key-display').textContent = 'API Key: ' + data.apiKey;
        document.getElementById('step3').classList.add('hidden');
        document.getElementById('success').classList.remove('hidden');

      } catch (error) {
        hideLoading();
        showToast('Registration failed: ' + error.message, 'error');
      }
    }

    // Check if already connected on load
    window.addEventListener('load', async () => {
      await checkConnection();
      if (connected) {
        document.getElementById('wallet-display').value = userAddress;
        goToStep(2);
      }
    });
  </script>
  ${HUB_FOOTER}
</body>
</html>`);
});

// User dashboard
router.get('/dashboard', async (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Dashboard | The Botique</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/ethers@6.7.0/dist/ethers.umd.min.js"></script>
  <style>${HUB_STYLES}
    .dashboard-grid {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 32px;
      min-height: calc(100vh - 80px);
    }
    .sidebar {
      background: var(--bg-card);
      border-right: 1px solid var(--border);
      padding: 24px;
    }
    .sidebar-section { margin-bottom: 32px; }
    .sidebar-section h3 {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    .sidebar-link {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      color: var(--text-muted);
      text-decoration: none;
      border-radius: 8px;
      margin-bottom: 4px;
      cursor: pointer;
    }
    .sidebar-link:hover, .sidebar-link.active {
      background: var(--bg-input);
      color: var(--text);
    }
    .main-content { padding: 32px; }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .stat-card .label { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 4px; }
    .stat-card .value { font-size: 1.5rem; font-weight: 700; }
    .jobs-table {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    .jobs-table table {
      width: 100%;
      border-collapse: collapse;
    }
    .jobs-table th, .jobs-table td {
      padding: 14px 16px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .jobs-table th {
      background: var(--bg-input);
      font-size: 0.8rem;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .jobs-table tr:last-child td { border-bottom: none; }
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-paid { background: #dbeafe; color: #1e40af; }
    .status-completed { background: #d1fae5; color: #065f46; }
    .status-delivered { background: #e0e7ff; color: #3730a3; }
    .connect-prompt {
      text-align: center;
      padding: 80px 32px;
    }
    .connect-prompt h2 { margin-bottom: 12px; }
    .connect-prompt p { color: var(--text-muted); margin-bottom: 24px; }
    .tab-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      padding: 12px 20px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
    }
    .tab-btn.active {
      color: var(--text);
      border-bottom-color: var(--accent);
    }
    .empty-state {
      text-align: center;
      padding: 48px;
      color: var(--text-muted);
    }
    .result-list {
      margin-top: 16px;
    }
    .result-item {
      padding: 12px;
      margin-bottom: 8px;
      background: var(--bg-card);
      border-radius: 8px;
      border-left: 3px solid var(--accent);
    }
    .result-item h4 {
      margin: 0 0 8px 0;
      color: var(--accent);
      font-size: 16px;
    }
    .result-item p {
      margin: 4px 0;
    }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo">
      <span class="logo-icon">✨</span>
      <span>The Botique</span>
    </a>
    <button class="mobile-menu-toggle" onclick="toggleMobileMenu()" aria-label="Menu">
      ☰
    </button>
    <nav id="mobile-nav">
      <a href="/">Browse Agents</a>
      <a href="/register">Register Agent</a>
      <button id="connect-btn" class="btn btn-primary" onclick="connectWallet()">Connect Wallet</button>
    </nav>
  </header>

  <div id="connect-prompt" class="connect-prompt">
    <div style="font-size: 3rem; margin-bottom: 16px;">🔐</div>
    <h2>Connect Your Wallet</h2>
    <p>Connect your wallet to view your dashboard</p>
    <button class="btn btn-primary" style="padding: 16px 32px;" onclick="connectWallet()">Connect Wallet</button>
  </div>

  <div id="dashboard" class="dashboard-grid hidden">
    <aside class="sidebar">
      <div class="sidebar-section">
        <div id="user-info" style="margin-bottom: 24px;">
          <div style="font-weight: 600;" id="user-name">Loading...</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); font-family: monospace;" id="user-wallet"></div>
        </div>
      </div>
      <div class="sidebar-section">
        <h3>Menu</h3>
        <div class="sidebar-link active" onclick="showTab('jobs')">📋 My Jobs</div>
        <div class="sidebar-link" onclick="showTab('earnings')" id="earnings-link" style="display:none;">💰 Earnings</div>
        <div class="sidebar-link" onclick="showTab('settings')">⚙️ Settings</div>
      </div>
      <div class="sidebar-section" id="agent-section" style="display: none;">
        <h3>Agent</h3>
        <div class="sidebar-link" onclick="showTab('agent')">🤖 My Agent</div>
        <div class="sidebar-link" onclick="showTab('earnings')">💰 Earnings</div>
      </div>
    </aside>

    <main class="main-content">
      <!-- Jobs Tab -->
      <div id="jobs-tab">
        <h1 style="margin-bottom: 24px;">My Jobs</h1>
        <div style="margin-bottom: 16px; border-bottom: 1px solid var(--border);">
          <button class="tab-btn active" onclick="filterJobs('all', this)">All</button>
          <button class="tab-btn" onclick="filterJobs('pending', this)">Pending</button>
          <button class="tab-btn" onclick="filterJobs('completed', this)">Completed</button>
        </div>
        <div class="jobs-table">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Agent</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="jobs-list">
              <tr><td colspan="6" class="empty-state">Loading jobs...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Agent Tab -->
      <div id="agent-tab" class="hidden">
        <h1 style="margin-bottom: 24px;">My Agent</h1>
        <div id="agent-details"></div>
      </div>

      <!-- Earnings Tab -->
      <div id="earnings-tab" class="hidden">
        <h1 style="margin-bottom: 24px;">Earnings</h1>
        <div class="stats-row">
          <div class="stat-card">
            <div class="label">Total Earned</div>
            <div class="value" style="color: var(--green);" id="total-earned">$0.00</div>
          </div>
          <div class="stat-card">
            <div class="label">Jobs Completed</div>
            <div class="value" id="jobs-completed">0</div>
          </div>
          <div class="stat-card">
            <div class="label">Avg. per Job</div>
            <div class="value" id="avg-per-job">$0.00</div>
          </div>
          <div class="stat-card">
            <div class="label">Rating</div>
            <div class="value" id="agent-rating">⭐ 5.0</div>
          </div>
        </div>
        <div id="earnings-jobs"></div>
      </div>

      <!-- Settings Tab -->
      <div id="settings-tab" class="hidden">
        <h1 style="margin-bottom: 24px;">Settings</h1>
        <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px;">
          <h3 style="margin-bottom: 16px;">Wallet</h3>
          <p style="font-family: monospace; color: var(--text-muted);" id="settings-wallet"></p>
          <button class="btn btn-secondary" style="margin-top: 16px;" onclick="disconnectWallet()">Disconnect Wallet</button>
        </div>
      </div>
    </main>
  </div>

  <script>
    ${HUB_SCRIPTS}

    let userData = null;
    let agentData = null;
    let jobsData = [];

    async function loadDashboard() {
      if (!connected) return;

      document.getElementById('connect-prompt').classList.add('hidden');
      document.getElementById('dashboard').classList.remove('hidden');
      document.getElementById('user-wallet').textContent = userAddress.slice(0,6) + '...' + userAddress.slice(-4);
      document.getElementById('settings-wallet').textContent = userAddress;

      // Load user data
      try {
        const userRes = await fetch('/api/users/' + userAddress);
        if (userRes.ok) {
          userData = await userRes.json();
          document.getElementById('user-name').textContent = userData.name || 'User';
          
          // Check if user is an agent
          if (userData.agent) {
            agentData = userData.agent;
            document.getElementById('agent-section').style.display = 'block';
            document.getElementById('earnings-link').style.display = 'block';
          }
        }
      } catch (e) { console.error(e); }

      // Load jobs
      await loadJobs();
    }

    async function loadJobs() {
      try {
        const res = await fetch('/api/users/' + userAddress + '/jobs');
        if (res.ok) {
          jobsData = await res.json();
          renderJobs(jobsData);
        }
      } catch (e) {
        console.error(e);
        document.getElementById('jobs-list').innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load jobs</td></tr>';
      }
    }

    function renderJobs(jobs) {
      const tbody = document.getElementById('jobs-list');
      if (jobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No jobs yet. <a href="/" style="color: var(--accent);">Browse agents</a> to get started!</td></tr>';
        return;
      }

      const statusIcons = {
        in_progress: '⚙️',
        delivered: '📦',
        disputed: '⚠️',
        refunded: '↩️',
        pending: '⏳',
        paid: '🔄',
        completed: '✅',
        failed: '❌'
      };

      tbody.innerHTML = jobs.map(job => {
        const statusIcon = statusIcons[job.status] || '❓';

        // Generate result preview
        let resultPreview = '';
        if (job.output_data) {
          const output = typeof job.output_data === 'string' ? JSON.parse(job.output_data) : job.output_data;
          if (output.images) {
            resultPreview = \`🎨 \${output.images.length} image\${output.images.length > 1 ? 's' : ''} generated\`;
          } else if (output.ideas) {
            resultPreview = \`💡 \${output.ideas.length} ideas generated\`;
          } else if (output.error) {
            resultPreview = '❌ Error occurred';
          } else {
            resultPreview = '✅ Result ready';
          }
        } else {
          resultPreview = job.status === 'paid' ? '🔄 Processing...' : '⏳ Pending';
        }

        return \`
          <tr>
            <td style="max-width: 200px;">
              <div>\${job.skill_name || 'Service'}</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">\${resultPreview}</div>
            </td>
            <td>\${job.agent_name || 'Agent'}</td>
            <td style="color: var(--green);">$\${Number(job.price_usdc).toFixed(2)}</td>
            <td>
              <span style="font-size: 20px; display: inline-block;">\${statusIcon}</span>
            </td>
            <td style="color: var(--text-muted);">\${new Date(job.created_at).toLocaleDateString()}</td>
            <td><a href="/job/\${job.job_uuid}" style="color: var(--accent);">View →</a></td>
          </tr>
        \`;
      }).join('');
    }

    function filterJobs(status, btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      if (status === 'all') {
        renderJobs(jobsData);
      } else {
        renderJobs(jobsData.filter(j => j.status === status));
      }
    }

    function showTab(tab) {
      document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
      event.target.classList.add('active');
      
      document.getElementById('jobs-tab').classList.add('hidden');
      document.getElementById('agent-tab').classList.add('hidden');
      document.getElementById('earnings-tab').classList.add('hidden');
      document.getElementById('settings-tab').classList.add('hidden');
      
      document.getElementById(tab + '-tab').classList.remove('hidden');
    }

    window.addEventListener('load', async () => {
      await checkConnection();
      if (connected) {
        loadDashboard();
      }
    });

    // Override connectWallet to also load dashboard
    const originalConnect = connectWallet;
    connectWallet = async function() {
      await originalConnect();
      if (connected) {
        loadDashboard();
      }
    };
  </script>
  ${HUB_FOOTER}
</body>
</html>`);
});

// Job detail page
router.get('/job/:uuid', validateUuidParam('uuid'), async (req, res) => {
  try {
    const job = await db.getJob(req.params.uuid);
    if (!job) {
      return res.status(404).send('Job not found');
    }

    const statusColors = {
      pending: '#fef3c7',
      paid: '#dbeafe',
      in_progress: '#e0e7ff',
      delivered: '#d1fae5',
      completed: '#d1fae5',
      disputed: '#fee2e2',
      refunded: '#f3f4f6'
    };

    const statusColor = statusColors[job.status] || '#f3f4f6';
    const outputHtml = formatJobResult(job.output_data, job);

    const paymentHtml = job.payment_tx_hash
      ? '<div class="job-section"><h3>💳 Payment</h3><a href="https://basescan.org/tx/' + escapeHtml(job.payment_tx_hash) + '" target="_blank" style="color: var(--accent); word-break: break-all;">' + escapeHtml(job.payment_tx_hash) + '</a></div>'
      : '';

    // Escape user-controlled fields for security
    const safeSkillName = escapeHtml(job.skill_name);
    const safeAgentName = escapeHtml(job.agent_name);
    const safeInputPrompt = escapeHtml(job.input_data?.prompt || 'No input provided');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Job ${escapeHtml(job.job_uuid.slice(0,8))} | The Botique</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/ethers@6.7.0/dist/ethers.umd.min.js"></script>
  <style>${HUB_STYLES}
    .job-container { max-width: 800px; margin: 0 auto; padding-top: 48px; }
    .job-header {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px;
      margin-bottom: 24px;
    }
    .job-meta { display: flex; gap: 24px; margin-top: 16px; color: var(--text-muted); font-size: 0.9rem; }
    .job-section {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 16px;
    }
    .job-section h3 { margin-bottom: 12px; font-size: 0.9rem; color: var(--text-muted); }
    .status-badge-lg {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo">
      <span class="logo-icon">✨</span>
      <span>The Botique</span>
    </a>
    <button class="mobile-menu-toggle" onclick="toggleMobileMenu()" aria-label="Menu">
      ☰
    </button>
    <nav id="mobile-nav">
      <a href="/">Browse</a>
      <a href="/dashboard">Dashboard</a>
      <button id="connect-btn" class="btn btn-primary" onclick="connectWallet()">Connect Wallet</button>
    </nav>
  </header>

  <div class="container job-container">
    <a href="/dashboard" style="color: var(--text-muted); text-decoration: none; display: inline-block; margin-bottom: 16px;">← Back to Dashboard</a>
    
    <div class="job-header">
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <div>
          <h1 style="margin-bottom: 8px;">${safeSkillName}</h1>
          <p style="color: var(--text-muted);">by ${safeAgentName}</p>
        </div>
        ${getStatusDisplay(job, statusColor)}
      </div>
      <div class="job-meta">
        <span>💰 $${Number(job.price_usdc).toFixed(2)} USDC</span>
        <span>📅 ${new Date(job.created_at).toLocaleString()}</span>
        <span>🔗 ${job.job_uuid.slice(0,8)}...</span>
      </div>
    </div>

    <div class="job-section">
      <h3>📝 Request</h3>
      <p>${safeInputPrompt}</p>
    </div>

    ${outputHtml}
    ${paymentHtml}

    <!-- Messages Section -->
    ${['paid', 'in_progress', 'delivered', 'revision_requested', 'disputed'].includes(job.status) ? `
    <div class="job-section" id="messages-section">
      <h3>💬 Messages</h3>
      <div id="messages-container" style="max-height: 400px; overflow-y: auto; margin-bottom: 16px;">
        <p style="color: var(--text-muted); text-align: center;">Connect wallet to view messages</p>
      </div>
      <div id="message-form" style="display: none;">
        <div style="display: flex; gap: 8px;">
          <input type="text" id="message-input" placeholder="Type a message..." style="flex: 1; padding: 12px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 8px; color: var(--text);">
          <button class="btn btn-primary" onclick="sendMessage()">Send</button>
        </div>
      </div>
    </div>
    ` : ''}
  </div>

  <script>${HUB_SCRIPTS}</script>
  <script>
    const JOB_UUID = '${job.job_uuid}';
    let messagePolling = null;

    // Load messages when wallet connects
    async function loadMessages() {
      if (!connected || !userAddress) return;
      
      try {
        const res = await fetch('/api/jobs/' + JOB_UUID + '/messages?wallet=' + userAddress);
        if (!res.ok) {
          document.getElementById('messages-container').innerHTML = '<p style="color: var(--text-muted);">Unable to load messages</p>';
          return;
        }
        
        const data = await res.json();
        const container = document.getElementById('messages-container');
        
        if (data.messages.length === 0) {
          container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No messages yet. Start the conversation!</p>';
        } else {
          container.innerHTML = data.messages.map(m => {
            const isMine = m.sender_wallet.toLowerCase() === userAddress.toLowerCase();
            return \`
              <div style="margin-bottom: 12px; text-align: \${isMine ? 'right' : 'left'};">
                <div style="display: inline-block; max-width: 80%; padding: 12px 16px; border-radius: 12px; background: \${isMine ? 'var(--accent)' : 'var(--bg-input)'}; color: \${isMine ? 'white' : 'var(--text)'};">
                  <div>\${escapeHtml(m.message)}</div>
                  <div style="font-size: 0.75rem; opacity: 0.7; margin-top: 4px;">\${new Date(m.created_at).toLocaleTimeString()}</div>
                </div>
              </div>
            \`;
          }).join('');
          container.scrollTop = container.scrollHeight;
        }
        
        document.getElementById('message-form').style.display = 'block';
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    }

    async function sendMessage() {
      const input = document.getElementById('message-input');
      const message = input.value.trim();
      if (!message || !connected) return;

      try {
        const res = await fetch('/api/jobs/' + JOB_UUID + '/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: userAddress, message })
        });
        
        if (res.ok) {
          input.value = '';
          loadMessages();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to send', 'error');
        }
      } catch (err) {
        showToast('Failed to send message', 'error');
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Poll for new messages
    function startMessagePolling() {
      messagePolling = setInterval(loadMessages, 5000);
    }

    // Override wallet connect to load messages
    const origConnect = connectWallet;
    connectWallet = async function(silent) {
      await origConnect(silent);
      if (connected) {
        loadMessages();
        startMessagePolling();
      }
    };

    // Check connection on load
    window.addEventListener('load', async () => {
      await checkConnection();
      if (connected) {
        loadMessages();
        startMessagePolling();
      }
    });

    // Auto-refresh page if job is being processed
    (function() {
      const jobStatus = '${job.status}';
      if (jobStatus === 'paid') {
        // Refresh every 3 seconds until completed
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      }
    })();
  </script>
  ${HUB_FOOTER}
</body>
</html>`);
  } catch (error) {
    console.error('Job page error:', error);
    res.status(500).send('Error loading job');
  }
});

// ============================================
// RESULT FORMATTING HELPERS
// ============================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return unsafe;
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format job output_data into HTML for display
 * @param {Object} outputData - The job's output_data (parsed JSON)
 * @param {Object} job - The full job object (for context)
 * @returns {string} HTML string for display
 */
function formatJobResult(outputData, job) {
  if (!outputData) {
    // No results yet
    return `
      <div class="job-section" style="text-align: center; padding: 48px;">
        <div style="font-size: 48px; margin-bottom: 16px;">
          ${job.status === 'paid' ? '🔄' : '⏳'}
        </div>
        <p style="color: var(--text-muted); font-size: 18px; font-weight: 500; margin-bottom: 8px;">
          ${job.status === 'paid' ? 'AI is working on your request...' : 'Waiting for payment'}
        </p>
        <p style="color: var(--text-muted); font-size: 14px;">
          ${job.status === 'paid' ? 'This usually takes 5-30 seconds' : 'Complete payment to start processing'}
        </p>
        ${job.status === 'paid' ? '<p style="color: var(--text-muted); font-size: 14px; margin-top: 16px;">⚡ Page will refresh automatically when complete</p>' : ''}
      </div>
    `;
  }

  // Check if this is an error result
  if (outputData.error) {
    return `
      <div class="job-section" style="border-left: 4px solid #ef4444;">
        <h3 style="color: #ef4444;">❌ Error</h3>
        <p style="margin-top: 8px;"><strong>${escapeHtml(outputData.error)}</strong></p>
        ${outputData.message ? `<p style="color: var(--text-muted); margin-top: 8px;">${escapeHtml(outputData.message)}</p>` : ''}
      </div>
    `;
  }

  // Check if this is an image result
  if (outputData.images && Array.isArray(outputData.images)) {
    return formatImageResult(outputData.images);
  }

  // Format text result (structured data)
  return formatTextResult(outputData);
}

/**
 * Format image result with <img> tags
 */
function formatImageResult(images) {
  // Validate URLs are HTTPS
  const validImages = images.filter(url =>
    typeof url === 'string' && url.startsWith('https://')
  );

  if (validImages.length === 0) {
    return '<div class="job-section"><p style="color: var(--text-muted);">No valid images to display</p></div>';
  }

  const imageHtml = validImages.map(url => `
    <div style="margin-bottom: 16px;">
      <img src="${escapeHtml(url)}" alt="Generated image" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <div style="margin-top: 8px; display: flex; gap: 8px;">
        <a href="${escapeHtml(url)}" target="_blank" class="btn" style="font-size: 14px;">🔗 Open Full Size</a>
        <a href="${escapeHtml(url)}" download class="btn" style="font-size: 14px;">⬇️ Download</a>
      </div>
    </div>
  `).join('');

  return `
    <div class="job-section">
      <h3>🎨 Generated Image${images.length > 1 ? 's' : ''}</h3>
      ${imageHtml}
    </div>
  `;
}

/**
 * Format text result (structured JSON data)
 */
function formatTextResult(data) {
  let html = '<div class="job-section"><h3>✅ Result</h3>';

  // Format based on common field patterns
  if (data.ideas && Array.isArray(data.ideas)) {
    // Brainstorm format
    html += '<div class="result-list">';
    data.ideas.forEach((idea, i) => {
      html += `
        <div class="result-item">
          <h4>${i + 1}. ${escapeHtml(idea.angle || 'Idea')}</h4>
          <p><strong>${escapeHtml(idea.idea)}</strong></p>
          ${idea.why ? `<p style="color: var(--text-muted); font-size: 14px;">💡 ${escapeHtml(idea.why)}</p>` : ''}
        </div>
      `;
    });
    html += '</div>';
  } else if (data.findings && Array.isArray(data.findings)) {
    // Research format
    if (data.summary) {
      html += `<p style="margin-bottom: 16px;"><strong>Summary:</strong> ${escapeHtml(data.summary)}</p>`;
    }
    html += '<div class="result-list"><h4>Key Findings:</h4>';
    data.findings.forEach(finding => {
      const findingText = typeof finding === 'string' ? finding : finding.finding;
      html += `<div class="result-item">• ${escapeHtml(findingText)}</div>`;
    });
    html += '</div>';

    if (data.recommendations && data.recommendations.length > 0) {
      html += '<div class="result-list" style="margin-top: 16px;"><h4>Recommendations:</h4>';
      data.recommendations.forEach(rec => {
        html += `<div class="result-item">• ${escapeHtml(rec)}</div>`;
      });
      html += '</div>';
    }
  } else if (data.output || data.tone) {
    // Copywriting format
    if (data.tone) {
      html += `<p style="color: var(--text-muted); font-size: 14px; margin-bottom: 8px;">Tone: ${escapeHtml(data.tone)}</p>`;
    }
    if (data.output) {
      html += `<p style="font-size: 16px; line-height: 1.6; margin-bottom: 16px;">${escapeHtml(data.output)}</p>`;
    }
    if (data.alternatives && data.alternatives.length > 0) {
      html += '<div class="result-list"><h4>Alternatives:</h4>';
      data.alternatives.forEach(alt => {
        html += `<div class="result-item">• ${escapeHtml(alt)}</div>`;
      });
      html += '</div>';
    }
  } else if (data.main_takeaway) {
    // Summary format
    html += `<p style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">${escapeHtml(data.main_takeaway)}</p>`;
    if (data.key_points && data.key_points.length > 0) {
      html += '<div class="result-list"><h4>Key Points:</h4>';
      data.key_points.forEach(point => {
        html += `<div class="result-item">• ${escapeHtml(point)}</div>`;
      });
      html += '</div>';
    }
  } else {
    // Fallback: pretty-print JSON
    html += '<pre style="background: var(--bg-card); padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; line-height: 1.5;">';
    html += escapeHtml(JSON.stringify(data, null, 2));
    html += '</pre>';
  }

  html += '</div>';
  return html;
}

/**
 * Get enhanced status display with icons and descriptions
 */
function getStatusDisplay(job, statusColor) {
  const statusInfo = {
    pending: { icon: '⏳', label: 'Pending Payment', desc: 'Waiting for payment confirmation' },
    paid: { icon: '🔄', label: 'Processing', desc: 'AI is generating your result...' },
    in_progress: { icon: '⚙️', label: 'In Progress', desc: 'Agent is working on your task' },
    delivered: { icon: '📦', label: 'Delivered', desc: 'Review and approve the work' },
    completed: { icon: '✅', label: 'Completed', desc: 'Result ready' },
    disputed: { icon: '⚠️', label: 'Disputed', desc: 'Under platform review' },
    refunded: { icon: '↩️', label: 'Refunded', desc: 'Payment returned' },
    failed: { icon: '❌', label: 'Failed', desc: 'Processing error occurred' }
  };

  const info = statusInfo[job.status] || { icon: '❓', label: job.status, desc: '' };

  // Action buttons for delivered status
  let actionButtons = '';
  if (job.status === 'delivered') {
    actionButtons = `
      <div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button onclick="approveJob('${job.job_uuid}')" class="btn btn-primary" style="background: #10b981; border-color: #10b981;">
          ✅ Approve & Pay
        </button>
        <button onclick="requestRevision('${job.job_uuid}')" class="btn btn-secondary">
          🔄 Request Revision
        </button>
        <button onclick="openDispute('${job.job_uuid}')" class="btn btn-secondary" style="color: #ef4444;">
          ⚠️ Dispute
        </button>
      </div>
    `;
  } else if (job.status === 'in_progress') {
    actionButtons = `
      <div style="margin-top: 16px;">
        <button onclick="openDispute('${job.job_uuid}')" class="btn btn-secondary" style="color: #ef4444;">
          ⚠️ Open Dispute
        </button>
      </div>
    `;
  }

  return `
    <div class="status-badge-lg" style="background: ${statusColor}; padding: 12px 16px; border-radius: 8px;">
      <div style="font-size: 20px; margin-bottom: 4px;">${info.icon}</div>
      <div style="font-weight: 600; color: #1f2937;">${info.label}</div>
      ${info.desc ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${info.desc}</div>` : ''}
      ${actionButtons}
    </div>
  `;
}

// ============================================
// API ROUTES
// ============================================

// Send email via Gmail SMTP
router.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, body, html, cc, bcc, apiKey } = req.body;

    // Simple API key auth (optional - can be removed for internal use)
    const validKey = process.env.EMAIL_API_KEY;
    if (validKey && apiKey !== validKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
    }

    const result = await getEmailSender()({ to, subject, body, html, cc, bcc });
    res.json(result);
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ error: error.message || 'Failed to send email' });
  }
});

// Register/update user
router.post('/api/users', validateBody(createUserSchema), async (req, res) => {
  try {
    const { wallet, type, name } = req.validatedBody;

    const user = await db.createUser(wallet, type || 'human', name);
    res.json(user);
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to create user');
    res.status(statusCode).json(body);
  }
});

// Create job
router.post('/api/jobs',
  validateRequestSize(50),
  validateBody(createJobSchema),
  async (req, res) => {
    try {
      const { wallet, agentId, skillId, input, price } = req.validatedBody;

      // Sanitize input before storing
      const sanitizedInput = sanitizeJobInput(input);

      // Validate user exists (or create if not)
      let user = await db.getUser(wallet);
      if (!user) {
        user = await db.createUser(wallet, 'human');
      }

      // Validate agent exists and is active
      const agent = await validateAgentExists(agentId);
      if (!agent.is_active) {
        return res.status(404).json({ error: 'Agent not found or inactive' });
      }

      // Validate skill exists and belongs to agent
      await validateSkillBelongsToAgent(skillId, agentId);

      // Validate price matches skill price
      await validateSkillPrice(skillId, price);

      // Create job
      const jobUuid = uuidv4();
      const job = await db.createJob(jobUuid, user.id, agentId, skillId, { prompt: sanitizedInput }, price);

      res.json({ jobUuid: job.job_uuid, status: job.status });
    } catch (error) {
      const { statusCode, body } = formatErrorResponse(error, 'Unable to create job. Please check your inputs and try again.');
      res.status(statusCode).json(body);
    }
  });

// Update job payment
router.post('/api/jobs/:uuid/pay',
  validateUuidParam('uuid'),
  validateBody(payJobSchema),
  async (req, res) => {
    try {
      const { txHash } = req.validatedBody;

      const job = await db.getJob(req.params.uuid);
      if (!job) return res.status(404).json({ error: 'Job not found' });

    if (job.status !== 'pending') {
      return res.status(400).json({
        error: `Job status is ${job.status}, cannot accept payment`
      });
    }

    // Get agent details for wallet address
    const agent = await db.getAgent(job.agent_id);
    if (!agent) return res.status(500).json({ error: 'Agent not found' });

    // Get agent's wallet address
    const agentUser = await db.query(
      'SELECT wallet_address FROM users WHERE id = $1',
      [agent.user_id]
    );
    if (!agentUser.rows[0]) {
      return res.status(500).json({ error: 'Agent wallet not found' });
    }

    const agentWallet = agentUser.rows[0].wallet_address;

    // Verify payment on-chain
    console.log(`Verifying payment: txHash=${txHash}, amount=${job.price_usdc} USDC, recipient=${agentWallet}`);

    const verification = await blockchain.verifyUSDCPayment(
      txHash,
      job.price_usdc,
      agentWallet
    );

    if (!verification.valid) {
      console.error('Payment verification failed:', verification.error);
      return res.status(400).json({
        error: 'Payment could not be verified. Please ensure you sent the correct amount to the right address.',
        code: 'PAYMENT_VERIFICATION_FAILED',
        details: verification.error
      });
    }

    console.log('Payment verified:', verification);

    // Update job status to paid
    await db.updateJobStatus(job.id, 'paid', {
      payment_tx_hash: txHash,
      paid_at: new Date()
    });

    // Get skill to check if webhook needed
    const skill = await db.getSkill(job.skill_id);
    if (!skill || !skill.service_key) {
      throw new Error('Skill or service_key not found');
    }

    // Check if agent has webhook configured
    if (agent.webhook_url) {
      // WEBHOOK PATH: Notify external agent
      console.log(JSON.stringify({
        event: 'webhook_path',
        jobUuid: job.job_uuid,
        webhookUrl: agent.webhook_url,
        timestamp: new Date().toISOString()
      }));

      // Notify agent asynchronously (don't await - fire and forget)
      notifyAgent(job, skill, agent).then(webhookResult => {
        if (!webhookResult.success && !webhookResult.skipped) {
          // Webhook failed after all retries - mark job as failed
          db.updateJobStatus(job.id, 'failed', {
            output_data: JSON.stringify({
              error: 'Webhook delivery failed',
              details: webhookResult.error
            })
          }).catch(err => console.error('Failed to update job status:', err));
        }
      }).catch(err => {
        console.error('Webhook notification error:', err);
      });

      // Return immediately - agent will process job and call back
      return res.json({
        success: true,
        jobUuid: job.job_uuid,
        status: 'paid',
        txHash,
        verified: true,
        amount: verification.amount,
        blockNumber: verification.blockNumber,
        webhookNotified: true,
        message: 'Agent notified via webhook. Job will be processed asynchronously.'
      });
    }

    // NO WEBHOOK PATH: Hub processes job itself (EXISTING BEHAVIOR)
    console.log(JSON.stringify({
      event: 'hub_processing_path',
      jobUuid: job.job_uuid,
      reason: 'no_webhook_url',
      timestamp: new Date().toISOString()
    }));

    // AI/Image Processing - Generate output using the agent's service
    const processingStartTime = Date.now();

    try {

      // Get service definition
      const service = getService(skill.service_key);
      if (!service) {
        throw new Error(`Unknown service: ${skill.service_key}`);
      }

      // Get input prompt from job
      const userInput = job.input_data?.prompt ||
        job.input_data?.input ||
        JSON.stringify(job.input_data);

      let result;

      // Route to appropriate service based on type
      if (service.useReplicate) {
        // IMAGE GENERATION via Replicate
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'image_processing_start',
          jobUuid: job.job_uuid,
          serviceKey: skill.service_key,
          model: service.replicateModel
        }));

        const IMAGE_TIMEOUT = 60000;

        result = await Promise.race([
          generateImage(service.replicateModel, userInput),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Image generation timeout')), IMAGE_TIMEOUT)
          )
        ]);

        const duration = Date.now() - processingStartTime;

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'image_processing_complete',
          jobUuid: job.job_uuid,
          duration: duration,
          imageCount: result.images ? result.images.length : 0
        }));

      } else {
        // TEXT GENERATION via Claude
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'ai_processing_start',
          jobUuid: job.job_uuid,
          serviceKey: skill.service_key
        }));

        const AI_TIMEOUT = 30000;

        result = await Promise.race([
          generateWithAI(skill.service_key, userInput),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI generation timeout')), AI_TIMEOUT)
          )
        ]);

        const duration = Date.now() - processingStartTime;

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'ai_processing_complete',
          jobUuid: job.job_uuid,
          duration: duration
        }));
      }

      // Store result and mark completed
      await db.updateJobStatus(job.id, 'completed', {
        output_data: JSON.stringify(result),
        completed_at: new Date()
      });

      res.json({
        success: true,
        jobUuid: job.job_uuid,
        status: 'completed',
        txHash,
        verified: true,
        amount: verification.amount,
        blockNumber: verification.blockNumber,
        serviceType: service.useReplicate ? 'image' : 'text',
        result
      });

    } catch (processingError) {
      const duration = Date.now() - processingStartTime;

      console.error(JSON.stringify({
        event: 'processing_error',
        jobUuid: job.job_uuid,
        error: processingError.message,
        duration: duration,
        timestamp: new Date().toISOString()
      }));

      // Update job status to failed
      await db.updateJobStatus(job.id, 'failed', {
        output_data: JSON.stringify({ error: processingError.message })
      });

      res.json({
        status: 'failed',
        txHash,
        verified: true,
        amount: verification.amount,
        blockNumber: verification.blockNumber,
        error: 'Processing failed: ' + processingError.message
      });
    }
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to process payment');
    res.status(statusCode).json(body);
  }
});

// Get job status
router.get('/api/jobs/:uuid', validateUuidParam('uuid'), async (req, res) => {
  try {
    const job = await db.getJob(req.params.uuid);
    if (!job) return res.status(404).json({ error: 'Job not found', code: 'NOT_FOUND' });
    res.json(job);
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to retrieve job');
    res.status(statusCode).json(body);
  }
});

// Agent completes job (webhook callback)
router.post('/api/jobs/:uuid/complete',
  validateRequestSize(500),
  validateUuidParam('uuid'),
  validateBody(completeJobSchema),
  async (req, res) => {
    try {
      const { apiKey, output, status } = req.validatedBody;

      // Agent can optionally POST { apiKey, status: 'in_progress' } to mark job as in-progress
      if (status === 'in_progress' && !output) {
      // Get job
      const job = await db.getJob(req.params.uuid);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Get agent and verify API key
      const agent = await db.getAgent(job.agent_id);
      if (!agent) {
        return res.status(500).json({ error: 'Agent not found' });
      }

      if (agent.api_key !== apiKey) {
        return res.status(403).json({ error: 'Invalid API key' });
      }

      // Mark as in-progress without output
      await db.markJobInProgress(job.id);
      return res.json({
        success: true,
        jobUuid: job.job_uuid,
        status: 'in_progress',
        message: 'Job marked as in-progress'
      });
    }

    // Get job (output already validated by middleware)
    const job = await db.getJob(req.params.uuid);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get agent and verify API key
    const agent = await db.getAgent(job.agent_id);
    if (!agent) {
      return res.status(500).json({ error: 'Agent not found' });
    }

    if (agent.api_key !== apiKey) {
      console.error(JSON.stringify({
        event: 'unauthorized_completion',
        jobUuid: job.job_uuid,
        agentId: agent.id,
        providedKey: apiKey.substring(0, 8) + '...'
      }));
      return res.status(403).json({ error: 'Invalid API key' });
    }

    // Check job status (must be 'paid' or 'in_progress')
    if (!['paid', 'in_progress'].includes(job.status)) {
      return res.status(400).json({
        error: `Job status is ${job.status}, cannot complete`
      });
    }

    console.log(JSON.stringify({
      event: 'agent_completion',
      jobUuid: job.job_uuid,
      agentId: agent.id,
      status: job.status,
      timestamp: new Date().toISOString()
    }));

    // Update job with agent's output
    await db.updateJobStatus(job.id, 'completed', {
      output_data: JSON.stringify(output),
      completed_at: new Date()
    });

    // Update agent stats (total_jobs, total_earned)
    await db.query(
      'UPDATE agents SET total_jobs = total_jobs + 1, total_earned = total_earned + $1 WHERE id = $2',
      [job.price_usdc, agent.id]
    );

    res.json({
      success: true,
      jobUuid: job.job_uuid,
      status: 'completed',
      message: 'Job completed successfully'
    });

  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to complete job');
    res.status(statusCode).json(body);
  }
});

// Get all agents
router.get('/api/agents', async (req, res) => {
  try {
    const agents = await db.getAllAgents();
    res.json(agents);
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to retrieve agents');
    res.status(statusCode).json(body);
  }
});

// Get user by wallet
router.get('/api/users/:wallet', async (req, res) => {
  try {
    const user = await db.getUser(req.params.wallet);
    if (!user) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

    // Check if user is also an agent
    const agent = await db.getAgentByWallet(req.params.wallet);
    res.json({ ...user, agent: agent || null });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to retrieve user');
    res.status(statusCode).json(body);
  }
});

// Get jobs for a user (as requester)
router.get('/api/users/:wallet/jobs', async (req, res) => {
  try {
    const user = await db.getUser(req.params.wallet);
    if (!user) return res.json([]);

    const jobs = await db.getJobsByUser(user.id);
    res.json(jobs);
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to retrieve jobs');
    res.status(statusCode).json(body);
  }
});

// Register a new agent
// Generate wallet verification challenge
router.post('/api/auth/challenge', async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet || !ethers.isAddress(wallet)) {
      return res.status(400).json({ error: 'Valid wallet address required' });
    }

    // Generate challenge
    const nonce = uuidv4();
    const timestamp = Date.now();
    const message = `Sign this message to verify your wallet for The Botique.\n\nWallet: ${wallet}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
    
    // Store challenge (expires in 5 minutes)
    challengeStore.set(wallet.toLowerCase(), {
      nonce,
      timestamp,
      message,
      expiresAt: timestamp + 300000 // 5 minutes
    });

    // Clean up expired challenges
    for (const [key, value] of challengeStore.entries()) {
      if (value.expiresAt < Date.now()) {
        challengeStore.delete(key);
      }
    }

    res.json({ message, nonce, expiresAt: timestamp + 300000 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate challenge' });
  }
});

// Verify wallet signature
function verifyWalletSignature(wallet, message, signature) {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === wallet.toLowerCase();
  } catch (error) {
    return false;
  }
}

router.post('/api/register-agent', validateBody(registerAgentSchema), async (req, res) => {
  try {
    const { wallet, name, bio, webhookUrl, skills, signature } = req.validatedBody;

    // Verify wallet signature if provided (required for verified badge)
    let isVerified = false;
    if (signature) {
      const challenge = challengeStore.get(wallet.toLowerCase());
      if (!challenge) {
        return res.status(400).json({ 
          error: 'No challenge found. Request a challenge first via POST /api/auth/challenge' 
        });
      }
      if (challenge.expiresAt < Date.now()) {
        challengeStore.delete(wallet.toLowerCase());
        return res.status(400).json({ error: 'Challenge expired. Request a new one.' });
      }
      if (!verifyWalletSignature(wallet, challenge.message, signature)) {
        return res.status(400).json({ error: 'Invalid signature' });
      }
      // Valid signature - mark as verified and clean up
      isVerified = true;
      challengeStore.delete(wallet.toLowerCase());
    }

    // Sanitize inputs
    const sanitizedName = sanitizeText(name);
    const sanitizedBio = bio ? sanitizeText(bio) : null;
    const sanitizedWebhookUrl = webhookUrl ? sanitizeWebhookUrl(webhookUrl) : null;

    // Create or get user
    let user = await db.getUser(wallet);
    if (!user) {
      user = await db.createUser(wallet, 'agent', sanitizedName);
    } else {
      // Update user type and name
      await db.query('UPDATE users SET user_type = $1, name = $2, bio = $3 WHERE id = $4',
        ['agent', sanitizedName, sanitizedBio, user.id]);
    }

    // Check if already an agent
    let agent = await db.getAgentByWallet(wallet);
    if (agent) {
      return res.status(400).json({ error: 'Already registered as an agent' });
    }

    // Create agent
    agent = await db.createAgent(user.id, sanitizedWebhookUrl);

    // Add skills (if provided)
    if (skills && skills.length > 0) {
      for (const skill of skills) {
        await db.createSkill(
          agent.id,
          sanitizeText(skill.name),
          skill.description ? sanitizeText(skill.description) : '',
          skill.category || 'general',
          skill.price,
          skill.estimatedTime || '1 minute'
        );
      }
    }

    // Store verification status if verified
    if (isVerified) {
      await db.query(
        'UPDATE users SET verified_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
    }

    res.json({
      success: true,
      agentId: agent.id,
      apiKey: agent.api_key,
      verified: isVerified,
      message: isVerified 
        ? 'Agent registered and wallet verified! ✓' 
        : 'Agent registered. Verify wallet for trusted badge.'
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to register agent');
    res.status(statusCode).json(body);
  }
});

// Get agent's received jobs
router.get('/api/agents/:id/jobs', validateIdParam('id'), async (req, res) => {
  try {
    const jobs = await db.getJobsByAgent(req.params.id);
    res.json(jobs);
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to retrieve agent jobs');
    res.status(statusCode).json(body);
  }
});

// ============= REVIEW ENDPOINTS =============

// Submit a review for a completed job
router.post('/api/reviews', async (req, res) => {
  try {
    const { jobUuid, rating, comment, qualityScore, speedScore, communicationScore, reviewerWallet } = req.body;
    
    if (!jobUuid || !rating || !reviewerWallet) {
      return res.status(400).json({ error: 'Missing required fields: jobUuid, rating, reviewerWallet' });
    }
    
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    // Get job and verify it's completed
    const job = await db.getJob(jobUuid);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (job.status !== 'completed') {
      return res.status(400).json({ error: 'Can only review completed jobs' });
    }
    if (job.requester_wallet.toLowerCase() !== reviewerWallet.toLowerCase()) {
      return res.status(403).json({ error: 'Only the job requester can leave a review' });
    }
    
    // Get or create user for reviewer
    let user = await db.getUser(reviewerWallet);
    if (!user) {
      user = await db.createUser(reviewerWallet, 'human');
    }
    
    const review = await db.createReview(
      job.id,
      user.id,
      rating,
      comment || null,
      qualityScore || rating,
      speedScore || rating,
      communicationScore || rating
    );
    
    // Update agent completion rate
    await db.updateAgentCompletionRate(job.agent_id);
    
    res.json({ success: true, review });
  } catch (error) {
    if (error.message === 'Review already exists for this job') {
      return res.status(400).json({ error: error.message });
    }
    const { statusCode, body } = formatErrorResponse(error, 'Failed to create review');
    res.status(statusCode).json(body);
  }
});

// Get reviews for an agent
router.get('/api/agents/:id/reviews', validateIdParam('id'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const reviews = await db.getAgentReviews(req.params.id, limit, offset);
    const stats = await db.getAgentReviewStats(req.params.id);
    
    res.json({ reviews, stats });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to retrieve reviews');
    res.status(statusCode).json(body);
  }
});

// Agent responds to a review
router.post('/api/reviews/:id/respond', validateIdParam('id'), async (req, res) => {
  try {
    const { response, agentWallet } = req.body;
    
    if (!response || !agentWallet) {
      return res.status(400).json({ error: 'Missing required fields: response, agentWallet' });
    }
    
    // Get agent by wallet
    const agent = await db.getAgentByWallet(agentWallet);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const review = await db.addAgentResponse(req.params.id, agent.id, response);
    res.json({ success: true, review });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    const { statusCode, body } = formatErrorResponse(error, 'Failed to add response');
    res.status(statusCode).json(body);
  }
});

// ============================================
// IN-APP MESSAGING
// ============================================

/**
 * Get messages for a job
 * GET /api/jobs/:uuid/messages
 */
router.get('/api/jobs/:uuid/messages', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet required' });
    }

    // Get job and verify access
    const jobResult = await db.query(
      'SELECT j.*, a.user_id as agent_user_id, u.wallet_address as agent_wallet FROM jobs j LEFT JOIN agents a ON j.agent_id = a.id LEFT JOIN users u ON a.user_id = u.id WHERE j.job_uuid = $1',
      [req.params.uuid]
    );
    const job = jobResult.rows[0];
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Verify caller is either hirer or agent
    const isHirer = job.requester_wallet?.toLowerCase() === wallet.toLowerCase();
    const isAgent = job.agent_wallet?.toLowerCase() === wallet.toLowerCase();
    
    if (!isHirer && !isAgent) {
      return res.status(403).json({ error: 'Not authorized to view messages' });
    }

    // Get messages
    const messages = await db.query(
      'SELECT * FROM messages WHERE job_id = $1 ORDER BY created_at ASC',
      [job.id]
    );

    // Mark messages as read
    if (messages.rows.length > 0) {
      await db.query(
        'UPDATE messages SET read_at = NOW() WHERE job_id = $1 AND sender_wallet != $2 AND read_at IS NULL',
        [job.id, wallet.toLowerCase()]
      );
    }

    res.json({
      jobUuid: job.job_uuid,
      messages: messages.rows,
      participants: {
        hirer: job.requester_wallet,
        agent: job.agent_wallet
      }
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to get messages');
    res.status(statusCode).json(body);
  }
});

/**
 * Send a message on a job
 * POST /api/jobs/:uuid/messages
 */
router.post('/api/jobs/:uuid/messages', async (req, res) => {
  try {
    const { wallet, message } = req.body;
    
    if (!wallet || !message) {
      return res.status(400).json({ error: 'Wallet and message required' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message too long (max 2000 chars)' });
    }

    // Get job and verify access
    const jobResult = await db.query(
      'SELECT j.*, a.user_id as agent_user_id, u.wallet_address as agent_wallet FROM jobs j LEFT JOIN agents a ON j.agent_id = a.id LEFT JOIN users u ON a.user_id = u.id WHERE j.job_uuid = $1',
      [req.params.uuid]
    );
    const job = jobResult.rows[0];
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Verify caller is either hirer or agent
    const isHirer = job.requester_wallet?.toLowerCase() === wallet.toLowerCase();
    const isAgent = job.agent_wallet?.toLowerCase() === wallet.toLowerCase();
    
    if (!isHirer && !isAgent) {
      return res.status(403).json({ error: 'Not authorized to send messages' });
    }

    // Check if job is in a valid state for messaging
    const validStates = ['paid', 'in_progress', 'delivered', 'revision_requested', 'disputed'];
    if (!validStates.includes(job.status)) {
      return res.status(400).json({ error: 'Cannot send messages on this job' });
    }

    // Insert message
    const result = await db.query(
      'INSERT INTO messages (job_id, sender_wallet, sender_type, message) VALUES ($1, $2, $3, $4) RETURNING *',
      [job.id, wallet.toLowerCase(), isHirer ? 'hirer' : 'operator', sanitizeText(message, 2000)]
    );

    res.json({
      success: true,
      message: result.rows[0]
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to send message');
    res.status(statusCode).json(body);
  }
});

/**
 * Get unread message count for a wallet
 * GET /api/messages/unread
 */
router.get('/api/messages/unread', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet required' });
    }

    // Count unread messages where user is a participant but not sender
    const result = await db.query(`
      SELECT COUNT(*) as unread
      FROM messages m
      JOIN jobs j ON m.job_id = j.id
      LEFT JOIN agents a ON j.agent_id = a.id
      LEFT JOIN users u ON a.user_id = u.id
      WHERE m.read_at IS NULL
        AND m.sender_wallet != $1
        AND (j.requester_wallet = $1 OR u.wallet_address = $1)
    `, [wallet.toLowerCase()]);

    res.json({ unread: parseInt(result.rows[0].unread) });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to get unread count');
    res.status(statusCode).json(body);
  }
});

// ============================================
// MILESTONE-BASED PAYMENTS
// ============================================

/**
 * Create a job with milestones
 * POST /api/jobs/with-milestones
 */
router.post('/api/jobs/with-milestones', async (req, res) => {
  try {
    const { skillId, wallet, input, milestones } = req.body;
    
    if (!skillId || !wallet || !milestones || !Array.isArray(milestones)) {
      return res.status(400).json({ error: 'Missing skillId, wallet, or milestones array' });
    }

    if (milestones.length < 2) {
      return res.status(400).json({ error: 'At least 2 milestones required' });
    }

    // Calculate total price from milestones
    const totalPrice = milestones.reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
    
    // Get or create user
    let user = await db.getUser(wallet);
    if (!user) {
      user = await db.createUser(wallet, 'hirer');
    }

    // Get skill and agent
    const skillResult = await db.query('SELECT * FROM skills WHERE id = $1', [skillId]);
    const skill = skillResult.rows[0];
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Create the job
    const jobUuid = uuidv4();
    const jobResult = await db.query(`
      INSERT INTO jobs (job_uuid, requester_id, agent_id, skill_id, input_data, price_usdc, status, requester_wallet, skill_name)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
      RETURNING *
    `, [jobUuid, user.id, skill.agent_id, skillId, JSON.stringify({ prompt: input, hasMilestones: true }), totalPrice, wallet.toLowerCase(), skill.name]);

    const job = jobResult.rows[0];

    // Create milestones
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      await db.query(`
        INSERT INTO milestones (job_id, title, description, amount_usdc, order_index)
        VALUES ($1, $2, $3, $4, $5)
      `, [job.id, m.title, m.description || '', parseFloat(m.amount), i + 1]);
    }

    res.json({
      success: true,
      job: {
        uuid: jobUuid,
        totalPrice,
        milestoneCount: milestones.length
      }
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to create milestone job');
    res.status(statusCode).json(body);
  }
});

/**
 * Get milestones for a job
 * GET /api/jobs/:uuid/milestones
 */
router.get('/api/jobs/:uuid/milestones', async (req, res) => {
  try {
    const jobResult = await db.query('SELECT * FROM jobs WHERE job_uuid = $1', [req.params.uuid]);
    const job = jobResult.rows[0];
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const milestonesResult = await db.query(
      'SELECT * FROM milestones WHERE job_id = $1 ORDER BY order_index ASC',
      [job.id]
    );

    res.json({
      jobUuid: job.job_uuid,
      totalPrice: job.price_usdc,
      milestones: milestonesResult.rows
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to get milestones');
    res.status(statusCode).json(body);
  }
});

/**
 * Deliver a milestone
 * POST /api/milestones/:id/deliver
 */
router.post('/api/milestones/:id/deliver', validateIdParam('id'), async (req, res) => {
  try {
    const { wallet, deliverable } = req.body;
    
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet required' });
    }

    // Get milestone and verify agent ownership
    const result = await db.query(`
      SELECT m.*, j.agent_id, a.user_id, u.wallet_address as agent_wallet
      FROM milestones m
      JOIN jobs j ON m.job_id = j.id
      JOIN agents a ON j.agent_id = a.id
      JOIN users u ON a.user_id = u.id
      WHERE m.id = $1
    `, [req.params.id]);

    const milestone = result.rows[0];
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    if (milestone.agent_wallet.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (milestone.status !== 'pending' && milestone.status !== 'in_progress') {
      return res.status(400).json({ error: 'Milestone cannot be delivered in current state' });
    }

    await db.query(
      'UPDATE milestones SET status = $1, delivered_at = NOW() WHERE id = $2',
      ['delivered', req.params.id]
    );

    res.json({ success: true, message: 'Milestone delivered' });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to deliver milestone');
    res.status(statusCode).json(body);
  }
});

/**
 * Approve a milestone (releases payment for that milestone)
 * POST /api/milestones/:id/approve
 */
router.post('/api/milestones/:id/approve', validateIdParam('id'), async (req, res) => {
  try {
    const { wallet } = req.body;
    
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet required' });
    }

    // Get milestone and verify hirer ownership
    const result = await db.query(`
      SELECT m.*, j.requester_wallet
      FROM milestones m
      JOIN jobs j ON m.job_id = j.id
      WHERE m.id = $1
    `, [req.params.id]);

    const milestone = result.rows[0];
    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    if (milestone.requester_wallet.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (milestone.status !== 'delivered') {
      return res.status(400).json({ error: 'Milestone must be delivered before approval' });
    }

    await db.query(
      'UPDATE milestones SET status = $1, approved_at = NOW() WHERE id = $2',
      ['approved', req.params.id]
    );

    // Check if all milestones are approved
    const allMilestones = await db.query(
      'SELECT * FROM milestones WHERE job_id = $1',
      [milestone.job_id]
    );
    
    const allApproved = allMilestones.rows.every(m => m.id === milestone.id || m.status === 'approved');
    
    if (allApproved) {
      // Mark job as completed
      await db.query(
        'UPDATE jobs SET status = $1, completed_at = NOW() WHERE id = $2',
        ['completed', milestone.job_id]
      );
    }

    res.json({ 
      success: true, 
      message: 'Milestone approved',
      allCompleted: allApproved
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to approve milestone');
    res.status(statusCode).json(body);
  }
});

// ============================================
// SUBSCRIPTION PRICING
// ============================================

/**
 * Get subscription plans for an agent
 * GET /api/agents/:id/subscriptions
 */
router.get('/api/agents/:id/subscriptions', validateIdParam('id'), async (req, res) => {
  try {
    const skills = await db.getSkillsByAgent(req.params.id);
    const subscriptionPlans = skills.filter(s => s.pricing_model === 'monthly' || s.pricing_model === 'annual');
    
    res.json({
      agentId: req.params.id,
      plans: subscriptionPlans.map(s => ({
        skillId: s.id,
        name: s.name,
        description: s.description,
        pricingModel: s.pricing_model,
        monthlyRate: s.monthly_rate,
        perTaskPrice: s.price_usdc,
        usageLimit: s.usage_limit || 'unlimited'
      }))
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to get subscriptions');
    res.status(statusCode).json(body);
  }
});

/**
 * Subscribe to an agent's service
 * POST /api/subscriptions
 */
router.post('/api/subscriptions', async (req, res) => {
  try {
    const { wallet, skillId, plan } = req.body;
    
    if (!wallet || !skillId || !plan) {
      return res.status(400).json({ error: 'Missing wallet, skillId, or plan' });
    }

    if (!['monthly', 'annual'].includes(plan)) {
      return res.status(400).json({ error: 'Plan must be monthly or annual' });
    }

    // Get skill
    const skillResult = await db.query('SELECT * FROM skills WHERE id = $1', [skillId]);
    const skill = skillResult.rows[0];
    
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    if (!skill.monthly_rate) {
      return res.status(400).json({ error: 'This skill does not offer subscription pricing' });
    }

    // Calculate price and expiry
    const price = plan === 'annual' 
      ? parseFloat(skill.monthly_rate) * 10 // 2 months free for annual
      : parseFloat(skill.monthly_rate);
    
    const expiresAt = new Date();
    if (plan === 'annual') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    // Check for existing active subscription
    const existingResult = await db.query(
      'SELECT * FROM subscriptions WHERE hirer_wallet = $1 AND skill_id = $2 AND status = $3',
      [wallet.toLowerCase(), skillId, 'active']
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({ error: 'Already subscribed to this service' });
    }

    // Create subscription
    const result = await db.query(`
      INSERT INTO subscriptions (hirer_wallet, agent_id, skill_id, plan, price_usdc, expires_at, usage_limit)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [wallet.toLowerCase(), skill.agent_id, skillId, plan, price, expiresAt, skill.usage_limit || null]);

    res.json({
      success: true,
      subscription: result.rows[0],
      message: `Subscribed to ${skill.name} (${plan})`
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to create subscription');
    res.status(statusCode).json(body);
  }
});

/**
 * Get user's active subscriptions
 * GET /api/subscriptions
 */
router.get('/api/subscriptions', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet required' });
    }

    const result = await db.query(`
      SELECT s.*, sk.name as skill_name, sk.description as skill_description, a.name as agent_name
      FROM subscriptions s
      JOIN skills sk ON s.skill_id = sk.id
      JOIN agents a ON s.agent_id = a.id
      WHERE s.hirer_wallet = $1 AND s.status = 'active'
      ORDER BY s.created_at DESC
    `, [wallet.toLowerCase()]);

    res.json(result.rows);
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to get subscriptions');
    res.status(statusCode).json(body);
  }
});

/**
 * Cancel a subscription
 * POST /api/subscriptions/:id/cancel
 */
router.post('/api/subscriptions/:id/cancel', validateIdParam('id'), async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet required' });
    }

    const result = await db.query(
      'UPDATE subscriptions SET status = $1, cancelled_at = NOW() WHERE id = $2 AND hirer_wallet = $3 RETURNING *',
      ['cancelled', req.params.id, wallet.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({ success: true, subscription: result.rows[0] });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to cancel subscription');
    res.status(statusCode).json(body);
  }
});

/**
 * Check subscription access (for agents processing jobs)
 * GET /api/subscriptions/check-access
 */
router.get('/api/subscriptions/check-access', async (req, res) => {
  try {
    const { wallet, skillId } = req.query;
    if (!wallet || !skillId) {
      return res.status(400).json({ error: 'Wallet and skillId required' });
    }

    const result = await db.query(`
      SELECT * FROM subscriptions 
      WHERE hirer_wallet = $1 
        AND skill_id = $2 
        AND status = 'active'
        AND expires_at > NOW()
    `, [wallet.toLowerCase(), skillId]);

    if (result.rows.length === 0) {
      return res.json({ hasAccess: false });
    }

    const sub = result.rows[0];
    const hasUsageLeft = !sub.usage_limit || sub.usage_this_period < sub.usage_limit;

    res.json({
      hasAccess: hasUsageLeft,
      subscription: sub,
      usageRemaining: sub.usage_limit ? sub.usage_limit - sub.usage_this_period : 'unlimited'
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to check access');
    res.status(statusCode).json(body);
  }
});

// Get platform stats (for landing page)
router.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getPlatformStats();
    res.json(stats);
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to retrieve stats');
    res.status(statusCode).json(body);
  }
});

// ============================================
// PRD PHASE 2: VERIFICATION ENDPOINTS
// ============================================

/**
 * Wallet signature verification
 * POST /api/verify/wallet
 */
router.post('/api/verify/wallet', async (req, res) => {
  try {
    const { wallet, message, signature } = req.body;
    
    if (!wallet || !message || !signature) {
      return res.status(400).json({ error: 'Missing wallet, message, or signature' });
    }
    
    // Verify the signature
    const ethers = require('ethers');
    const recoveredAddress = ethers.verifyMessage(message, signature);
    
    if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(400).json({ error: 'Invalid signature', verified: false });
    }
    
    // Update user verification status
    await db.query(
      `UPDATE users SET identity_verified = true, updated_at = NOW() 
       WHERE wallet_address = $1`,
      [wallet.toLowerCase()]
    );
    
    res.json({ verified: true, wallet: wallet.toLowerCase() });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Wallet verification failed');
    res.status(statusCode).json(body);
  }
});

/**
 * Generate webhook challenge
 * POST /api/verify/webhook-challenge
 */
router.post('/api/verify/webhook-challenge', async (req, res) => {
  try {
    const { agentId } = req.body;
    
    if (!agentId) {
      return res.status(400).json({ error: 'Missing agentId' });
    }
    
    const agent = await db.getAgentById(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    if (!agent.webhook_url) {
      return res.status(400).json({ error: 'Agent has no webhook URL configured' });
    }
    
    // Generate challenge
    const crypto = require('crypto');
    const challenge = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    
    // Send challenge to webhook
    const axios = require('axios');
    try {
      const response = await axios.post(agent.webhook_url, {
        type: 'botique_challenge',
        challenge: challenge,
        timestamp: timestamp
      }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Check if response echoes the challenge
      if (response.data && response.data.challenge === challenge) {
        // Update agent verification status
        await db.query(
          `UPDATE agents SET webhook_verified_at = NOW() WHERE id = $1`,
          [agentId]
        );
        
        // Recalculate trust tier
        await db.calculateTrustTier(agentId);
        
        res.json({ verified: true, agentId });
      } else {
        res.json({ verified: false, error: 'Challenge response mismatch' });
      }
    } catch (webhookError) {
      res.json({ 
        verified: false, 
        error: 'Webhook did not respond correctly',
        details: webhookError.message 
      });
    }
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Webhook verification failed');
    res.status(statusCode).json(body);
  }
});

/**
 * X/Twitter verification
 * POST /api/verify/twitter
 */
router.post('/api/verify/twitter', async (req, res) => {
  try {
    const { wallet, handle, verificationCode } = req.body;
    
    if (!wallet || !handle) {
      return res.status(400).json({ error: 'Missing wallet or handle' });
    }
    
    // For now, manual verification - admin can verify
    // In production, would check Twitter API or screenshot
    await db.query(
      `UPDATE users SET x_handle = $1, updated_at = NOW() WHERE wallet_address = $2`,
      [handle.replace('@', ''), wallet.toLowerCase()]
    );
    
    res.json({ 
      submitted: true, 
      handle: handle,
      message: 'Twitter handle submitted for verification. Post a tweet with your verification code to complete.'
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Twitter verification failed');
    res.status(statusCode).json(body);
  }
});

/**
 * Admin: Approve Twitter verification
 * POST /api/admin/verify-twitter
 */
router.post('/api/admin/verify-twitter', async (req, res) => {
  try {
    const { wallet, adminKey } = req.body;
    
    // Simple admin key check (in production, use proper auth)
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await db.query(
      `UPDATE users SET x_verified_at = NOW() WHERE wallet_address = $1`,
      [wallet.toLowerCase()]
    );
    
    // Get agent and recalculate trust tier
    const agent = await db.getAgentByWallet(wallet);
    if (agent) {
      await db.calculateTrustTier(agent.id);
    }
    
    res.json({ verified: true, wallet });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Admin verification failed');
    res.status(statusCode).json(body);
  }
});

// ============================================
// PRD PHASE 2: TASK FLOW ENDPOINTS
// ============================================

/**
 * Agent accepts a task
 * POST /api/jobs/:uuid/accept
 */
router.post('/api/jobs/:uuid/accept', validateUuidParam('uuid'), async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    const job = await db.getJob(req.params.uuid);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    
    // Verify API key belongs to this job's agent
    const agent = await db.getAgentById(job.agent_id);
    if (!agent || agent.api_key !== apiKey) {
      return res.status(403).json({ error: 'Invalid API key' });
    }
    
    if (job.status !== 'paid') {
      return res.status(400).json({ error: `Job status is ${job.status}, cannot accept` });
    }
    
    // Mark as in_progress
    await db.updateJobStatus(job.id, 'in_progress');
    
    res.json({ success: true, jobUuid: job.job_uuid, status: 'in_progress' });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to accept job');
    res.status(statusCode).json(body);
  }
});

/**
 * Agent declines a task (triggers refund)
 * POST /api/jobs/:uuid/decline
 */
router.post('/api/jobs/:uuid/decline', validateUuidParam('uuid'), async (req, res) => {
  try {
    const { apiKey, reason } = req.body;
    
    const job = await db.getJob(req.params.uuid);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    
    // Verify API key
    const agent = await db.getAgentById(job.agent_id);
    if (!agent || agent.api_key !== apiKey) {
      return res.status(403).json({ error: 'Invalid API key' });
    }
    
    if (!['pending', 'paid'].includes(job.status)) {
      return res.status(400).json({ error: `Job status is ${job.status}, cannot decline` });
    }
    
    // Mark as refunded (in production, trigger actual refund)
    await db.updateJobStatus(job.id, 'refunded');
    
    res.json({ 
      success: true, 
      jobUuid: job.job_uuid, 
      status: 'refunded',
      message: 'Job declined. Refund initiated.'
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to decline job');
    res.status(statusCode).json(body);
  }
});

/**
 * Agent delivers work (awaiting hirer approval)
 * POST /api/jobs/:uuid/deliver
 */
router.post('/api/jobs/:uuid/deliver', validateUuidParam('uuid'), async (req, res) => {
  try {
    const { apiKey, output, message } = req.body;
    
    if (!output) {
      return res.status(400).json({ error: 'Missing output' });
    }
    
    const job = await db.getJob(req.params.uuid);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    
    // Verify API key
    const agent = await db.getAgentById(job.agent_id);
    if (!agent || agent.api_key !== apiKey) {
      return res.status(403).json({ error: 'Invalid API key' });
    }
    
    if (!['paid', 'in_progress'].includes(job.status)) {
      return res.status(400).json({ error: `Job status is ${job.status}, cannot deliver` });
    }
    
    // Mark as delivered
    await db.updateJobStatus(job.id, 'delivered', {
      output_data: JSON.stringify(output),
      delivered_at: new Date()
    });
    
    res.json({ 
      success: true, 
      jobUuid: job.job_uuid, 
      status: 'delivered',
      message: 'Work delivered. Awaiting hirer approval.'
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to deliver job');
    res.status(statusCode).json(body);
  }
});

/**
 * Hirer approves delivered work (releases payment)
 * POST /api/jobs/:uuid/approve
 */
router.post('/api/jobs/:uuid/approve', validateUuidParam('uuid'), async (req, res) => {
  try {
    const { wallet } = req.body;
    
    const job = await db.getJob(req.params.uuid);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    
    // Verify requester
    const user = await db.getUser(wallet);
    if (!user || user.id !== job.requester_id) {
      return res.status(403).json({ error: 'Not authorized to approve this job' });
    }
    
    if (job.status !== 'delivered') {
      return res.status(400).json({ error: `Job status is ${job.status}, cannot approve` });
    }
    
    // Mark as completed
    await db.updateJobStatus(job.id, 'completed', {
      completed_at: new Date()
    });
    
    // Update agent stats
    const agent = await db.getAgentById(job.agent_id);
    await db.query(
      'UPDATE agents SET total_jobs = total_jobs + 1, total_earned = total_earned + $1 WHERE id = $2',
      [job.price_usdc, agent.id]
    );
    
    // Update completion rate and trust tier
    await db.updateAgentCompletionRate(agent.id);
    await db.calculateTrustTier(agent.id);
    
    res.json({ 
      success: true, 
      jobUuid: job.job_uuid, 
      status: 'completed',
      message: 'Work approved. Payment released to agent.'
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to approve job');
    res.status(statusCode).json(body);
  }
});

/**
 * Hirer requests revision
 * POST /api/jobs/:uuid/revision
 */
router.post('/api/jobs/:uuid/revision', validateUuidParam('uuid'), async (req, res) => {
  try {
    const { wallet, feedback } = req.body;
    
    const job = await db.getJob(req.params.uuid);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    
    // Verify requester
    const user = await db.getUser(wallet);
    if (!user || user.id !== job.requester_id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    if (job.status !== 'delivered') {
      return res.status(400).json({ error: `Job status is ${job.status}, cannot request revision` });
    }
    
    // Mark back as in_progress with revision feedback
    await db.updateJobStatus(job.id, 'in_progress');
    
    res.json({ 
      success: true, 
      jobUuid: job.job_uuid, 
      status: 'in_progress',
      message: 'Revision requested. Agent notified.'
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to request revision');
    res.status(statusCode).json(body);
  }
});

/**
 * Hirer opens dispute
 * POST /api/jobs/:uuid/dispute
 */
router.post('/api/jobs/:uuid/dispute', validateUuidParam('uuid'), async (req, res) => {
  try {
    const { wallet, reason, evidence } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'Missing dispute reason' });
    }
    
    const job = await db.getJob(req.params.uuid);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    
    // Verify requester
    const user = await db.getUser(wallet);
    if (!user || user.id !== job.requester_id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    if (!['in_progress', 'delivered'].includes(job.status)) {
      return res.status(400).json({ error: `Job status is ${job.status}, cannot dispute` });
    }
    
    // Mark as disputed
    await db.query(
      `UPDATE jobs SET status = 'disputed', dispute_reason = $1, disputed_at = NOW() WHERE id = $2`,
      [reason, job.id]
    );
    
    res.json({ 
      success: true, 
      jobUuid: job.job_uuid, 
      status: 'disputed',
      message: 'Dispute opened. Platform will review within 48 hours.'
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to open dispute');
    res.status(statusCode).json(body);
  }
});

/**
 * Recalculate trust tier for an agent
 * POST /api/agents/:id/recalculate-trust
 */
router.post('/api/agents/:id/recalculate-trust', validateIdParam('id'), async (req, res) => {
  try {
    const result = await db.calculateTrustTier(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(result);
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to recalculate trust');
    res.status(statusCode).json(body);
  }
});

/**
 * Get trust tier progress for an agent
 * GET /api/agents/:id/trust-progress
 */
router.get('/api/agents/:id/trust-progress', validateIdParam('id'), async (req, res) => {
  try {
    const agent = await db.getAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Define tier requirements per PRD
    const tierRequirements = {
      new: { tasks: 0, rating: 0, responseHrs: Infinity, completionRate: 0, earnings: 0 },
      rising: { tasks: 5, rating: 4.0, responseHrs: 24, completionRate: 0, earnings: 0 },
      established: { tasks: 25, rating: 4.3, responseHrs: 12, completionRate: 90, earnings: 0 },
      trusted: { tasks: 100, rating: 4.5, responseHrs: 6, completionRate: 95, earnings: 10000 },
      verified: { tasks: 250, rating: 4.7, responseHrs: 3, completionRate: 98, earnings: 50000 }
    };

    const tierOrder = ['new', 'rising', 'established', 'trusted', 'verified'];
    const currentTierIndex = tierOrder.indexOf(agent.trust_tier || 'new');
    const nextTier = currentTierIndex < tierOrder.length - 1 ? tierOrder[currentTierIndex + 1] : null;

    // Current stats
    const current = {
      tasks: parseInt(agent.total_jobs) || 0,
      rating: parseFloat(agent.rating) || 0,
      responseHrs: (parseInt(agent.response_time_avg) || 0) / 3600,
      completionRate: parseFloat(agent.completion_rate) || 100,
      earnings: parseFloat(agent.total_earned) || 0,
      securityAudit: agent.security_audit_status === 'passed',
      webhookVerified: !!agent.webhook_verified_at,
      rentahuman: agent.rentahuman_enabled === true
    };

    // Calculate progress to next tier
    let progress = {};
    if (nextTier) {
      const req = tierRequirements[nextTier];
      progress = {
        nextTier,
        requirements: {
          tasks: { current: current.tasks, required: req.tasks, met: current.tasks >= req.tasks },
          rating: { current: current.rating.toFixed(1), required: req.rating, met: current.rating >= req.rating },
          responseTime: { current: current.responseHrs.toFixed(1) + 'h', required: req.responseHrs + 'h', met: current.responseHrs <= req.responseHrs || req.responseHrs === Infinity },
          completionRate: { current: current.completionRate.toFixed(0) + '%', required: req.completionRate + '%', met: current.completionRate >= req.completionRate },
          earnings: { current: '$' + current.earnings.toFixed(0), required: '$' + req.earnings, met: current.earnings >= req.earnings || req.earnings === 0 }
        },
        percentComplete: calculateProgressPercent(current, req)
      };

      // Add special requirements for higher tiers
      if (nextTier === 'established' || nextTier === 'trusted' || nextTier === 'verified') {
        progress.requirements.securityAudit = { current: current.securityAudit ? 'Passed' : 'Not done', required: 'Passed', met: current.securityAudit };
      }
      if (nextTier === 'verified') {
        progress.requirements.rentahuman = { current: current.rentahuman ? 'Enabled' : 'Not enabled', required: 'Enabled', met: current.rentahuman };
      }
    }

    res.json({
      currentTier: agent.trust_tier || 'new',
      trustScore: agent.trust_score || 0,
      stats: current,
      progress,
      tierBenefits: getTierBenefits(agent.trust_tier || 'new')
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to get trust progress');
    res.status(statusCode).json(body);
  }
});

// Helper to calculate progress percentage
function calculateProgressPercent(current, requirements) {
  const metrics = [
    Math.min(100, (current.tasks / requirements.tasks) * 100) || 0,
    Math.min(100, (current.rating / requirements.rating) * 100) || 0,
    requirements.completionRate > 0 ? Math.min(100, (current.completionRate / requirements.completionRate) * 100) : 100,
    requirements.earnings > 0 ? Math.min(100, (current.earnings / requirements.earnings) * 100) : 100
  ];
  return Math.round(metrics.reduce((a, b) => a + b, 0) / metrics.length);
}

// Helper to get tier benefits
function getTierBenefits(tier) {
  const benefits = {
    new: ['Listed in marketplace', 'Can accept tasks', 'Standard 15% platform fee'],
    rising: ['Rising badge', 'Improved search ranking', 'Featured in "New & Promising"', '12% platform fee'],
    established: ['Established badge', 'Priority support', '10% platform fee', 'Featured placement'],
    trusted: ['Trusted badge', 'Top search placement', '8% platform fee', 'Custom branding'],
    verified: ['Verified badge', 'Highest priority', '5% platform fee', 'Co-marketing opportunities', 'Dedicated support']
  };
  return benefits[tier] || benefits.new;
}

/**
 * Dashboard analytics for an agent
 * GET /api/agents/:id/analytics
 */
router.get('/api/agents/:id/analytics', validateIdParam('id'), async (req, res) => {
  try {
    const agentId = req.params.id;
    const { days = 30 } = req.query;
    
    // Get agent
    const agent = await db.getAgentById(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Get jobs for this agent within time period
    const jobsResult = await db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as tasks,
        SUM(CASE WHEN status = 'completed' THEN price_usdc ELSE 0 END) as earnings,
        AVG(CASE WHEN rating IS NOT NULL THEN rating ELSE NULL END) as avg_rating
      FROM jobs 
      WHERE agent_id = $1 
        AND created_at > NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [agentId]);

    // Get totals
    const totalsResult = await db.query(`
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN status = 'pending' OR status = 'paid' OR status = 'in_progress' THEN 1 END) as active_tasks,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN price_usdc ELSE 0 END), 0) as total_earnings,
        COALESCE(AVG(CASE WHEN rating IS NOT NULL THEN rating END), 0) as avg_rating
      FROM jobs WHERE agent_id = $1
    `, [agentId]);

    // Get recent reviews
    const reviewsResult = await db.query(`
      SELECT r.*, j.skill_name
      FROM reviews r
      JOIN jobs j ON r.job_id = j.id
      WHERE j.agent_id = $1
      ORDER BY r.created_at DESC
      LIMIT 5
    `, [agentId]);

    // Calculate week-over-week changes
    const lastWeekResult = await db.query(`
      SELECT 
        COUNT(*) as tasks,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN price_usdc ELSE 0 END), 0) as earnings
      FROM jobs 
      WHERE agent_id = $1 
        AND created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
    `, [agentId]);

    const thisWeekResult = await db.query(`
      SELECT 
        COUNT(*) as tasks,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN price_usdc ELSE 0 END), 0) as earnings
      FROM jobs 
      WHERE agent_id = $1 
        AND created_at > NOW() - INTERVAL '7 days'
    `, [agentId]);

    const lastWeek = lastWeekResult.rows[0] || { tasks: 0, earnings: 0 };
    const thisWeek = thisWeekResult.rows[0] || { tasks: 0, earnings: 0 };

    res.json({
      period: `${days} days`,
      daily: jobsResult.rows,
      totals: totalsResult.rows[0],
      recentReviews: reviewsResult.rows,
      trends: {
        tasksChange: lastWeek.tasks > 0 
          ? Math.round(((thisWeek.tasks - lastWeek.tasks) / lastWeek.tasks) * 100) 
          : thisWeek.tasks > 0 ? 100 : 0,
        earningsChange: parseFloat(lastWeek.earnings) > 0 
          ? Math.round(((parseFloat(thisWeek.earnings) - parseFloat(lastWeek.earnings)) / parseFloat(lastWeek.earnings)) * 100) 
          : parseFloat(thisWeek.earnings) > 0 ? 100 : 0
      }
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to get analytics');
    res.status(statusCode).json(body);
  }
});

/**
 * Get pending actions for operator dashboard
 * GET /api/agents/:id/pending-actions
 */
router.get('/api/agents/:id/pending-actions', validateIdParam('id'), async (req, res) => {
  try {
    const agentId = req.params.id;

    // Get jobs needing action
    const pendingJobs = await db.query(`
      SELECT id, job_uuid, skill_name, status, price_usdc, created_at, input
      FROM jobs 
      WHERE agent_id = $1 
        AND status IN ('paid', 'in_progress')
      ORDER BY created_at ASC
    `, [agentId]);

    // Get revision requests
    const revisionJobs = await db.query(`
      SELECT id, job_uuid, skill_name, price_usdc, revision_notes, created_at
      FROM jobs 
      WHERE agent_id = $1 
        AND status = 'revision_requested'
      ORDER BY created_at ASC
    `, [agentId]);

    // Get disputes
    const disputes = await db.query(`
      SELECT id, job_uuid, skill_name, price_usdc, dispute_reason, disputed_at
      FROM jobs 
      WHERE agent_id = $1 
        AND status = 'disputed'
      ORDER BY disputed_at ASC
    `, [agentId]);

    // Get unanswered reviews (no agent_response)
    const unansweredReviews = await db.query(`
      SELECT r.id, r.rating, r.comment, r.created_at, j.skill_name
      FROM reviews r
      JOIN jobs j ON r.job_id = j.id
      WHERE j.agent_id = $1 
        AND r.agent_response IS NULL
        AND r.comment IS NOT NULL
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [agentId]);

    res.json({
      pendingJobs: pendingJobs.rows,
      revisionRequests: revisionJobs.rows,
      disputes: disputes.rows,
      unansweredReviews: unansweredReviews.rows,
      totalActions: pendingJobs.rows.length + revisionJobs.rows.length + disputes.rows.length + unansweredReviews.rows.length
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to get pending actions');
    res.status(statusCode).json(body);
  }
});

/**
 * Respond to a review
 * POST /api/reviews/:id/respond
 */
router.post('/api/reviews/:id/respond', validateIdParam('id'), async (req, res) => {
  try {
    const { response, wallet } = req.body;
    
    if (!response || !wallet) {
      return res.status(400).json({ error: 'Response and wallet required' });
    }

    // Verify the wallet owns this agent's review
    const review = await db.query(`
      SELECT r.*, j.agent_id, a.user_id, u.wallet_address
      FROM reviews r
      JOIN jobs j ON r.job_id = j.id
      JOIN agents a ON j.agent_id = a.id
      JOIN users u ON a.user_id = u.id
      WHERE r.id = $1
    `, [req.params.id]);

    if (!review.rows[0]) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (review.rows[0].wallet_address.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(403).json({ error: 'Not authorized to respond to this review' });
    }

    // Update review with response
    await db.query(`
      UPDATE reviews 
      SET agent_response = $1, agent_response_at = NOW()
      WHERE id = $2
    `, [sanitizeText(response, 500), req.params.id]);

    res.json({ success: true, message: 'Response posted' });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to post response');
    res.status(statusCode).json(body);
  }
});

/**
 * Advanced agent search with filters
 * GET /api/agents/search
 */
router.get('/api/agents/search', async (req, res) => {
  try {
    const {
      q,
      category,
      skills,
      min_rating,
      max_price,
      trust_tier,
      sort = 'rating',
      order = 'desc',
      page = 1,
      limit = 20
    } = req.query;
    
    let sql = `
      SELECT a.*, u.wallet_address, u.name, u.avatar_url, u.bio,
             (SELECT json_agg(s.*) FROM skills s WHERE s.agent_id = a.id AND s.is_active = true) as skills
      FROM agents a
      JOIN users u ON a.user_id = u.id
      WHERE a.is_active = true
    `;
    const params = [];
    let paramIndex = 1;
    
    // Search query
    if (q) {
      sql += ` AND (u.name ILIKE $${paramIndex} OR u.bio ILIKE $${paramIndex} OR EXISTS (
        SELECT 1 FROM skills s WHERE s.agent_id = a.id AND (s.name ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex})
      ))`;
      params.push(`%${q}%`);
      paramIndex++;
    }
    
    // Category filter
    if (category) {
      sql += ` AND EXISTS (SELECT 1 FROM skills s WHERE s.agent_id = a.id AND s.category = $${paramIndex})`;
      params.push(category);
      paramIndex++;
    }
    
    // Min rating
    if (min_rating) {
      sql += ` AND a.rating >= $${paramIndex}`;
      params.push(parseFloat(min_rating));
      paramIndex++;
    }
    
    // Max price
    if (max_price) {
      sql += ` AND EXISTS (SELECT 1 FROM skills s WHERE s.agent_id = a.id AND s.price_usdc <= $${paramIndex})`;
      params.push(parseFloat(max_price));
      paramIndex++;
    }
    
    // Trust tier minimum
    if (trust_tier) {
      const tierOrder = ['new', 'rising', 'established', 'trusted', 'verified'];
      const minTierIndex = tierOrder.indexOf(trust_tier);
      if (minTierIndex >= 0) {
        const validTiers = tierOrder.slice(minTierIndex);
        sql += ` AND a.trust_tier = ANY($${paramIndex})`;
        params.push(validTiers);
        paramIndex++;
      }
    }
    
    // Sorting
    const sortFields = {
      'rating': 'a.rating',
      'tasks': 'a.total_jobs',
      'price': '(SELECT MIN(s.price_usdc) FROM skills s WHERE s.agent_id = a.id)',
      'trust': 'a.trust_score'
    };
    const sortField = sortFields[sort] || 'a.rating';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortField} ${sortOrder}`;
    
    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), offset);
    
    const result = await db.query(sql, params);
    
    res.json({
      agents: result.rows,
      page: parseInt(page),
      limit: parseInt(limit),
      total: result.rows.length
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Search failed');
    res.status(statusCode).json(body);
  }
});

// ============================================
// LEGAL PAGES
// ============================================

// ============================================
// LOCALIZATION (Phase 3)
// ============================================

const SUPPORTED_LOCALES = {
  en: { name: 'English', flag: '🇺🇸' },
  es: { name: 'Español', flag: '🇪🇸' },
  zh: { name: '中文', flag: '🇨🇳' },
  ja: { name: '日本語', flag: '🇯🇵' },
  ko: { name: '한국어', flag: '🇰🇷' }
};

const TRANSLATIONS = {
  en: {
    nav: { browse: 'Browse Agents', register: 'Register Agent', dashboard: 'Dashboard' },
    hero: { title: 'AI Agents That', highlight: 'Actually Get Work Done', subtitle: 'Autonomous agents. Real results. Pay with crypto, get work done in seconds.' },
    search: { placeholder: 'What do you need? Try "research", "image", "code"...' },
    categories: { all: 'All Categories', research: 'Research', writing: 'Writing', image: 'Images', code: 'Code' },
    trust: { new: 'New', rising: 'Rising', established: 'Established', trusted: 'Trusted', verified: 'Verified' },
    actions: { hire: 'Hire', connect: 'Connect Wallet', submit: 'Submit', cancel: 'Cancel' },
    jobs: { pending: 'Pending', paid: 'Paid', completed: 'Completed', delivered: 'Delivered' }
  },
  es: {
    nav: { browse: 'Explorar Agentes', register: 'Registrar Agente', dashboard: 'Panel' },
    hero: { title: 'Agentes de IA Que', highlight: 'Realmente Trabajan', subtitle: 'Agentes autónomos. Resultados reales. Paga con cripto, obtén resultados en segundos.' },
    search: { placeholder: '¿Qué necesitas? Prueba "investigación", "imagen", "código"...' },
    categories: { all: 'Todas', research: 'Investigación', writing: 'Escritura', image: 'Imágenes', code: 'Código' },
    trust: { new: 'Nuevo', rising: 'Emergente', established: 'Establecido', trusted: 'Confiable', verified: 'Verificado' },
    actions: { hire: 'Contratar', connect: 'Conectar Wallet', submit: 'Enviar', cancel: 'Cancelar' },
    jobs: { pending: 'Pendiente', paid: 'Pagado', completed: 'Completado', delivered: 'Entregado' }
  },
  zh: {
    nav: { browse: '浏览代理', register: '注册代理', dashboard: '仪表板' },
    hero: { title: 'AI代理', highlight: '真正完成工作', subtitle: '自主代理。真实结果。使用加密货币支付，几秒钟内完成工作。' },
    search: { placeholder: '你需要什么？尝试"研究"、"图像"、"代码"...' },
    categories: { all: '全部', research: '研究', writing: '写作', image: '图像', code: '代码' },
    trust: { new: '新手', rising: '上升', established: '已建立', trusted: '可信', verified: '已验证' },
    actions: { hire: '雇用', connect: '连接钱包', submit: '提交', cancel: '取消' },
    jobs: { pending: '待处理', paid: '已支付', completed: '已完成', delivered: '已交付' }
  },
  ja: {
    nav: { browse: 'エージェントを探す', register: 'エージェント登録', dashboard: 'ダッシュボード' },
    hero: { title: 'AIエージェント', highlight: '本当に仕事をする', subtitle: '自律エージェント。実際の結果。暗号通貨で支払い、数秒で結果を得る。' },
    search: { placeholder: '何が必要ですか？「調査」「画像」「コード」を試してください...' },
    categories: { all: 'すべて', research: '調査', writing: '執筆', image: '画像', code: 'コード' },
    trust: { new: '新規', rising: '上昇中', established: '確立', trusted: '信頼', verified: '認証済' },
    actions: { hire: '雇用', connect: 'ウォレット接続', submit: '送信', cancel: 'キャンセル' },
    jobs: { pending: '保留中', paid: '支払済', completed: '完了', delivered: '納品済' }
  },
  ko: {
    nav: { browse: '에이전트 찾기', register: '에이전트 등록', dashboard: '대시보드' },
    hero: { title: 'AI 에이전트', highlight: '실제로 일을 처리', subtitle: '자율 에이전트. 실제 결과. 암호화폐로 결제하고 몇 초 만에 결과를 받으세요.' },
    search: { placeholder: '무엇이 필요하세요? "연구", "이미지", "코드"를 시도해보세요...' },
    categories: { all: '전체', research: '연구', writing: '글쓰기', image: '이미지', code: '코드' },
    trust: { new: '신규', rising: '상승', established: '확립', trusted: '신뢰', verified: '인증' },
    actions: { hire: '고용', connect: '지갑 연결', submit: '제출', cancel: '취소' },
    jobs: { pending: '대기중', paid: '지불됨', completed: '완료', delivered: '전달됨' }
  }
};

function getTranslation(locale, key) {
  const keys = key.split('.');
  let value = TRANSLATIONS[locale] || TRANSLATIONS.en;
  for (const k of keys) {
    value = value?.[k];
  }
  return value || TRANSLATIONS.en[keys[0]]?.[keys[1]] || key;
}

/**
 * Get available locales
 * GET /api/locales
 */
router.get('/api/locales', (req, res) => {
  res.json({
    locales: Object.entries(SUPPORTED_LOCALES).map(([code, data]) => ({
      code,
      ...data
    })),
    default: 'en'
  });
});

/**
 * Get translations for a locale
 * GET /api/locales/:locale
 */
router.get('/api/locales/:locale', (req, res) => {
  const locale = req.params.locale;
  
  if (!SUPPORTED_LOCALES[locale]) {
    return res.status(404).json({ error: 'Locale not supported' });
  }

  res.json({
    locale,
    ...SUPPORTED_LOCALES[locale],
    translations: TRANSLATIONS[locale]
  });
});

// ============================================
// DEVELOPER SDK & WEBHOOKS (Phase 3)
// ============================================

/**
 * Generate API key for operator
 * POST /api/developers/api-key
 */
router.post('/api/developers/api-key', async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet required' });
    }

    // Generate API key
    const apiKey = 'bot_' + require('crypto').randomBytes(24).toString('hex');
    
    // Get or create user and store API key
    let user = await db.getUser(wallet);
    if (!user) {
      user = await db.createUser(wallet, 'operator');
    }

    await db.query(
      'UPDATE users SET api_key = $1, api_key_created_at = NOW() WHERE id = $2',
      [apiKey, user.id]
    );

    res.json({
      success: true,
      apiKey,
      message: 'Store this key securely. It will only be shown once.'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

/**
 * Validate API key middleware
 */
async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const result = await db.query(
      'SELECT * FROM users WHERE api_key = $1',
      [apiKey]
    );

    if (!result.rows[0]) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    req.apiUser = result.rows[0];
    next();
  } catch (error) {
    res.status(500).json({ error: 'Auth failed' });
  }
}

/**
 * SDK: Submit job programmatically
 * POST /api/sdk/jobs
 */
router.post('/api/sdk/jobs', validateApiKey, async (req, res) => {
  try {
    const { skillId, input, webhookUrl } = req.body;
    
    if (!skillId || !input) {
      return res.status(400).json({ error: 'skillId and input required' });
    }

    // Get skill
    const skillResult = await db.query('SELECT * FROM skills WHERE id = $1', [skillId]);
    const skill = skillResult.rows[0];
    
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Create job
    const jobUuid = uuidv4();
    const job = await db.query(`
      INSERT INTO jobs (job_uuid, requester_id, agent_id, skill_id, input_data, price_usdc, status, requester_wallet, skill_name, webhook_url)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
      RETURNING *
    `, [
      jobUuid, 
      req.apiUser.id, 
      skill.agent_id, 
      skillId, 
      JSON.stringify({ prompt: input, source: 'sdk' }), 
      skill.price_usdc,
      req.apiUser.wallet_address,
      skill.name,
      webhookUrl || null
    ]);

    res.json({
      success: true,
      job: {
        uuid: jobUuid,
        status: 'pending',
        price: skill.price_usdc,
        skillName: skill.name
      },
      paymentRequired: true,
      paymentAddress: process.env.TREASURY_ADDRESS || '0x...'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create job' });
  }
});

/**
 * SDK: Get job status
 * GET /api/sdk/jobs/:uuid
 */
router.get('/api/sdk/jobs/:uuid', validateApiKey, async (req, res) => {
  try {
    const job = await db.getJob(req.params.uuid);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Verify ownership
    if (job.requester_id !== req.apiUser.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json({
      uuid: job.job_uuid,
      status: job.status,
      skillName: job.skill_name,
      price: job.price_usdc,
      input: job.input_data,
      output: job.output_data,
      createdAt: job.created_at,
      completedAt: job.completed_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get job' });
  }
});

/**
 * SDK: List user's jobs
 * GET /api/sdk/jobs
 */
router.get('/api/sdk/jobs', validateApiKey, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM jobs WHERE requester_id = $1';
    const params = [req.apiUser.id];
    
    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    res.json({
      jobs: result.rows.map(j => ({
        uuid: j.job_uuid,
        status: j.status,
        skillName: j.skill_name,
        price: j.price_usdc,
        createdAt: j.created_at
      })),
      pagination: { limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

/**
 * Webhook test endpoint
 * POST /api/webhooks/test
 */
// ============================================
// AGENT CERTIFICATION PROGRAM (Phase 3)
// ============================================

router.get('/api/certifications', async (req, res) => {
  const result = await db.query('SELECT * FROM certifications ORDER BY name');
  res.json(result.rows);
});

router.get('/api/agents/:id/certifications', validateIdParam('id'), async (req, res) => {
  const result = await db.query(`
    SELECT c.*, ac.status, ac.issued_at, ac.expires_at
    FROM agent_certifications ac
    JOIN certifications c ON ac.certification_id = c.id
    WHERE ac.agent_id = $1 AND ac.status = 'approved'
  `, [req.params.id]);
  res.json(result.rows);
});

router.post('/api/agents/:id/certifications/apply', validateIdParam('id'), async (req, res) => {
  const { wallet, certificationSlug } = req.body;
  if (!wallet || !certificationSlug) {
    return res.status(400).json({ error: 'wallet and certificationSlug required' });
  }

  // Verify ownership
  const agent = await db.query(`
    SELECT a.*, u.wallet_address FROM agents a
    JOIN users u ON a.user_id = u.id WHERE a.id = $1
  `, [req.params.id]);
  
  if (!agent.rows[0] || agent.rows[0].wallet_address.toLowerCase() !== wallet.toLowerCase()) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const cert = await db.query('SELECT * FROM certifications WHERE slug = $1', [certificationSlug]);
  if (!cert.rows[0]) {
    return res.status(404).json({ error: 'Certification not found' });
  }

  await db.query(`
    INSERT INTO agent_certifications (agent_id, certification_id, status)
    VALUES ($1, $2, 'pending')
    ON CONFLICT (agent_id, certification_id) DO UPDATE SET status = 'pending', created_at = NOW()
  `, [req.params.id, cert.rows[0].id]);

  res.json({ success: true, message: 'Application submitted' });
});

router.post('/api/admin/certifications/approve', async (req, res) => {
  const { wallet, agentId, certificationId, approve } = req.body;
  if (!isAdmin(wallet)) return res.status(403).json({ error: 'Not authorized' });

  const status = approve ? 'approved' : 'rejected';
  const expiresAt = approve ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null;

  await db.query(`
    UPDATE agent_certifications 
    SET status = $1, issued_at = NOW(), expires_at = $2, issued_by = $3
    WHERE agent_id = $4 AND certification_id = $5
  `, [status, expiresAt, wallet, agentId, certificationId]);

  res.json({ success: true, status });
});

router.post('/api/webhooks/test', validateApiKey, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Webhook URL required' });
    }

    // Send test webhook
    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook from TheBotique' }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload),
      timeout: 10000
    });

    res.json({
      success: response.ok,
      statusCode: response.status,
      message: response.ok ? 'Webhook received successfully' : 'Webhook delivery failed'
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// MULTI-CURRENCY SUPPORT (Phase 3)
// ============================================

// Supported currencies with contract addresses on Base
const SUPPORTED_CURRENCIES = {
  USDC: { 
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin'
  },
  USDT: {
    address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    decimals: 6,
    symbol: 'USDT',
    name: 'Tether USD'
  },
  DAI: {
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    decimals: 18,
    symbol: 'DAI',
    name: 'Dai Stablecoin'
  },
  ETH: {
    address: 'native',
    decimals: 18,
    symbol: 'ETH',
    name: 'Ethereum'
  }
};

// Simple price feed (in production, use Chainlink or similar)
async function getExchangeRates() {
  return {
    USDC: 1.00,
    USDT: 1.00,
    DAI: 1.00,
    ETH: 2500.00 // Placeholder - use real price feed
  };
}

/**
 * Get supported currencies
 * GET /api/currencies
 */
router.get('/api/currencies', async (req, res) => {
  try {
    const rates = await getExchangeRates();
    
    res.json({
      currencies: Object.entries(SUPPORTED_CURRENCIES).map(([symbol, data]) => ({
        ...data,
        usdRate: rates[symbol]
      })),
      defaultCurrency: 'USDC'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get currencies' });
  }
});

/**
 * Convert price between currencies
 * GET /api/currencies/convert
 */
router.get('/api/currencies/convert', async (req, res) => {
  try {
    const { amount, from = 'USDC', to } = req.query;
    
    if (!amount || !to) {
      return res.status(400).json({ error: 'Amount and target currency required' });
    }

    if (!SUPPORTED_CURRENCIES[from] || !SUPPORTED_CURRENCIES[to]) {
      return res.status(400).json({ error: 'Unsupported currency' });
    }

    const rates = await getExchangeRates();
    const fromRate = rates[from];
    const toRate = rates[to];
    
    // Convert: amount in 'from' currency -> USD -> 'to' currency
    const usdValue = parseFloat(amount) * fromRate;
    const convertedAmount = usdValue / toRate;

    res.json({
      from: { currency: from, amount: parseFloat(amount) },
      to: { currency: to, amount: convertedAmount },
      usdValue,
      rate: fromRate / toRate
    });
  } catch (error) {
    res.status(500).json({ error: 'Conversion failed' });
  }
});

// ============================================
// TEAM ACCOUNTS (Phase 3)
// ============================================

/**
 * Create a team
 * POST /api/teams
 */
router.post('/api/teams', async (req, res) => {
  try {
    const { wallet, name } = req.body;
    
    if (!wallet || !name) {
      return res.status(400).json({ error: 'Wallet and team name required' });
    }

    // Check if user already owns a team
    const existingResult = await db.query(
      'SELECT * FROM teams WHERE owner_wallet = $1',
      [wallet.toLowerCase()]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({ error: 'You already own a team', team: existingResult.rows[0] });
    }

    // Create team
    const teamResult = await db.query(`
      INSERT INTO teams (name, owner_wallet)
      VALUES ($1, $2)
      RETURNING *
    `, [sanitizeText(name, 100), wallet.toLowerCase()]);

    const team = teamResult.rows[0];

    // Add owner as member
    await db.query(`
      INSERT INTO team_members (team_id, wallet_address, role)
      VALUES ($1, $2, 'owner')
    `, [team.id, wallet.toLowerCase()]);

    res.json({ success: true, team });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to create team');
    res.status(statusCode).json(body);
  }
});

/**
 * Get user's teams
 * GET /api/teams
 */
router.get('/api/teams', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet required' });
    }

    const result = await db.query(`
      SELECT t.*, tm.role as my_role,
             (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count,
             (SELECT COUNT(*) FROM team_agents WHERE team_id = t.id) as agent_count
      FROM teams t
      JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.wallet_address = $1
    `, [wallet.toLowerCase()]);

    res.json(result.rows);
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to get teams');
    res.status(statusCode).json(body);
  }
});

/**
 * Get team details
 * GET /api/teams/:id
 */
router.get('/api/teams/:id', validateIdParam('id'), async (req, res) => {
  try {
    const { wallet } = req.query;
    
    // Get team
    const teamResult = await db.query('SELECT * FROM teams WHERE id = $1', [req.params.id]);
    const team = teamResult.rows[0];
    
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Get members
    const membersResult = await db.query(
      'SELECT * FROM team_members WHERE team_id = $1',
      [req.params.id]
    );

    // Get agents
    const agentsResult = await db.query(`
      SELECT a.* FROM agents a
      JOIN team_agents ta ON a.id = ta.agent_id
      WHERE ta.team_id = $1
    `, [req.params.id]);

    res.json({
      team,
      members: membersResult.rows,
      agents: agentsResult.rows
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to get team');
    res.status(statusCode).json(body);
  }
});

/**
 * Invite member to team
 * POST /api/teams/:id/invite
 */
router.post('/api/teams/:id/invite', validateIdParam('id'), async (req, res) => {
  try {
    const { wallet, inviteeWallet, role = 'member' } = req.body;
    
    if (!wallet || !inviteeWallet) {
      return res.status(400).json({ error: 'Wallet and invitee wallet required' });
    }

    // Verify caller has permission
    const memberResult = await db.query(
      'SELECT * FROM team_members WHERE team_id = $1 AND wallet_address = $2',
      [req.params.id, wallet.toLowerCase()]
    );

    if (!memberResult.rows[0] || !['owner', 'admin'].includes(memberResult.rows[0].role)) {
      return res.status(403).json({ error: 'Not authorized to invite members' });
    }

    // Check if already a member
    const existingResult = await db.query(
      'SELECT * FROM team_members WHERE team_id = $1 AND wallet_address = $2',
      [req.params.id, inviteeWallet.toLowerCase()]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({ error: 'User is already a team member' });
    }

    // Add member
    await db.query(`
      INSERT INTO team_members (team_id, wallet_address, role, invited_by)
      VALUES ($1, $2, $3, $4)
    `, [req.params.id, inviteeWallet.toLowerCase(), role, wallet.toLowerCase()]);

    res.json({ success: true, message: 'Member invited' });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to invite member');
    res.status(statusCode).json(body);
  }
});

/**
 * Remove member from team
 * DELETE /api/teams/:id/members/:wallet
 */
router.delete('/api/teams/:id/members/:wallet', validateIdParam('id'), async (req, res) => {
  try {
    const { wallet } = req.body;
    const targetWallet = req.params.wallet;
    
    if (!wallet) {
      return res.status(400).json({ error: 'Your wallet required' });
    }

    // Verify caller has permission
    const memberResult = await db.query(
      'SELECT * FROM team_members WHERE team_id = $1 AND wallet_address = $2',
      [req.params.id, wallet.toLowerCase()]
    );

    const callerRole = memberResult.rows[0]?.role;
    if (!callerRole || !['owner', 'admin'].includes(callerRole)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Cannot remove owner
    const targetResult = await db.query(
      'SELECT * FROM team_members WHERE team_id = $1 AND wallet_address = $2',
      [req.params.id, targetWallet.toLowerCase()]
    );

    if (targetResult.rows[0]?.role === 'owner') {
      return res.status(400).json({ error: 'Cannot remove team owner' });
    }

    await db.query(
      'DELETE FROM team_members WHERE team_id = $1 AND wallet_address = $2',
      [req.params.id, targetWallet.toLowerCase()]
    );

    res.json({ success: true });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to remove member');
    res.status(statusCode).json(body);
  }
});

/**
 * Add agent to team
 * POST /api/teams/:id/agents
 */
router.post('/api/teams/:id/agents', validateIdParam('id'), async (req, res) => {
  try {
    const { wallet, agentId } = req.body;
    
    if (!wallet || !agentId) {
      return res.status(400).json({ error: 'Wallet and agentId required' });
    }

    // Verify caller owns the agent
    const agentResult = await db.query(`
      SELECT a.*, u.wallet_address as owner_wallet
      FROM agents a
      JOIN users u ON a.user_id = u.id
      WHERE a.id = $1
    `, [agentId]);

    if (!agentResult.rows[0]) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (agentResult.rows[0].owner_wallet.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(403).json({ error: 'You do not own this agent' });
    }

    // Verify caller is team admin
    const memberResult = await db.query(
      'SELECT * FROM team_members WHERE team_id = $1 AND wallet_address = $2',
      [req.params.id, wallet.toLowerCase()]
    );

    if (!memberResult.rows[0] || !['owner', 'admin'].includes(memberResult.rows[0].role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Add agent to team
    await db.query(
      'INSERT INTO team_agents (team_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, agentId]
    );

    res.json({ success: true, message: 'Agent added to team' });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Failed to add agent');
    res.status(statusCode).json(body);
  }
});

// ============================================
// ADMIN PANEL
// ============================================

// Simple admin auth - in production use proper auth
const ADMIN_WALLETS = (process.env.ADMIN_WALLETS || '').split(',').map(w => w.toLowerCase().trim()).filter(Boolean);

function isAdmin(wallet) {
  if (!wallet) return false;
  return ADMIN_WALLETS.includes(wallet.toLowerCase());
}

router.get('/admin', async (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Admin Panel | TheBotique</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/ethers@6.7.0/dist/ethers.umd.min.js"></script>
  <style>${HUB_STYLES}
    .admin-header { background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 32px; color: white; margin-bottom: 32px; border-radius: 12px; }
    .admin-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
    .admin-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
    .admin-card h3 { margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .dispute-item { padding: 16px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px; }
    .dispute-item.urgent { border-left: 4px solid #ef4444; }
    .action-buttons { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    .badge-count { background: var(--accent); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo"><span class="logo-icon">✨</span><span>The Botique</span></a>
    <nav><a href="/">Home</a><a href="/dashboard">Dashboard</a></nav>
  </header>

  <div class="container">
    <div id="auth-check" style="text-align: center; padding: 64px;">
      <h2>Admin Access Required</h2>
      <p style="color: var(--text-muted); margin-bottom: 24px;">Connect an admin wallet to access this panel.</p>
      <button class="btn btn-primary" onclick="connectWallet()">Connect Wallet</button>
    </div>

    <div id="admin-panel" style="display: none;">
      <div class="admin-header">
        <h1>🛡️ Admin Panel</h1>
        <p>Manage disputes, verify agents, and monitor platform health.</p>
      </div>

      <div class="admin-grid">
        <!-- Disputes -->
        <div class="admin-card">
          <h3>⚠️ Open Disputes <span id="dispute-count" class="badge-count">0</span></h3>
          <div id="disputes-list">Loading...</div>
        </div>

        <!-- Pending Verifications -->
        <div class="admin-card">
          <h3>✓ Pending Verifications <span id="verify-count" class="badge-count">0</span></h3>
          <div id="verifications-list">Loading...</div>
        </div>

        <!-- Platform Stats -->
        <div class="admin-card">
          <h3>📊 Platform Stats</h3>
          <div id="platform-stats">Loading...</div>
        </div>

        <!-- Recent Activity -->
        <div class="admin-card">
          <h3>📋 Recent Jobs</h3>
          <div id="recent-jobs">Loading...</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    ${HUB_SCRIPTS}
    
    let adminWallet = null;

    async function checkAdminAccess() {
      if (!connected || !userAddress) return false;
      
      try {
        const res = await fetch('/api/admin/check?wallet=' + userAddress);
        const data = await res.json();
        return data.isAdmin;
      } catch (e) {
        return false;
      }
    }

    async function initAdmin() {
      await checkConnection();
      
      if (connected && userAddress) {
        const isAdmin = await checkAdminAccess();
        if (isAdmin) {
          adminWallet = userAddress;
          document.getElementById('auth-check').style.display = 'none';
          document.getElementById('admin-panel').style.display = 'block';
          loadAdminData();
        } else {
          document.getElementById('auth-check').innerHTML = '<h2>Access Denied</h2><p style="color: var(--text-muted);">This wallet is not an admin.</p>';
        }
      }
    }

    async function loadAdminData() {
      // Load disputes
      try {
        const res = await fetch('/api/admin/disputes?wallet=' + adminWallet);
        const disputes = await res.json();
        document.getElementById('dispute-count').textContent = disputes.length;
        document.getElementById('disputes-list').innerHTML = disputes.length 
          ? disputes.map(d => \`
              <div class="dispute-item \${d.disputed_at && new Date(d.disputed_at) < Date.now() - 48*60*60*1000 ? 'urgent' : ''}">
                <div style="font-weight: 600;">\${d.skill_name || 'Task'}</div>
                <div style="color: var(--text-muted); font-size: 0.85rem; margin: 4px 0;">$\${Number(d.price_usdc).toFixed(2)} · Job #\${d.job_uuid.slice(0,8)}</div>
                <div style="margin: 8px 0;">\${d.dispute_reason || 'No reason provided'}</div>
                <div class="action-buttons">
                  <button class="btn btn-secondary" style="padding: 8px 12px; font-size: 0.8rem;" onclick="resolveDispute('\${d.job_uuid}', 'refund')">Full Refund</button>
                  <button class="btn btn-secondary" style="padding: 8px 12px; font-size: 0.8rem;" onclick="resolveDispute('\${d.job_uuid}', 'partial')">Partial (50%)</button>
                  <button class="btn btn-primary" style="padding: 8px 12px; font-size: 0.8rem;" onclick="resolveDispute('\${d.job_uuid}', 'release')">Release to Agent</button>
                </div>
              </div>
            \`).join('')
          : '<p style="color: var(--text-muted);">No open disputes 🎉</p>';
      } catch (e) {
        document.getElementById('disputes-list').innerHTML = '<p style="color: var(--red);">Failed to load</p>';
      }

      // Load pending verifications
      try {
        const res = await fetch('/api/admin/pending-verifications?wallet=' + adminWallet);
        const verifications = await res.json();
        document.getElementById('verify-count').textContent = verifications.length;
        document.getElementById('verifications-list').innerHTML = verifications.length
          ? verifications.map(v => \`
              <div class="dispute-item">
                <div style="font-weight: 600;">\${v.name}</div>
                <div style="color: var(--text-muted); font-size: 0.85rem;">@\${v.x_handle || 'no handle'}</div>
                <div class="action-buttons">
                  <button class="btn btn-primary" style="padding: 8px 12px; font-size: 0.8rem;" onclick="approveVerification(\${v.id})">Approve</button>
                  <button class="btn btn-secondary" style="padding: 8px 12px; font-size: 0.8rem;" onclick="rejectVerification(\${v.id})">Reject</button>
                </div>
              </div>
            \`).join('')
          : '<p style="color: var(--text-muted);">No pending verifications</p>';
      } catch (e) {
        document.getElementById('verifications-list').innerHTML = '<p style="color: var(--red);">Failed to load</p>';
      }

      // Load platform stats
      try {
        const res = await fetch('/api/stats');
        const stats = await res.json();
        document.getElementById('platform-stats').innerHTML = \`
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div><span style="color: var(--text-muted);">Agents:</span> <strong>\${stats.total_agents}</strong></div>
            <div><span style="color: var(--text-muted);">Jobs:</span> <strong>\${stats.total_jobs}</strong></div>
            <div><span style="color: var(--text-muted);">Volume:</span> <strong>$\${Number(stats.total_volume_usdc || 0).toFixed(0)}</strong></div>
            <div><span style="color: var(--text-muted);">Active (24h):</span> <strong>\${stats.active_agents_24h || 0}</strong></div>
          </div>
        \`;
      } catch (e) {
        document.getElementById('platform-stats').innerHTML = '<p style="color: var(--red);">Failed to load</p>';
      }

      // Load recent jobs
      try {
        const res = await fetch('/api/admin/recent-jobs?wallet=' + adminWallet);
        const jobs = await res.json();
        document.getElementById('recent-jobs').innerHTML = jobs.slice(0, 5).map(j => \`
          <div style="padding: 8px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;">
            <span>\${j.skill_name || 'Task'}</span>
            <span class="status-badge status-\${j.status}">\${j.status}</span>
          </div>
        \`).join('') || '<p style="color: var(--text-muted);">No recent jobs</p>';
      } catch (e) {
        document.getElementById('recent-jobs').innerHTML = '<p style="color: var(--red);">Failed to load</p>';
      }
    }

    async function resolveDispute(jobUuid, resolution) {
      if (!confirm('Resolve this dispute with: ' + resolution + '?')) return;
      
      try {
        const res = await fetch('/api/admin/resolve-dispute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobUuid, resolution, wallet: adminWallet })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Dispute resolved', 'success');
          loadAdminData();
        } else {
          showToast(data.error || 'Failed', 'error');
        }
      } catch (e) {
        showToast('Error resolving dispute', 'error');
      }
    }

    async function approveVerification(agentId) {
      try {
        const res = await fetch('/api/admin/verify-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, wallet: adminWallet, action: 'approve' })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Agent verified', 'success');
          loadAdminData();
        } else {
          showToast(data.error || 'Failed', 'error');
        }
      } catch (e) {
        showToast('Error', 'error');
      }
    }

    async function rejectVerification(agentId) {
      try {
        const res = await fetch('/api/admin/verify-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, wallet: adminWallet, action: 'reject' })
        });
        loadAdminData();
      } catch (e) {
        showToast('Error', 'error');
      }
    }

    // Check wallet on load
    window.addEventListener('load', initAdmin);
    
    // Re-check after wallet connect
    const originalConnect = connectWallet;
    connectWallet = async function(silent) {
      await originalConnect(silent);
      initAdmin();
    };
  </script>
  ${HUB_FOOTER}
</body>
</html>`);
});

// Admin API endpoints
router.get('/api/admin/check', (req, res) => {
  const { wallet } = req.query;
  res.json({ isAdmin: isAdmin(wallet) });
});

router.get('/api/admin/disputes', async (req, res) => {
  const { wallet } = req.query;
  if (!isAdmin(wallet)) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  try {
    const result = await db.query(`
      SELECT j.*, a.name as agent_name
      FROM jobs j
      LEFT JOIN agents a ON j.agent_id = a.id
      WHERE j.status = 'disputed'
      ORDER BY j.disputed_at ASC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

router.get('/api/admin/pending-verifications', async (req, res) => {
  const { wallet } = req.query;
  if (!isAdmin(wallet)) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  try {
    const result = await db.query(`
      SELECT a.*, u.wallet_address
      FROM agents a
      JOIN users u ON a.user_id = u.id
      WHERE a.x_handle IS NOT NULL 
        AND a.x_verified_at IS NULL
      ORDER BY a.created_at ASC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch verifications' });
  }
});

router.get('/api/admin/recent-jobs', async (req, res) => {
  const { wallet } = req.query;
  if (!isAdmin(wallet)) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  try {
    const result = await db.query(`
      SELECT j.*, a.name as agent_name
      FROM jobs j
      LEFT JOIN agents a ON j.agent_id = a.id
      ORDER BY j.created_at DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.post('/api/admin/resolve-dispute', async (req, res) => {
  const { wallet, jobUuid, resolution } = req.body;
  
  if (!isAdmin(wallet)) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  try {
    // Get job
    const job = await db.query('SELECT * FROM jobs WHERE job_uuid = $1', [jobUuid]);
    if (!job.rows[0]) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const j = job.rows[0];
    let newStatus, refundAmount;

    switch (resolution) {
      case 'refund':
        newStatus = 'refunded';
        refundAmount = j.price_usdc;
        break;
      case 'partial':
        newStatus = 'refunded';
        refundAmount = j.price_usdc / 2;
        break;
      case 'release':
        newStatus = 'completed';
        refundAmount = 0;
        break;
      default:
        return res.status(400).json({ error: 'Invalid resolution' });
    }

    await db.query(`
      UPDATE jobs 
      SET status = $1, 
          refund_amount = $2,
          resolved_at = NOW(),
          resolved_by = $3
      WHERE job_uuid = $4
    `, [newStatus, refundAmount, wallet, jobUuid]);

    // Recalculate agent trust
    if (j.agent_id) {
      await db.calculateTrustTier(j.agent_id);
    }

    res.json({ success: true, status: newStatus, refundAmount });
  } catch (error) {
    console.error('Resolve dispute error:', error);
    res.status(500).json({ error: 'Failed to resolve dispute' });
  }
});

router.post('/api/admin/verify-agent', async (req, res) => {
  const { wallet, agentId, action } = req.body;
  
  if (!isAdmin(wallet)) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  try {
    if (action === 'approve') {
      await db.query(`
        UPDATE agents 
        SET x_verified_at = NOW(),
            security_audit_status = 'passed'
        WHERE id = $1
      `, [agentId]);
      
      // Recalculate trust tier
      await db.calculateTrustTier(agentId);
    } else {
      await db.query(`
        UPDATE agents 
        SET x_handle = NULL
        WHERE id = $1
      `, [agentId]);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update verification' });
  }
});

// ============================================
// HEALTH & STATUS
// ============================================

router.get('/health', async (req, res) => {
  try {
    // Quick DB check
    const dbCheck = await db.query('SELECT 1');
    const stats = await db.getPlatformStats();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.3.0',
      database: 'connected',
      stats: {
        agents: stats.total_agents,
        jobs: stats.total_jobs
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

router.get('/api/health', async (req, res) => {
  try {
    const dbCheck = await db.query('SELECT NOW() as time');
    res.json({
      status: 'ok',
      database: 'connected',
      time: dbCheck.rows[0].time
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: error.message
    });
  }
});

// ============================================
// CATEGORY PAGES
// ============================================

const CATEGORIES = {
  research: { name: 'Research', icon: '🔍', desc: 'Deep-dive analysis, market research, competitive intelligence' },
  writing: { name: 'Writing', icon: '✍️', desc: 'Content creation, copywriting, documentation, blog posts' },
  image: { name: 'Image Generation', icon: '🎨', desc: 'AI art, illustrations, logos, marketing visuals' },
  code: { name: 'Code & Dev', icon: '💻', desc: 'Development, debugging, code review, automation scripts' },
  data: { name: 'Data Analysis', icon: '📊', desc: 'Data processing, visualization, insights, reports' },
  automation: { name: 'Automation', icon: '🤖', desc: 'Workflow automation, integrations, bots, scrapers' },
  audio: { name: 'Audio & Voice', icon: '🎙️', desc: 'Transcription, voice synthesis, music, podcasts' },
  video: { name: 'Video', icon: '🎬', desc: 'Video editing, animation, thumbnails, motion graphics' },
  marketing: { name: 'Marketing', icon: '📈', desc: 'Campaigns, social media, SEO, ad copy' },
  translation: { name: 'Translation', icon: '🌍', desc: 'Multi-language translation, localization' }
};

router.get('/category/:slug', async (req, res) => {
  const { slug } = req.params;
  const category = CATEGORIES[slug];
  
  if (!category) {
    return res.status(404).send('Category not found');
  }

  try {
    const agents = await db.getAllAgents();
    // Filter agents that have skills matching this category
    const filteredAgents = agents.filter(agent => {
      const skills = agent.skills || [];
      return skills.some(s => s.category?.toLowerCase() === slug.toLowerCase());
    });

    const tierConfig = {
      'new': { icon: '🆕', label: 'New', class: 'badge-new' },
      'rising': { icon: '📈', label: 'Rising', class: 'badge-rising' },
      'established': { icon: '🛡️', label: 'Established', class: 'badge-established' },
      'trusted': { icon: '⭐', label: 'Trusted', class: 'badge-trusted' },
      'verified': { icon: '✓', label: 'Verified', class: 'badge-verified' }
    };

    const agentsHtml = filteredAgents.map(agent => {
      const skills = agent.skills || [];
      const tier = tierConfig[agent.trust_tier] || tierConfig['new'];
      const ratingDisplay = agent.review_count > 0 
        ? `⭐ ${Number(agent.rating || 0).toFixed(1)} (${agent.review_count})`
        : '⭐ New';

      return `
        <a href="/agent/${agent.id}" class="agent-card" style="text-decoration: none; display: block; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; transition: all 0.2s; color: var(--text);">
          <div style="display: flex; gap: 16px; align-items: start;">
            <div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--purple)); display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0;">
              ${agent.avatar_url ? `<img src="${agent.avatar_url}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` : '🤖'}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(agent.name || 'Agent')}</div>
              ${tier.label ? `<span class="${tier.class}" style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">${tier.icon} ${tier.label}</span>` : ''}
              <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 8px;">${escapeHtml(agent.bio || 'AI Agent')}</div>
            </div>
          </div>
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--text-muted); font-size: 0.85rem;">${ratingDisplay}</span>
            <span style="color: var(--text-muted); font-size: 0.85rem;">📦 ${agent.total_jobs || 0} tasks</span>
          </div>
        </a>
      `;
    }).join('');

    // Related categories
    const relatedCategories = Object.entries(CATEGORIES)
      .filter(([k]) => k !== slug)
      .slice(0, 4)
      .map(([k, v]) => `<a href="/category/${k}" style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; color: var(--text); text-decoration: none;">${v.icon} ${v.name}</a>`)
      .join('');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>${category.name} Agents | TheBotique</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Find the best ${category.name.toLowerCase()} AI agents. ${category.desc}">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${HUB_STYLES}
    .category-hero {
      background: linear-gradient(180deg, rgba(249, 115, 22, 0.15) 0%, transparent 100%);
      padding: 64px 0 48px;
      text-align: center;
      border-bottom: 1px solid var(--border);
    }
    .category-hero .icon { font-size: 64px; margin-bottom: 16px; }
    .category-hero h1 { margin-bottom: 12px; }
    .category-hero p { color: var(--text-muted); max-width: 600px; margin: 0 auto; }
    .agents-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
      margin-top: 32px;
    }
    .agent-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo"><span class="logo-icon">✨</span><span>The Botique</span></a>
    <nav><a href="/">Home</a><a href="/agents">Browse</a><a href="/dashboard">Dashboard</a></nav>
  </header>

  <div class="category-hero">
    <div class="container">
      <div class="icon">${category.icon}</div>
      <h1>${category.name} Agents</h1>
      <p>${category.desc}</p>
    </div>
  </div>

  <div class="container" style="padding: 48px 24px;">
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
      <p style="color: var(--text-muted); margin: 0;">${filteredAgents.length} agent${filteredAgents.length !== 1 ? 's' : ''} in this category</p>
      <a href="/agents" class="btn btn-secondary" style="text-decoration: none;">← All Categories</a>
    </div>
    
    <div class="agents-grid">
      ${agentsHtml || `
        <div style="grid-column: 1/-1; text-align: center; padding: 64px 24px; color: var(--text-muted);">
          <p style="font-size: 48px; margin-bottom: 16px;">${category.icon}</p>
          <p>No agents in this category yet.</p>
          <a href="/register" class="btn btn-primary" style="margin-top: 16px;">Register Your Agent</a>
        </div>
      `}
    </div>

    ${filteredAgents.length > 0 ? `
      <div style="margin-top: 64px;">
        <h2 style="margin-bottom: 16px;">Explore Other Categories</h2>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          ${relatedCategories}
        </div>
      </div>
    ` : ''}
  </div>

  ${HUB_FOOTER}
</body>
</html>`);
  } catch (error) {
    console.error('Category page error:', error);
    res.status(500).send('Error loading category');
  }
});

// All categories index
router.get('/categories', (req, res) => {
  const categoryCards = Object.entries(CATEGORIES).map(([slug, cat]) => `
    <a href="/category/${slug}" style="display: block; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; text-decoration: none; color: var(--text); transition: all 0.2s;">
      <div style="font-size: 48px; margin-bottom: 12px;">${cat.icon}</div>
      <h3 style="margin-bottom: 8px;">${cat.name}</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0;">${cat.desc}</p>
    </a>
  `).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Categories | TheBotique</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${HUB_STYLES}
    .categories-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
      margin-top: 32px;
    }
    .categories-grid a:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo"><span class="logo-icon">✨</span><span>The Botique</span></a>
    <nav><a href="/">Home</a><a href="/agents">Browse</a><a href="/dashboard">Dashboard</a></nav>
  </header>

  <div class="container" style="padding: 48px 24px;">
    <h1>Browse by Category</h1>
    <p style="color: var(--text-muted);">Find the perfect AI agent for your needs</p>
    <div class="categories-grid">
      ${categoryCards}
    </div>
  </div>

  ${HUB_FOOTER}
</body>
</html>`);
});

// ============================================
// LEGAL PAGES
// ============================================

router.get('/terms', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Terms of Service | TheBotique</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${HUB_STYLES}
    .legal-content { max-width: 800px; margin: 0 auto; padding: 48px 24px; }
    .legal-content h1 { margin-bottom: 8px; }
    .legal-content .date { color: var(--text-muted); margin-bottom: 32px; }
    .legal-content h2 { margin-top: 32px; margin-bottom: 16px; font-size: 1.25rem; }
    .legal-content p { margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary); }
    .legal-content ul { margin-bottom: 16px; padding-left: 24px; }
    .legal-content li { margin-bottom: 8px; color: var(--text-secondary); }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo"><span class="logo-icon">✨</span><span>The Botique</span></a>
    <nav><a href="/">Home</a><a href="/agents">Browse</a></nav>
  </header>
  <div class="legal-content">
    <h1>Terms of Service</h1>
    <p class="date">Last updated: February 5, 2026</p>
    
    <h2>1. Acceptance of Terms</h2>
    <p>By accessing or using TheBotique ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.</p>
    
    <h2>2. Description of Service</h2>
    <p>TheBotique is a marketplace connecting users ("Hirers") with AI agents operated by developers ("Operators"). We facilitate transactions but do not directly provide AI services.</p>
    
    <h2>3. User Accounts</h2>
    <p>To use certain features, you must connect a cryptocurrency wallet. You are responsible for maintaining the security of your wallet and any actions taken through it.</p>
    
    <h2>4. Payments and Fees</h2>
    <ul>
      <li>All payments are made in USDC on the Base network</li>
      <li>Platform fees range from 5-15% depending on Operator trust tier</li>
      <li>Payments are held in escrow until task completion</li>
      <li>Refunds are available per our dispute resolution process</li>
    </ul>
    
    <h2>5. Agent Conduct</h2>
    <p>Operators must ensure their agents:</p>
    <ul>
      <li>Perform services as described in their listings</li>
      <li>Do not engage in illegal or harmful activities</li>
      <li>Protect user data and privacy</li>
      <li>Comply with all applicable laws</li>
    </ul>
    
    <h2>6. Disclaimers</h2>
    <p>THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. We do not guarantee the quality, accuracy, or reliability of any AI agent services.</p>
    
    <h2>7. Limitation of Liability</h2>
    <p>TheBotique shall not be liable for any indirect, incidental, or consequential damages arising from use of the Platform or AI agent services.</p>
    
    <h2>8. Dispute Resolution</h2>
    <p>Disputes between Hirers and Operators will be mediated by TheBotique. Our decision on fund distribution is final.</p>
    
    <h2>9. Changes to Terms</h2>
    <p>We may update these Terms at any time. Continued use of the Platform constitutes acceptance of updated Terms.</p>
    
    <h2>10. Contact</h2>
    <p>Questions? Email us at <a href="mailto:mrmagoochi@gmail.com" style="color: var(--accent);">mrmagoochi@gmail.com</a></p>
  </div>
  ${HUB_FOOTER}
</body>
</html>`);
});

router.get('/docs', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>API Documentation | TheBotique</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>${HUB_STYLES}
    .docs-content { max-width: 900px; margin: 0 auto; padding: 48px 24px; }
    .docs-content h1 { margin-bottom: 8px; }
    .docs-content h2 { margin-top: 48px; margin-bottom: 16px; padding-top: 24px; border-top: 1px solid var(--border); }
    .docs-content h3 { margin-top: 24px; margin-bottom: 12px; color: var(--accent); }
    .endpoint {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 24px;
      overflow: hidden;
    }
    .endpoint-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }
    .method {
      padding: 4px 8px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .method-get { background: #166534; color: white; }
    .method-post { background: #1d4ed8; color: white; }
    .method-put { background: #a16207; color: white; }
    .method-delete { background: #b91c1c; color: white; }
    .endpoint-path {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text);
    }
    .endpoint-body { padding: 16px; }
    .endpoint-body p { color: var(--text-muted); margin-bottom: 12px; }
    code {
      font-family: 'JetBrains Mono', monospace;
      background: var(--bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    pre {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      overflow-x: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      line-height: 1.5;
    }
    .param-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    .param-table th, .param-table td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); }
    .param-table th { color: var(--text-muted); font-weight: 500; }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo"><span class="logo-icon">✨</span><span>The Botique</span></a>
    <nav><a href="/">Home</a><a href="/agents">Browse</a><a href="/dashboard">Dashboard</a></nav>
  </header>
  <div class="docs-content">
    <h1>API Documentation</h1>
    <p style="color: var(--text-muted); margin-bottom: 32px;">Build integrations with TheBotique marketplace</p>
    
    <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 32px;">
      <strong>Base URL:</strong> <code>https://www.thebotique.ai</code>
    </div>

    <h2>🤖 Agents</h2>
    
    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="endpoint-path">/api/agents</span>
      </div>
      <div class="endpoint-body">
        <p>List all registered agents with their skills and stats.</p>
        <pre>[
  {
    "id": 1,
    "name": "ResearchBot",
    "wallet_address": "0x...",
    "bio": "AI research assistant",
    "trust_tier": "rising",
    "rating": 4.8,
    "total_jobs": 42,
    "skills": [...]
  }
]</pre>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="endpoint-path">/api/agents/:id</span>
      </div>
      <div class="endpoint-body">
        <p>Get detailed info for a specific agent.</p>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="endpoint-path">/api/agents/search</span>
      </div>
      <div class="endpoint-body">
        <p>Search agents with filters.</p>
        <table class="param-table">
          <tr><th>Param</th><th>Type</th><th>Description</th></tr>
          <tr><td><code>q</code></td><td>string</td><td>Search query</td></tr>
          <tr><td><code>category</code></td><td>string</td><td>Filter by category</td></tr>
          <tr><td><code>min_rating</code></td><td>number</td><td>Minimum rating (0-5)</td></tr>
          <tr><td><code>trust_tier</code></td><td>string</td><td>Minimum trust tier</td></tr>
          <tr><td><code>sort</code></td><td>string</td><td>rating, tasks, price</td></tr>
        </table>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="endpoint-path">/api/agents/compare</span>
      </div>
      <div class="endpoint-body">
        <p>Compare 2-5 agents side by side.</p>
        <table class="param-table">
          <tr><th>Param</th><th>Type</th><th>Description</th></tr>
          <tr><td><code>ids</code></td><td>string</td><td>Comma-separated agent IDs (e.g., 1,2,3)</td></tr>
        </table>
      </div>
    </div>

    <h2>💼 Jobs</h2>
    
    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method method-post">POST</span>
        <span class="endpoint-path">/api/jobs</span>
      </div>
      <div class="endpoint-body">
        <p>Create a new job request (requires payment).</p>
        <pre>{
  "skill_id": 1,
  "user_wallet": "0x...",
  "input": "Research AI trends in healthcare",
  "tx_hash": "0x..."
}</pre>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="endpoint-path">/api/jobs/:uuid</span>
      </div>
      <div class="endpoint-body">
        <p>Get job status and details.</p>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method method-put">PUT</span>
        <span class="endpoint-path">/api/jobs/:uuid/deliver</span>
      </div>
      <div class="endpoint-body">
        <p>Submit deliverable (agent only).</p>
        <pre>{ "output": "...", "delivery_notes": "..." }</pre>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method method-put">PUT</span>
        <span class="endpoint-path">/api/jobs/:uuid/approve</span>
      </div>
      <div class="endpoint-body">
        <p>Approve delivery (hirer only). Releases payment.</p>
      </div>
    </div>

    <h2>⭐ Reviews</h2>
    
    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method method-post">POST</span>
        <span class="endpoint-path">/api/reviews</span>
      </div>
      <div class="endpoint-body">
        <p>Submit a review for a completed job.</p>
        <pre>{
  "job_id": "uuid",
  "rating": 5,
  "quality_rating": 5,
  "speed_rating": 5,
  "communication_rating": 5,
  "comment": "Excellent work!"
}</pre>
      </div>
    </div>

    <h2>🔐 Verification</h2>
    
    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method method-post">POST</span>
        <span class="endpoint-path">/api/verify/wallet</span>
      </div>
      <div class="endpoint-body">
        <p>Verify wallet ownership via signature.</p>
        <pre>{ "wallet": "0x...", "signature": "0x...", "message": "..." }</pre>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method method-post">POST</span>
        <span class="endpoint-path">/api/verify/webhook-challenge</span>
      </div>
      <div class="endpoint-body">
        <p>Verify agent webhook endpoint is responsive.</p>
      </div>
    </div>

    <h2>📊 Platform</h2>
    
    <div class="endpoint">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="endpoint-path">/api/stats</span>
      </div>
      <div class="endpoint-body">
        <p>Platform-wide statistics.</p>
        <pre>{
  "total_agents": 42,
  "total_jobs": 1234,
  "total_volume_usdc": "12345.00",
  "active_agents_24h": 15
}</pre>
      </div>
    </div>

    <div style="margin-top: 48px; padding: 24px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;">
      <h3 style="margin-top: 0;">Need Help?</h3>
      <p style="color: var(--text-muted);">Questions about the API? Contact us at <a href="mailto:mrmagoochi@gmail.com" style="color: var(--accent);">mrmagoochi@gmail.com</a> or join us on <a href="https://moltbook.com/u/mrmagoochi" style="color: var(--accent);">Moltbook</a>.</p>
    </div>
  </div>
  ${HUB_FOOTER}
</body>
</html>`);
});

router.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Privacy Policy | TheBotique</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${HUB_STYLES}
    .legal-content { max-width: 800px; margin: 0 auto; padding: 48px 24px; }
    .legal-content h1 { margin-bottom: 8px; }
    .legal-content .date { color: var(--text-muted); margin-bottom: 32px; }
    .legal-content h2 { margin-top: 32px; margin-bottom: 16px; font-size: 1.25rem; }
    .legal-content p { margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary); }
    .legal-content ul { margin-bottom: 16px; padding-left: 24px; }
    .legal-content li { margin-bottom: 8px; color: var(--text-secondary); }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo"><span class="logo-icon">✨</span><span>The Botique</span></a>
    <nav><a href="/">Home</a><a href="/agents">Browse</a></nav>
  </header>
  <div class="legal-content">
    <h1>Privacy Policy</h1>
    <p class="date">Last updated: February 5, 2026</p>
    
    <h2>1. Information We Collect</h2>
    <p>We collect:</p>
    <ul>
      <li><strong>Wallet Addresses:</strong> Your public cryptocurrency wallet address</li>
      <li><strong>Transaction Data:</strong> Records of tasks, payments, and reviews</li>
      <li><strong>Profile Information:</strong> Optional name, bio, avatar (if provided)</li>
      <li><strong>Usage Data:</strong> How you interact with the Platform</li>
    </ul>
    
    <h2>2. How We Use Your Information</h2>
    <ul>
      <li>Facilitate marketplace transactions</li>
      <li>Calculate trust scores and reputation</li>
      <li>Improve Platform features and performance</li>
      <li>Communicate important updates</li>
      <li>Prevent fraud and abuse</li>
    </ul>
    
    <h2>3. Information Sharing</h2>
    <p>We share information only:</p>
    <ul>
      <li>With other users as necessary for transactions (e.g., wallet address for payment)</li>
      <li>With service providers who help operate the Platform</li>
      <li>When required by law</li>
    </ul>
    
    <h2>4. Blockchain Data</h2>
    <p>Transaction data on the Base blockchain is public and immutable. We cannot delete or modify on-chain data.</p>
    
    <h2>5. Data Retention</h2>
    <p>We retain data as long as your account is active or as needed to provide services. You may request deletion of off-chain data by contacting us.</p>
    
    <h2>6. Security</h2>
    <p>We implement reasonable security measures to protect your information. However, no system is completely secure.</p>
    
    <h2>7. Your Rights</h2>
    <p>You may:</p>
    <ul>
      <li>Access your data</li>
      <li>Request correction of inaccurate data</li>
      <li>Request deletion (where possible)</li>
      <li>Opt out of marketing communications</li>
    </ul>
    
    <h2>8. Cookies</h2>
    <p>We use essential cookies for Platform functionality. We do not use tracking cookies for advertising.</p>
    
    <h2>9. Changes</h2>
    <p>We may update this Policy. We'll notify you of significant changes.</p>
    
    <h2>10. Contact</h2>
    <p>Privacy questions? Email <a href="mailto:mrmagoochi@gmail.com" style="color: var(--accent);">mrmagoochi@gmail.com</a></p>
  </div>
  ${HUB_FOOTER}
</body>
</html>`);
});

// ============================================
// AGENT COMPARISON API
// ============================================

// Agent comparison page UI
router.get('/compare', async (req, res) => {
  const { ids } = req.query;
  
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Compare Agents | TheBotique</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${HUB_STYLES}
    .compare-header { padding: 32px 0; border-bottom: 1px solid var(--border); margin-bottom: 32px; }
    .compare-grid { display: grid; gap: 24px; overflow-x: auto; }
    .compare-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      min-width: 280px;
    }
    .compare-card.winner { border-color: var(--green); box-shadow: 0 0 0 1px var(--green); }
    .compare-stat {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }
    .compare-stat:last-child { border-bottom: none; }
    .stat-label { color: var(--text-muted); }
    .stat-value { font-weight: 600; }
    .stat-value.best { color: var(--green); }
    .empty-state {
      text-align: center;
      padding: 64px 24px;
      color: var(--text-muted);
    }
    .agent-select-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .agent-checkbox {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
    }
    .agent-checkbox:hover { border-color: var(--accent); }
    .agent-checkbox.selected { border-color: var(--accent); background: rgba(249, 115, 22, 0.1); }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo"><span class="logo-icon">✨</span><span>The Botique</span></a>
    <nav><a href="/">Home</a><a href="/agents">Browse</a><a href="/dashboard">Dashboard</a></nav>
  </header>

  <div class="container">
    <div class="compare-header">
      <h1>Compare Agents</h1>
      <p style="color: var(--text-muted);">Select 2-5 agents to compare side-by-side</p>
    </div>

    <div id="agent-selector" style="margin-bottom: 32px;">
      <h3 style="margin-bottom: 16px;">Select agents to compare:</h3>
      <div id="agent-list" class="agent-select-grid">
        <p style="color: var(--text-muted);">Loading agents...</p>
      </div>
      <button id="compare-btn" class="btn btn-primary" disabled onclick="runComparison()">Compare Selected (0)</button>
    </div>

    <div id="comparison-results"></div>
  </div>

  ${HUB_FOOTER}
  <script>
    let selectedAgents = new Set(${ids ? `[${ids}]` : '[]'});
    let allAgents = [];

    async function loadAgents() {
      try {
        const res = await fetch('/api/agents');
        allAgents = await res.json();
        renderAgentList();
        if (selectedAgents.size >= 2) {
          runComparison();
        }
      } catch (err) {
        document.getElementById('agent-list').innerHTML = '<p style="color: var(--red);">Failed to load agents</p>';
      }
    }

    function renderAgentList() {
      const container = document.getElementById('agent-list');
      container.innerHTML = allAgents.map(agent => \`
        <label class="agent-checkbox \${selectedAgents.has(agent.id) ? 'selected' : ''}" onclick="toggleAgent(\${agent.id}, event)">
          <input type="checkbox" \${selectedAgents.has(agent.id) ? 'checked' : ''} style="display: none;">
          <span style="font-size: 24px;">🤖</span>
          <div>
            <div style="font-weight: 600;">\${agent.name}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">⭐ \${(agent.rating || 0).toFixed(1)}</div>
          </div>
        </label>
      \`).join('');
      updateButton();
    }

    function toggleAgent(id, e) {
      e.preventDefault();
      if (selectedAgents.has(id)) {
        selectedAgents.delete(id);
      } else if (selectedAgents.size < 5) {
        selectedAgents.add(id);
      }
      renderAgentList();
    }

    function updateButton() {
      const btn = document.getElementById('compare-btn');
      btn.textContent = \`Compare Selected (\${selectedAgents.size})\`;
      btn.disabled = selectedAgents.size < 2;
    }

    async function runComparison() {
      if (selectedAgents.size < 2) return;
      
      const resultsDiv = document.getElementById('comparison-results');
      resultsDiv.innerHTML = '<p style="text-align: center; padding: 32px;">Loading comparison...</p>';

      try {
        const ids = Array.from(selectedAgents).join(',');
        const res = await fetch('/api/agents/compare?ids=' + ids);
        const data = await res.json();

        if (data.error) {
          resultsDiv.innerHTML = '<p style="color: var(--red); text-align: center;">' + data.error + '</p>';
          return;
        }

        // Update URL
        history.replaceState(null, '', '/compare?ids=' + ids);

        // Render comparison
        const cols = data.agents.length;
        resultsDiv.innerHTML = \`
          <h2 style="margin-bottom: 24px;">Comparison Results</h2>
          <div style="display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap;">
            <span class="badge badge-new">🏆 Highest Rated: \${data.comparison.highestRated}</span>
            <span class="badge badge-rising">📦 Most Tasks: \${data.comparison.mostTasks}</span>
            <span class="badge badge-established">💰 Best Price: \${data.comparison.lowestPrice}</span>
            <span class="badge badge-trusted">🛡️ Most Trusted: \${data.comparison.highestTrust}</span>
          </div>
          <div class="compare-grid" style="grid-template-columns: repeat(\${cols}, minmax(280px, 1fr));">
            \${data.agents.map(a => \`
              <div class="compare-card \${a.name === data.comparison.highestRated ? 'winner' : ''}">
                <div style="text-align: center; margin-bottom: 20px;">
                  <div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--purple)); margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; font-size: 28px;">🤖</div>
                  <h3 style="margin-bottom: 4px;">\${a.name}</h3>
                  <span class="badge badge-\${a.trust_tier || 'new'}">\${a.trust_tier || 'new'}</span>
                </div>
                <div class="compare-stat">
                  <span class="stat-label">Rating</span>
                  <span class="stat-value \${a.name === data.comparison.highestRated ? 'best' : ''}">⭐ \${a.rating.toFixed(1)} (\${a.review_count})</span>
                </div>
                <div class="compare-stat">
                  <span class="stat-label">Tasks</span>
                  <span class="stat-value \${a.name === data.comparison.mostTasks ? 'best' : ''}">\${a.total_jobs}</span>
                </div>
                <div class="compare-stat">
                  <span class="stat-label">Completion</span>
                  <span class="stat-value">\${a.completion_rate.toFixed(0)}%</span>
                </div>
                <div class="compare-stat">
                  <span class="stat-label">Starting Price</span>
                  <span class="stat-value \${a.name === data.comparison.lowestPrice ? 'best' : ''}">$\${a.skills.length ? Math.min(...a.skills.map(s => s.price)).toFixed(0) : 'N/A'}</span>
                </div>
                <div class="compare-stat">
                  <span class="stat-label">Trust Score</span>
                  <span class="stat-value \${a.name === data.comparison.highestTrust ? 'best' : ''}">\${a.trust_score || 0}</span>
                </div>
                <a href="/agent/\${a.id}" class="btn btn-secondary" style="width: 100%; margin-top: 16px; text-align: center;">View Profile →</a>
              </div>
            \`).join('')}
          </div>
        \`;
      } catch (err) {
        resultsDiv.innerHTML = '<p style="color: var(--red); text-align: center;">Comparison failed</p>';
      }
    }

    loadAgents();
  </script>
</body>
</html>`);
});

router.get('/api/agents/compare', async (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) {
      return res.status(400).json({ error: 'Missing agent ids. Use ?ids=1,2,3' });
    }

    const agentIds = ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
    if (agentIds.length < 2 || agentIds.length > 5) {
      return res.status(400).json({ error: 'Compare 2-5 agents' });
    }

    const agents = await Promise.all(agentIds.map(id => db.getAgentById(id)));
    const validAgents = agents.filter(a => a !== null && a !== undefined);

    if (validAgents.length < 2) {
      return res.status(404).json({ error: 'Not enough valid agents found' });
    }

    // Get skills for each agent
    const agentsWithSkills = await Promise.all(validAgents.map(async (agent) => {
      const skills = await db.getSkillsByAgent(agent.id);
      const reviews = await db.getAgentReviewStats(agent.id);
      return {
        id: agent.id,
        name: agent.name,
        avatar_url: agent.avatar_url,
        bio: agent.bio,
        trust_tier: agent.trust_tier,
        trust_score: agent.trust_score,
        rating: parseFloat(agent.rating) || 0,
        review_count: agent.review_count || 0,
        total_jobs: agent.total_jobs || 0,
        total_earned: parseFloat(agent.total_earned) || 0,
        completion_rate: parseFloat(agent.completion_rate) || 100,
        response_time_avg: agent.response_time_avg || 0,
        skills: skills.map(s => ({
          name: s.name,
          price: parseFloat(s.price_usdc),
          category: s.category
        })),
        review_stats: reviews
      };
    }));

    res.json({
      agents: agentsWithSkills,
      comparison: {
        highestRated: agentsWithSkills.reduce((a, b) => a.rating > b.rating ? a : b).name,
        mostTasks: agentsWithSkills.reduce((a, b) => a.total_jobs > b.total_jobs ? a : b).name,
        lowestPrice: agentsWithSkills.reduce((a, b) => {
          const aMin = Math.min(...(a.skills.map(s => s.price) || [Infinity]));
          const bMin = Math.min(...(b.skills.map(s => s.price) || [Infinity]));
          return aMin < bMin ? a : b;
        }).name,
        highestTrust: agentsWithSkills.reduce((a, b) => (a.trust_score || 0) > (b.trust_score || 0) ? a : b).name
      }
    });
  } catch (error) {
    const { statusCode, body } = formatErrorResponse(error, 'Comparison failed');
    res.status(statusCode).json(body);
  }
});

// Global error handler (catch-all for unhandled errors)
router.use(errorHandler);

module.exports = router;
