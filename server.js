require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

const app = express();

const PORT = process.env.PORT || 10000;

const SESSION_SECRET = process.env.SESSION_SECRET;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_CALLBACK_URL = process.env.DISCORD_CALLBACK_URL;
const FRONTEND_URL = process.env.FRONTEND_URL;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const ADMIN_ROLE_ID = '1556390847191322806';
const PULL_ROLE_ID = '1553856941204181162';

if (!SESSION_SECRET) {
  console.error('Missing SESSION_SECRET');
  process.exit(1);
}

if (
  !DISCORD_CLIENT_ID ||
  !DISCORD_CLIENT_SECRET ||
  !DISCORD_CALLBACK_URL ||
  !FRONTEND_URL ||
  !DISCORD_GUILD_ID ||
  !DISCORD_BOT_TOKEN
) {
  console.error('Missing required environment variables');
  process.exit(1);
}

app.set('trust proxy', 1);

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

passport.use(new DiscordStrategy(
  {
    clientID: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET,
    callbackURL: DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const userGuildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      let roles = [];

      if (userGuildsRes.ok) {
        const guilds = await userGuildsRes.json();
        const inGuild = guilds.some(g => g.id === DISCORD_GUILD_ID);

        if (inGuild) {
          const memberRes = await fetch(
            `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${profile.id}`,
            {
              headers: {
                Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (memberRes.ok) {
            const memberData = await memberRes.json();
            roles = Array.isArray(memberData.roles) ? memberData.roles : [];
          } else {
            console.error('Failed to fetch guild member:', await memberRes.text());
          }
        }
      } else {
        console.error('Failed to fetch user guilds:', await userGuildsRes.text());
      }

      return done(null, {
        id: profile.id,
        username: profile.username,
        avatar: profile.avatar,
        roles
      });
    } catch (err) {
      console.error('Discord strategy error:', err);
      return done(err);
    }
  }
));

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

app.get('/auth/discord/login', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: FRONTEND_URL }),
  (req, res) => {
    res.redirect(FRONTEND_URL);
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

let players = [];

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

app.get('/players', ensureAuth, (req, res) => {
  res.json(players);
});

app.post('/players', ensureAdminRole, (req, res) => {
  const {
    name,
    signal_strength = 15,
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
      signal_strength: player.signal_strength,
      channel_name: player.channel_name,
      computer_name: player.computer_name
    }
  });
});

app.get('/status', (req, res) => {
  res.json({
    status: 'ON',
    backend_status: 'ON',
    computer: 'N/A',
    oilRig: 'Working',
    website: 'Working',
    players: players.map(p => p.name)
  });
});

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
