const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return structuredClone(fallback);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const defaultUsers = [
  {
    id: 1,
    username: 'Fr05tedF4ang5',
    password: 'Frosting',
    isAdmin: true,
    canPull: true,
    allFolders: true,
    allowedFolders: []
  },
  {
    id: 2,
    username: 'Frost',
    password: 'Genius',
    isAdmin: false,
    canPull: true,
    allFolders: true,
    allowedFolders: []
  },
  {
    id: 3,
    username: 'LakIo',
    password: 'RedEye',
    isAdmin: false,
    canPull: true,
    allFolders: false,
    allowedFolders: ['LakIo']
  }
];

const defaultPlayers = [
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

let users = readJSON(USERS_FILE, defaultUsers);
let players = readJSON(PLAYERS_FILE, defaultPlayers);
let triggerQueue = readJSON(STATE_FILE, []);

function persistUsers() {
  writeJSON(USERS_FILE, users);
}

function persistPlayers() {
  writeJSON(PLAYERS_FILE, players);
}

function persistTriggers() {
  writeJSON(STATE_FILE, triggerQueue);
}

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy((username, password, done) => {
  const user = users.find(u => u.username === username);
  if (!user) return done(null, false, { message: 'Invalid username' });
  if (user.password !== password) return done(null, false, { message: 'Invalid password' });
  return done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = users.find(u => u.id === id);
  done(null, user || false);
});

function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user && req.user.isAdmin) return next();
  return res.status(403).json({ error: 'Admin Only' });
}

function canViewFolder(user, folder) {
  if (!user) return false;
  if (user.isAdmin || user.allFolders) return true;
  return Array.isArray(user.allowedFolders) && user.allowedFolders.includes(folder);
}

function visiblePlayers(user) {
  if (!user) return [];
  if (user.isAdmin || user.allFolders) return players;
  return players.filter(p => canViewFolder(user, p.folder_name));
}

function findTriggerForComputer(computerName) {
  const index = triggerQueue.findIndex(t => t.computer_name === computerName);
  if (index === -1) return null;
  const trigger = triggerQueue.splice(index, 1)[0];
  persistTriggers();
  return trigger;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ON' });
});

/* AUTH */
app.post('/auth/local/login', passport.authenticate('local'), (req, res) => {
  res.json({
    ok: true,
    user: {
      username: req.user.username,
      isAdmin: !!req.user.isAdmin,
      canPull: !!req.user.canPull,
      allFolders: !!req.user.allFolders,
      allowedFolders: req.user.allowedFolders || []
    }
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

app.post('/auth/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
});

/* DISCORD PLACEHOLDERS */
app.get('/auth/discord/login', (req, res) => {
  res.status(501).send('Discord login not configured yet.');
});

app.get('/auth/discord/callback', (req, res) => {
  res.status(501).send('Discord callback not configured yet.');
});

/* TRIGGER API FOR CC LUA */
app.get('/trigger', (req, res) => {
  const computerName = String(req.query.computer_name || '').trim();
  if (!computerName) {
    return res.status(400).json({ error: 'Missing computer_name' });
  }

  const trigger = findTriggerForComputer(computerName);
  if (!trigger) return res.json({ trigger: null });

  return res.json({
    trigger: {
      computer_name: trigger.computer_name,
      direction: trigger.direction
    }
  });
});

app.post('/trigger', ensureAuth, (req, res) => {
  const { computer_name, direction } = req.body || {};
  if (!computer_name || !direction) {
    return res.status(400).json({ error: 'Missing computer_name or direction' });
  }

  if (!canViewFolder(req.user, String(req.body.folder_name || req.body.folder || computer_name))) {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'No permission for this folder' });
    }
  }

  if (!req.user.canPull && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Pull permission denied' });
  }

  triggerQueue.push({
    computer_name: String(computer_name),
    direction: String(direction),
    createdAt: Date.now()
  });
  persistTriggers();

  res.json({ ok: true });
});

/* STATUS / PLAYERS */
app.get('/status', ensureAuth, (req, res) => {
  res.json({ players: visiblePlayers(req.user) });
});

app.get('/players', ensureAuth, (req, res) => {
  res.json({ players: visiblePlayers(req.user) });
});

app.post('/players', ensureAdmin, (req, res) => {
  const { name, computer_name, folder_name, channel_name, direction, signal_strength } = req.body || {};
  if (!name || !computer_name || !folder_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const newPlayer = {
    id: Date.now(),
    name: String(name),
    computer_name: String(computer_name),
    folder_name: String(folder_name),
    channel_name: String(channel_name || ''),
    direction: String(direction || 'left'),
    signal_strength: Number(signal_strength || 15)
  };

  players.push(newPlayer);
  persistPlayers();
  res.json({ ok: true, player: newPlayer });
});

app.put('/players/:id', ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const idx = players.findIndex(p => Number(p.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'Player not found' });

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

  persistPlayers();
  res.json({ ok: true, player: players[idx] });
});

app.delete('/players/:id', ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const before = players.length;
  players = players.filter(p => Number(p.id) !== id);

  if (players.length === before) {
    return res.status(404).json({ error: 'Player not found' });
  }

  persistPlayers();
  res.json({ ok: true });
});

/* USER MANAGEMENT */
app.get('/admin/users', ensureAdmin, (req, res) => {
  res.json({ users: users.map(({ password, ...u }) => u) });
});

app.post('/admin/users', ensureAdmin, (req, res) => {
  const { username, password, isAdmin, canPull, allFolders, allowedFolders } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }

  if (users.some(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const newUser = {
    id: Date.now(),
    username: String(username),
    password: String(password),
    isAdmin: !!isAdmin,
    canPull: canPull !== undefined ? !!canPull : true,
    allFolders: !!allFolders,
    allowedFolders: Array.isArray(allowedFolders) ? allowedFolders.map(String) : []
  };

  users.push(newUser);
  persistUsers();

  const { password: _, ...safeUser } = newUser;
  res.json({ ok: true, user: safeUser });
});

app.put('/admin/users/:id', ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const idx = users.findIndex(u => Number(u.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  const { username, password, isAdmin, canPull, allFolders, allowedFolders } = req.body || {};

  if (username && users.some(u => u.username === username && Number(u.id) !== id)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  users[idx] = {
    ...users[idx],
    username: username ?? users[idx].username,
    password: password !== undefined && password !== '' ? String(password) : users[idx].password,
    isAdmin: isAdmin !== undefined ? !!isAdmin : users[idx].isAdmin,
    canPull: canPull !== undefined ? !!canPull : users[idx].canPull,
    allFolders: allFolders !== undefined ? !!allFolders : users[idx].allFolders,
    allowedFolders: Array.isArray(allowedFolders) ? allowedFolders.map(String) : users[idx].allowedFolders
  };

  persistUsers();

  const { password: _, ...safeUser } = users[idx];
  res.json({ ok: true, user: safeUser });
});

app.delete('/admin/users/:id', ensureAdmin, (req, res) => {
  const id = Number(req.params.id);

  if (users.some(u => Number(u.id) === id && u.username === req.user.username)) {
    return res.status(400).json({ error: 'You cannot delete your own active account' });
  }

  const before = users.length;
  users = users.filter(u => Number(u.id) !== id);

  if (users.length === before) {
    return res.status(404).json({ error: 'User not found' });
  }

  persistUsers();
  res.json({ ok: true });
});

/* STATIC */
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
