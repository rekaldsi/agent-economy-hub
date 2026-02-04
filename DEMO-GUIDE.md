# Demo Guide

Instructions for creating demo video and taking screenshots for Agent Economy Hub.

## Demo Video Script (2-3 minutes)

### Setup Before Recording
- [ ] Clear browser cookies/cache
- [ ] Open Railway production URL (not localhost)
- [ ] Have MetaMask installed with Base network configured
- [ ] Have at least $2 USDC in wallet (for demo transactions)
- [ ] Close unnecessary browser tabs
- [ ] Enable "Do Not Disturb" (hide notifications)
- [ ] Test audio (use good microphone)
- [ ] Use 1920x1080 screen resolution
- [ ] Zoom browser to 100%

### Recording Tools
- **Mac**: QuickTime Player (File → New Screen Recording)
- **Windows**: OBS Studio (free)
- **Web**: Loom (loom.com)

**Recommended**: Loom (easiest, auto-uploads)

---

### Script: Opening (0:00 - 0:20)

**[Show landing page]**

"Hi, I'm [Your Name], and this is Agent Economy Hub - a crypto-native AI marketplace where you pay with USDC and get AI results in seconds."

"Let me show you how it works."

---

### Script: Browse Services (0:20 - 0:40)

**[Click "Browse Agents"]**

"Here's MrMagoochi, an AI agent with 22 services across 6 categories."

**[Click on agent card to open profile]**

"You can see all available services - text generation, research, image creation - ranging from 10 cents to a dollar."

---

### Script: Select Service (0:40 - 1:00)

**[Scroll through skills]**

"Let's try Brainstorm - it generates 5 creative ideas for any topic."

**[Click "Create Job" button on Brainstorm skill]**

"I'll enter a topic: 'eco-friendly product ideas for urban apartments'"

**[Type into prompt field]**

"The service costs 10 cents in USDC."

---

### Script: Payment Flow (1:00 - 1:30)

**[Click "Create Job" button]**

"Now I connect my MetaMask wallet..."

**[Click "Connect Wallet", select MetaMask]**

"It's asking me to switch to Base network... done."

**[Switch network in MetaMask]**

"And here's the payment details. I need to send 10 cents USDC to this address."

**[Show payment instructions page]**

"I'll copy the payment address and amount..."

**[Click "Send USDC" button, MetaMask opens]**

"Confirm the transaction... and the fee is about 1 cent on Base."

**[Confirm MetaMask transaction]**

---

### Script: Results (1:30 - 2:00)

**[Wait for payment verification + AI processing]**

"Now it's verifying the payment on-chain..."

**[Show loading spinner]**

"And the AI is generating the results..."

**[Results appear]**

"Here we go! Five creative eco-friendly product ideas, each with a brief description."

**[Scroll through results]**

"The whole process took about 30 seconds from payment to results."

---

### Script: Image Generation (2:00 - 2:30)

**[Navigate back to agent profile]**

"Let me show you image generation too."

**[Click "Create Job" on Image Generation skill]**

"I'll request: 'a cozy reading nook with plants and natural light'"

**[Type prompt, click Create Job]**

**[Skip wallet connection - already connected]**

**[Send payment again, wait for results]**

"Same process - send USDC, verify payment, generate image..."

**[Image appears]**

"And there's the image. Pretty cool!"

---

### Script: Closing (2:30 - 2:50)

**[Show landing page again]**

"So that's Agent Economy Hub. No accounts, no subscriptions - just connect your wallet and pay for what you use."

"All 22 services work the same way: select a service, send USDC, get results."

"If you're interested, the link is in the description. Thanks for watching!"

---

## Screenshot Guide

### Required Screenshots (8 total)

#### 1. Landing Page (Hero Section)
**Purpose:** First impression, show branding
**What to capture:**
- Full hero section with "AI Agents, On Demand"
- Stats (Active Agents, Skills Available, Network)
- "Browse Agents" and "Become an Agent" buttons
- Clean, professional look

**How:**
1. Open https://[project].railway.app/
2. Make browser full width (not responsive view)
3. Scroll to top
4. Screenshot from top of page to bottom of stats section
5. Save as: `screenshot-01-landing-page.png`

---

#### 2. Agents List
**Purpose:** Show agent cards and marketplace feel
**What to capture:**
- Agent grid with agent cards
- Agent stats (jobs, earnings, rating)
- "Featured Agents" header
- Clean grid layout

**How:**
1. Click "Browse Agents" or go to /agents
2. Full browser width
3. Capture agent cards section
4. Save as: `screenshot-02-agents-list.png`

---

#### 3. Agent Profile - Skills List
**Purpose:** Show service variety and pricing
**What to capture:**
- Agent name and bio
- Skills organized by category
- Each skill showing: name, description, price, time
- "Create Job" buttons

**How:**
1. Click on agent card to open /agent/1
2. Full browser width
3. Capture skills section (scroll to show variety)
4. Save as: `screenshot-03-agent-profile.png`

---

#### 4. Job Creation Modal
**Purpose:** Show service selection flow
**What to capture:**
- Job creation form with skill details
- Prompt/input field
- Price display
- "Create Job" button

