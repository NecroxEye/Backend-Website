const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// If you're on Render behind a proxy
app.set('trust proxy', 1);

// ---- CORS ----
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---- SESSION ----
app.use(session({
  secret: process.env.SESSION_SECRET || 'change_this_secret',
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

// ---- LOCAL USERS ----
// NOTE: In production, store these in a DB and hash passwords.
const localUsers = {
  'Fr05tedFang5': {
    id: 1,
    username: 'Fr05tedFang5',
    password: 'Frosting',
    isAdmin: true,
    canPull: true,
    allFolders: true,
    allowedFolders: []
  },
  'Frost': {
    id: 2,
    username: 'Frost',
    password: 'Genius',
    isAdmin: false,
    canPull: true,
    allFolders: true,
    allowedFolders: []
  },
  'LokIo': {
    id: 3,
    username: 'LokIo',
    password: 'RedEye',
    isAdmin: false,
    canPull: true,
    allFolders: false,
    allowedFolders: ['LakIo']
  }
};

// ---- ROASTER/PLAYER DATA (in-memory example) ----
// Replace with DB later if you want persistence.
let players = [
  {
    id: 1,
    name: 'Necrox',
    computer_name: 'Oil Rig',
    folder_name: 'Oil Rig',
    channel_name: 'main',
    direction: 'left',
    signal_strength: 15
  },
  {
    id: 2,
    name: 'Alice',
    computer_name: 'EMENeth',
    folder_name: 'EMENeth',
    channel_name: 'alpha',
    direction: 'right',
    signal_strength: 15
  },
  {
    id: 3,
    name: 'Fangs',
    computer_name: 'LakIo',
    folder_name: 'LakIo',
    channel_name: 'beta',
    direction: 'back',
    signal_strength: 15
  }
];

// ---- PASSPORT STRATEGY ----
passport.use(new LocalStrategy((username, password, done) => {
  const user = localUsers[username];
  if (!user) return done(null, false, { message: 'Invalid username' });
  if (user.password !== password) return done(null, false, { message: 'Invalid password' });
  return done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.username));
passport.deserializeUser((username, done) => {
  const user = localUsers[username];
  done(null, user || false);
});

// ---- HELPERS ----
function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user && req.user.isAdmin) return next();
  return res.status(403).json({ error: 'Admin Only' });
}

function getVisiblePlayersForUser(user) {
  if (!user) return [];
  if (user.isAdmin || user.allFolders) return players;
  if (Array.isArray(user.allowedFolders) && user.allowedFolders.length) {
    return players.filter(p => user.allowedFolders.includes(p.folder_name));
  }
  return [];
}

// ---- AUTH ROUTES ----
app.post('/auth/local/login', passport.authenticate('local'), (req, res) => {
  res.json({
    ok: true,
    user: {
      username: req.user.username,
      isAdmin: req.user.isAdmin,
      canPull: req.user.canPull,
      allFolders: req.user.allFolders,
      allowedFolders: req.user.allowedFolders || []
    }
  });
});

app.post('/auth/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
});

app.get('/auth/me', (req, res) => {
  if (!req.user) return res.json({ user: null });

  res.json({
    user: {
      username: req.user.username,
      isAdmin: !!req.user.isAdmin,
      canPull: !!req.user.canPull,
      allFolders: !!req.user.allFolders,
      allowedFolders: req.user.allowedFolders || []
    }
  });
});

// ---- HEALTH ----
app.get('/health', (req, res) => {
  res.json({ status: 'ON' });
});

// ---- STATUS ----
app.get('/status', ensureAuth, (req, res) => {
  const visible = getVisiblePlayersForUser(req.user);
  res.json({ players: visible });
});

// ---- TRIGGER ----
app.post('/trigger', ensureAuth, (req, res) => {
  const { computer_name, direction } = req.body || {};

  if (!computer_name || !direction) {
    return res.status(400).json({ error: 'Missing computer_name or direction' });
  }

  // You can connect this to your CC/Tweaked poll system or DB trigger queue later.
  console.log(`[TRIGGER] ${computer_name} -> ${direction} by ${req.user.username}`);

  res.json({
    ok: true,
    triggered: {
      computer_name,
      direction
    }
  });
});

// ---- PLAYERS CRUD ----
app.get('/players', ensureAuth, (req, res) => {
  const visible = getVisiblePlayersForUser(req.user);
  res.json({ players: visible });
});

app.post('/players', ensureAdmin, (req, res) => {
  const { name, computer_name, folder_name, channel_name, direction, signal_strength } = req.body || {};

  if (!name || !computer_name || !folder_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const newPlayer = {
    id: Date.now(),
    name,
    computer_name,
    folder_name,
    channel_name: channel_name || '',
    direction: direction || 'left',
    signal_strength: Number(signal_strength || 15)
  };

  players.push(newPlayer);
  res.json({ ok: true, player: newPlayer });
});

app.put('/players/:id', ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const idx = players.findIndex(p => Number(p.id) === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Player not found' });
  }

  const { name, computer_name, folder_name, channel_name, direction, signal_strength } = req.body || {};

  players[idx] = {
    ...players[idx],
    name: name ?? players[idx].name,
    computer_name: computer_name ?? players[idx].computer_name,
    folder_name: folder_name ?? players[idx].folder_name,
    channel_name: channel_name ?? players[idx].channel_name,
    direction: direction ?? players[idx].direction,
    signal_strength: signal_strength !== undefined ? Number(signal_strength) : players[idx].signal_strength
  };

  res.json({ ok: true, player: players[idx] });
});

app.delete('/players/:id', ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const before = players.length;
  players = players.filter(p => Number(p.id) !== id);

  if (players.length === before) {
    return res.status(404).json({ error: 'Player not found' });
  }

  res.json({ ok: true });
});

// ---- STATIC FRONTEND ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- START ----
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
