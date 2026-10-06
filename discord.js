require('dotenv').config();

const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require('discord.js');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BACKEND_URL = process.env.BACKEND_URL;
const STATUS_MESSAGE_FILE = process.env.STATUS_MESSAGE_FILE || './status_message_id.json';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 10000);

if (!DISCORD_BOT_TOKEN || !CHANNEL_ID || !BACKEND_URL) {
  console.error('Missing DISCORD_BOT_TOKEN, CHANNEL_ID, or BACKEND_URL in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let cachedMessageId = null;
let updateRunning = false;

function loadSavedMessageId() {
  try {
    if (!fs.existsSync(STATUS_MESSAGE_FILE)) return null;
    const raw = fs.readFileSync(STATUS_MESSAGE_FILE, 'utf8');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.messageId || null;
  } catch (err) {
    console.error('Failed to load saved message ID:', err.message);
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

async function fetchStatus() {
  const res = await fetch(BACKEND_URL, {
    headers: { Accept: 'application/json' }
  });

  const text = await res.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Backend did not return JSON. Response: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Backend error ${res.status}`);
  }

  return data;
}

function normalizeState(data) {
  const playersRaw = Array.isArray(data.players)
    ? data.players
    : Array.isArray(data.players_added)
      ? data.players_added
      : [];

  const players = playersRaw.map(p => {
    if (typeof p === 'string') {
      return { name: p, computer_name: 'Oil Rig', direction: 'north' };
    }

    return {
      name: String(p.name || p.username || 'Unknown'),
      computer_name: String(p.computer_name || p.computer || 'Oil Rig'),
      direction: String(p.direction || 'north')
    };
  });

  return {
    websiteStatus: String(data.website_status || data.website || 'ON').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    backendStatus: String(data.backend_status || data.backend || data.status || 'ON').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    players
  };
}

function buildComputerLines(players) {
  const computers = new Map();

  for (const player of players) {
    const computer = String(player.computer_name || 'Oil Rig').trim() || 'Oil Rig';
    if (!computers.has(computer)) computers.set(computer, []);
    computers.get(computer).push(player.name);
  }

  if (computers.size === 0) {
    computers.set('Oil Rig', []);
  }

  return [...computers.entries()]
    .map(([computer, names]) => `${computer} - ${names.length > 0 ? 'ON' : 'OFF'}`)
    .join('\n');
}

function buildPlayersLines(players) {
  if (!players.length) return 'None';
  return players.map(p => `• ${p.name}`).join('\n');
}

function buildEmbed(state) {
  const websiteEmoji = state.websiteStatus === 'ON' ? '🟢' : '🔴';
  const backendEmoji = state.backendStatus === 'ON' ? '🟢' : '🔴';

  return new EmbedBuilder()
    .setTitle('System Status Panel')
    .setColor(state.backendStatus === 'ON' ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: 'Computers', value: buildComputerLines(state.players), inline: false },
      { name: 'Players', value: buildPlayersLines(state.players), inline: false },
      { name: 'Website Status', value: `${websiteEmoji} ${state.websiteStatus}`, inline: true },
      { name: 'Backend Status', value: `${backendEmoji} ${state.backendStatus}`, inline: true },
      { name: 'Frosted Fang', value: '[Open Website](https://necroxeye.github.io/Backend-Website/)', inline: false }
    )
    .setFooter({ text: 'Auto-updating status panel' })
    .setTimestamp();
}

async function getExistingMessage(channel) {
  if (!cachedMessageId) cachedMessageId = loadSavedMessageId();
  if (!cachedMessageId) return null;

  try {
    return await channel.messages.fetch(cachedMessageId);
  } catch (err) {
    console.warn('Saved message missing or inaccessible:', err.message);
    cachedMessageId = null;
    return null;
  }
}

async function updatePanel() {
  if (updateRunning) return;
  updateRunning = true;

  try {
    console.log('[panel] fetching backend...');
    const raw = await fetchStatus();
    const state = normalizeState(raw);

    console.log('[panel] fetching channel...');
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) {
      console.error('[panel] channel not found');
      return;
    }

    const perms = channel.permissionsFor(client.user);
    const needed = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.ReadMessageHistory
    ];

    if (!perms || !perms.has(needed)) {
      console.error('[panel] missing permissions in channel');
      return;
    }

    const embed = buildEmbed(state);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Frosted Fang')
        .setStyle(ButtonStyle.Link)
        .setURL('https://necroxeye.github.io/Backend-Website/')
    );

    const existing = await getExistingMessage(channel);

    if (existing) {
      console.log('[panel] editing existing message');
      await existing.edit({ embeds: [embed], components: [row] });
    } else {
      console.log('[panel] sending new message');
      const sent = await channel.send({ embeds: [embed], components: [row] });
      cachedMessageId = sent.id;
      saveMessageId(sent.id);
    }

    console.log('[panel] done');
  } catch (err) {
    console.error('[panel] update failed:', err.message);
  } finally {
    updateRunning = false;
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  cachedMessageId = loadSavedMessageId();
  await updatePanel();
  setInterval(updatePanel, POLL_INTERVAL_MS);
});

client.login(DISCORD_BOT_TOKEN);
