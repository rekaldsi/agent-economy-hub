require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');
const hubRouter = require('./hub');
const { SERVICES, getService, getAllServices } = require('./services');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 7378;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Initialize Anthropic
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Mount Hub routes
app.use(hubRouter);

// Get pricing from services
const PRICING = Object.fromEntries(
  Object.entries(SERVICES).map(([key, s]) => [key, s.price])
);

// Legacy alias for old prompts - now uses services.js
const SYSTEM_PROMPTS = Object.fromEntries(
  Object.entries(SERVICES).map(([key, s]) => [key, s.systemPrompt])
);

// Also keep backward compatibility with old format
const LEGACY_PROMPTS = {
  brainstorm: `You are MrMagoochi, an expert creative strategist known for fresh, unexpected ideas.

When given a topic, generate exactly 5 creative ideas. For each idea provide:
- A short "angle" name (2-4 words)
- The idea itself (1-2 sentences)
- Why it works (1 sentence)

Be specific to the topic. Avoid generic advice. Push for unexpected angles.

Respond in this exact JSON format:
{
  "ideas": [
    {"angle": "...", "idea": "...", "why": "..."},
    ...
  ]
}`,

  concept: `You are MrMagoochi, a senior creative director who develops breakthrough campaign concepts.

Given a brief, create a comprehensive creative concept including:
- Insight: The human truth this is built on
- Tension: The cultural or personal conflict we're tapping into
- Idea: The core creative idea in one clear sentence
- Headline: A punchy campaign headline
- Execution: Hero content, social approach, and experiential element
- Why it works: Strategic rationale

Be specific to the brief. Create something ownable and distinctive.

Respond in this exact JSON format:
{
  "insight": "...",
  "tension": "...",
  "idea": "...",
  "headline": "...",
  "execution": {
    "hero": "...",
    "social": "...",
    "experiential": "..."
  },
  "why_it_works": "..."
}`,

  research: `You are MrMagoochi, a strategic researcher who synthesizes complex topics into actionable insights.

Given a research query, provide:
- Summary: 2-3 sentence overview
- 3 Key Findings: Each with a finding and its strategic implication
- 3 Recommendations: Actionable next steps

Be specific and insightful. Avoid generic observations.

Respond in this exact JSON format:
{
  "summary": "...",
  "findings": [
    {"finding": "...", "implication": "..."},
    ...
  ],
  "recommendations": ["...", "...", "..."]
}`,

  write: `You are MrMagoochi, a sharp copywriter who writes with clarity and soul.

Given a writing task, create compelling copy that:
- Sounds human, not corporate
- Has a clear point of view
- Uses rhythm and punch

Also suggest 2 alternative approaches.

Respond in this exact JSON format:
{
  "tone": "description of the tone used",
  "output": "the main copy",
  "alternatives": ["alternative approach 1", "alternative approach 2"]
}`,

  brief: `You are MrMagoochi, a strategist who writes briefs that inspire great creative work.

Given a product and objective, create a creative brief including:
- Project name
- Objective
- Target audience
- Key insight
- Single-minded proposition
- Tone of voice
- 3 Success metrics

Be specific and strategic. Write a brief that actually helps creatives.

Respond in this exact JSON format:
{
  "project": "...",
  "objective": "...",
  "audience": "...",
  "insight": "...",
  "proposition": "...",
  "tone": "...",
  "success_metrics": ["...", "...", "..."]
}`
};

// ============================================
// AI GENERATION (uses services.js prompts)
// ============================================
async function generateWithAI(serviceKey, userMessage) {
  // Get service config - try new services first, fall back to legacy
  const service = getService(serviceKey);
  const systemPrompt = service ? service.systemPrompt : SYSTEM_PROMPTS[serviceKey];
  
  if (!systemPrompt) {
    throw new Error(`Unknown service: ${serviceKey}`);
  }
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage }
      ]
    });
    
    const content = response.content[0].text;
    // Extract JSON from response (Claude may wrap in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('AI generation error:', error.message);
    throw error;
  }
}

