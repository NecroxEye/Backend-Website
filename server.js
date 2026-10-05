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
  origin(origin, callback) {
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
