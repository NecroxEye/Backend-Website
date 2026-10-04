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

const PLAYER_SIGNALS = {
  Necrox: { signal: 15, side: 'back', channel: 'Oil Rig' },
  Alice: { signal: 15, side: 'top', channel: 'Oil Rig' },
  'Frosted Fang': { signal: 15, side: 'left', channel: 'Oil Rig' }
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

app.get('/', (req, res) => {
  res.send('Backend is running');
});

app.get('/api/me', (req, res) => {
  try {
    if (!req.session || !req.session.discordUser) {
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

app.get('/api/latest-signal', (req, res) => {
  return res.json(latestSignal || { player: null, signal: 0, at: 0 });
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
    const targetRoleId = process.env.DISCORD_ROLE_ID;
    const hasRole = Array.isArray(member.roles) && member.roles.includes(targetRoleId);

    if (!hasRole) {
      return res.status(403).send('You do not have the required Discord role.');
    }

    req.session.discordUser = {
      id: user.id,
      username: user.username,
      global_name: user.global_name || null,
      roles: member.roles || []
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
    if (!req.session || !req.session.discordUser) {
      return res.status(401).json({ message: 'Not logged in' });
    }

    const { name, signal, side, channel } = req.body;

    const roles = req.session.discordUser.roles || [];
    const isAdmin = roles.includes(ADMIN_ROLE_ID);

    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin role required' });
    }

    if (!name || !channel) {
      return res.status(400).json({ message: 'Missing player name or channel' });
    }

    const cleanName = String(name).replace(/\s+/g, ' ').trim();
    const cleanChannel = String(channel).replace(/\s+/g, ' ').trim();
    const cleanSide = ['front', 'back', 'left', 'right', 'top', 'bottom'].includes(side) ? side : 'back';
    const cleanSignal = Number.isInteger(signal) && signal >= 1 && signal <= 15 ? signal : 15;

    PLAYER_SIGNALS[cleanName] = {
      signal: cleanSignal,
      side: cleanSide,
      channel: cleanChannel
    };

    return res.json({
      ok: true,
      player: cleanName,
      config: PLAYER_SIGNALS[cleanName]
    });
  } catch (err) {
    console.error('Error in /api/add-player:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/pull-pearl', async (req, res) => {
  try {
    if (!req.session || !req.session.discordUser) {
      return res.status(401).json({ message: 'Not logged in' });
    }

    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Missing player' });
    }

    const config = PLAYER_SIGNALS[name];

    if (!config) {
      return res.status(400).json({ message: 'Unknown player' });
    }

    latestSignal = {
      player: name,
      signal: config.signal,
      side: config.side,
      channel: config.channel,
      at: Date.now()
    };

    if (minecraftClient && minecraftClient.readyState === 1) {
      minecraftClient.send(JSON.stringify({
        type: 'pearl',
        player: name,
        signal: config.signal,
        side: config.side,
        channel: config.channel,
        requestedBy: req.session.discordUser.username
      }));
    }

    console.log(`Pearl action requested by ${req.session.discordUser.username} for ${name}, signal ${config.signal}, side ${config.side}, channel ${config.channel}`);
    return res.json({
      message: `Sent signal ${config.signal} for ${name}`,
      player: name,
      config
    });
  } catch (err) {
    console.error('Error in /api/pull-pearl:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
