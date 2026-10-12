const express = require('express');
const session = require('express-session');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://necroxeye.github.io/Backend-Website/';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SESSION_SECRET) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  name: 'connect.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    isAdmin: !!row.is_admin,
    canPull: !!row.can_pull,
    allFolders: !!row.all_folders,
    allowedFolders: Array.isArray(row.allowed_folders) ? row.allowed_folders : []
  };
}

function ensureAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function ensureAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.isAdmin) return next();
  return res.status(403).json({ error: 'Admin only' });
}

function canSeeFolder(user, folderName) {
  if (!user) return false;
  if (user.isAdmin || user.allFolders) return true;
  return Array.isArray(user.allowedFolders) && user.allowedFolders.includes(folderName);
}

function normalizeFolderName(player) {
  return String(player.folder_name || player.computer_name || 'Unassigned').trim() || 'Unassigned';
}

async function lookupUser(username, password) {
  return await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .maybeSingle();
}

async function getAllPlayers() {
  return await supabase.from('players').select('*').order('id', { ascending: true });
}

async function getAllUsersPublic() {
  return await supabase
    .from('users')
    .select('id, username, is_admin, can_pull, all_folders, allowed_folders')
    .order('id', { ascending: true });
}

app.get('/debug/session', (req, res) => {
  res.json({
    hasSession: !!req.session,
    sessionID: req.sessionID || null,
    sessionUser: req.session?.user || null,
    cookieHeader: req.headers.cookie || null,
    origin: req.headers.origin || null
  });
});

app.get('/debug/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('*');
  res.json({ data, error });
});

app.post('/debug/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const { data, error } = await lookupUser(username, password);
    res.json({ username, password, found: !!data, data, error });
  } catch (err) {
    res.status(500).json({ error: err.message || 'debug login failed' });
  }
});

app.post('/auth/local/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    console.log('[LOGIN] attempt:', username, 'origin:', req.headers.origin);

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const { data, error } = await lookupUser(username, password);

    console.log('[LOGIN] lookup result:', {
      found: !!data,
      error: error ? error.message || String(error) : null
    });

    if (error) {
      return res.status(500).json({ error: error.message || 'Login lookup failed' });
    }

    if (!data) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    req.session.user = publicUser(data);

    req.session.save((sessionErr) => {
      if (sessionErr) {
        console.log('[LOGIN] session save error:', sessionErr);
        return res.status(500).json({ error: 'Session save failed' });
      }

      console.log('[LOGIN] success:', req.session.user.username, 'sessionID:', req.sessionID);
      return res.json({ user: req.session.user });
    });
  } catch (err) {
    console.log('[LOGIN] fatal error:', err);
    return res.status(500).json({ error: err.message || 'Login failed' });
  }
});

app.get('/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid', {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    });
    res.json({ ok: true });
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ON' });
});

app.get('/status', ensureAuth, async (req, res) => {
  try {
    const { data, error } = await getAllPlayers();
    if (error) return res.status(500).json({ error: 'Failed to load status' });

    const players = (data || []).filter(p => canSeeFolder(req.session.user, normalizeFolderName(p)));
    res.json({ user: req.session.user, players });
  } catch {
    res.status(500).json({ error: 'Failed to load status' });
  }
});

let triggerQueue = [];

function cleanExpiredTriggers() {
  const now = Date.now();
  triggerQueue = triggerQueue.filter(t => t.expiresAt > now);
}

app.get('/trigger', async (req, res) => {
  try {
    const computerName = String(req.query.computer_name || '').trim();
    if (!computerName) return res.status(400).json({ error: 'Missing computer
