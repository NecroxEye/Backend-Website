require('dotenv').config();

const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType
} = require('discord.js');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || '1554124753760034997';
const BACKEND_URL = process.env.BACKEND_URL || 'https://backend-website-syxe.onrender.com/status';
const STATUS_MESSAGE_FILE = process.env.STATUS_MESSAGE_FILE || './status_message_id.json';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 10000);
const WEBSITE_URL = 'https://necroxeye.github.io/Backend-Website/';

if (!DISCORD_BOT_TOKEN) {
  console.error('[bot] Missing DISCORD_BOT_TOKEN');
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
    console.error('[storage] failed reading message id:', err.message);
    return null;
  }
}

function saveMessageId(messageId) {
  try {
    fs.writeFileSync(STATUS_MESSAGE_FILE, JSON.stringify({ messageId }, null, 2), 'utf8');
  } catch (err) {
    console.error('[storage] failed saving message id:', err.message);
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

function normalizePlayer(p) {
  return {
    id: p.id || '',
    name: String(p.name || p.username || 'Unknown'),
    computer_name: String(p.computer_name || p.computer || 'Oil Rig'),
    channel_name: String(p.channel_name || ''),
    signal_strength: Number(p.signal_strength ?? 15),
    direction: String(p.direction || 'left'),
    is_admin: !!p.is_admin,
    created_at: p.created_at || null
  };
}

function normalizeState(data) {
  const players = Array.isArray(data.players) ? data.players.map(normalizePlayer) : [];

  return {
    status: String(data.status || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    backend_status: String(data.backend_status || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    computer: String(data.computer || 'N/A'),
    oilRig: String(data.oilRig || 'Offline'),
    website: String(data.website || 'Offline'),
    players
  };
}

function buildComputerLines(state) {
  if (!state.players.length) {
    return `Oil Rig - ${String(state.oilRig).toLowerCase() === 'working' ? 'ON' : 'OFF'}`;
  }

  const grouped = new Map();

  for (const p of state.players) {
    const key = p.computer_name || 'Oil Rig';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(p.name);
  }

  return [...grouped.entries()]
    .map(([computer, list]) => `${computer} - ${list.length > 0 ? 'ON' : 'OFF'}`)
    .join('\n');
}

function buildPlayersLines(players) {
  if (!players.length) return 'None';
  return players.map(p => `• ${p.name} — ${p.computer_name} — ${p.direction}`).join('\n');
}

function buildEmbed(state) {
  const websiteOk = String(state.website).toLowerCase() === 'working' || state.status === 'ON';
  const backendOk = state.backend_status === 'ON';

  return new EmbedBuilder()
    .setTitle('System Status Panel')
    .setColor(backendOk ? 0x67d7ff : 0xd65574)
    .addFields(
      { name: 'Computers', value: buildComputerLines(state), inline: false },
      { name: 'Players', value: buildPlayersLines(state.players), inline: false },
      { name: 'Website Status', value: websiteOk ? '🟢 Working' : '🔴 Offline', inline: true },
      { name: 'Backend Status', value: backendOk ? '🟢 ON' : '🔴 OFF', inline: true },
      { name: 'Frosted Fang', value: `[Open Website](${WEBSITE_URL})`, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Auto-updating status panel' });
}

async function resolveChannel() {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(err => {
    console.error('[discord] channel fetch failed:', err.message);
    return null;
  });

  if (!channel) return null;

  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    console.error('[discord] channel is not a text channel');
    return null;
  }

  return channel;
}

async function getExistingMessage(channel) {
  if (!cachedMessageId) cachedMessageId = loadSavedMessageId();
  if (!cachedMessageId) return null;

  try {
    return await channel.messages.fetch(cachedMessageId);
  } catch (err) {
    console.warn('[discord] saved panel message missing:', err.message);
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

    console.log('[panel] backend status:', JSON.stringify(raw));

    const channel = await resolveChannel();
    if (!channel) return;

    const perms = channel.permissionsFor(client.user);
    const required = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.ReadMessageHistory
    ];

    if (!perms || !perms.has(required)) {
      console.error('[discord] missing permissions in channel');
      return;
    }

    const embed = buildEmbed(state);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Frosted Fang')
        .setStyle(ButtonStyle.Link)
        .setURL(WEBSITE_URL)
    );

    const existing = await getExistingMessage(channel);

    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] });
      console.log('[panel] panel edited');
    } else {
      const sent = await channel.send({ embeds: [embed], components: [row] });
      cachedMessageId = sent.id;
      saveMessageId(sent.id);
      console.log('[panel] new panel sent:', sent.id);
    }
  } catch (err) {
    console.error('[panel] update failed:', err.message);
  } finally {
    updateRunning = false;
  }
}

client.once('ready', async () => {
  console.log(`[bot] logged in as ${client.user.tag}`);
  cachedMessageId = loadSavedMessageId();
  await updatePanel();
  setInterval(updatePanel, POLL_INTERVAL_MS);
});

client.on('error', err => console.error('[bot] client error:', err));
process.on('unhandledRejection', err => console.error('[bot] unhandled rejection:', err));
process.on('uncaughtException', err => console.error('[bot] uncaught exception:', err));

client.login(DISCORD_BOT_TOKEN).catch(err => {
  console.error('[bot] login failed:', err.message);
  process.exit(1);
});