// Generic service endpoint - works for any service in services.js
app.post('/api/service/:serviceKey', async (req, res) => {
  const { serviceKey } = req.params;
  const { input } = req.body;
  
  const service = getService(serviceKey);
  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }
  
  if (!input) {
    return res.status(400).json({ error: 'Input required' });
  }
  
  try {
    const result = await generateWithAI(serviceKey, input);
    res.json({ 
      service: serviceKey,
      serviceName: service.name,
      price: service.price,
      result 
    });
  } catch (error) {
    res.status(500).json({ error: 'AI generation failed: ' + error.message });
  }
});

// List all available services
app.get('/api/services', (req, res) => {
  const services = getAllServices().map(s => ({
    key: s.key,
    name: s.name,
    category: s.category,
    description: s.description,
    price: s.price,
    estimatedTime: s.estimatedTime,
    inputLabel: s.inputLabel,
    inputPlaceholder: s.inputPlaceholder
  }));
  res.json({ services, total: services.length });
});

// ============================================
// LANDING PAGE
// ============================================
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>MrMagoochi | AI Creative Agent</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="AI-powered creative strategy on demand">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
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
    }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
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
      gap: 10px;
      font-weight: 700;
      font-size: 1.1rem;
    }
    .logo span:first-child { font-size: 1.4rem; }
    .logo span:last-child { color: var(--accent); }
    .status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      color: var(--green);
      background: rgba(34, 197, 94, 0.1);
      padding: 6px 12px;
      border-radius: 99px;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      background: var(--green);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    main {
      max-width: 600px;
      margin: 0 auto;
      padding: 24px 16px 100px;
    }
    .hero {
      text-align: center;
      padding: 32px 0;
    }
    .hero h1 {
      font-size: 1.8rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .hero p {
      color: var(--text-muted);
      font-size: 1rem;
    }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .card-title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    select {
      width: 100%;
      padding: 14px 16px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      font-size: 1rem;
      font-family: inherit;
      margin-bottom: 12px;
      cursor: pointer;
    }
    select:focus {
      outline: none;
      border-color: var(--accent);
    }
    .price-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--bg);
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 0.9rem;
    }
    .price-row span:first-child { color: var(--text-muted); }
    .price-row span:last-child { 
      color: var(--green); 
      font-weight: 600;
      font-family: monospace;
    }
    textarea {
      width: 100%;
      min-height: 120px;
      padding: 16px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      font-size: 1rem;
      font-family: inherit;
      resize: vertical;
      margin-bottom: 20px;
    }
    textarea::placeholder { color: #71717a; }
    textarea:focus { outline: none; border-color: var(--accent); }
    .btn {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, var(--accent), var(--accent-light));
      border: none;
      border-radius: 10px;
      color: #000;
      font-size: 1rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(249, 115, 22, 0.25);
    }
    .btn:active { transform: translateY(0); }
    .btn:disabled {
      opacity: 0.6;
      cursor: wait;
      transform: none;
      box-shadow: none;
    }
    .live-badge {
      text-align: center;
      padding: 12px;
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.2);
      border-radius: 8px;
      margin-top: 16px;
      font-size: 0.85rem;
      color: var(--green);
    }
    .results-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
    }
    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      background: var(--bg);
    }
    .results-header h3 {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }
    .copy-btn {
      padding: 6px 12px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-muted);
      font-size: 0.8rem;
      cursor: pointer;
      display: none;
    }
    .copy-btn.show { display: block; }
    .copy-btn:hover { color: var(--text); background: var(--border); }
    .results-body {
      padding: 20px;
      min-height: 200px;
    }
    .results-empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-muted);
    }
    .results-empty .icon { font-size: 2.5rem; margin-bottom: 12px; opacity: 0.5; }
    .results-empty h4 { font-weight: 500; margin-bottom: 4px; color: var(--text); }
    .loading {
      text-align: center;
      padding: 50px 20px;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading p { color: var(--text-muted); }
    .result-item {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .result-item:last-child { margin-bottom: 0; }
    .result-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: var(--accent);
      color: #000;
      font-size: 0.8rem;
      font-weight: 600;
      border-radius: 50%;
      margin-right: 10px;
    }
    .result-title {
      font-weight: 600;
      color: var(--accent-light);
      margin-bottom: 8px;
    }
    .result-body { color: var(--text); line-height: 1.6; }
    .result-note { color: var(--text-muted); font-size: 0.9rem; margin-top: 8px; }
    .result-section { margin-bottom: 20px; }
    .result-section:last-child { margin-bottom: 0; }
    .result-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--blue);
      margin-bottom: 6px;
    }
    .result-text { color: var(--text); line-height: 1.6; }
    .result-headline {
      font-size: 1.3rem;
      font-weight: 700;
      color: var(--accent);
      padding: 16px;
      background: rgba(249, 115, 22, 0.1);
      border-left: 3px solid var(--accent);
      border-radius: 0 8px 8px 0;
      margin: 16px 0;
    }
    .result-list {
      list-style: none;
      padding: 0;
    }
    .result-list li {
      padding: 8px 0 8px 20px;
      position: relative;
      color: var(--text-muted);
    }
    .result-list li::before {
      content: '→';
      position: absolute;
      left: 0;
      color: var(--green);
    }
    .result-quote {
      background: var(--bg-input);
      padding: 20px;
      border-radius: 10px;
      line-height: 1.8;
      white-space: pre-wrap;
    }
    footer {
      text-align: center;
      padding: 24px;
      color: var(--text-muted);
      font-size: 0.85rem;
      border-top: 1px solid var(--border);
      margin-top: 40px;
    }
    footer a { color: var(--blue); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    .wallet {
      margin-top: 20px;
      padding: 16px;
      background: var(--bg);
      border-radius: 10px;
    }
    .wallet h4 {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .wallet code {
      display: block;
      font-size: 0.75rem;
      color: var(--text-muted);
      word-break: break-all;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">
      <span>🦞</span>
      <span>MrMagoochi</span>
    </div>
    <div class="status">
      <span class="status-dot"></span>
      Online
    </div>
  </header>
  <main>
    <div class="hero">
      <h1>Creative Strategy On Demand</h1>
      <p>AI-powered ideas, concepts, and copy in seconds</p>
    </div>
    <div class="card">
      <div class="card-title">New Request</div>
      <label>Service</label>
      <select id="service" onchange="updatePrice()">
        <option value="brainstorm">💡 Quick Brainstorm — 5 ideas</option>
        <option value="concept">🎯 Creative Concept — Full campaign</option>
        <option value="research">🔍 Research Report — Deep analysis</option>
        <option value="write">✍️ Writing — Sharp copy</option>
        <option value="brief">📋 Creative Brief — Strategy doc</option>
      </select>
      <div class="price-row">
        <span id="service-desc">5 fresh ideas for any challenge</span>
        <span id="price">$0.10</span>
      </div>
      <label>What do you need?</label>
      <textarea id="request" placeholder="Describe your request in detail...

Example: I need ideas for marketing a sustainable fashion brand to Gen Z. The brand uses recycled ocean plastics and wants to stand out without being preachy about sustainability."></textarea>
      <button class="btn" id="submit-btn" onclick="generate()">
        Generate Results ✨
      </button>
      <div class="live-badge">
        ⚡ Powered by AI — Real-time generation
      </div>
      <div class="wallet">
        <h4>Payment Address (Base Network)</h4>
        <code>0xA193128362e6dE28E6D51eEbc98505672FFeb3c5</code>
      </div>
    </div>
    <div class="results-card">
      <div class="results-header">
        <h3>Results</h3>
        <button class="copy-btn" id="copy-btn" onclick="copyResults()">Copy</button>
      </div>
      <div class="results-body" id="results">
        <div class="results-empty">
          <div class="icon">✨</div>
          <h4>Ready when you are</h4>
          <p>Fill out the form above and hit Generate</p>
        </div>
      </div>
    </div>
  </main>
  <footer>
    Built by <a href="https://www.moltbook.com/u/MrMagoochi" target="_blank">MrMagoochi</a> · Powered by <a href="https://openclaw.ai" target="_blank">OpenClaw</a>
  </footer>
<script>
const services = {
  brainstorm: { desc: '5 fresh ideas for any challenge', price: 0.10 },
  concept: { desc: 'Full campaign concept with strategy', price: 0.50 },
  research: { desc: 'Deep analysis and recommendations', price: 0.25 },
  write: { desc: 'Sharp copy in any tone', price: 0.15 },
  brief: { desc: 'Comprehensive creative brief', price: 1.00 }
};

function updatePrice() {
  const s = document.getElementById('service').value;
  document.getElementById('service-desc').textContent = services[s].desc;
  document.getElementById('price').textContent = '$' + services[s].price.toFixed(2);
}

async function generate() {
  const service = document.getElementById('service').value;
  const request = document.getElementById('request').value.trim();
  const results = document.getElementById('results');
  const btn = document.getElementById('submit-btn');
  const copyBtn = document.getElementById('copy-btn');
  
  if (!request) { alert('Please describe your request'); return; }
  
  btn.disabled = true;
  btn.textContent = 'Generating...';
  copyBtn.classList.remove('show');
  results.innerHTML = '<div class="loading"><div class="spinner"></div><p>MrMagoochi is thinking...</p></div>';
  
  try {
    let body = {};
    switch(service) {
      case 'brainstorm': body = { topic: request }; break;
      case 'concept': body = { brief: request }; break;
      case 'research': body = { query: request }; break;
      case 'write': body = { task: request }; break;
      case 'brief': body = { product: request, objective: 'Drive awareness and engagement' }; break;
    }
    
    const res = await fetch('/' + service, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await res.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    results.innerHTML = formatResults(service, data);
    copyBtn.classList.add('show');
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
  } catch (err) {
    results.innerHTML = '<div class="results-empty"><div class="icon">⚠️</div><h4>Error</h4><p>' + err.message + '</p></div>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Results ✨';
  }
}

function formatResults(service, data) {
  let html = '';
  
  if (service === 'brainstorm' && data.ideas) {
    data.ideas.forEach((idea, i) => {
      html += '<div class="result-item">';
      html += '<div class="result-title"><span class="result-num">' + (i+1) + '</span>' + idea.angle + '</div>';
      html += '<div class="result-body">' + idea.idea + '</div>';
      html += '<div class="result-note">↳ ' + idea.why + '</div>';
      html += '</div>';
    });
  }
  
  else if (service === 'concept' && data.concept) {
    const c = data.concept;
    html += '<div class="result-section"><div class="result-label">Insight</div><div class="result-text">' + c.insight + '</div></div>';
    html += '<div class="result-section"><div class="result-label">Tension</div><div class="result-text">' + c.tension + '</div></div>';
    html += '<div class="result-section"><div class="result-label">Core Idea</div><div class="result-text">' + c.idea + '</div></div>';
    html += '<div class="result-headline">"' + c.headline + '"</div>';
    if (c.execution) {
      html += '<div class="result-section"><div class="result-label">Execution</div><ul class="result-list">';
      html += '<li><strong>Hero:</strong> ' + (c.execution.hero || 'N/A') + '</li>';
      html += '<li><strong>Social:</strong> ' + (c.execution.social || 'N/A') + '</li>';
      html += '<li><strong>Experiential:</strong> ' + (c.execution.experiential || 'N/A') + '</li>';
      html += '</ul></div>';
    }
    html += '<div class="result-section"><div class="result-label">Why It Works</div><div class="result-text" style="color:var(--text-muted);font-style:italic;">' + c.why_it_works + '</div></div>';
  }
  
  else if (service === 'research' && data.report) {
    const r = data.report;
    html += '<div class="result-section"><div class="result-label">Summary</div><div class="result-text">' + r.summary + '</div></div>';
    r.findings.forEach((f, i) => {
      html += '<div class="result-item">';
      html += '<div class="result-title"><span class="result-num">' + (i+1) + '</span>' + f.finding + '</div>';
      html += '<div class="result-note" style="color:var(--green);">→ ' + f.implication + '</div>';
      html += '</div>';
    });
    html += '<div class="result-section"><div class="result-label">Recommendations</div><ul class="result-list">';
    r.recommendations.forEach(rec => { html += '<li>' + rec + '</li>'; });
    html += '</ul></div>';
  }
  
  else if (service === 'write' && data.result) {
    const w = data.result;
    html += '<div class="result-section"><div class="result-label">Tone: ' + w.tone + '</div></div>';
    html += '<div class="result-quote">' + w.output + '</div>';
    html += '<div class="result-section" style="margin-top:16px;"><div class="result-label">Alternatives</div><ul class="result-list">';
    w.alternatives.forEach(alt => { html += '<li>' + alt + '</li>'; });
    html += '</ul></div>';
  }
  
  else if (service === 'brief' && data.brief) {
    const b = data.brief;
    html += '<div class="result-section"><div class="result-label">Project</div><div class="result-text" style="font-size:1.1rem;font-weight:600;">' + b.project + '</div></div>';
    html += '<div class="result-section"><div class="result-label">Objective</div><div class="result-text">' + b.objective + '</div></div>';
    html += '<div class="result-section"><div class="result-label">Audience</div><div class="result-text">' + b.audience + '</div></div>';
    html += '<div class="result-section"><div class="result-label">Insight</div><div class="result-text">' + b.insight + '</div></div>';
    html += '<div class="result-headline">"' + b.proposition + '"</div>';
    html += '<div class="result-section"><div class="result-label">Tone</div><div class="result-text">' + b.tone + '</div></div>';
    html += '<div class="result-section"><div class="result-label">Success Metrics</div><ul class="result-list">';
    b.success_metrics.forEach(m => { html += '<li>' + m + '</li>'; });
    html += '</ul></div>';
  }
  
  else {
    html = '<pre style="color:var(--text-muted);font-size:0.85rem;">' + JSON.stringify(data, null, 2) + '</pre>';
  }
  
  return html;
}

function copyResults() {
  const text = document.getElementById('results').innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
}
</script>
</body>
</html>`);
});

// Health
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    agent: 'MrMagoochi', 
    version: '0.8.0',
    ai: 'claude-sonnet-4',
    services: Object.keys(PRICING), 
    pricing: PRICING 
  });
});

// ============================================
// API ENDPOINTS WITH REAL AI
// ============================================

app.post('/brainstorm', async (req, res) => {
  const { topic } = req.body;
  if (!topic) return res.status(400).json({ error: 'Topic required' });
  
  try {
    const result = await generateWithAI('brainstorm', `Generate 5 creative ideas for: ${topic}`);
    res.json({ service: 'brainstorm', topic, ideas: result.ideas });
  } catch (error) {
    res.status(500).json({ error: 'AI generation failed: ' + error.message });
  }
});

app.post('/concept', async (req, res) => {
  const { brief } = req.body;
  if (!brief) return res.status(400).json({ error: 'Brief required' });
  
  try {
    const result = await generateWithAI('concept', `Create a creative concept for: ${brief}`);
    res.json({ service: 'concept', concept: result });
  } catch (error) {
    res.status(500).json({ error: 'AI generation failed: ' + error.message });
  }
});

app.post('/research', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });
  
  try {
    const result = await generateWithAI('research', `Research and analyze: ${query}`);
    res.json({ service: 'research', report: { query, ...result } });
  } catch (error) {
    res.status(500).json({ error: 'AI generation failed: ' + error.message });
  }
});

app.post('/write', async (req, res) => {
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: 'Task required' });
  
  try {
    const result = await generateWithAI('write', `Write copy for: ${task}`);
    res.json({ service: 'write', result: { task, ...result } });
  } catch (error) {
    res.status(500).json({ error: 'AI generation failed: ' + error.message });
  }
});

app.post('/brief', async (req, res) => {
  const { product, objective } = req.body;
  if (!product) return res.status(400).json({ error: 'Product required' });
  
  try {
    const result = await generateWithAI('brief', `Create a creative brief for: ${product}. Objective: ${objective || 'Drive awareness and engagement'}`);
    res.json({ service: 'brief', brief: result });
  } catch (error) {
    res.status(500).json({ error: 'AI generation failed: ' + error.message });
  }
});

// Start server
async function start() {
  try {
    await db.initDB();
    app.listen(PORT, () => {
      console.log(`🦞 Agent Economy Hub v0.9.0 | http://localhost:${PORT}`);
      console.log(`   AI: claude-sonnet-4 | Key: ${ANTHROPIC_API_KEY ? '✓' : '✗'}`);
      console.log(`   DB: ${process.env.DATABASE_URL ? '✓' : '✗'}`);
    });
  } catch (error) {
    console.error('Failed to start:', error.message);
    process.exit(1);
  }
}

start();
