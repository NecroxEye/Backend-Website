const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SESSION_SECRET) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // Localhost/dev:
    // secure: false, sameSite: 'lax'
    //
    // HTTPS/prod:
    // secure: true, sameSite: 'none'
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

function normalizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    password: row.password,
    isAdmin: !!row.is_admin,
    canPull: !!row.can_pull,
    allFolders: !!row.all_folders,
    allowedFolders: Array.isArray(row.allowed_folders) ? row.allowed_folders : []
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    isAdmin: !!user.isAdmin,
    canPull: !!user.canPull,
    allFolders: !!user.allFolders,
    allowedFolders: Array.isArray(user.allowedFolders) ? user.allowedFolders : []
  };
}

async function getUserByUsername(username) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (error) throw error;
  return normalizeUser(data);
}

async function getUserById(id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return normalizeUser(data);
}

function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user && req.user.isAdmin) return next();
  return res.status(403).json({ error: 'Admin only' });
}

function canSeeFolder(user, folderName) {
  if (!user) return false;
  if (user.isAdmin || user.allFolders) return true;
  return Array.isArray(user.allowedFolders) && user.allowedFolders.includes(folderName);
}

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const user = await getUserByUsername(username);
    if (!user) return done(null, false, { message: 'Invalid username' });
    if (String(user.password) !== String(password)) return done(null, false, { message: 'Invalid password' });
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await getUserById(id);
    done(null, user || false);
  } catch (err) {
    done(err);
  }
});

/* =========================
   COMPUTERCRAFT TRIGGERS
   =========================
   Keep the website -> in-game communication unchanged:
   GET /trigger?computer_name=...
   returns { trigger: null } or { trigger: { computer_name, direction } }

   POST /trigger queues a trigger that should be visible for about 1 to 1.5 seconds.
*/
let triggerQueue = [];

function cleanExpiredTriggers() {
  const now = Date.now();
  triggerQueue = triggerQueue.filter(t => t.expiresAt > now);
}

app.get('/trigger', async (req, res) => {
  try {
    const computerName = String(req.query.computer_name || '').trim();
    if (!computerName) return res.status(400).json({ error: 'Missing computer_name' });

    cleanExpiredTriggers();

    const index = triggerQueue.findIndex(t => String(t.computer_name) === computerName);
    if (index === -1) {
      return res.json({ trigger: null });
    }

    const trigger = triggerQueue.splice(index, 1)[0];
    return res.json({
      trigger: {
        computer_name: trigger.computer_name,
        direction: trigger.direction
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Trigger lookup failed' });
  }
});

app.post('/trigger', ensureAuth, async (req, res) => {
  try {
    const { computer_name, direction, folder_name } = req.body || {};
    if (!computer_name || !direction) {
      return res.status(400).json({ error: 'Missing computer_name or direction' });
    }

    if (!req.user.canPull && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Pull permission denied' });
    }

    const targetFolder = String(folder_name || computer_name).trim();
    if (!req.user.isAdmin && !canSeeFolder(req.user, targetFolder)) {
      return res.status(403).json({ error: 'No access to that folder' });
    }

    const now = Date.now();
    const trigger = {
      computer_name: String(computer_name).trim(),
      direction: String(direction).trim(),
      createdAt: now,
      expiresAt: now + 1500
    };

    triggerQueue.push(trigger);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to queue trigger' });
  }
});

/* =========================
   AUTH
   ========================= */
app.post('/auth/local/login', passport.authenticate('local'), (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/auth/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

app.post('/auth/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
});

/* =========================
   HEALTH / STATUS
   ========================= */
app.get('/health', (req, res) => {
  res.json({ status: 'ON' });
});

app.get('/status', ensureAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('players').select('*');
    if (error) return res.status(500).json({ error: 'Failed to load status' });

    const players = (data || []).filter(p => canSeeFolder(req.user, p.folder_name));
    res.json({
      user: publicUser(req.user),
      players
    });
  } catch {
    res.status(500).json({ error: 'Failed to load status' });
  }
});

/* =========================
   PLAYERS
   ========================= */
app.get('/players', ensureAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('players').select('*').order('id', { ascending: true });
    if (error) return res.status(500).json({ error: 'Failed to load players' });

    const players = req.user.isAdmin || req.user.allFolders
      ? (data || [])
      : (data || []).filter(p => canSeeFolder(req.user, p.folder_name));

    res.json({ players });
  } catch {
    res.status(500).json({ error: 'Failed to load players' });
  }
});

