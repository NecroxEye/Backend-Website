<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pearl Pull System</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Oxanium:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg: #07110b;
      --panel: rgba(10, 18, 14, .34);
      --panel-strong: rgba(7, 14, 10, .52);
      --line: rgba(126, 255, 178, .18);
      --line-strong: rgba(126, 255, 178, .28);
      --text: #f4fff7;
      --muted: #c7d8cd;
      --green: #73f2aa;
      --green-2: #b8ffd2;
      --gold: #ffe18a;
      --danger: #ff8484;
      --discord-a: #5865f2;
      --discord-b: #7b86ff;
      --shadow: 0 24px 70px rgba(0,0,0,.34);
      --radius: 26px;
    }

    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%}

    body{
      font-family:"Inter", sans-serif;
      color:var(--text);
      background:
        linear-gradient(rgba(3,8,5,.18), rgba(3,8,5,.38)),
        url("background.png") center/cover no-repeat fixed;
      overflow-x:hidden;
    }

    body::before{
      content:"";
      position:fixed;
      inset:0;
      pointer-events:none;
      background:
        linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.022) 1px, transparent 1px);
      background-size:34px 34px;
      opacity:.15;
      mask-image:linear-gradient(to bottom, rgba(0,0,0,.85), transparent 96%);
      -webkit-mask-image:linear-gradient(to bottom, rgba(0,0,0,.85), transparent 96%);
    }

    .layout{
      min-height:100vh;
      padding:22px;
      display:grid;
      grid-template-columns:minmax(0,1.2fr) 360px;
      gap:22px;
    }

    .stage,
    .side{
      position:relative;
      overflow:hidden;
      border-radius:var(--radius);
      border:1px solid var(--line);
      background:linear-gradient(180deg, var(--panel), var(--panel-strong));
      backdrop-filter:blur(6px);
      -webkit-backdrop-filter:blur(6px);
      box-shadow:var(--shadow);
    }

    .stage{
      min-height:calc(100vh - 44px);
      display:flex;
      align-items:center;
      justify-content:center;
      padding:40px 28px;
    }

    .side{
      min-height:calc(100vh - 44px);
      display:flex;
      flex-direction:column;
      padding:22px;
    }

    .stage::after,
    .side::after{
      content:"";
      position:absolute;
      right:-80px;
      bottom:-80px;
      width:260px;
      height:260px;
      border-radius:50%;
      background:radial-gradient(circle, rgba(115,242,170,.16), transparent 68%);
      filter:blur(16px);
      pointer-events:none;
    }

    .hero{
      width:min(760px, 100%);
      text-align:center;
      animation:fadeUp .7s ease both;
    }

    .eyebrow{
      display:inline-flex;
      align-items:center;
      gap:10px;
      color:var(--green);
      text-transform:uppercase;
      letter-spacing:.14em;
      font-size:.82rem;
      font-weight:800;
      margin-bottom:16px;
    }

    .eyebrow::before{
      content:"";
      width:12px;
      height:12px;
      border-radius:4px;
      background:linear-gradient(135deg, var(--green), var(--gold));
      box-shadow:0 0 16px rgba(115,242,170,.4);
    }

    .logo{
      width:min(260px, 56vw);
      height:auto;
      display:block;
      margin:0 auto 18px;
      filter:drop-shadow(0 16px 30px rgba(0,0,0,.28));
    }

    h1,h2,h3{
      margin:0;
      font-family:"Oxanium", sans-serif;
      letter-spacing:-.03em;
      line-height:.95;
    }

    h1{
      font-size:clamp(2.5rem, 5vw, 5rem);
      text-shadow:0 12px 32px rgba(0,0,0,.3);
      margin-bottom:16px;
    }

    .lead{
      max-width:56ch;
      margin:0 auto;
      color:var(--muted);
      line-height:1.72;
      font-size:1rem;
    }

    .action-stack{
      width:min(520px, 100%);
      margin:28px auto 0;
      display:grid;
      gap:14px;
    }

    .btn,
    .link-btn{
      appearance:none;
      border:none;
      width:100%;
      min-height:60px;
      padding:0 18px;
      border-radius:18px;
      cursor:pointer;
      font:inherit;
      font-size:1rem;
      font-weight:800;
      text-decoration:none;
      display:flex;
      align-items:center;
      justify-content:center;
      gap:10px;
      transition:transform .18s ease, box-shadow .18s ease, background .18s ease, opacity .18s ease;
    }

    .btn:active,
    .link-btn:active{
      transform:translateY(1px) scale(.99);
    }

    .discord-btn{
      color:#f7f9ff;
      background:linear-gradient(135deg, var(--discord-a), var(--discord-b));
      box-shadow:0 18px 38px rgba(88,101,242,.28);
    }

    .discord-btn:hover{
      transform:translateY(-2px);
      box-shadow:0 24px 46px rgba(88,101,242,.34);
    }

    .pearl-btn{
      color:#05110a;
      background:linear-gradient(135deg, var(--green), var(--green-2));
      box-shadow:0 18px 38px rgba(115,242,170,.22);
    }

    .pearl-btn:hover{
      transform:translateY(-2px);
      box-shadow:0 24px 46px rgba(115,242,170,.28);
    }

    .secondary{
      color:var(--text);
      background:rgba(255,255,255,.045);
      border:1px solid rgba(255,255,255,.08);
    }

    .secondary:hover{
      transform:translateY(-2px);
      background:rgba(255,255,255,.07);
    }

    .hidden{display:none !important}

    .panel-head p,
    .info p{
      color:var(--muted);
      line-height:1.7;
      margin:10px 0 0;
      font-size:.95rem;
    }

    .status{
      display:flex;
      align-items:center;
      gap:10px;
      margin:18px 0;
      padding:14px 15px;
      border-radius:16px;
      background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.07);
      color:var(--muted);
      font-size:.95rem;
    }

    .dot{
      width:10px;
      height:10px;
      border-radius:50%;
      background:var(--gold);
      box-shadow:0 0 14px rgba(255,225,138,.4);
      flex:none;
    }

    .stack{
      display:grid;
      gap:12px;
      margin-top:6px;
    }

    .info,
    .log-wrap{
      margin-top:18px;
      padding:16px;
      border-radius:18px;
      background:rgba(0,0,0,.18);
      border:1px solid rgba(255,255,255,.07);
    }

    .log-wrap{
      flex:1;
      display:flex;
      flex-direction:column;
      min-height:260px;
    }

    #log{
      margin-top:12px;
      flex:1;
      min-height:220px;
      border-radius:14px;
      background:#08100d;
      border:1px solid rgba(115,242,170,.12);
      padding:12px;
      overflow:auto;
      font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size:.86rem;
      line-height:1.55;
      color:#c4ffda;
    }

    .line{margin-bottom:8px}
    .ok{color:var(--green)}
    .warn{color:var(--gold)}
    .err{color:var(--danger)}
    .dim{color:#86a594}

    @keyframes fadeUp{
      from{opacity:0; transform:translateY(18px)}
      to{opacity:1; transform:translateY(0)}
    }

    @media (max-width:1080px){
      .layout{grid-template-columns:1fr}
      .stage,.side{min-height:auto}
    }

    @media (max-width:700px){
      .layout{padding:14px; gap:14px}
      .stage,.side{padding:18px}
      .logo{width:min(210px, 64vw)}
    }
  </style>
</head>
<body>
  <main class="layout">
    <section class="stage">
      <div class="hero">
        <div class="eyebrow">Minecraft control panel</div>

        <img src="Logo.png" alt="Pearl Pull System Logo" class="logo">

        <h1>Pearl Pull System</h1>
        <p class="lead">
          Authorize with Discord to unlock the pull controls. If your role is approved,
          the login button disappears and the pearl buttons become available.
        </p>

        <div id="loginWrap" class="action-stack">
          <a id="discordLoginBtn" class="link-btn discord-btn" href="#">
            Login with Discord
          </a>
        </div>

        <div id="pearlWrap" class="action-stack hidden">
          <button class="btn pearl-btn pearl-action" type="button" data-player="Necrox">Necrox Pearl</button>
          <button class="btn pearl-btn pearl-action" type="button" data-player="Alice">Alice Pearl</button>
        </div>
      </div>
    </section>

    <aside class="side">
      <div class="panel-head">
        <h2>Access Status</h2>
        <p>The panel checks your session against the backend and only shows controls after successful Discord authentication.</p>
      </div>

      <div id="statusBox" class="status">
        <span class="dot"></span>
        <span>Checking backend...</span>
      </div>

      <div class="stack">
        <button class="btn secondary" type="button" id="refreshBtn">Refresh status</button>
        <button class="btn secondary hidden" type="button" id="logoutBtn">Hide controls</button>
      </div>

      <div class="info">
        <h3>How it works</h3>
        <p>
          Users authenticate through your Discord application on the backend. If the role check passes,
          the session is accepted and the pearl controls are unlocked on this page.
        </p>
      </div>

      <div class="log-wrap">
        <h3>Status Log</h3>
        <div id="log">
          <div class="line ok">• Panel loaded</div>
          <div class="line dim">• Waiting for session check...</div>
        </div>
      </div>
    </aside>
  </main>

  <script>
    const BACKEND_URL = 'https://backend-website-syxe.onrender.com';

    const loginWrap = document.getElementById('loginWrap');
    const pearlWrap = document.getElementById('pearlWrap');
    const statusBox = document.getElementById('statusBox');
    const log = document.getElementById('log');
    const refreshBtn = document.getElementById('refreshBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const discordLoginBtn = document.getElementById('discordLoginBtn');

    discordLoginBtn.href = `${BACKEND_URL}/auth/discord`;

    function setLog(lines) {
      log.innerHTML = lines.join('');
      log.scrollTop = log.scrollHeight;
    }

    function addLog(message, type = 'ok') {
      log.innerHTML += `<div class="line ${type}">• ${message}</div>`;
      log.scrollTop = log.scrollHeight;
    }

    function setStatus(text) {
      statusBox.innerHTML = `<span class="dot"></span><span>${text}</span>`;
    }

    async function checkLogin() {
      setStatus('Checking login...');
      setLog([
        '<div class="line ok">• Panel loaded</div>',
        '<div class="line warn">• Checking backend session...</div>'
      ]);

      try {
        const response = await fetch(`${BACKEND_URL}/api/me`, {
          method: 'GET',
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.loggedIn) {
          const name = data.user?.global_name || data.user?.username || 'Approved User';

          loginWrap.classList.add('hidden');
          pearlWrap.classList.remove('hidden');
          logoutBtn.classList.remove('hidden');

          setStatus(`Logged in as ${name}`);
          setLog([
            '<div class="line ok">• Panel loaded</div>',
            '<div class="line ok">• Backend reachable</div>',
            `<div class="line ok">• Auth approved for ${name}</div>`,
            '<div class="line ok">• Login button hidden</div>',
            '<div class="line ok">• Necrox Pearl and Alice Pearl unlocked</div>'
          ]);
        } else {
          loginWrap.classList.remove('hidden');
          pearlWrap.classList.add('hidden');
          logoutBtn.classList.add('hidden');

          setStatus('Not logged in');
          setLog([
            '<div class="line ok">• Panel loaded</div>',
            '<div class="line ok">• Backend reachable</div>',
            '<div class="line warn">• No active approved session</div>',
            '<div class="line dim">• Login button displayed under logo</div>'
          ]);
        }
      } catch (error) {
        console.error(error);

        loginWrap.classList.remove('hidden');
        pearlWrap.classList.add('hidden');
        logoutBtn.classList.add('hidden');

        setStatus('Backend unavailable');
        setLog([
          '<div class="line ok">• Panel loaded</div>',
          '<div class="line err">• Could not reach backend</div>',
          '<div class="line dim">• Check Render service, env vars, and CORS/session config</div>'
        ]);
      }
    }

    async function sendPearl(player) {
      addLog(`Sending pearl request for ${player}...`, 'warn');

      try {
        const response = await fetch(`${BACKEND_URL}/api/pull-pearl`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ player })
        });

        const data = await response.json();

        if (response.ok) {
          addLog(data.message || `Pearl request sent for ${player}`, 'ok');
        } else {
          addLog(data.message || `Pearl request failed for ${player}`, 'err');
        }
      } catch (error) {
        console.error(error);
        addLog(`Backend request failed for ${player}`, 'err');
      }
    }

    document.querySelectorAll('.pearl-action').forEach(button => {
      button.addEventListener('click', () => {
        sendPearl(button.dataset.player);
      });
    });

    refreshBtn.addEventListener('click', checkLogin);

    logoutBtn.addEventListener('click', () => {
      pearlWrap.classList.add('hidden');
      loginWrap.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      setStatus('Controls hidden on page');
      addLog('Controls hidden locally. Session may still exist on backend.', 'warn');
    });

    window.addEventListener('load', checkLogin);
  </script>
</body>
</html>