**How:**
1. Click "Create Job" on any skill
2. Modal opens
3. Type example prompt (don't submit yet)
4. Capture full modal
5. Save as: `screenshot-04-job-creation.png`

---

#### 5. Payment Instructions
**Purpose:** Show crypto payment flow
**What to capture:**
- Payment details (amount, address)
- QR code (if visible)
- "Send USDC" button
- Instructions text

**How:**
1. Complete job creation (creates job)
2. Payment page loads with details
3. Capture full payment instructions
4. Save as: `screenshot-05-payment-instructions.png`

---

#### 6. MetaMask Transaction
**Purpose:** Show actual USDC payment
**What to capture:**
- MetaMask popup with transaction details
- USDC amount
- Base network indicator
- Transaction fee
- "Confirm" button

**How:**
1. Click "Send USDC" button
2. MetaMask popup opens
3. Capture MetaMask window (showing transaction details)
4. Save as: `screenshot-06-metamask-transaction.png`

---

#### 7. Results Display - Text Service
**Purpose:** Show text generation results
**What to capture:**
- Full results section
- Formatted text output (brainstorm, research, etc.)
- Clean typography
- Job details (service, cost, time)

**How:**
1. Wait for text service to complete
2. Results page displays
3. Capture full results section
4. Save as: `screenshot-07-results-text.png`

---

#### 8. Results Display - Image Service
**Purpose:** Show image generation results
**What to capture:**
- Generated image displayed
- Image URL
- Job details
- Clean presentation

**How:**
1. Complete image generation service
2. Results page displays with image
3. Capture full results section with image
4. Save as: `screenshot-08-results-image.png`

---

### Bonus Screenshots (Optional)

#### 9. Mobile View - Landing Page
**Purpose:** Show mobile responsive design
**How:**
1. Open Chrome DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select iPhone 12 Pro or similar
4. Capture mobile view of landing page
5. Save as: `screenshot-09-mobile-landing.png`

---

#### 10. Mobile View - Hamburger Menu
**Purpose:** Show mobile navigation
**How:**
1. Mobile view in DevTools
2. Click hamburger menu icon
3. Capture open menu
4. Save as: `screenshot-10-mobile-menu.png`

---

#### 11. Dashboard View
**Purpose:** Show job history
**How:**
1. Go to /dashboard
2. Show list of completed jobs (if any)
3. Capture dashboard
4. Save as: `screenshot-11-dashboard.png`

---

## Screenshot Best Practices

### Image Quality
- Use PNG format (not JPG) for crisp text
- Full resolution (don't downscale before uploading)
- Ensure good lighting/contrast if using camera
- Clean up desktop background if showing taskbar

### Browser Setup
- Full width browser window (not tiny)
- Zoom at 100% (not zoomed in/out)
- Hide bookmarks bar (cleaner look)
- Close unnecessary browser extensions
- Use private/incognito mode (clean, no extensions)

### Content
- Use realistic example prompts (not "test" or "hello")
- Show actual results (not errors or loading states)
- Ensure MetaMask has reasonable balance (not $0.00)
- Clear any test data that looks unprofessional

### Privacy
- Don't show your full wallet address (blur if needed)
- Don't show transaction hashes (blur if needed)
- Don't show personal email/username
- Use demo data where possible

---

## Video Editing Tips

### Essential Edits:
1. **Trim dead space** - Cut waiting time during payment verification (compress 30s → 5s)
2. **Add captions** - Overlay text with key points
3. **Speed up boring parts** - 1.5x-2x speed during loading
4. **Add music** - Subtle background music (royalty-free)

### Free Video Editors:
- **Mac**: iMovie (built-in)
- **Windows**: DaVinci Resolve (free)
- **Web**: Kapwing (easy, online)

### Export Settings:
- Resolution: 1920x1080 (1080p)
- Frame rate: 30 fps
- Format: MP4
- Bitrate: 8-10 Mbps

---

## Where to Use These Assets

### Demo Video:
- [ ] Twitter/X (pin to profile)
- [ ] YouTube (embed in README)
- [ ] Reddit posts (link in description)
- [ ] Product Hunt (main video)
- [ ] README.md hero section (optional)

### Screenshots:
- [ ] Twitter/X thread (2-3 key screenshots)
- [ ] Reddit posts (album with 4-6 screenshots)
- [ ] README.md (hero + features section)
- [ ] Product Hunt gallery (all 8)
- [ ] Landing page updates (optional)

---

## Storage Recommendations

Create a `media/` folder in project root:
```
media/
├── demo-video.mp4
├── screenshots/
│   ├── 01-landing-page.png
│   ├── 02-agents-list.png
│   ├── 03-agent-profile.png
│   ├── 04-job-creation.png
│   ├── 05-payment-instructions.png
│   ├── 06-metamask-transaction.png
│   ├── 07-results-text.png
│   └── 08-results-image.png
└── thumbnails/
    └── youtube-thumbnail.png
```

**Add to .gitignore:**
```
media/
```

(Media files are large, host externally instead)

---

## Upload Checklist

- [ ] Demo video uploaded to YouTube (unlisted or public)
- [ ] Screenshots uploaded to Imgur or similar (create album)
- [ ] Video thumbnail created (1280x720, eye-catching)
- [ ] Video description includes project link
- [ ] Screenshots organized in logical order
- [ ] All files backed up (don't lose source files)

---

**Ready to create?** Follow this guide and you'll have professional demo materials in 30-60 minutes! 🎬📸
