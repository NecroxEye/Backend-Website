require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
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
  SUPABASE_ANON_KEY
} = process.env;

const ADMIN_ROLE_ID = '1556390847191322806';
const PULL_ROLE_ID = '1553856941204181162';

if (
  !SESSION_SECRET ||
  !DISCORD_CLIENT_ID ||
  !DISCORD_CLIENT_SECRET ||
  !DISCORD_CALLBACK_URL ||
  !FRONTEND_URL ||
  !DISCORD_GUILD_ID ||
  !DISCORD_BOT_TOKEN ||
  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY
) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.set('trust proxy', 1);
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

app.get('/auth/discord/login', passport.authenticate('discord'));

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

  const player = mapPlayer(data);

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
      return res.status(500).json({ error: error.message });
    }

    const players = (data || []).map(mapPlayer);

    return res.json({
      status: 'ON',
      backend_status: 'ON',
      computer: 'N/A',
      oilRig: 'Working',
      website: 'Working',
      players
    });
  } catch (err) {
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

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
