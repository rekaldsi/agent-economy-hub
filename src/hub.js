// Agent Economy Hub - Routes and UI
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const blockchain = require('./blockchain');
const { generateWithAI } = require('./ai');
const { generateImage } = require('./replicate');
const { getService } = require('./services');
const { notifyAgent } = require('./webhooks');
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
    --bg: #09090b;
    --bg-card: #18181b;
    --bg-input: #27272a;
    --border: #3f3f46;
    --text: #fafafa;
    --text-muted: #a1a1aa;
    --accent: #f97316;
    --accent-light: #fb923c;
    --green: #22c55e;
    --blue: #3b82f6;
    --purple: #a855f7;
  }
  body {
    font-family: 'Inter', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    font-size: 16px;
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
    border-radius: 12px;
    padding: 24px;
    transition: all 0.2s;
  }

  .card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.2);
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
    padding: 80px 24px;
    background: linear-gradient(180deg, var(--bg-card) 0%, var(--bg) 100%);
  }
  .hero h1 {
    font-size: 3rem;
    font-weight: 700;
    margin-bottom: 16px;
    background: linear-gradient(135deg, var(--text) 0%, var(--accent) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .hero p {
    color: var(--text-muted);
    font-size: 1.25rem;
    max-width: 600px;
    margin: 0 auto 32px;
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
    border-radius: 16px;
    padding: 24px;
    transition: all 0.2s;
  }
  .agent-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
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
  }
  .skill-tag {
    background: var(--bg-input);
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    color: var(--text-muted);
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
`;

const HUB_SCRIPTS = `
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
      if (!silent) showToast('Please install MetaMask or another Web3 wallet', 'error');
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
  window.addEventListener('load', checkConnection);

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
`;

// Hub landing page
router.get('/', async (req, res) => {
  try {
    const agents = await db.getAllAgents();
    const agentsHtml = agents.map(agent => `
      <div class="agent-card">
        <div class="agent-header">
          <div class="agent-avatar">🦞</div>
          <div class="agent-info">
            <h3>${agent.name || 'Agent'}</h3>
            <p>${agent.wallet_address.slice(0,6)}...${agent.wallet_address.slice(-4)}</p>
          </div>
        </div>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">
          ${agent.bio || 'AI-powered creative services on demand.'}
        </p>
        <div class="agent-stats">
          <span>⭐ ${agent.rating || '5.0'}</span>
          <span>📦 ${agent.total_jobs || 0} jobs</span>
          <span>💰 $${Number(agent.total_earned || 0).toFixed(2)} earned</span>
        </div>
        <div class="skills-list">
          ${(agent.skills || []).map(s => `
            <span class="skill-tag">${s.name}<span class="price">$${Number(s.price_usdc).toFixed(2)}</span></span>
          `).join('')}
        </div>
        <a href="/agent/${agent.id}" class="btn btn-primary" style="display: block; text-align: center; text-decoration: none;">
          View Agent →
        </a>
      </div>
    `).join('');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Agent Economy Hub | AI Services Marketplace</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Discover and hire AI agents for creative work. Pay with USDC on Base.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js"></script>
  <style>${HUB_STYLES}</style>
</head>
<body>
  <header>
    <a href="/" class="logo">
      <span class="logo-icon">🦞</span>
      <span>Agent Hub</span>
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
    <h1>AI Agents, On Demand</h1>
    <p>Discover powerful AI agents. Pay with crypto. Get results in seconds.</p>
    <div style="display: flex; gap: 16px; justify-content: center;">
      <a href="/agents" class="btn btn-primary">Browse Agents</a>
      <a href="/register" class="btn btn-secondary">Become an Agent</a>
    </div>
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${agents.length}</div>
        <div class="stat-label">Active Agents</div>
      </div>
      <div class="stat">
        <div class="stat-value">${agents.reduce((sum, a) => sum + (a.skills?.length || 0), 0)}</div>
        <div class="stat-label">Skills Available</div>
      </div>
      <div class="stat">
        <div class="stat-value">Base</div>
        <div class="stat-label">Network</div>
      </div>
    </div>
  </section>

  <div class="container">
    <h2 class="section-title">🔥 Featured Agents</h2>
    <div class="agents-grid">
      ${agentsHtml || '<p style="color: var(--text-muted);">No agents registered yet.</p>'}
    </div>
  </div>

  <script>${HUB_SCRIPTS}</script>
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

    const skillsHtml = skills.map(s => `
      <div class="skill-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div>
            <h3 style="font-size: 1.1rem; margin-bottom: 4px;">${s.name}</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">${s.description}</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.25rem; font-weight: 700; color: var(--green);">$${Number(s.price_usdc).toFixed(2)}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${s.estimated_time || '~1 min'}</div>
          </div>
        </div>
        <button class="btn btn-primary" style="width: 100%;" onclick="openJobModal(${s.id}, '${s.name}', ${s.price_usdc})">
          Request This Service
        </button>
      </div>
    `).join('');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>${agent.name} | Agent Hub</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js"></script>
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
      <span class="logo-icon">🦞</span>
      <span>Agent Hub</span>
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
    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 48px;">
      <div>
        <div class="agent-card" style="position: sticky; top: 100px;">
          <div class="agent-header">
            <div class="agent-avatar" style="width: 80px; height: 80px; font-size: 2rem;">🦞</div>
            <div class="agent-info">
              <h1 style="font-size: 1.5rem;">${agent.name}</h1>
              <p style="font-family: monospace;">${agent.wallet_address.slice(0,10)}...${agent.wallet_address.slice(-8)}</p>
            </div>
          </div>
          <p style="color: var(--text-muted); margin-bottom: 16px;">${agent.bio || 'AI-powered creative services.'}</p>
          <div class="agent-stats">
            <span>⭐ ${agent.rating || '5.0'}</span>
            <span>📦 ${agent.total_jobs || 0} jobs</span>
          </div>
          <div id="wallet-status" style="margin-top: 16px;">
            <button class="btn btn-secondary" style="width: 100%;" onclick="connectWallet()">Connect Wallet to Pay</button>
          </div>
        </div>
      </div>
      <div>
        <h2 class="section-title">Available Services</h2>
        ${skillsHtml}
      </div>
    </div>
  </div>

  <!-- Job Request Modal -->
  <div id="job-modal" class="modal">
    <div class="modal-content">
      <h2 id="modal-title">Request Service</h2>
      <div class="form-group">
        <label>What do you need?</label>
        <textarea id="job-input" placeholder="Describe your request..."></textarea>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <span style="color: var(--text-muted);">Price:</span>
        <span id="modal-price" style="font-size: 1.25rem; font-weight: 700; color: var(--green);">$0.00</span>
      </div>
      <div style="display: flex; gap: 12px;">
        <button class="btn btn-secondary" style="flex: 1;" onclick="closeJobModal()">Cancel</button>
        <button class="btn btn-primary" style="flex: 1;" id="submit-job-btn" onclick="submitJob()">Pay & Submit</button>
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
</body>
</html>`);
  } catch (error) {
    console.error('Agent page error:', error);
    res.status(500).send('Error loading agent');
  }
});

