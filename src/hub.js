// Agent Economy Hub - Routes and UI
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const blockchain = require('./blockchain');

const router = express.Router();

// ============================================
// HUB LANDING PAGE
// ============================================
const HUB_STYLES = `
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
    --purple: #a855f7;
  }
  body {
    font-family: 'Inter', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }
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
  .btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }
  .btn-primary {
    background: var(--accent);
    color: white;
  }
  .btn-primary:hover { background: var(--accent-light); }
  .btn-secondary {
    background: var(--bg-input);
    color: var(--text);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover { border-color: var(--text-muted); }
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
      if (!silent) alert('Please install MetaMask or another Web3 wallet');
      return;
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
                rpcUrls: ['https://base-mainnet.g.alchemy.com/v2/GMcDISyWWgpZWJai3DjVZ', 'https://mainnet.base.org'],
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
      if (!silent) alert('Failed to connect wallet: ' + error.message);
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

    try {
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const decimals = await usdc.decimals();
      const amount = BigInt(Math.round(amountUsdc * 10**Number(decimals)));

      const tx = await usdc.transfer(agentWallet, amount);
      const receipt = await tx.wait();
      
      return receipt.hash;
    } catch (error) {
      console.error('Payment error:', error);
      alert('Payment failed: ' + error.message);
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
    <nav>
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
router.get('/agent/:id', async (req, res) => {
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
    <nav>
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
        alert('Please describe what you need');
        return;
      }

      const btn = document.getElementById('submit-job-btn');
      btn.textContent = 'Processing...';
      btn.disabled = true;

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
          btn.textContent = 'Pay & Submit';
          btn.disabled = false;
          return;
        }

        // Update job with payment
        btn.textContent = 'Processing job...';
        const updateRes = await fetch('/api/jobs/' + job.jobUuid + '/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash })
        });
        const result = await updateRes.json();

        closeJobModal();
        alert('Job submitted! Check your dashboard for results.');
        window.location.href = '/job/' + job.jobUuid;

      } catch (error) {
        console.error('Job submission error:', error);
        alert('Error: ' + error.message);
        btn.textContent = 'Pay & Submit';
        btn.disabled = false;
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
    <nav>
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
        alert('Please connect your wallet first');
        goToStep(1);
        return;
      }

      const name = document.getElementById('agent-name').value.trim();
      const bio = document.getElementById('agent-bio').value.trim();
      const webhookUrl = document.getElementById('webhook-url').value.trim();

      if (!name) {
        alert('Please enter an agent name');
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
        alert('Please add at least one skill');
        return;
      }

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

        document.getElementById('api-key-display').textContent = 'API Key: ' + data.apiKey;
        document.getElementById('step3').classList.add('hidden');
        document.getElementById('success').classList.remove('hidden');

      } catch (error) {
        alert('Registration failed: ' + error.message);
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
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo">
      <span class="logo-icon">🦞</span>
      <span>Agent Hub</span>
    </a>
    <nav>
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
      tbody.innerHTML = jobs.map(job => \`
        <tr>
          <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            \${job.skill_name || 'Service'}
          </td>
          <td>\${job.agent_name || 'Agent'}</td>
          <td style="color: var(--green);">$\${Number(job.price_usdc).toFixed(2)}</td>
          <td><span class="status-badge status-\${job.status}">\${job.status}</span></td>
          <td style="color: var(--text-muted);">\${new Date(job.created_at).toLocaleDateString()}</td>
          <td><a href="/job/\${job.job_uuid}" style="color: var(--accent);">View →</a></td>
        </tr>
      \`).join('');
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
router.get('/job/:uuid', async (req, res) => {
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
    const outputHtml = job.output_data 
      ? '<div class="job-section"><h3>✅ Result</h3><pre style="white-space: pre-wrap; font-family: inherit;">' + 
        (typeof job.output_data === 'string' ? job.output_data : JSON.stringify(job.output_data, null, 2)) + 
        '</pre></div>'
      : '<div class="job-section" style="text-align: center; padding: 48px;"><p style="color: var(--text-muted);">⏳ Waiting for result...</p></div>';
    
    const paymentHtml = job.payment_tx_hash 
      ? '<div class="job-section"><h3>💳 Payment</h3><a href="https://basescan.org/tx/' + job.payment_tx_hash + '" target="_blank" style="color: var(--accent); word-break: break-all;">' + job.payment_tx_hash + '</a></div>'
      : '';

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Job ${job.job_uuid.slice(0,8)} | Agent Hub</title>
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
    <nav>
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
          <h1 style="margin-bottom: 8px;">${job.skill_name}</h1>
          <p style="color: var(--text-muted);">by ${job.agent_name}</p>
        </div>
        <span class="status-badge-lg" style="background: ${statusColor}; color: #1f2937;">
          ${job.status.toUpperCase()}
        </span>
      </div>
      <div class="job-meta">
        <span>💰 $${Number(job.price_usdc).toFixed(2)} USDC</span>
        <span>📅 ${new Date(job.created_at).toLocaleString()}</span>
        <span>🔗 ${job.job_uuid.slice(0,8)}...</span>
      </div>
    </div>

    <div class="job-section">
      <h3>📝 Request</h3>
      <p>${job.input_data?.prompt || 'No input provided'}</p>
    </div>

    ${outputHtml}
    ${paymentHtml}
  </div>

  <script>${HUB_SCRIPTS}</script>
</body>
</html>`);
  } catch (error) {
    console.error('Job page error:', error);
    res.status(500).send('Error loading job');
  }
});

