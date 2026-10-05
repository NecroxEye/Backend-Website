require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// =====================
// ENV
// =====================
const PORT = process.env.PORT || 10000;
const SESSION_SECRET = process.env.SESSION_SECRET;

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_CALLBACK_URL = process.env.DISCORD_CALLBACK_URL;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

const ADMIN_ROLE_ID = '1556390847191322806';
const PULL_ROLE_ID = '1553856941204181162';

// Optional backend config
const BACKEND_URL = process.env.BACKEND_URL || '';
const STATUS_MESSAGE_FILE = process.env.STATUS_MESSAGE_FILE || './status_message_id.json';

// =====================
// BASIC CHECKS
// =====================
if (!SESSION_SECRET) {
  console.error('Missing SESSION_SECRET in .env');
  process.exit(1);
}

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_CALLBACK_URL || !DISCORD_GUILD_ID) {
  console.error('Missing DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_CALLBACK_URL, or DISCORD_GUILD_ID in .env');
  process.exit(1);
}

// =====================
// MIDDLEWARE
// =====================
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// =====================
// PASSPORT
// =====================
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new DiscordStrategy(
  {
    clientID: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET,
    callbackURL: DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Fetch guild member to get role ids
      const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      let roles = [];
      if (memberRes.ok) {
        const memberData = await memberRes.json();
        roles = Array.isArray(memberData.roles) ? memberData.roles : [];
      }

      return done(null, {
        id: profile.id,
        username: profile.username,
        avatar: profile.avatar,
        roles
      });
    } catch (err) {
      return done(err);
    }
  }
));

// =====================
// HELPERS
// =====================
function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

function hasRole(req, roleId) {
  return Array.isArray(req.user?.roles) && req.user.roles.includes(roleId);
}

function ensurePullRole(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (hasRole(req, PULL_ROLE_ID) || hasRole(req, ADMIN_ROLE_ID)) return next();
  return res.status(403).json({ error: 'Missing pull role' });
}

function ensureAdminRole(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (hasRole(req, ADMIN_ROLE_ID)) return next();
  return res.status(403).json({ error: 'Missing admin role' });
}

// =====================
// AUTH ROUTES
// =====================
app.get('/auth/discord/login', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/');
  }
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
      roles: req.user.roles || []
    }
  });
});

app.post('/auth/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
});

// =====================
// HEALTH
// =====================
app.get('/health', (req, res) => {
  res.json({ status: 'ON' });
});

// =====================
// SIMPLE IN-MEMORY PLAYER STORE
// Replace with Supabase later if you want
// =====================
let players = [
  // example:
  // {
  //   id: '1',
  //   name: 'Sample',
  //   signal_strength: 15,
  //   direction: 'left',
  //   channel_name: 'pearl-main',
  //   computer_name: 'shared-pearl-computer',
  //   is_admin: false
  // }
];

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

// =====================
// PLAYER ROUTES
// =====================
app.get('/players', ensureAuth, (req, res) => {
  res.json(players);
});

app.post('/players', ensureAdminRole, (req, res) => {
  const {
    name,
    signal_strength = 15,
    direction,
    channel_name = '',
    computer_name = '',
    is_admin = false
  } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const player = {
    id: makeId(),
    name: String(name),
    signal_strength: Number(signal_strength),
    direction: String(direction || ''),
    channel_name: String(channel_name),
    computer_name: String(computer_name),
    is_admin: !!is_admin
  };

  players.push(player);
  res.json(player);
});

app.put('/players/:id', ensureAdminRole, (req, res) => {
  const { id } = req.params;
  const index = players.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Player not found' });
  }

  const {
    name,
    signal_strength = 15,
    direction,
    channel_name = '',
    computer_name = '',
    is_admin = false
  } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  players[index] = {
    ...players[index],
    name: String(name),
    signal_strength: Number(signal_strength),
    direction: String(direction || ''),
    channel_name: String(channel_name),
    computer_name: String(computer_name),
    is_admin: !!is_admin
  };

  res.json(players[index]);
});

app.delete('/players/:id', ensureAdminRole, (req, res) => {
  const { id } = req.params;
  const before = players.length;
  players = players.filter(p => p.id !== id);

  if (players.length === before) {
    return res.status(404).json({ error: 'Player not found' });
  }

  res.json({ ok: true });
});

// =====================
// TRIGGER ROUTE
// =====================
app.post('/trigger/:id', ensurePullRole, (req, res) => {
  const { id } = req.params;
  const player = players.find(p => p.id === id);

  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  res.json({
    ok: true,
    sent: {
      player: player.name,
      direction: player.direction,
      signal_strength: player.signal_strength,
      computer_name: player.computer_name,
      channel_name: player.channel_name
    }
  });
});

// =====================
// OPTIONAL STATUS ROUTE FOR DISCORD BOT
// =====================
app.get('/status', async (req, res) => {
  let backendStatus = 'OFF';
  let websiteStatus = 'Working';
  let oilRig = 'Offline';
  let computer = 'N/A';

  if (BACKEND_URL) {
    try {
      const r = await fetch(BACKEND_URL, { headers: { Accept: 'application/json' } });
      if (r.ok) backendStatus = 'ON';
    } catch {}
  }

  res.json({
    status: 'ON',
    backend_status: backendStatus,
    computer,
    oilRig,
    website: websiteStatus,
    players: players.map(p => p.name)
  });
});

// =====================
// ROOT
// =====================
app.get('/', (req, res) => {
  res.send('Server running');
});

// =====================
// START
// =====================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
