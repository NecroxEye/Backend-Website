<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Frosted Fang System</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg-1:#03131a;
      --bg-2:#072532;
      --bg-3:#0b3a4c;
      --ice:#dffcff;
      --cyan:#8af7ff;
      --line:rgba(138,247,255,.22);
      --line-strong:rgba(138,247,255,.42);
      --text:#ecfdff;
      --muted:#a7d8df;
      --success:#7fffd4;
      --danger:#ff9ab2;
      --shadow:0 24px 80px rgba(0,0,0,.35);
      --radius:26px;
      --max:1220px;
    }

    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{
      min-height:100vh;
      color:var(--text);
      font-family:"JetBrains Mono", monospace;
      background:
        radial-gradient(circle at 15% 20%, rgba(138,247,255,.18), transparent 24%),
        radial-gradient(circle at 80% 18%, rgba(87,231,255,.14), transparent 22%),
        radial-gradient(circle at 50% 85%, rgba(38,205,232,.12), transparent 28%),
        linear-gradient(135deg, var(--bg-1) 0%, var(--bg-2) 42%, var(--bg-3) 100%);
      overflow-x:hidden;
    }

    body::before{
      content:"";
      position:fixed;
      inset:0;
      pointer-events:none;
      background:
        linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
      background-size:36px 36px;
      opacity:.28;
      mask-image: radial-gradient(circle at center, black 42%, transparent 100%);
    }

    .shell{
      width:min(calc(100% - 28px), var(--max));
      margin-inline:auto;
    }

    .glass{
      border:1px solid var(--line);
      background:
        linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04)),
        linear-gradient(180deg, rgba(8,29,38,.56), rgba(5,17,22,.56));
      border-radius:var(--radius);
      box-shadow:var(--shadow);
      backdrop-filter:blur(20px) saturate(160%);
      -webkit-backdrop-filter:blur(20px) saturate(160%);
      position:relative;
      overflow:hidden;
    }

    .glass::before{
      content:"";
      position:absolute;
      inset:0;
      pointer-events:none;
      background:
        linear-gradient(130deg, rgba(255,255,255,.16), transparent 20%, transparent 75%, rgba(138,247,255,.07)),
        radial-gradient(circle at top left, rgba(255,255,255,.12), transparent 28%);
    }

    header{padding:22px 0 10px}

    .topbar{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:18px;
      padding:14px 16px;
      border:1px solid var(--line);
      border-radius:999px;
      background:linear-gradient(180deg, rgba(222,252,255,.10), rgba(7,24,31,.30));
      box-shadow:var(--shadow);
      backdrop-filter:blur(18px) saturate(150%);
    }

    .brand{
      display:flex;
      align-items:center;
      gap:14px;
      min-width:0;
    }

    .logo-wrap{
      width:56px;
      height:56px;
      border-radius:16px;
      display:grid;
      place-items:center;
      background:linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.03));
      border:1px solid var(--line);
      overflow:hidden;
      flex:0 0 auto;
      padding:6px;
    }

    .logo-wrap img{
      width:100%;
      height:100%;
      object-fit:contain;
      display:block;
    }

    .logo-fallback{
      width:100%;
      height:100%;
      display:none;
      place-items:center;
      color:var(--cyan);
      font-family:"Orbitron", sans-serif;
      font-size:1.2rem;
      text-transform:uppercase;
    }

    .brand-copy small{
      display:block;
      color:var(--muted);
      letter-spacing:.18em;
      text-transform:uppercase;
      font-size:.72rem;
      margin-bottom:4px;
    }

    .brand-copy strong{
      display:block;
      font-family:"Orbitron", sans-serif;
      font-size:1rem;
      letter-spacing:.08em;
      text-transform:uppercase;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }

    .status-pill{
      display:inline-flex;
      align-items:center;
      gap:10px;
      padding:10px 14px;
      border-radius:999px;
      border:1px solid var(--line);
      background:rgba(255,255,255,.06);
      color:var(--muted);
      white-space:nowrap;
    }

    .status-dot{
      width:10px;height:10px;border-radius:50%;
      background:var(--cyan);
      box-shadow:0 0 0 7px rgba(138,247,255,.10), 0 0 16px rgba(138,247,255,.6);
      animation:pulse 2s infinite;
    }

    main{padding:18px 0 38px}

    .hero{
      display:grid;
      grid-template-columns:1.15fr .85fr;
      gap:22px;
      align-items:stretch;
    }

    .hero-copy{
      padding:clamp(24px, 5vw, 52px);
      min-height:420px;
      display:flex;
      flex-direction:column;
      justify-content:center;
    }

    .eyebrow{
      display:inline-block;
      color:var(--muted);
      text-transform:uppercase;
      letter-spacing:.24em;
      font-size:.75rem;
      margin-bottom:14px;
    }

    h1,h2{
      margin:0;
      font-family:"Orbitron", sans-serif;
      text-transform:uppercase;
      line-height:.92;
      letter-spacing:.04em;
    }

    h1{
      font-size:clamp(2.8rem, 7vw, 5.8rem);
      max-width:9ch;
      margin-bottom:18px;
    }

    .lead{
      margin:0 0 24px;
      max-width:58ch;
      color:#d3f7fb;
      line-height:1.75;
      font-size:clamp(.98rem, 1.4vw, 1.05rem);
    }

    .hero-tags{
      display:flex;
      flex-wrap:wrap;
      gap:12px;
    }

    .tag{
      border:1px solid var(--line);
      background:rgba(255,255,255,.06);
      color:var(--ice);
      border-radius:999px;
      padding:10px 14px;
      font-size:.88rem;
    }

    .hero-side{
      padding:22px;
      display:grid;
      grid-template-rows:auto auto 1fr auto;
      gap:16px;
    }

    .mini{
      color:var(--muted);
      text-transform:uppercase;
      letter-spacing:.18em;
      font-size:.74rem;
    }

    .auth-box{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      align-items:center;
      justify-content:space-between;
      border:1px solid var(--line);
      border-radius:18px;
      padding:12px 14px;
      background:rgba(255,255,255,.05);
    }

    .auth-text{
      color:var(--ice);
      font-size:.92rem;
      line-height:1.6;
    }

    .btn{
      border:none;
      cursor:pointer;
      border-radius:14px;
      padding:12px 16px;
      font:inherit;
      font-weight:700;
      transition:transform .18s ease, filter .18s ease, opacity .18s ease;
    }

    .btn:hover{transform:translateY(-2px);filter:brightness(1.03)}
    .btn:active{transform:translateY(0) scale(.985)}

    .btn-login{
      color:#03242d;
      background:linear-gradient(180deg, #dffcff, #8af7ff);
    }

    .btn-logout{
      color:var(--text);
      background:rgba(255,255,255,.08);
      border:1px solid var(--line);
    }

    .console{
      border-radius:22px;
      overflow:hidden;
      border:1px solid rgba(138,247,255,.22);
      background:
        linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01)),
        linear-gradient(180deg, rgba(4,15,20,.92), rgba(3,11,15,.96));
      min-height:250px;
      display:grid;
      grid-template-rows:auto 1fr;
    }

    .console-bar{
      display:flex;
      align-items:center;
      gap:8px;
      padding:12px 14px;
      border-bottom:1px solid rgba(138,247,255,.14);
      background:rgba(255,255,255,.04);
    }

    .dot{
      width:10px;height:10px;border-radius:50%;
      background:#7bc9da;
      opacity:.5;
    }
    .dot:nth-child(2){opacity:.7}
    .dot:nth-child(3){opacity:1}

    .console-screen{
      padding:20px;
      color:var(--success);
      font-size:1rem;
      line-height:1.7;
      white-space:pre-line;
      overflow:hidden;
    }

    .console-meta{
      display:flex;
      justify-content:space-between;
      gap:12px;
      color:var(--muted);
      font-size:.86rem;
    }

    .section{margin-top:24px}

    .panel{padding:clamp(22px, 4vw, 34px)}

    .panel-head{
      display:flex;
      justify-content:space-between;
      align-items:end;
      gap:18px;
      margin-bottom:22px;
    }

    .panel-head p{
      margin:8px 0 0;
      color:var(--muted);
      max-width:62ch;
      line-height:1.7;
    }

    .big-count{
      font-family:"Orbitron", sans-serif;
      font-size:clamp(2.2rem, 5vw, 3.4rem);
      color:var(--cyan);
    }

    .players{
      display:grid;
      grid-template-columns:repeat(3, minmax(0,1fr));
      gap:16px;
    }

    .player-btn{
      border:none;
      cursor:pointer;
      text-align:left;
      padding:20px 18px;
      min-height:140px;
      border-radius:22px;
      color:var(--text);
      background:
        linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.03)),
        linear-gradient(180deg, rgba(11,38,49,.78), rgba(6,21,29,.9));
      border:1px solid rgba(138,247,255,.20);
      box-shadow:0 16px 28px rgba(0,0,0,.18);
      transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease, opacity .18s ease;
      position:relative;
      overflow:hidden;
    }

    .player-btn::before{
      content:"";
      position:absolute;
      inset:auto 0 0 0;
      height:3px;
      background:linear-gradient(90deg, rgba(138,247,255,.9), transparent 78%);
    }

    .player-btn:hover:not(:disabled){
      transform:translateY(-4px);
      border-color:var(--line-strong);
      box-shadow:0 20px 34px rgba(0,0,0,.22);
    }

    .player-btn:active:not(:disabled){
      transform:translateY(0) scale(.985);
    }

    .player-btn:disabled{
      cursor:not-allowed;
      opacity:.52;
    }

    .player-btn .label{
      display:block;
      color:var(--muted);
      text-transform:uppercase;
      letter-spacing:.16em;
      font-size:.72rem;
      margin-bottom:10px;
    }

    .player-btn .name{
      display:block;
      font-family:"Orbitron", sans-serif;
      font-size:clamp(1.2rem, 2.3vw, 1.6rem);
      line-height:1.1;
      margin-bottom:10px;
      text-transform:uppercase;
    }

    .player-btn .sub{
      display:block;
      color:#d9fbff;
      font-size:.88rem;
      line-height:1.65;
    }

    .admin-panel{
      margin-top:20px;
      padding:18px;
      border:1px solid rgba(138,247,255,.16);
      border-radius:20px;
      background:rgba(255,255,255,.04);
    }

    .admin-grid{
      display:grid;
      grid-template-columns:1.35fr .75fr .75fr 1fr;
      gap:12px;
      margin-top:14px;
    }

    .input, .select{
      min-width:0;
      border-radius:16px;
      border:1px solid rgba(138,247,255,.22);
      background:rgba(255,255,255,.06);
      color:var(--text);
      padding:14px 16px;
      font:inherit;
      outline:none;
      width:100%;
    }

    .select option{
      color:#000;
    }

    .input::placeholder{color:#b5e8ef}

    .input:focus, .select:focus{
      border-color:var(--line-strong);
      box-shadow:0 0 0 4px rgba(138,247,255,.08);
    }

    .add-btn{
      margin-top:12px;
      color:#03242d;
      background:linear-gradient(180deg, #dffcff, #8af7ff);
    }

    .admin-note{
      margin-top:12px;
      color:var(--muted);
      font-size:.9rem;
      line-height:1.6;
    }

    .hint{
      margin-top:12px;
      color:var(--muted);
      line-height:1.6;
      font-size:.92rem;
    }

    .overlay{
      position:fixed;
      inset:0;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:22px;
      background:rgba(3,13,17,.48);
      backdrop-filter:blur(10px);
      opacity:0;
      pointer-events:none;
      transition:opacity .24s ease;
      z-index:50;
    }

    .overlay.show{
      opacity:1;
      pointer-events:auto;
    }

    .anim-panel{
      width:min(92vw, 760px);
      border-radius:26px;
      overflow:hidden;
      border:1px solid rgba(138,247,255,.26);
      background:
        linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.03)),
        linear-gradient(180deg, rgba(8,28,36,.88), rgba(5,16,22,.94));
      box-shadow:0 30px 90px rgba(0,0,0,.35);
      transform:translateY(12px) scale(.985);
      transition:transform .24s ease;
      position:relative;
    }

    .overlay.show .anim-panel{
      transform:translateY(0) scale(1);
    }

    .anim-head{
      padding:14px 16px;
      display:flex;
      align-items:center;
      gap:8px;
      border-bottom:1px solid rgba(138,247,255,.14);
      background:rgba(255,255,255,.05);
    }

    .anim-body{
      padding:28px 26px 30px;
      display:grid;
      gap:18px;
      justify-items:center;
      text-align:center;
    }

    .eye-wrap{
      width:min(100%, 520px);
    }

    .eye-svg{
      width:100%;
      height:auto;
      display:block;
      filter:drop-shadow(0 0 18px rgba(138,247,255,.28));
    }

    .eye-outline{
      stroke:rgba(223,252,255,.95);
      stroke-width:3.2;
      fill:none;
      stroke-linecap:round;
      stroke-dasharray:900;
      stroke-dashoffset:900;
      animation:drawEye .9s ease forwards;
    }

    .eye-pupil{
      fill:var(--cyan);
      transform-origin:center;
      animation:pupilPulse 1.25s ease .4s forwards;
      opacity:0;
    }

    .anim-title{
      font-family:"Orbitron", sans-serif;
      font-size:clamp(1.25rem, 2.6vw, 2rem);
      letter-spacing:.08em;
      text-transform:uppercase;
      margin:0;
    }

    .anim-text{
      margin:0;
      color:var(--success);
      font-size:clamp(1rem, 1.7vw, 1.08rem);
      line-height:1.8;
    }

    .hidden{display:none !important}

    @keyframes pulse{
      0%,100%{transform:scale(1);opacity:1}
      50%{transform:scale(1.16);opacity:.84}
    }

    @keyframes drawEye{
      to{stroke-dashoffset:0}
    }

    @keyframes pupilPulse{
      0%{transform:scale(.25);opacity:0}
      60%{transform:scale(1.15);opacity:1}
      100%{transform:scale(1);opacity:1}
    }

    @media (max-width: 980px){
      .hero{grid-template-columns:1fr}
      .players{grid-template-columns:repeat(2, minmax(0,1fr))}
      .admin-grid{grid-template-columns:1fr 1fr}
    }

    @media (max-width: 640px){
      .topbar{
        flex-direction:column;
        align-items:flex-start;
        border-radius:24px;
      }
      .panel-head{
        flex-direction:column;
        align-items:flex-start;
      }
      .players{grid-template-columns:1fr}
      .admin-grid{grid-template-columns:1fr}
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="topbar">
        <div class="brand">
          <div class="logo-wrap">
            <img id="logoImage" src="./logo.png" alt="Frosted Fang logo" />
            <div id="logoFallback" class="logo-fallback">FF</div>
          </div>
          <div class="brand-copy">
            <small>Frosted Division</small>
            <strong>Frosted Fang System</strong>
          </div>
        </div>

        <div class="status-pill" aria-live="polite">
          <span class="status-dot" aria-hidden="true"></span>
          <span id="backendStatus">Backend: checking...</span>
        </div>
      </div>
    </header>

    <main>
      <section class="hero">
        <article class="glass hero-copy">
          <span class="eyebrow">Cryo Control Interface</span>
          <h1>Frosted Fang</h1>
          <p class="lead">
            Secure role-based access, persistent login, channel-aware player configs, and a frosted cyan control panel for instant pearl pulls.
          </p>
          <div class="hero-tags">
            <span class="tag">Discord auth</span>
            <span class="tag">Role restricted admin add</span>
            <span class="tag">Signal • side • channel</span>
          </div>
        </article>

        <aside class="glass hero-side">
          <div class="mini">Authorization</div>

          <div class="auth-box">
            <div class="auth-text" id="authText">Checking login...</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button id="loginBtn" class="btn btn-login" type="button">Login with Discord</button>
              <button id="logoutBtn" class="btn btn-logout hidden" type="button">Logout</button>
            </div>
          </div>

          <div class="mini">System Console</div>
          <div class="console">
            <div class="console-bar">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
            <div class="console-screen" id="consoleScreen">Frosted Fang System
Awaiting authorization...</div>
          </div>

          <div class="console-meta">
            <span id="playerCountSmall">0 players loaded</span>
            <span id="lastAction">No action yet</span>
          </div>
        </aside>
      </section>

      <section class="section">
        <article class="glass panel">
          <div class="panel-head">
            <div>
              <span class="eyebrow">Operator Grid</span>
              <h2>Team Pearl Controls</h2>
              <p>
                Each player carries its own signal, redstone side, and channel name. Only users with the admin Discord role can add new players.
              </p>
            </div>
            <div class="big-count" id="playerCountBig">0</div>
          </div>

          <div class="players" id="playersGrid"></div>

          <div id="adminPanel" class="admin-panel hidden">
            <span class="eyebrow">Admin Configuration</span>
            <h2 style="font-size:clamp(1.3rem,2vw,1.7rem); margin-top:4px;">Add New Player</h2>

            <div class="admin-grid">
              <input id="newPlayerName" class="input" type="text" maxlength="24" placeholder="Player name" />
              <input id="newPlayerSignal" class="input" type="number" min="1" max="15" value="15" placeholder="Signal" />
              <select id="newPlayerSide" class="select">
                <option value="back">back</option>
                <option value="front">front</option>
                <option value="left">left</option>
                <option value="right">right</option>
                <option value="top">top</option>
                <option value="bottom">bottom</option>
              </select>
              <input id="newPlayerChannel" class="input" type="text" maxlength="32" value="Oil Rig" placeholder="Channel name" />
            </div>

            <button id="addPlayerBtn" class="btn add-btn" type="button">Add Player</button>

            <p class="admin-note">
              Admin role required: <strong>1556390847191322806</strong>
            </p>
          </div>

          <p class="hint">
            Put your real logo file next to this HTML as <strong>logo.png</strong>. If it is missing, a fallback FF icon appears.
          </p>
        </article>
      </section>
    </main>
  </div>

  <div class="overlay" id="overlay" aria-hidden="true">
    <div class="anim-panel">
      <div class="anim-head">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
      <div class="anim-body">
        <div class="eye-wrap" aria-hidden="true">
          <svg class="eye-svg" viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">
            <path class="eye-outline" d="M85 100C145 42 225 28 300 28C375 28 455 42 515 100C455 158 375 172 300 172C225 172 145 158 85 100Z"/>
            <circle class="eye-pupil" cx="300" cy="100" r="24"/>
          </svg>
        </div>
        <h3 class="anim-title">Frosted Fang System</h3>
        <p class="anim-text" id="animText">Pulled User Pearl</p>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = 'https://backend-website-syxe.onrender.com';
    const ADMIN_ROLE_ID = '1556390847191322806';

    const players = [
      { name: 'Necrox', signal: 15, side: 'back', channel: 'Oil Rig' },
      { name: 'Alice', signal: 15, side: 'top', channel: 'Oil Rig' },
      { name: 'Frosted Fang', signal: 15, side: 'left', channel: 'Oil Rig' }
    ];

    let isLoggedIn = false;
    let currentUser = null;
    let canManagePlayers = false;

    const playersGrid = document.getElementById('playersGrid');
    const playerCountSmall = document.getElementById('playerCountSmall');
    const playerCountBig = document.getElementById('playerCountBig');
    const backendStatus = document.getElementById('backendStatus');
    const consoleScreen = document.getElementById('consoleScreen');
    const lastAction = document.getElementById('lastAction');
    const overlay = document.getElementById('overlay');
    const animText = document.getElementById('animText');
    const authText = document.getElementById('authText');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminPanel = document.getElementById('adminPanel');
    const addPlayerBtn = document.getElementById('addPlayerBtn');
    const newPlayerName = document.getElementById('newPlayerName');
    const newPlayerSignal = document.getElementById('newPlayerSignal');
    const newPlayerSide = document.getElementById('newPlayerSide');
    const newPlayerChannel = document.getElementById('newPlayerChannel');
    const logoImage = document.getElementById('logoImage');
    const logoFallback = document.getElementById('logoFallback');

    logoImage.addEventListener('error', () => {
      logoImage.style.display = 'none';
      logoFallback.style.display = 'grid';
    });

    function updateCounts() {
      const count = players.length;
      playerCountSmall.textContent = `${count} player${count === 1 ? '' : 's'} loaded`;
      playerCountBig.textContent = count;
    }

    function setConsole(text) {
      consoleScreen.textContent = text;
    }

    function cleanName(name) {
      return name.replace(/\s+/g, ' ').trim();
    }

    function updateAuthUI() {
      const buttons = document.querySelectorAll('.player-btn');
      buttons.forEach(btn => btn.disabled = !isLoggedIn);

      adminPanel.classList.toggle('hidden', !canManagePlayers);

      if (isLoggedIn) {
        const name = currentUser?.global_name || currentUser?.username || 'Authorized User';
        const adminText = canManagePlayers ? '\nAdmin role detected.' : '\nStandard operator access.';
        authText.textContent = `Logged in as ${name}`;
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        setConsole(`Frosted Fang System\nAuthorized.\nWelcome ${name}${adminText}`);
      } else {
        authText.textContent = 'Not logged in';
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        adminPanel.classList.add('hidden');
        setConsole('Frosted Fang System\nAwaiting authorization...');
      }
    }

    async function checkBackend() {
      try {
        const res = await fetch(`${API_BASE}/`, { method: 'GET', credentials: 'include' });
        if (!res.ok) throw new Error();
        backendStatus.textContent = 'Backend: online';
      } catch {
        backendStatus.textContent = 'Backend: offline';
      }
    }

    async function checkLogin() {
      try {
        const res = await fetch(`${API_BASE}/api/me`, {
          method: 'GET',
          credentials: 'include'
        });
        const data = await res.json();

        if (data.loggedIn) {
          isLoggedIn = true;
          currentUser = data.user;
          canManagePlayers = Array.isArray(data.user.roles) && data.user.roles.includes(ADMIN_ROLE_ID);
        } else {
          isLoggedIn = false;
          currentUser = null;
          canManagePlayers = false;
        }
      } catch {
        isLoggedIn = false;
        currentUser = null;
        canManagePlayers = false;
      }

      updateAuthUI();
    }

    function showAnimation(player) {
      animText.textContent = `Pulled ${player} Pearl`;
      overlay.classList.add('show');
      overlay.setAttribute('aria-hidden', 'false');

      setTimeout(() => {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
      }, 1900);
    }

    async function pullPearl(player, button) {
      if (!isLoggedIn) {
        setConsole('Frosted Fang System\nAccess denied.\nPlease login first.');
        return;
      }

      button.disabled = true;
      setConsole(`Frosted Fang System\nSending command...\nTarget: ${player.name}\nSide: ${player.side}\nChannel: ${player.channel}`);

      try {
        const res = await fetch(`${API_BASE}/api/pull-pearl`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(player)
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.message || 'Request failed');
        }

        lastAction.textContent = `Last action: ${player.name}`;
        setConsole(`Frosted Fang System\nCommand accepted.\nPulled ${player.name} Pearl`);
        showAnimation(player.name);
      } catch (err) {
        setConsole(`Frosted Fang System\nCommand failed.\n${err.message}`);
      } finally {
        button.disabled = !isLoggedIn;
      }
    }

    function createPlayerButton(player) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'player-btn';
      button.disabled = !isLoggedIn;
      button.innerHTML = `
        <span class="label">Pearl Trigger</span>
        <span class="name">${player.name}</span>
        <span class="sub">Signal ${player.signal} • ${player.side} • ${player.channel}</span>
      `;
      button.addEventListener('click', () => pullPearl(player, button));
      return button;
    }

    function renderPlayers() {
      playersGrid.innerHTML = '';
      players.forEach(player => {
        playersGrid.appendChild(createPlayerButton(player));
      });
      updateCounts();
      updateAuthUI();
    }

    function addPlayer() {
      if (!isLoggedIn) {
        setConsole('Frosted Fang System\nAccess denied.\nPlease login first.');
        return;
      }

      if (!canManagePlayers) {
        setConsole('Frosted Fang System\nAccess denied.\nAdmin role required to add players.');
        return;
      }

      const name = cleanName(newPlayerName.value);
      const signal = Number(newPlayerSignal.value);
      const side = newPlayerSide.value;
      const channel = cleanName(newPlayerChannel.value);

      if (!name) {
        setConsole('Frosted Fang System\nMissing player name.');
        return;
      }

      if (!channel) {
        setConsole('Frosted Fang System\nMissing channel name.');
        return;
      }

      if (!Number.isInteger(signal) || signal < 1 || signal > 15) {
        setConsole('Frosted Fang System\nSignal must be between 1 and 15.');
        return;
      }

      const exists = players.some(p => p.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        setConsole(`Frosted Fang System\nPlayer already exists.\n${name}`);
        return;
      }

      players.push({ name, signal, side, channel });
      renderPlayers();
      setConsole(`Frosted Fang System\nRegistered new player.\n${name}\nSignal: ${signal} • Side: ${side} • Channel: ${channel}`);

      newPlayerName.value = '';
      newPlayerSignal.value = '15';
      newPlayerSide.value = 'back';
      newPlayerChannel.value = 'Oil Rig';
    }

    loginBtn.addEventListener('click', () => {
      window.location.href = `${API_BASE}/auth/discord`;
    });

    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          credentials: 'include'
        });
      } catch {}
      isLoggedIn = false;
      currentUser = null;
      canManagePlayers = false;
      updateAuthUI();
    });

    addPlayerBtn.addEventListener('click', addPlayer);

    renderPlayers();
    updateAuthUI();
    checkBackend();
    checkLogin();
  </script>
</body>
</html>
