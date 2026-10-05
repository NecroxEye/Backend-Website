require('dotenv').config();

const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BACKEND_URL = process.env.BACKEND_URL;
const STATUS_MESSAGE_FILE = process.env.STATUS_MESSAGE_FILE || './status_message_id.json';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 15000);

if (!DISCORD_BOT_TOKEN || !CHANNEL_ID || !BACKEND_URL) {
  console.error('Missing DISCORD_BOT_TOKEN, CHANNEL_ID, or BACKEND_URL in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let cachedMessageId = null;
let lastSnapshot = null;
let updateRunning = false;

function loadSavedMessageId() {
  try {
    if (!fs.existsSync(STATUS_MESSAGE_FILE)) return null;
    const raw = fs.readFileSync(STATUS_MESSAGE_FILE, 'utf8');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.messageId || null;
  } catch {
    return null;
  }
}

function saveMessageId(messageId) {
  try {
    fs.writeFileSync(STATUS_MESSAGE_FILE, JSON.stringify({ messageId }, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save message ID:', err.message);
  }
}

async function fetchBackendStatus() {
  const res = await fetch(BACKEND_URL, {
    headers: { Accept: 'application/json' }
  });

  const text = await res.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Backend did not return JSON: ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Backend error ${res.status}`);
  }

  return data;
}

function normalizeState(data) {
  const players = Array.isArray(data.players)
    ? data.players
    : Array.isArray(data.players_added)
      ? data.players_added
      : [];

  return {
    status: String(data.status || data.backend_status || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    backendStatus: String(data.backend_status || data.backend || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    computer: String(data.computer || data.computer_name || 'N/A'),
    oilRig: String(data.oilRig || data.oil_rig || 'Offline'),
    website: String(data.website || 'Working'),
    players
  };
}

function buildEmbed(state) {
  const statusEmoji = state.status === 'ON' ? '🟢' : '🔴';
  const backendEmoji = state.backendStatus === 'ON' ? '🟢' : '🔴';
  const oilRigWorking = String(state.oilRig).toLowerCase() === 'working';

  const playersText = state.players.length
    ? state.players.map(p => `• ${p}`).join('\n')
    : 'None';

  return new EmbedBuilder()
    .setTitle('System Status Panel')
    .setColor(state.status === 'ON' ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: 'Status', value: `${statusEmoji} ${state.status}`, inline: true },
      { name: 'Backend Status', value: `${backendEmoji} ${state.backendStatus}`, inline: true },
      { name: 'Computer', value: state.computer, inline: true },
      { name: 'Oil Rig', value: oilRigWorking ? '🟢 Working' : '🔴 Offline', inline: true },
      { name: 'Website', value: '🟢 Working', inline: true },
      { name: 'Players Added', value: playersText, inline: false }
    )
    .setFooter({ text: 'Auto-updating status panel' })
    .setTimestamp();
}

async function getStatusMessage(channel) {
  if (!cachedMessageId) {
    cachedMessageId = loadSavedMessageId();
  }

  if (cachedMessageId) {
    try {
      return await channel.messages.fetch(cachedMessageId);
    } catch {
      cachedMessageId = null;
    }
  }

  return null;
}

async function updatePanel() {
  if (updateRunning) return;
  updateRunning = true;

  try {
    const raw = await fetchBackendStatus();
    const state = normalizeState(raw);
    const snapshot = JSON.stringify(state);

    // If nothing changed, do nothing
    if (snapshot === lastSnapshot) {
      return;
    }
    lastSnapshot = snapshot;

    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) {
      console.error('Channel not found');
      return;
    }

    const embed = buildEmbed(state);
    const existingMessage = await getStatusMessage(channel);

    if (existingMessage) {
      await existingMessage.edit({ embeds: [embed] });
    } else {
      const sent = await channel.send({ embeds: [embed] });
      cachedMessageId = sent.id;
      saveMessageId(sent.id);
    }
  } catch (err) {
    console.error('Status panel update error:', err.message);
  } finally {
    updateRunning = false;
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await updatePanel();
  setInterval(updatePanel, POLL_INTERVAL_MS);
});

client.login(DISCORD_BOT_TOKEN);
