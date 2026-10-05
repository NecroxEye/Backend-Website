const express = require('express');
const http = require('http');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    status: 'running',
    time: new Date().toISOString()
  });
});

// Players
app.get('/players', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/players', async (req, res) => {
  try {
    const {
      name,
      signal_strength,
      direction,
      channel_name,
      computer_name,
      is_admin
    } = req.body || {};

    if (!name || !direction) {
      return res.status(400).json({ error: 'name and direction are required' });
    }

    const row = {
      name: String(name).trim(),
      signal_strength: Number.isFinite(Number(signal_strength)) ? Number(signal_strength) : 15,
      direction: String(direction).trim(),
      channel_name: String(channel_name || '').trim(),
      computer_name: String(computer_name || '').trim(),
      is_admin: !!is_admin
    };

    const { data, error } = await supabase
      .from('players')
      .insert([row])
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/players/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const updateData = {};
    const fields = [
      'name',
      'signal_strength',
      'direction',
      'channel_name',
      'computer_name',
      'is_admin'
    ];

    for (const field of fields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    if (updateData.name !== undefined) updateData.name = String(updateData.name).trim();
    if (updateData.direction !== undefined) updateData.direction = String(updateData.direction).trim();
    if (updateData.channel_name !== undefined) updateData.channel_name = String(updateData.channel_name).trim();
    if (updateData.computer_name !== undefined) updateData.computer_name = String(updateData.computer_name).trim();
    if (updateData.signal_strength !== undefined) {
      updateData.signal_strength = Number.isFinite(Number(updateData.signal_strength))
        ? Number(updateData.signal_strength)
        : 15;
    }
    if (updateData.is_admin !== undefined) updateData.is_admin = !!updateData.is_admin;

    const { data, error } = await supabase
      .from('players')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/players/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('players')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Trigger a player
app.post('/trigger/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: player, error } = await supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const payload = {
      type: 'pearl',
      player: player.name,
      direction: player.direction,
      signal_strength: player.signal_strength,
      channel_name: player.channel_name,
      computer_name: player.computer_name
    };

    // Send to any connected websocket clients
    const message = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }

    return res.json({
      success: true,
      sent: payload,
      connected_clients: [...wss.clients].filter(c => c.readyState === 1).length
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// WebSocket
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to backend'
  }));

  ws.on('message', (msg) => {
    console.log('WS message:', msg.toString());
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });

  ws.on('error', (err) => {
    console.log('WebSocket error:', err.message);
  });
});

// Keepalive ping
setInterval(() => {
  const ping = JSON.stringify({ type: 'ping', time: Date.now() });

  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(ping);
    }
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