app.post('/players', ensureAdmin, async (req, res) => {
  try {
    const { name, computer_name, channel_name, folder_name, direction, signal_strength } = req.body || {};
    if (!name || !computer_name || !folder_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const payload = {
      name: String(name),
      computer_name: String(computer_name),
      channel_name: String(channel_name || ''),
      folder_name: String(folder_name),
      direction: String(direction || 'left'),
      signal_strength: Number(signal_strength || 15)
    };

    const { data, error } = await supabase
      .from('players')
      .insert([payload])
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to create player' });
    res.json({ player: data });
  } catch {
    res.status(500).json({ error: 'Failed to create player' });
  }
});

app.put('/players/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { data: existing, error: findError } = await supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findError) return res.status(500).json({ error: 'Failed to load player' });
    if (!existing) return res.status(404).json({ error: 'Player not found' });

    const { name, computer_name, channel_name, folder_name, direction, signal_strength } = req.body || {};
    const payload = {
      name: name !== undefined ? String(name) : existing.name,
      computer_name: computer_name !== undefined ? String(computer_name) : existing.computer_name,
      channel_name: channel_name !== undefined ? String(channel_name) : existing.channel_name,
      folder_name: folder_name !== undefined ? String(folder_name) : existing.folder_name,
      direction: direction !== undefined ? String(direction) : existing.direction,
      signal_strength: signal_strength !== undefined ? Number(signal_strength) : existing.signal_strength
    };

    const { data, error } = await supabase
      .from('players')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to update player' });
    res.json({ player: data });
  } catch {
    res.status(500).json({ error: 'Failed to update player' });
  }
});

app.delete('/players/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { error } = await supabase.from('players').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete player' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete player' });
  }
});

/* =========================
   ADMIN USERS
   ========================= */
app.get('/admin/users', ensureAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, is_admin, can_pull, all_folders, allowed_folders')
      .order('id', { ascending: true });

    if (error) return res.status(500).json({ error: 'Failed to load users' });

    res.json({
      users: (data || []).map(u => ({
        id: u.id,
        username: u.username,
        isAdmin: !!u.is_admin,
        canPull: !!u.can_pull,
        allFolders: !!u.all_folders,
        allowedFolders: Array.isArray(u.allowed_folders) ? u.allowed_folders : []
      }))
    });
  } catch {
    res.status(500).json({ error: 'Failed to load users' });
  }
});

app.post('/admin/users', ensureAdmin, async (req, res) => {
  try {
    const { username, password, isAdmin, canPull, allFolders, allowedFolders } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const payload = {
      username: String(username),
      password: String(password),
      is_admin: !!isAdmin,
      can_pull: canPull !== undefined ? !!canPull : true,
      all_folders: !!allFolders,
      allowed_folders: Array.isArray(allowedFolders) ? allowedFolders.map(String) : []
    };

    const { data, error } = await supabase
      .from('users')
      .insert([payload])
      .select('id, username, is_admin, can_pull, all_folders, allowed_folders')
      .single();

    if (error) return res.status(500).json({ error: 'Failed to create user' });

    res.json({
      user: {
        id: data.id,
        username: data.username,
        isAdmin: !!data.is_admin,
        canPull: !!data.can_pull,
        allFolders: !!data.all_folders,
        allowedFolders: Array.isArray(data.allowed_folders) ? data.allowed_folders : []
      }
    });
  } catch {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/admin/users/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { username, password, isAdmin, canPull, allFolders, allowedFolders } = req.body || {};

    const payload = {};
    if (username !== undefined) payload.username = String(username);
    if (password !== undefined && password !== '') payload.password = String(password);
    if (isAdmin !== undefined) payload.is_admin = !!isAdmin;
    if (canPull !== undefined) payload.can_pull = !!canPull;
    if (allFolders !== undefined) payload.all_folders = !!allFolders;
    if (allowedFolders !== undefined) {
      payload.allowed_folders = Array.isArray(allowedFolders) ? allowedFolders.map(String) : [];
    }

    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', id)
      .select('id, username, is_admin, can_pull, all_folders, allowed_folders')
      .single();

    if (error) return res.status(500).json({ error: 'Failed to update user' });

    res.json({
      user: {
        id: data.id,
        username: data.username,
        isAdmin: !!data.is_admin,
        canPull: !!data.can_pull,
        allFolders: !!data.all_folders,
        allowedFolders: Array.isArray(data.allowed_folders) ? data.allowed_folders : []
      }
    });
  } catch {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/admin/users/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (req.user && Number(req.user.id) === id) {
      return res.status(400).json({ error: 'You cannot delete your own active account' });
    }

    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete user' });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
