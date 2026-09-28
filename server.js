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

const allowedOrigins = ['https://necroxeye.github.io'];

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
  secret: process.env.SESSION_SECRET || 'change_this_secret',
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

let minecraftClient = null;
let latestSignal = null;

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
      global_name: user.global_name || null
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

app.post('/api/pull-pearl', async (req, res) => {
  try {
    const { player } = req.body;

    if (!req.session || !req.session.discordUser) {
      return res.status(401).json({ message: 'Not logged in' });
    }

    if (!player) {
      return res.status(400).json({ message: 'Missing player' });
    }

    let signal = 0;

    if (player === 'Necrox') signal = 15;
    else if (player === 'Alice') signal = 13;
    else return res.status(400).json({ message: 'Unknown player' });

    latestSignal = {
      player,
      signal,
      at: Date.now()
    };

    if (minecraftClient && minecraftClient.readyState === 1) {
      minecraftClient.send(JSON.stringify({
        type: 'pearl',
        player,
        signal
      }));
    }

    console.log(`Pearl action requested for ${player}, signal ${signal}`);
    return res.json({ message: `Sent signal ${signal} for ${player}` });
  } catch (err) {
    console.error('Error in /api/pull-pearl:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