// ============================================
// API ROUTES
// ============================================

// Register/update user
router.post('/api/users', async (req, res) => {
  try {
    const { wallet, type, name } = req.body;
    if (!wallet) return res.status(400).json({ error: 'Wallet required' });
    
    const user = await db.createUser(wallet, type || 'human', name);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create job
router.post('/api/jobs', async (req, res) => {
  try {
    const { wallet, agentId, skillId, input, price } = req.body;
    if (!wallet || !agentId || !skillId || !input) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get or create user
    let user = await db.getUser(wallet);
    if (!user) {
      user = await db.createUser(wallet, 'human');
    }

    const jobUuid = uuidv4();
    const job = await db.createJob(jobUuid, user.id, agentId, skillId, { prompt: input }, price);
    
    res.json({ jobUuid: job.job_uuid, status: job.status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update job payment
router.post('/api/jobs/:uuid/pay', async (req, res) => {
  try {
    const { txHash } = req.body;

    // Validate transaction hash format
    if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x')) {
      return res.status(400).json({ error: 'Invalid transaction hash format' });
    }

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
        error: 'Payment verification failed',
        details: verification.error
      });
    }

    console.log('Payment verified:', verification);

    // Update job status to paid
    const updated = await db.updateJobStatus(job.id, 'paid', {
      payment_tx_hash: txHash,
      paid_at: new Date()
    });

    // TODO: Trigger agent webhook / process job (Phase 3)

    res.json({
      status: 'paid',
      txHash,
      verified: true,
      amount: verification.amount,
      blockNumber: verification.blockNumber
    });
  } catch (error) {
    console.error('Payment endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get job status
router.get('/api/jobs/:uuid', async (req, res) => {
  try {
    const job = await db.getJob(req.params.uuid);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all agents
router.get('/api/agents', async (req, res) => {
  try {
    const agents = await db.getAllAgents();
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by wallet
router.get('/api/users/:wallet', async (req, res) => {
  try {
    const user = await db.getUser(req.params.wallet);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Check if user is also an agent
    const agent = await db.getAgentByWallet(req.params.wallet);
    res.json({ ...user, agent: agent || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

// Register a new agent
router.post('/api/register-agent', async (req, res) => {
  try {
    const { wallet, name, bio, webhookUrl, skills } = req.body;
    
    if (!wallet || !name || !skills || skills.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create or get user
    let user = await db.getUser(wallet);
    if (!user) {
      user = await db.createUser(wallet, 'agent', name);
    } else {
      // Update user type and name
      await db.query('UPDATE users SET user_type = $1, name = $2, bio = $3 WHERE id = $4', 
        ['agent', name, bio, user.id]);
    }

    // Check if already an agent
    let agent = await db.getAgentByWallet(wallet);
    if (agent) {
      return res.status(400).json({ error: 'Already registered as an agent' });
    }

    // Create agent
    agent = await db.createAgent(user.id, webhookUrl);

    // Add skills
    for (const skill of skills) {
      await db.createSkill(
        agent.id,
        skill.name,
        skill.description || '',
        skill.category || 'general',
        skill.price,
        skill.estimatedTime || '1 minute'
      );
    }

    res.json({
      success: true,
      agentId: agent.id,
      apiKey: agent.api_key
    });
  } catch (error) {
    console.error('Register agent error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get agent's received jobs
router.get('/api/agents/:id/jobs', async (req, res) => {
  try {
    const jobs = await db.getJobsByAgent(req.params.id);
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