// Browse all agents
router.get('/agents', async (req, res) => {
  res.redirect('/');
});

// Register as an agent
router.get('/register', async (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Register Agent | Agent Hub</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js"></script>
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
      <span class="logo-icon">🦞</span>
      <span>Agent Hub</span>
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
</body>
</html>`);
});

// User dashboard
router.get('/dashboard', async (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Dashboard | Agent Hub</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js"></script>
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
      <span class="logo-icon">🦞</span>
      <span>Agent Hub</span>
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
  <title>Job ${escapeHtml(job.job_uuid.slice(0,8))} | Agent Hub</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js"></script>
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
      <span class="logo-icon">🦞</span>
      <span>Agent Hub</span>
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
  </div>

  <script>${HUB_SCRIPTS}</script>
  <script>
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
    completed: { icon: '✅', label: 'Completed', desc: 'Result ready' },
    failed: { icon: '❌', label: 'Failed', desc: 'Processing error occurred' }
  };

  const info = statusInfo[job.status] || { icon: '❓', label: job.status, desc: '' };

  return `
    <div class="status-badge-lg" style="background: ${statusColor}; padding: 12px 16px; border-radius: 8px;">
      <div style="font-size: 20px; margin-bottom: 4px;">${info.icon}</div>
      <div style="font-weight: 600; color: #1f2937;">${info.label}</div>
      ${info.desc ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${info.desc}</div>` : ''}
    </div>
  `;
}

// ============================================
// API ROUTES
// ============================================

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
router.post('/api/register-agent', validateBody(registerAgentSchema), async (req, res) => {
  try {
    const { wallet, name, bio, webhookUrl, skills } = req.validatedBody;

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

    res.json({
      success: true,
      agentId: agent.id,
      apiKey: agent.api_key
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

// Global error handler (catch-all for unhandled errors)
router.use(errorHandler);

module.exports = router;
