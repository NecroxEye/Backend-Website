const express = require('express');
const http = require('http');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const LocalStrategy = require('passport-local').Strategy;
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

const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || ''; // optional but recommended
const ROLE_TRIGGER = '1553856941204181162';
const ROLE_ADMIN = '1556390847191322806';

const LOCAL_ADMIN_USER = process.env.LOCAL_ADMIN_USER || 'Fr05tedF4ng';
const LOCAL_ADMIN_PASS = process.env.LOCAL_ADMIN_PASS || 'Admin';

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

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

function buildUserFromDiscord(profile, hasTriggerRole, hasAdminRole) {
  return {
    id: profile.id,
    username: profile.username,
    avatar: profile.avatar,
    roles: profile.roles || [],
    isAdmin: !!hasAdminRole,
    canPull: !!hasTriggerRole,
    authType: 'discord'
  };
}

passport.use(new DiscordStrategy(
  {
    clientID: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET,
    callbackURL: DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let hasTriggerRole = false;
      let hasAdminRole = false;

      // Best-effort guild member role lookup
      if (DISCORD_GUILD_ID) {
        try {
          const memberRes = await fetch(
            `https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          );

          if (memberRes.ok) {
            const member = await memberRes.json();
            const roles = Array.isArray(member.roles) ? member.roles : [];

            hasTriggerRole = roles.includes(ROLE_TRIGGER) || roles.includes(ROLE_ADMIN);
            hasAdminRole = roles.includes(ROLE_ADMIN);
          }
        } catch (err) {
          console.error('[DISCORD ROLE CHECK] failed:', err.message);
        }
      }

      const user = buildUserFromDiscord(profile, hasTriggerRole, hasAdminRole);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      if (username === LOCAL_ADMIN_USER && password === LOCAL_ADMIN_PASS) {
        return done(null, {
          id: 'local-admin',
          username: LOCAL_ADMIN_USER,
          avatar: null,
          roles: [],
          isAdmin: true,
          canPull: true,
          authType: 'local'
        });
      }

      return done(null, false);
    } catch (err) {
      return done(err);
    }
  }
));

function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

function ensureTriggerAccess(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (req.user.isAdmin || req.user.canPull) return next();

  return res.status(403).json({ error: 'No trigger access' });
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

/* =========================
   Trigger store
========================= */

const activeTriggers = new Map(); // computer_name -> { computer_name, direction, created_at, expires_at }

function setTrigger(computerName, direction) {
  const now = Date.now();
  const trigger = {
    computer_name: computerName,
    direction: direction,
    created_at: now,
    expires_at: now + 1000
  };

  activeTriggers.set(computerName, trigger);

  setTimeout(() => {
    const current = activeTriggers.get(computerName);
    if (current && current.expires_at === trigger.expires_at) {
      activeTriggers.delete(computerName);
    }
  }, 1100);

  return trigger;
}

function getAndClearTrigger(computerName) {
  const trigger = activeTriggers.get(computerName);
  if (!trigger) return null;

  activeTriggers.delete(computerName);
  return trigger;
}

/* =========================
   Routes
========================= */

app.get('/health', (req, res) => {
  res.json({ status: 'ON' });
});

/* Website sets trigger */
app.post('/trigger', ensureTriggerAccess, (req, res) => {
  const { computer_name, direction } = req.body || {};

  if (!computer_name) {
    return res.status(400).json({ error: 'computer_name is required' });
  }

  if (!direction) {
    return res.status(400).json({ error: 'direction is required' });
  }

  const trigger = setTrigger(String(computer_name), String(direction));

  console.log('[TRIGGER] stored:', trigger);

  return res.json({
    ok: true,
    trigger
  });
});

/* Lua polls trigger */
app.get('/trigger', (req, res) => {
  const computerName = String(req.query.computer_name || '').trim();

  if (!computerName) {
    return res.status(400).json({ error: 'computer_name is required' });
  }

  const trigger = getAndClearTrigger(computerName);

  return res.json({
    ok: true,
    trigger: trigger
      ? {
          computer_name: trigger.computer_name,
          direction: trigger.direction
        }
      : null
  });
});

/* Discord login */
app.get('/auth/discord/login', passport.authenticate('discord'));

app.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: FRONTEND_REDIRECT }),
  (req, res) => {
    res.redirect(FRONTEND_REDIRECT);
  }
);

/* Local fallback login */
app.post('/auth/local/login', passport.authenticate('local'), (req, res) => {
  return res.json({
    ok: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      avatar: req.user.avatar,
      roles: req.user.roles || [],
      isAdmin: !!req.user.isAdmin,
      canPull: !!req.user.canPull,
      authType: req.user.authType || 'local'
    }
  });
});

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
      canPull: !!req.user.canPull,
      authType: req.user.authType || 'discord'
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

/* Supabase player routes */
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

server.listen(PORT, () => {
  console.log('[server] running on port ' + PORT);
});
