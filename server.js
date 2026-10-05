require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const axios = require('axios');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const DISCORD_API = 'https://discord.com/api';

const PULL_ROLE_ID = process.env.DISCORD_ROLE_ID || '1553856941204181162';
const ADMIN_ROLE_ID = '1556390847191322806';

const allowedOrigins = [
  'https://necroxeye.github.io'
];

app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(session({
  name: 'frosted_fang_sid',
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));

let minecraftClient = null;
let latestSignal = null;

// In-memory roster
// Each player:
// {
//   name,
//   signal,
//   direction,
//   computerId,
//   channelName,
//   locked,
//   active
// }
const PLAYER_ROSTER = {
  Necrox: {
    name: 'Necrox',
    signal: 15,
    direction: 'back',
    computerId: 1,
    channelName: 'Oil Rig',
    locked: false,
    active: true
  },
  Alice: {
    name: 'Alice',
    signal: 15,
    direction: 'top',
    computerId: 1,
    channelName: 'Oil Rig',
    locked: false,
    active: true
  },
  'Frosted Fang': {
    name: 'Frosted Fang',
    signal: 15,
    direction: 'left',
    computerId: 1,
    channelName: 'Oil Rig',
    locked: false,
    active: true
  }
};

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Minecraft bridge connected');
  minecraftClient = ws;

  ws.on('close', () => {
    console.log('Minecraft bridge disconnected');
    if (minecraftClient === ws) minecraftClient = null;
  });

  ws.on('message', (msg) => {
    console.log('Bridge message:', msg.toString());
  });
});

function getPublicPlayer(player) {
  return {
    name: player.name,
    signal: player.signal,
    direction: player.direction,
    computerId: player.computerId,
    channelName: player.channelName,
    locked: !!player.locked,
    active: player.active !== false
  };
}

function isLoggedIn(req) {
  return !!(req.session && req.session.discordUser);
}

function isAdmin(req) {
  const roles = req.session?.discordUser?.roles || [];
  return roles.includes(ADMIN_ROLE_ID);
}

function isPullAuthorized(req) {
  const roles = req.session?.discordUser?.roles || [];
  return roles.includes(PULL_ROLE_ID) || roles.includes(ADMIN_ROLE_ID);
}

app.get('/', (req, res) => {
  res.send('Backend is running');
});

app.get('/api/me', (req, res) => {
  try {
    if (!isLoggedIn(req)) {
      return res.json({ loggedIn: false });
    }

    return res.json({
      loggedIn: true,
      user: req.session.discordUser
    });
  } catch (err) {
    console.error('Error in /api/me:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/players', (req, res) => {
  try {
    if (!isLoggedIn(req)) {
      return res.status(401).json({ message: 'Not logged in' });
    }

    if (!isPullAuthorized(req)) {
      return res.status(403).json({ message: 'Missing pearl pull role' });
    }

    return res.json({
      players: Object.values(PLAYER_ROSTER).map(getPublicPlayer)
    });
  } catch (err) {
    console.error('Error in /api/players:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/latest-signal', (req, res) => {
  return res.json(latestSignal || { player: null, signal: 0, side: null, computerId: null, channelName: null, at: 0 });
});

app.get('/auth/discord', (req, res) => {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_REDIRECT_URI) {
    return res.status(500).send('Missing Discord config');
  }

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds'
  });

  res.redirect(`${DISCORD_API}/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code returned from Discord');

  try {
    const tokenResponse = await axios.post(
      `${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
        scope: 'identify guilds'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get(`${DISCORD_API}/users/@me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const user = userResponse.data;

    if (!process.env.DISCORD_GUILD_ID || !process.env.DISCORD_BOT_TOKEN) {
      return res.status(500).send('Missing guild or bot token config');
    }

    const memberResponse = await axios.get(
      `${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.id}`,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
        }
      }
    );

    const member = memberResponse.data;
    const roles = Array.isArray(member.roles) ? member.roles : [];

    if (!roles.includes(PULL_ROLE_ID) && !roles.includes(ADMIN_ROLE_ID)) {
      return res.status(403).send('You do not have the required Discord role.');
    }

    req.session.discordUser = {
      id: user.id,
      username: user.username,
      global_name: user.global_name || null,
      roles
    };

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Failed to save session');
      }

      res.redirect('https://necroxeye.github.io/Backend-Website/');
    });
  } catch (error) {
    console.error('Discord callback error:', error.response?.data || error.message);

    if (error.response && error.response.status === 404) {
      return res.status(403).send('You are not in the required Discord server or the bot cannot see you.');
    }

    return res.status(500).send('Discord login failed');
  }
});

app.post('/auth/logout', (req, res) => {
  if (!req.session) {
    return res.json({ ok: true });
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ ok: false, message: 'Logout failed' });
    }

    res.clearCookie('frosted_fang_sid', {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    });

    return res.json({ ok: true });
  });
});

app.post('/api/add-player', (req, res) => {
  try {
    if (!isLoggedIn(req)) {
      return res.status(401).json({ message: 'Not logged in' });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ message: 'Admin role required' });
    }

    const { name, signal, direction, computerId, channelName } = req.body;

    const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
    const cleanChannelName = String(channelName || '').replace(/\s+/g, ' ').trim();
    const cleanDirection = ['top', 'bottom', 'left', 'right', 'front', 'back'].includes(direction) ? direction : 'back';
    const cleanSignal = Number.isInteger(signal) && signal >= 1 && signal <= 15 ? signal : 15;
    const cleanComputerId = Number.isInteger(computerId) && computerId >= 1 ? computerId : 1;

    if (!cleanName) {
      return res.status(400).json({ message: 'Missing player name' });
    }

    if (!cleanChannelName) {
      return res.status(400).json({ message: 'Missing computer name' });
    }

    if (PLAYER_ROSTER[cleanName]) {
      return res.status(400).json({ message: 'Player already exists' });
    }

    PLAYER_ROSTER[cleanName] = {
      name: cleanName,
      signal: cleanSignal,
      direction: cleanDirection,
      computerId: cleanComputerId,
      channelName: cleanChannelName,
      locked: false,
      active: true
    };

    return res.json({
      ok: true,
      player: getPublicPlayer(PLAYER_ROSTER[cleanName])
    });
  } catch (err) {
    console.error('Error in /api/add-player:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/
