const express = require('express');
const http = require('http');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { WebSocketServer, WebSocket } = require('ws');

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

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/players', async (req, res) => {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

app.post('/players', async (req, res) => {
  const {
    name,
    signal_strength,
    direction,
    channel_name,
    computer_name,
    is_admin
  } = req.body;

  if (!name || !direction) {
    return res.status(400).json({ error: 'name and direction are required' });
  }

  const { data, error } = await supabase
    .from('players')
    .insert([{
      name,
      signal_strength: signal_strength ?? 15,
      direction,
      channel_name: channel_name ?? '',
      computer_name: computer_name ?? '',
      is_admin: is_admin ?? false
    }])
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

app.put('/players/:id', async (req, res) => {
  const { id } = req.params;

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
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  }

  const { data, error } = await supabase
    .from('players')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

app.delete('/players/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('players')
    .delete()
    .eq('id', id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

const wss = new WebSocketServer({ noServer: true });
const connectedClients = new Set();

function broadcastMessage(messageObj) {
  const message = JSON.stringify(messageObj);

  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    } else {
      connectedClients.delete(client);
    }
  }
}

app.post('/trigger/:id', async (req, res) => {
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

  broadcastMessage(payload);

  res.json({
    success: true,
    sent: payload,
    connected_clients: connectedClients.size
  });
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  connectedClients.add(ws);
  console.log('WebSocket client connected');

  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to backend'
  }));

  ws.on('message', (message) => {
    console.log('WS message from client:', message.toString());
  });

  ws.on('close', () => {
    connectedClients.delete(ws);
    console.log('WebSocket client disconnected');
  });

  ws.on('error', (err) => {
    console.log('WebSocket error:', err.message);
    connectedClients.delete(ws);
  });
});

setInterval(() => {
  broadcastMessage({ type: 'ping' });
}, 30000);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
