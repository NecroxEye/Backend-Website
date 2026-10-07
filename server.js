require('dotenv').config();

const fs = require('fs');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const http = require('http');
const { WebSocketServer } = require('ws');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType
} = require('discord.js');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const {
  SESSION_SECRET,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_CALLBACK_URL,
  FRONTEND_URL,
  DISCORD_GUILD_ID,
  DISCORD_BOT_TOKEN,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  CHANNEL_ID,
  BACKEND_URL,
  STATUS_MESSAGE_FILE,
  POLL_INTERVAL_MS
} = process.env;

const ADMIN_ROLE_ID = '1556390847191322806';
const PULL_ROLE_ID = '1553856941204181162';
const WEBSITE_URL = 'https://necroxeye.github.io/Backend-Website/';

function must(name, value) {
  if (!value) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
}

must('SESSION_SECRET', SESSION_SECRET);
must('DISCORD_CLIENT_ID', DISCORD_CLIENT_ID);
must('DISCORD_CLIENT_SECRET', DISCORD_CLIENT_SECRET);
must('DISCORD_CALLBACK_URL', DISCORD_CALLBACK_URL);
must('FRONTEND_URL', FRONTEND_URL);
must('DISCORD_GUILD_ID', DISCORD_GUILD_ID);
must('DISCORD_BOT_TOKEN', DISCORD_BOT_TOKEN);
must('SUPABASE_URL', SUPABASE_URL);
must('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY);
must('CHANNEL_ID', CHANNEL_ID);

const STATUS_FILE = STATUS_MESSAGE_FILE || './status_message_id.json';
const PANEL_POLL_MS = Number(POLL_INTERVAL_MS || 10000);
const STATUS_URL = BACKEND_URL || 'https://backend-website-syxe.onrender.com/status';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.set('trust proxy', 1);

/**
 * CORS must come BEFORE routes.
 * This is required so your GitHub Pages frontend can call the backend with cookies.
 */
app.use(cors({
  origin: 'https://necroxeye.github.io',
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

async function fetchGuildMemberRoles(userId) {
  const res = await axios.get(
    `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${userId}`,
    {
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`
      }
    }
  );

  return Array.isArray(res.data?.roles) ? res.data.roles : [];
}

passport.use(new DiscordStrategy(
  {
    clientID: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET,
    callbackURL: DISCORD_CALLBACK_URL,
    scope: ['identify']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const roles = await fetchGuildMemberRoles(profile.id);

      done(null, {
        id: profile.id,
        username: profile.username,
        avatar: profile.avatar,
        roles,
        isAdmin: roles.includes(ADMIN_ROLE_ID),
        canPull: roles.includes(PULL_ROLE_ID) || roles.includes(ADMIN_ROLE_ID)
      });
    } catch (err) {
      console.error('Discord auth error:', err.message);
      done(null, {
        id: profile.id,
        username: profile.username,
        avatar: profile.avatar,
        roles: [],
        isAdmin: false,
        canPull: false
      });
    }
  }
));

function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

function ensureAdmin(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.user?.isAdmin) return next();
  return res.status(403).json({ error: 'Missing admin role' });
}

function ensurePull(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.user?.canPull) return next();
  return res.status(403).json({ error: 'Missing pull role' });
}

function mapPlayer(row) {
  return {
    id: row.id,
    name: row.name,
    computer_name: row.computer_name || 'Oil Rig',
    channel_name: row.channel_name || '',
    signal_strength: Number(row.signal_strength ?? 15),
    direction: row.direction || 'left',
    is_admin: !!row.is_admin,
    created_at: row.created_at || null
  };
}

('/auth/discord/login', passport.authenticate('discord'));

app.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: FRONTEND_URL }),
  (req, res) => res.redirect(FRONTEND_URL)
);

app.get('/auth/me', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.json({ user: null });
  }

  return res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      avatar: req.user.avatar,
      roles: req.user.roles || [],
      isAdmin: !!req.user.isAdmin,
      canPull: !!req.user.canPull
    }
  });
});

app.post('/auth/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid', {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
      });
      res.json({ ok: true });
    });
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ON' });
});

app.get('/players', ensureAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Supabase /players select error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.json((data || []).map(mapPlayer));
});

app.post('/players', ensureAdmin, async (req, res) => {
  const {
    name,
    computer_name = 'Oil Rig',
    channel_name = '',
    signal_strength = 15,
    direction = 'left',
    is_admin = false
  } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const payload = {
    name: String(name),
    computer_name: String(computer_name),
    channel_name: String(channel_name),
    signal_strength: Number(signal_strength),
    direction: String(direction),
    is_admin: !!is_admin
  };

  const { data, error } = await supabase
    .from('players')
    .insert([payload])
    .select('*')
    .single();

  if (error) {
    console.error('Supabase /players insert error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.json(mapPlayer(data));
});

app.put('/players/:id', ensureAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    computer_name = 'Oil Rig',
    channel_name = '',
    signal_strength = 15,
    direction = 'left',
    is_admin = false
  } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const payload = {
    name: String(name),
    computer_name: String(computer_name),
    channel_name: String(channel_name),
    signal_strength: Number(signal_strength),
    direction: String(direction),
    is_admin: !!is_admin
  };

  const { data, error } = await supabase
    .from('players')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Supabase /players update error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.json(mapPlayer(data));
});

app.delete('/players/:id', ensureAdmin, async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('players')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Supabase /players delete error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true });
});

app.post('/trigger/:id', ensurePull, async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Player not found' });
  }

   = mapPlayer(data);

  return res.json({
    ok: true,
    sent: {
      player: player.name,
      computer_name: player.computer_name,
      channel_name: player.channel_name,
      signal_strength: player.signal_strength,
      direction: player.direction
    }
  });
});


app.get('/status', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Supabase /status select error:', error);
      return res.status(500).json({
        status: 'OFF',
        backend_status: 'OFF',
        computer: 'N/A',
        oilRig: 'Offline',
        website: 'Offline',
        players: [],
        error: error.message
      });
    }

  const player = mapPlayer(data);

  const delivered = sendToComputer(player.computer_name, {
    type: 'trigger',
    direction: player.direction,
    signal_strength: player.signal_strength
  });

  return res.json({
    ok: true,
    sent: {
      player: player.name,
      computer_name: player.computer_name,
      channel_name: player.channel_name,
      signal_strength: player.signal_strength,
      direction: player.direction,
      delivered
    }
  });
  } catch (err) {
    console.error('/status error:', err);
    return res.status(500).json({
      status: 'OFF',
      backend_status: 'OFF',
      computer: 'N/A',
      oilRig: 'Offline',
      website: 'Offline',
      players: [],
      error: err.message
    });
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });
const connectedComputers = new Map();

function sendToComputer(computerName, payload) {
  const ws = connectedComputers.get(computerName);
  if (!ws || ws.readyState !== 1) return false;

  ws.send(JSON.stringify(payload));
  return true;
}

wss.on('connection', (ws) => {
  console.log('[WS] client connected');

  ws.on('message', (buf) => {
    try {
      const msg = JSON.parse(buf.toString());

      if (msg.type === 'register') {
        const name = String(msg.computer_name || 'unknown');
        connectedComputers.set(name, ws);

        ws.send(JSON.stringify({
          type: 'welcome',
          computer_name: name
        }));

        console.log(`[WS] registered computer: ${name}`);
      }
    } catch (err) {
      console.error('[WS] message error:', err.message);
    }
  });

  ws.on('close', () => {
    for (const [name, sock] of connectedComputers.entries()) {
      if (sock === ws) {
        connectedComputers.delete(name);
        console.log(`[WS] disconnected computer: ${name}`);
        break;
      }
    }
  });
});

app.get('/', (req, res) => {
  res.send('Server is running');
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let cachedMessageId = null;
let panelStarted = false;
let updateRunning = false;

function loadSavedMessageId() {
  try {
    if (!STATUS_FILE || !fs.existsSync(STATUS_FILE)) return null;
    const raw = fs.readFileSync(STATUS_FILE, 'utf8');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.messageId || null;
  } catch (err) {
    console.error('[storage] failed reading message id:', err.message);
    return null;
  }
}

function saveMessageId(messageId) {
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ messageId }, null, 2), 'utf8');
  } catch (err) {
    console.error('[storage] failed saving message id:', err.message);
  }
}

async function fetchStatusForPanel() {
  const res = await fetch(STATUS_URL, {
    headers: { Accept: 'application/json' }
  });

  const text = await res.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Backend did not return JSON. Response: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Backend error ${res.status}`);
  }

  return data;
}

function normalizePlayer(p) {
  return {
    id: p.id || '',
    name: String(p.name || p.username || 'Unknown'),
    computer_name: String(p.computer_name || p.computer || 'Oil Rig'),
    channel_name: String(p.channel_name || ''),
    signal_strength: Number(p.signal_strength ?? 15),
    direction: String(p.direction || 'left'),
    is_admin: !!p.is_admin,
    created_at: p.created_at || null
  };
}

function normalizeState(data) {
  const players = Array.isArray(data.players) ? data.players.map(normalizePlayer) : [];

  return {
    status: String(data.status || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    backend_status: String(data.backend_status || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    computer: String(data.computer || 'N/A'),
    oilRig: String(data.oilRig || 'Offline'),
    website: String(data.website || 'Offline'),
    players
  };
}

function buildComputerLines(state) {
  if (!state.players.length) {
    return `Oil Rig - ${String(state.oilRig).toLowerCase() === 'working' ? 'ON' : 'OFF'}`;
  }

  const grouped = new Map();

  for (const p of state.players) {
    const key = p.computer_name || 'Oil Rig';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(p.name);
  }

  return [...grouped.entries()]
    .map(([computer, list]) => `${computer} - ${list.length > 0 ? 'ON' : 'OFF'}`)
    .join('\n');
}

function buildPlayersLines(players) {
  if (!players.length) return 'None';
  return players.map(p => `• ${p.name} — ${p.computer_name} — ${p.direction}`).join('\n');
}

function buildEmbed(state) {
  const websiteOk = String(state.website).toLowerCase() === 'working' || state.status === 'ON';
  const backendOk = state.backend_status === 'ON';

  return new EmbedBuilder()
    .setTitle('System Status Panel')
    .setColor(backendOk ? 0x67d7ff : 0xd65574)
    .addFields(
      { name: 'Computers', value: buildComputerLines(state), inline: false },
      { name: 'Players', value: buildPlayersLines(state.players), inline: false },
      { name: 'Website Status', value: websiteOk ? '🟢 Working' : '🔴 Offline', inline: true },
      { name: 'Backend Status', value: backendOk ? '🟢 ON' : '🔴 OFF', inline: true },
      { name: 'Frosted Fang', value: `[Open Website](${WEBSITE_URL})`, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Auto-updating status panel' });
}

async function resolveChannel() {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(err => {
    console.error('[discord] channel fetch failed:', err.message);
    return null;
  });

  if (!channel) return null;

  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    console.error('[discord] channel is not a text channel');
    return null;
  }

  return channel;
}

async function getExistingMessage(channel) {
  if (!cachedMessageId) cachedMessageId = loadSavedMessageId();
  if (!cachedMessageId) return null;

  try {
    return await channel.messages.fetch(cachedMessageId);
  } catch (err) {
    console.warn('[discord] saved panel message missing:', err.message);
    cachedMessageId = null;
    return null;
  }
}

async function updatePanel() {
  if (updateRunning) return;
  updateRunning = true;

  try {
    const raw = await fetchStatusForPanel();
    const state = normalizeState(raw);

    const channel = await resolveChannel();
    if (!channel) return;

    const perms = channel.permissionsFor(client.user);
    const required = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.ReadMessageHistory
    ];

    if (!perms || !perms.has(required)) {
      console.error('[discord] missing permissions in channel');
      return;
    }

    const embed = buildEmbed(state);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Frosted Fang')
        .setStyle(ButtonStyle.Link)
        .setURL(WEBSITE_URL)
    );

    const existing = await getExistingMessage(channel);

    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] });
    } else {
      const sent = await channel.send({ embeds: [embed], components: [row] });
      cachedMessageId = sent.id;
      saveMessageId(sent.id);
    }
  } catch (err) {
    console.error('[panel] update failed:', err.message);
  } finally {
    updateRunning = false;
  }
}

client.once('ready', async () => {
  console.log(`[bot] logged in as ${client.user.tag}`);
  cachedMessageId = loadSavedMessageId();
  await updatePanel();
  setInterval(updatePanel, PANEL_POLL_MS);
});

client.on('error', err => console.error('[bot] client error:', err));
process.on('unhandledRejection', err => console.error('[process] unhandled rejection:', err));
process.on('uncaughtException', err => console.error('[process] uncaught exception:', err));

server.listen(PORT, async () => {
  console.log(`[server] Server running on port ${PORT}`);

  if (!panelStarted) {
    panelStarted = true;
    try {
      await client.login(DISCORD_BOT_TOKEN);
    } catch (err) {
      console.error('[bot] login failed:', err.message);
    }
  }
});
