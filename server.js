const express = require('express');
const http = require('http');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { WebSocketServer } = require('ws');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://necroxeye.github.io';
const FRONTEND_REDIRECT = process.env.FRONTEND_REDIRECT || 'https://necroxeye.github.io/Backend-Website/';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_CALLBACK_URL =
  process.env.DISCORD_CALLBACK_URL ||
  'https://backend-website-syxe.onrender.com/auth/discord/callback';

const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
  console.error('Missing Discord env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.set('trust proxy', 1);

app.use(cors({
  origin: FRONTEND_ORIGIN,
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
    sameSite: 'none',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new DiscordStrategy(
  {
    clientID: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET,
    callbackURL: DISCORD_CALLBACK_URL,
    scope: ['identify']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const user = {
        id: profile.id,
        username: profile.username,
        avatar: profile.avatar,
        roles: [],
        isAdmin: false,
        canPull: true
      };

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user && req.user.isAdmin) {
    return next();
  }
  return res.status(403).json({ error: 'Admin only' });
}

function mapPlayer(row) {
  return {
    id: row.id,
    name: row.name,
    computer_name: row.computer_name || 'Unknown',
    channel_name: row.channel_name || '',
    signal_strength: Number(row.signal_strength ?? 15),
    direction: row.direction || 'left',
    is_admin: !!row.is_admin,
    created_at: row.created_at || null
  };
}

/* -----------------------------
   WebSocket setup
------------------------------ */

const computers = new Map(); // computer_name -> ws

const wss = new WebSocketServer({ server, path: '/ws' });

function sendJSON(ws, obj) {
  try {
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  } catch (err) {
    console.error('[WS] sendJSON error:', err.message);
  }
}

wss.on('connection', (ws, req) => {
  console.log('[WS] client connected from', req.socket.remoteAddress);

  ws.computerName = null;

  sendJSON(ws, {
    type: 'welcome',
    message: 'connected'
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      console.log('[WS] received:', msg);

      if (msg.type === 'register') {
        const name = String(msg.computer_name || '').trim();

        if (!name) {
          sendJSON(ws, { type: 'error', message: 'computer_name is required' });
          return;
        }

        // If the same computer reconnects, replace old socket
        if (computers.has(name)) {
          const oldWs = computers.get(name);
          try {
            oldWs.close();
          } catch (_) {}
        }

        ws.computerName = name;
        computers.set(name, ws);

        sendJSON(ws, {
          type: 'welcome',
          computer_name: name
        });

        console.log('[WS] registered:', name);
        return;
      }

      if (msg.type === 'ping') {
        sendJSON(ws, { type: 'pong' });
        return;
      }

      if (msg.type === 'status') {
        console.log('[WS] status from', ws.computerName || 'unknown:', msg.message || '');
        return;
      }

      sendJSON(ws, { type: 'error', message: 'unknown message type' });
    } catch (err) {
      console.error('[WS] bad message:', err.message);
      sendJSON(ws, { type: 'error', message: 'invalid json' });
    }
  });

  ws.on('close', () => {
    if (ws.computerName && computers.get(ws.computerName) === ws) {
      computers.delete(ws.computerName);
    }
    console.log('[WS] client disconnected');
  });

  ws.on('error', (err) => {
    console.error('[WS] error:', err.message);
  });
});

/* -----------------------------
   Trigger route
------------------------------ */

app.post('/trigger', ensureAuth, (req, res) => {
  console.log('[POST /trigger] body:', req.body);

  const { computer_name, command = 'default' } = req.body || {};

  if (!computer_name) {
    return res.status(400).json({ error: 'computer_name is required' });
  }

  const ws = computers.get(String(computer_name));

  if (!ws || ws.readyState !== ws.OPEN) {
    return res.status(404).json({ error: 'Computer not connected' });
  }

  sendJSON(ws, {
    type: 'trigger',
    command: String(command)
  });

  return res.json({ ok: true });
});

/* -----------------------------
   Auth routes
------------------------------ */

app.get('/auth/discord/login', passport.authenticate('discord'));

app.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: FRONTEND_REDIRECT }),
  (req, res) => {
    res.redirect(FRONTEND_REDIRECT);
  }
);

app.get('/auth/me', (req, res) => {
  console.log('[AUTH ME] authenticated:', req.isAuthenticated && req.isAuthenticated());
  console.log('[AUTH ME] user:', req.user || null);

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

/* -----------------------------
   Public routes
------------------------------ */

app.get('/health', (req, res) => {
  res.json({ status: 'ON' });
});

app.get('/status', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Supabase /status error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      ok: true,
      players: (data || []).map(mapPlayer)
    });
  } catch (err) {
    console.error('GET /status failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
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
    computer_name = 'Unknown',
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
    computer_name = 'Unknown',
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

app.get('/', (req, res) => {
  res.send('Backend is running');
});

/* -----------------------------
   Start server
------------------------------ */

server.listen(PORT, () => {
  console.log('[server] running on port ' + PORT);
});
