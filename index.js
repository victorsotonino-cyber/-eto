
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || process.env.TOKEN;
const CLIENT_ID = "1557167878183067688";
const GUILD_ID = "1554248808194642040";
const PORT = Number.isFinite(Number(process.env.PORT)) ? Number(process.env.PORT) : 3000;
const TICKET_IMAGE_URL = process.env.TICKET_IMAGE_URL || "";
const BOT_BRAND = "Nexus";
const DASHBOARD_URL = "https://nexus-control-panel.onrender.com";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const PANEL_SYNC_SECRET = process.env.PANEL_SYNC_SECRET || "";
const DISCORD_REDIRECT_URI = DASHBOARD_URL + "/auth/discord/callback";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "ticket-data.json");
const DASHBOARD_FILE = path.join(DATA_DIR, "dashboard-data.json");
const DB_VERSION = 4;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 128 * 1024;
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || "Dent2026";
const MAX_DASHBOARD_SESSIONS = 2;
const DASHBOARD_OWNERS = [
  { role: "Dueño", name: "Camtrax2024" },
  { role: "Dev", name: "srkid" }
];

fs.mkdirSync(DATA_DIR, { recursive: true });

const STAFF_TEAM_ROLE_ID = "1557203534133330010";
const REWARD_ROLE_ID = "1554248808194642048";
const FULL_ACCESS_ROLE_ID = "1554252558359470182";
const POST_STAFF_NOTIFY_ROLE_IDS = ["1554708798499725393", "1554708987700715531"];

const DEFAULT_STAFF_QUESTIONS = [
  "👤 ¿Cuál es tu nombre/usuario de Discord?",
  "🎂 ¿Qué edad tienes?",
  "🌎 ¿De qué país eres y cuál es tu zona horaria?",
  "⏰ ¿Cuánto tiempo puedes estar activo diariamente?",
  "🧠 ¿Has tenido experiencia como Staff?",
  "🎯 ¿Por qué quieres formar parte del Staff?",
  "🛠️ ¿Qué harías ante spam, estafas o incumplimiento de reglas?",
  "⚖️ Si un amigo incumple las reglas, ¿lo sancionarías? ¿Por qué?",
  "🚨 ¿Qué harías ante una discusión entre usuarios?",
  "⭐ ¿Qué puedes aportar como Helper?"
];

const DEFAULT_ALTER_QUESTIONS = [
  "👤 ¿Cuál es tu usuario de Discord?",
  "🌎 ¿De qué país eres?",
  "🎂 ¿Qué edad tienes?",
  "📦 ¿Qué tipo de cuentas manejas?",
  "🎮 ¿Qué cantidad de stock tienes?",
  "🔄 ¿Con qué frecuencia repones stock?",
  "🎉 ¿Cuántos sorteos o drops puedes realizar al día?",
  "🎁 ¿Qué cantidad puedes aportar semanalmente?",
  "🛡️ ¿Cómo garantizas que las cuentas funcionan?",
  "⭐ ¿Por qué quieres ser Alter y qué puedes aportar?"
];

const EMOJIS = {
  support: { id: "1555058199147708426", name: "TestSupporter" },
  rewards: { id: "1555058008642293821", name: "RedStar" }
};

const COLOR = {
  purple: 0x8b2cff,
  green: 0x57f287,
  red: 0xed4245,
  blue: 0x5865f2,
  orange: 0xfaa61a
};

function sanitizeSnowflake(value) {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).trim();
  return /^\d{17,20}$/.test(s) ? s : null;
}

function sanitizeQuestions(value, fallback) {
  if (!Array.isArray(value)) return fallback.slice();
  return value
    .map(x => String(x ?? "").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 20);
}

function defaultGuild() {
  return {
    schemaVersion: DB_VERSION,
    configVersion: 0,
    categoryId: null,
    staffRoleId: null,
    logsChannelId: null,
    vouchChannelId: null,
    tickets: {},
    warnings: {},
    vouches: {},
    staffQuestions: DEFAULT_STAFF_QUESTIONS.slice(),
    alterQuestions: DEFAULT_ALTER_QUESTIONS.slice(),
    activity: [],
    botSnapshot: null,
    updatedAt: 0
  };
}

function normalizeGuild(input) {
  const g = { ...defaultGuild(), ...(input && typeof input === "object" ? input : {}) };

  g.schemaVersion = DB_VERSION;
  g.categoryId = sanitizeSnowflake(g.categoryId);
  g.staffRoleId = sanitizeSnowflake(g.staffRoleId);
  g.logsChannelId = sanitizeSnowflake(g.logsChannelId);
  g.vouchChannelId = sanitizeSnowflake(g.vouchChannelId);
  g.staffQuestions = sanitizeQuestions(g.staffQuestions, DEFAULT_STAFF_QUESTIONS);
  g.alterQuestions = sanitizeQuestions(g.alterQuestions, DEFAULT_ALTER_QUESTIONS);
  g.activity = Array.isArray(g.activity) ? g.activity.filter(x => x && typeof x === "object").slice(0, 500) : [];
  g.warnings = g.warnings && typeof g.warnings === "object" && !Array.isArray(g.warnings) ? g.warnings : {};
  g.vouches = g.vouches && typeof g.vouches === "object" && !Array.isArray(g.vouches) ? g.vouches : {};
  g.tickets = g.tickets && typeof g.tickets === "object" && !Array.isArray(g.tickets) ? g.tickets : {};

  const migratedTickets = {};
  for (const [key, ticket] of Object.entries(g.tickets)) {
    if (!ticket || typeof ticket !== "object" || !sanitizeSnowflake(ticket.channelId)) continue;
    const channelId = sanitizeSnowflake(ticket.channelId);
    migratedTickets[channelId] = {
      channelId,
      userId: sanitizeSnowflake(ticket.userId) || sanitizeSnowflake(key),
      type: String(ticket.type || "support"),
      closed: Boolean(ticket.closed),
      claimedBy: sanitizeSnowflake(ticket.claimedBy),
      createdAt: Number(ticket.createdAt) || Date.now(),
      closedAt: Number(ticket.closedAt) || 0
    };
  }
  g.tickets = migratedTickets;

  for (const [userId, list] of Object.entries(g.warnings)) {
    if (!Array.isArray(list)) {
      delete g.warnings[userId];
      continue;
    }
    g.warnings[userId] = list.slice(-100).map(w => ({
      reason: String(w?.reason || "Sin razón").slice(0, 500),
      moderatorId: sanitizeSnowflake(w?.moderatorId),
      at: Number(w?.at) || Date.now()
    }));
  }

  for (const [userId, count] of Object.entries(g.vouches)) {
    const n = Number(count);
    if (!/^\d{17,20}$/.test(userId) || !Number.isFinite(n) || n < 0) delete g.vouches[userId];
    else g.vouches[userId] = Math.floor(n);
  }

  if (g.botSnapshot && typeof g.botSnapshot === "object") {
    g.botSnapshot = {
      serverName: String(g.botSnapshot.serverName || "").slice(0, 100),
      botOnline: Boolean(g.botSnapshot.botOnline),
      syncedAt: Number(g.botSnapshot.syncedAt) || 0,
      openTickets: Math.max(0, Number(g.botSnapshot.openTickets) || 0),
      warnings: Math.max(0, Number(g.botSnapshot.warnings) || 0),
      vouches: Math.max(0, Number(g.botSnapshot.vouches) || 0)
    };
  } else {
    g.botSnapshot = null;
  }

  g.configVersion = Math.max(0, Number(g.configVersion) || 0);
  g.updatedAt = Math.max(0, Number(g.updatedAt) || 0);
  return g;
}

function defaultDB() {
  return {
    version: DB_VERSION,
    updatedAt: 0,
    guilds: {}
  };
}

function atomicWriteJSON(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + ".tmp-" + process.pid + "-" + Date.now();
  const backup = file + ".bak";
  const json = JSON.stringify(data, null, 2);

  try {
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeFileSync(fd, json, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (fs.existsSync(file)) fs.copyFileSync(file, backup);
    fs.renameSync(tmp, file);
  } catch (error) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw error;
  }
}

function loadJSON(file, fallback) {
  const backup = file + ".bak";
  const candidates = [
    { file, primary: true },
    { file: backup, primary: false }
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate.file)) continue;
      const raw = JSON.parse(fs.readFileSync(candidate.file, "utf8"));
      return { data: raw, recovered: !candidate.primary };
    } catch (error) {
      if (candidate.primary) {
        try {
          const corrupt = file + ".corrupt-" + Date.now();
          if (fs.existsSync(file)) fs.copyFileSync(file, corrupt);
        } catch {}
        console.error("Nexus: archivo de datos principal ilegible:", error.message);
      }
    }
  }

  return { data: fallback, recovered: false };
}

function normalizeDB(raw) {
  const source = raw && typeof raw === "object" ? raw : defaultDB();
  const result = {
    version: DB_VERSION,
    updatedAt: Number(source.updatedAt) || 0,
    guilds: {}
  };

  if (source.guilds && typeof source.guilds === "object") {
    for (const [guildId, guild] of Object.entries(source.guilds)) {
      if (/^\d{17,20}$/.test(guildId)) result.guilds[guildId] = normalizeGuild(guild);
    }
  }
  return result;
}

let db;
let dbDirty = false;
let dbSaveTimer = null;

function loadDB() {
  const loaded = loadJSON(DATA_FILE, defaultDB());
  const normalized = normalizeDB(loaded.data);
  if (loaded.recovered) {
    try { atomicWriteJSON(DATA_FILE, normalized); }
    catch (e) { console.error("Nexus: no pude reescribir la copia recuperada:", e.message); }
  }
  return normalized;
}

function saveDBNow(reason) {
  db.updatedAt = Date.now();
  atomicWriteJSON(DATA_FILE, db);
  dbDirty = false;
  if (reason) console.log("Nexus: datos guardados (" + reason + ").");
}

function scheduleSaveDB(reason) {
  dbDirty = true;
  if (dbSaveTimer) return;
  dbSaveTimer = setTimeout(() => {
    dbSaveTimer = null;
    if (!dbDirty) return;
    try { saveDBNow(reason || "debounced"); }
    catch (error) { console.error("Nexus: error guardando datos:", error); }
  }, 350);
}

function saveDB(reason) {
  try {
    if (dbSaveTimer) {
      clearTimeout(dbSaveTimer);
      dbSaveTimer = null;
    }
    saveDBNow(reason || "immediate");
  } catch (error) {
    dbDirty = true;
    console.error("Nexus: error guardando datos:", error);
  }
}

db = loadDB();

const dashboardLoaded = loadJSON(DASHBOARD_FILE, defaultDB());
let dashboardDB = normalizeDB(dashboardLoaded.data);

function saveDashboardDBNow(reason) {
  dashboardDB.updatedAt = Date.now();
  atomicWriteJSON(DASHBOARD_FILE, dashboardDB);
  if (reason) console.log("Nexus: dashboard guardado (" + reason + ").");
}

function getGuild(guildId, store = db) {
  if (!store.guilds[guildId]) store.guilds[guildId] = defaultGuild();
  store.guilds[guildId] = normalizeGuild(store.guilds[guildId]);
  return store.guilds[guildId];
}

function touchConfig(guild) {
  const now = Date.now();
  guild.configVersion = Math.max(now, Number(guild.configVersion || 0) + 1);
  guild.updatedAt = now;
}

function recordActivity(guildId, type, user, details) {
  const g = getGuild(guildId);
  g.activity.unshift({
    type: String(type || "Actividad").slice(0, 80),
    user: String(user || "Sistema").slice(0, 120),
    details: String(details || "").slice(0, 300),
    at: Date.now()
  });
  if (g.activity.length > 500) g.activity.length = 500;
  db.guilds[guildId] = g;
  scheduleSaveDB("actividad");
}

function activityUser(user) {
  if (!user) return "Sistema";
  return user.tag || user.username || user.globalName || user.id || "Usuario";
}

function calculateStats(g) {
  return {
    openTickets: Object.values(g.tickets || {}).filter(t => !t.closed).length,
    warnings: Object.values(g.warnings || {}).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0),
    vouches: Object.values(g.vouches || {}).reduce((n, value) => n + Number(value || 0), 0)
  };
}

function publicGuildConfig(store, guildId) {
  const g = getGuild(guildId, store);
  const localStats = calculateStats(g);
  const snapshot = g.botSnapshot || {};
  return {
    categoryId: g.categoryId,
    staffRoleId: g.staffRoleId,
    logsChannelId: g.logsChannelId,
    vouchChannelId: g.vouchChannelId,
    staffQuestions: g.staffQuestions.slice(0, 20),
    alterQuestions: g.alterQuestions.slice(0, 20),
    configVersion: g.configVersion || 0,
    activity: g.activity.slice(0, 500),
    openTickets: Number.isFinite(Number(snapshot.openTickets)) ? Number(snapshot.openTickets) : localStats.openTickets,
    warnings: Number.isFinite(Number(snapshot.warnings)) ? Number(snapshot.warnings) : localStats.warnings,
    vouchTotal: Number.isFinite(Number(snapshot.vouches)) ? Number(snapshot.vouches) : localStats.vouches,
    serverName: snapshot.serverName || null,
    botOnline: Boolean(snapshot.botOnline),
    lastBotSyncAt: Number(snapshot.syncedAt) || 0
  };
}

async function requestPanelJSON(pathname, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 8000);
  try {
    const response = await fetch(DASHBOARD_URL + pathname, {
      method: options.method || "GET",
      headers: {
        "cache-control": "no-cache",
        ...(options.headers || {})
      },
      body: options.body,
      signal: controller.signal
    });
    const body = await response.text();
    let json = {};
    try { json = body ? JSON.parse(body) : {}; }
    catch { throw new Error("Panel devolvió JSON inválido"); }
    if (!response.ok) throw new Error("Panel HTTP " + response.status + (json.error ? ": " + json.error : ""));
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function buildPanelPayload() {
  const g = getGuild(GUILD_ID);
  const stats = calculateStats(g);
  const guild = client.guilds.cache.get(GUILD_ID);
  return {
    configVersion: g.configVersion || 0,
    categoryId: g.categoryId,
    staffRoleId: g.staffRoleId,
    logsChannelId: g.logsChannelId,
    vouchChannelId: g.vouchChannelId,
    staffQuestions: g.staffQuestions.slice(0, 20),
    alterQuestions: g.alterQuestions.slice(0, 20),
    activity: g.activity.slice(0, 200),
    serverName: guild?.name || "",
    botOnline: Boolean(client.user),
    syncedAt: Date.now(),
    openTickets: stats.openTickets,
    warnings: stats.warnings,
    vouches: stats.vouches
  };
}

let syncInFlight = null;
let lastPanelSyncErrorAt = 0;

async function pushPanelState() {
  if (!PANEL_SYNC_SECRET || !client.isReady()) return false;
  try {
    await requestPanelJSON("/api/sync/" + GUILD_ID, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-panel-sync-secret": PANEL_SYNC_SECRET
      },
      body: JSON.stringify(buildPanelPayload())
    });
    return true;
  } catch (error) {
    const now = Date.now();
    if (now - lastPanelSyncErrorAt > 30000) {
      console.log("Nexus: no pude enviar el estado al panel:", error.message);
      lastPanelSyncErrorAt = now;
    }
    return false;
  }
}

async function syncPanelConfig() {
  if (!DASHBOARD_URL || !PANEL_SYNC_SECRET || !client.isReady()) return false;
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    try {
      const remote = await requestPanelJSON("/api/sync/" + GUILD_ID, {
        headers: { "x-panel-sync-secret": PANEL_SYNC_SECRET }
      });

      const local = getGuild(GUILD_ID);
      const remoteVersion = Math.max(0, Number(remote.configVersion) || 0);
      const localVersion = Math.max(0, Number(local.configVersion) || 0);

      if (remoteVersion > localVersion || localVersion === 0) {
        local.categoryId = sanitizeSnowflake(remote.categoryId);
        local.staffRoleId = sanitizeSnowflake(remote.staffRoleId);
        local.logsChannelId = sanitizeSnowflake(remote.logsChannelId);
        local.vouchChannelId = sanitizeSnowflake(remote.vouchChannelId);
        local.staffQuestions = sanitizeQuestions(remote.staffQuestions, DEFAULT_STAFF_QUESTIONS);
        local.alterQuestions = sanitizeQuestions(remote.alterQuestions, DEFAULT_ALTER_QUESTIONS);
        local.configVersion = remoteVersion;
        local.updatedAt = Date.now();
        db.guilds[GUILD_ID] = local;
        saveDB("configuración del panel");
        console.log("Nexus: configuración del panel aplicada. Versión " + remoteVersion + ".");
      }

      if (localVersion > remoteVersion || remoteVersion === 0) await pushPanelState();
      return true;
    } catch (error) {
      const now = Date.now();
      if (now - lastPanelSyncErrorAt > 30000) {
        console.log("Nexus: sincronización del panel pendiente:", error.message);
        lastPanelSyncErrorAt = now;
      }
      return false;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map(part => {
        const i = part.indexOf("=");
        return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1))];
      })
  );
}

const sessions = new Map();
const panelGates = new Map();

function cleanupDashboardSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}

function cleanupPanelGates() {
  const now = Date.now();
  for (const [id, gate] of panelGates) {
    if (gate.expiresAt <= now) panelGates.delete(id);
  }
}

function panelGateUser(req) {
  cleanupPanelGates();
  const cookies = parseCookies(req);
  const id = cookies.panel_gate;
  if (!id) return null;
  const gate = panelGates.get(id);
  if (!gate || gate.expiresAt <= Date.now()) {
    if (id) panelGates.delete(id);
    return null;
  }
  return gate;
}

function setPanelGateCookie(res, id) {
  res.setHeader(
    "Set-Cookie",
    "panel_gate=" + encodeURIComponent(id) +
      "; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=900"
  );
}

function clearPanelGateCookie(res) {
  res.setHeader("Set-Cookie", "panel_gate=; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=0");
}

function dashboardUser(req) {
  const cookies = parseCookies(req);
  const id = cookies.dash_session;
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  return session;
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === DASHBOARD_URL;
}

function sendJSON(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(body);
}

function redirect(res, location, extraHeaders = {}) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end();
}

async function readBody(req, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let total = 0;

  return new Promise((resolve, reject) => {
    req.on("data", chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Payload demasiado grande."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function requireSession(req, res) {
  const session = dashboardUser(req);
  if (!session) {
    sendJSON(res, 401, { error: "No autenticado" });
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function requireCSRF(req, res, session) {
  if (!isSameOrigin(req) || req.headers["x-csrf-token"] !== session.csrf) {
    sendJSON(res, 403, { error: "Solicitud no autorizada." });
    return false;
  }
  return true;
}

function setSessionCookie(res, id) {
  res.setHeader(
    "Set-Cookie",
    "dash_session=" + encodeURIComponent(id) +
      "; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=" + Math.floor(SESSION_TTL_MS / 1000)
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "dash_session=; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=0");
}

function discordRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? require("node:https") : require("node:http");
    const req = transport.request(
      target,
      {
        method: options.method || "GET",
        headers: options.headers || {},
        timeout: options.timeout || 10000
      },
      response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => body += chunk);
        response.on("end", () => {
          let parsed = {};
          try { parsed = body ? JSON.parse(body) : {}; }
          catch { parsed = { raw: body }; }
          resolve({ status: response.statusCode || 0, body: parsed });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Discord API timeout")));
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function channelMention(id) {
  return id ? "<#" + id + ">" : "No configurado";
}

function roleMention(id) {
  return id ? "<@&" + id + ">" : "No configurado";
}

function isStaff(member) {
  if (!member) return false;
  if (member.roles?.cache?.has(FULL_ACCESS_ROLE_ID)) return true;
  const gd = getGuild(member.guild.id);
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    (gd.staffRoleId ? member.roles.cache.has(gd.staffRoleId) : false);
}

function ticketByChannel(guildId, channelId) {
  return Object.values(getGuild(guildId).tickets).find(t => t.channelId === channelId) || null;
}

function ticketOpenByUser(guildId, userId) {
  return Object.values(getGuild(guildId).tickets).filter(t => t.userId === userId && !t.closed);
}

function ticketPrefix(type) {
  return ({
    support: "soporte",
    rewards: "rewards",
    applications: "postulaciones",
    ally: "ally"
  })[type] || "ticket";
}

async function fetchGuildEmojis(guild) {
  try {
    await guild.emojis.fetch();
  } catch (error) {
    console.log("Nexus: no pude actualizar la lista de emojis:", error.message);
  }
}

function emojiObject(emoji) {
  if (!emoji) return null;
  return { id: emoji.id, name: emoji.name, animated: Boolean(emoji.animated) };
}

function findGuildEmoji(guild, names, fallback) {
  const wanted = names.map(name => String(name).toLowerCase());
  for (const name of wanted) {
    const found = guild.emojis.cache.find(e => e.name?.toLowerCase() === name && e.available !== false);
    if (found) return emojiObject(found);
  }

  for (const name of wanted) {
    const found = guild.emojis.cache.find(e => {
      const current = String(e.name || "").toLowerCase();
      return e.available !== false && (current.includes(name) || name.includes(current));
    });
    if (found) return emojiObject(found);
  }

  return fallback || null;
}

function emojiText(guild, names, fallback) {
  const data = findGuildEmoji(guild, names, fallback);
  return data ? "<" + (data.animated ? "a" : "") + ":" + data.name + ":" + data.id + ">" : "";
}

function panelEmbed(guild) {
  const support = emojiText(guild, ["TestSupporter", "staff_support", "support", "soporte"]);
  const rewards = emojiText(guild, ["RedStar", "reclaim_rewards", "reclaim", "rewards"]);
  const applications = emojiText(guild, ["postulaciones", "postulacion", "staff_application", "application", "apply", "staff"]);
  const ally = emojiText(guild, ["ally", "otros", "other", "owner_ally"]);

  const embed = new EmbedBuilder()
    .setColor(COLOR.purple)
    .setTitle((support || "🎫") + " • Sistema de Tickets")
    .setDescription(
      "🇪🇸 **Español**\n" +
      "¿Necesitas ayuda, quieres reclamar una recompensa o enviar una postulación?\n" +
      "Selecciona la categoría que corresponda.\n\n" +
      "🇬🇧 **English**\n" +
      "Need help, want to claim a reward, or submit an application?\n" +
      "Select the category that matches your request.\n\n" +
      (support || "•") + " **Soporte**  •  " +
      (rewards || "•") + " **Rewards**  •  " +
      (applications || "•") + " **Postulaciones**  •  " +
      (ally || "•") + " **Ally**\n\n" +
      "👇 **Selecciona una categoría para comenzar.**"
    )
    .setFooter({ text: BOT_BRAND + " • Sistema de Tickets" });

  if (TICKET_IMAGE_URL) embed.setImage(TICKET_IMAGE_URL);
  return embed;
}

async function panelComponents(guild) {
  await fetchGuildEmojis(guild);

  const customPool = [...guild.emojis.cache.values()]
    .filter(e => e && e.available !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const used = new Set();

  function take(names, preferred) {
    const found = findGuildEmoji(guild, names, null);
    if (found && guild.emojis.cache.has(found.id)) {
      used.add(found.id);
      return found;
    }
    if (preferred && guild.emojis.cache.has(preferred.id)) {
      used.add(preferred.id);
      return preferred;
    }
    const next = customPool.find(e => !used.has(e.id));
    if (!next) return null;
    used.add(next.id);
    return emojiObject(next);
  }

  // Los 4 botones usan emojis personalizados que existen en este servidor.
  const support = take(["TestSupporter", "staff_support", "support", "soporte"], EMOJIS.support);
  const rewards = take(["RedStar", "reclaim_rewards", "reclaim", "rewards", "comprar", "compra"], EMOJIS.rewards);
  const applications = take(["postulaciones", "postulacion", "staff_application", "application", "apply", "staff"]);
  const ally = take(["ally", "otros", "other", "owner_ally", "reclamos", "reclamo"]);

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("ticket_create")
        .setPlaceholder("Haz una selección • Select a category")
        .addOptions(
          { label: "Soporte", description: "Obtén ayuda del staff.", value: "support", emoji: support },
          { label: "Rewards", description: "Reclama tu recompensa.", value: "rewards", emoji: rewards },
          { label: "Postulaciones", description: "Envía una postulación al equipo.", value: "applications", emoji: applications },
          { label: "Ally", description: "Cualquier otra consulta.", value: "ally", emoji: ally }
        )
    )
  ];
}

function ticketButtons(closed) {
  if (closed) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_reopen").setLabel("Reabrir").setEmoji("🔓").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("ticket_transcript").setLabel("Transcript").setEmoji("📄").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ticket_delete").setLabel("Eliminar").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
    );
  }

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Cerrar ticket")
      .setEmoji({ id: "1557199596382584842", name: "demongirl" })
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel("Reclamar")
      .setEmoji({ id: "1557199346141761687", name: "pentagram", animated: true })
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ticket_transcript")
      .setLabel("Transcript")
      .setEmoji("📄")
      .setStyle(ButtonStyle.Secondary)
  );
}

function welcomeEmbed(user, type) {
  const names = { support: "Soporte", rewards: "Rewards", applications: "Postulaciones", ally: "Ally" };
  return new EmbedBuilder()
    .setColor(COLOR.purple)
    .setTitle("🎫 Ticket • " + (names[type] || type))
    .setDescription(
      "Hola " + user + ", gracias por abrir tu ticket.\n\n" +
      "📌 **Categoría:** " + (names[type] || type) + "\n" +
      "📝 Explica tu solicitud con el mayor detalle posible.\n\n" +
      "Un miembro del Staff Team te atenderá en cuanto pueda."
    )
    .setFooter({ text: BOT_BRAND + " • Sistema de Tickets" })
    .setTimestamp();
}

async function sendLog(guild, embed) {
  const id = getGuild(guild.id).logsChannelId;
  if (!id) return;
  const channel = await guild.channels.fetch(id).catch(() => null);
  if (channel?.isTextBased()) await channel.send({ embeds: [embed] }).catch(() => {});
}

function uniquePermissionOverwrites(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

const ticketCreationLocks = new Set();

async function createTicket(guild, user, type) {
  if (!guild || !user) return { error: "Datos de ticket inválidos." };
  const lockKey = guild.id + ":" + user.id;
  if (ticketCreationLocks.has(lockKey)) return { busy: true };

  ticketCreationLocks.add(lockKey);
  try {
    const gd = getGuild(guild.id);
    const open = ticketOpenByUser(guild.id, user.id);

    for (const existing of open) {
      const exists = await guild.channels.fetch(existing.channelId).catch(() => null);
      if (!exists) {
        delete gd.tickets[existing.channelId];
        scheduleSaveDB("limpieza de ticket huérfano");
      }
    }

    const openAfterCleanup = ticketOpenByUser(guild.id, user.id);
    if (openAfterCleanup.length >= 2) {
      return { limit: true, channelIds: openAfterCleanup.map(t => t.channelId) };
    }

    const category = gd.categoryId ? await guild.channels.fetch(gd.categoryId).catch(() => null) : null;
    const staffRole = gd.staffRoleId ? guild.roles.cache.get(gd.staffRoleId) : null;
    const staffTeam = guild.roles.cache.get(STAFF_TEAM_ROLE_ID);
    const rewardRole = guild.roles.cache.get(REWARD_ROLE_ID);
    const fullAccess = guild.roles.cache.get(FULL_ACCESS_ROLE_ID);

    const username = String(user.username || "usuario").toLowerCase().replace(/[^a-z0-9-_]/g, "");
    const safeUser = username.slice(0, 22) || "usuario";
    const prefix = ticketPrefix(type);
    let channelName = prefix + "-" + safeUser;
    let suffix = 2;
    while (guild.channels.cache.some(ch => ch.name === channelName)) {
      channelName = (prefix + "-" + safeUser).slice(0, 95) + "-" + suffix++;
      if (suffix > 20) break;
    }

    const overwrites = uniquePermissionOverwrites([
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      },
      ...(staffRole ? [{
        id: staffRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      }] : []),
      ...(staffTeam ? [{
        id: staffTeam.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      }] : []),
      ...(type === "rewards" && rewardRole ? [{
        id: rewardRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      }] : []),
      ...(fullAccess ? [{
        id: fullAccess.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageChannels
        ]
      }] : [])
    ]);

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.type === ChannelType.GuildCategory ? category.id : undefined,
      topic: "Ticket de " + user.tag + " • " + type,
      permissionOverwrites: overwrites
    });

    gd.tickets[channel.id] = {
      channelId: channel.id,
      userId: user.id,
      type,
      closed: false,
      claimedBy: null,
      createdAt: Date.now(),
      closedAt: 0
    };
    db.guilds[guild.id] = gd;
    saveDB("ticket creado");

    const mentions = [user.toString(), "<@&" + STAFF_TEAM_ROLE_ID + ">"];
    if (type === "rewards") mentions.push("<@&" + REWARD_ROLE_ID + ">");

    try {
      await channel.send({
        content: mentions.join(" "),
        embeds: [welcomeEmbed(user, type)],
        components: [ticketButtons(false)]
      });
    } catch (error) {
      delete gd.tickets[channel.id];
      saveDB("rollback de ticket");
      await channel.delete().catch(() => {});
      throw new Error("No pude enviar el mensaje inicial del ticket: " + error.message);
    }

    await sendLog(
      guild,
      new EmbedBuilder()
        .setColor(COLOR.green)
        .setTitle("🎫 Ticket creado")
        .setDescription(
          "**Usuario:** " + user + "\n" +
          "**Canal:** " + channel + "\n" +
          "**Categoría:** " + type
        )
        .setTimestamp()
    );

    recordActivity(guild.id, "Ticket creado", activityUser(user), "#" + channel.name + " • " + type);
    return { channel };
  } finally {
    ticketCreationLocks.delete(lockKey);
  }
}

async function makeTranscript(channel) {
  const messages = [];
  let before;

  for (let page = 0; page < 20; page++) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    }).catch(() => null);

    if (!batch?.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  messages.reverse();
  const lines = messages.map(message => {
    const files = [...message.attachments.values()].map(a => a.url).join(" ");
    const content = String(message.content || "").replace(/\r?\n/g, " ");
    return "[" + new Date(message.createdTimestamp).toISOString() + "] " +
      message.author.tag + ": " + content + (files ? " " + files : "");
  });

  return Buffer.from(lines.join("\n") || "Sin mensajes.", "utf8");
}

async function closeTicket(channel, actor) {
  const ticket = ticketByChannel(channel.guild.id, channel.id);
  if (!ticket) return false;

  ticket.closed = true;
  ticket.closedAt = Date.now();
  saveDB("ticket cerrado");

  await channel.permissionOverwrites.edit(ticket.userId, {
    ViewChannel: false,
    SendMessages: false
  }).catch(() => {});

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR.red)
        .setTitle("🔒 Ticket cerrado")
        .setDescription("Cerrado por " + actor + ". Puedes usar **Reabrir** si necesitas volver a abrirlo.")
        .setTimestamp()
    ],
    components: [ticketButtons(true)]
  }).catch(() => {});

  await sendLog(
    channel.guild,
    new EmbedBuilder()
      .setColor(COLOR.red)
      .setTitle("🔒 Ticket cerrado")
      .setDescription("**Canal:** " + channel + "\n**Por:** " + actor)
      .setTimestamp()
  );

  recordActivity(channel.guild.id, "Ticket cerrado", activityUser(actor), "#" + channel.name);
  return true;
}

async function reopenTicket(channel, actor) {
  const ticket = ticketByChannel(channel.guild.id, channel.id);
  if (!ticket) return false;

  ticket.closed = false;
  ticket.closedAt = 0;
  saveDB("ticket reabierto");

  await channel.permissionOverwrites.edit(ticket.userId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true
  }).catch(() => {});

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR.green)
        .setTitle("🔓 Ticket reabierto")
        .setDescription("Reabierto por " + actor + ".")
        .setTimestamp()
    ],
    components: [ticketButtons(false)]
  }).catch(() => {});

  await sendLog(
    channel.guild,
    new EmbedBuilder()
      .setColor(COLOR.green)
      .setTitle("🔓 Ticket reabierto")
      .setDescription("**Canal:** " + channel + "\n**Por:** " + actor)
      .setTimestamp()
  );

  recordActivity(channel.guild.id, "Ticket reabierto", activityUser(actor), "#" + channel.name);
  return true;
}

const commands = [
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Sistema completo de tickets.")
    .addSubcommand(s => s
      .setName("panel")
      .setDescription("Publica el panel de tickets.")
      .addChannelOption(o => o
        .setName("canal")
        .setDescription("Canal donde se publicará.")
        .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s
      .setName("setup")
      .setDescription("Configura categoría, staff y logs.")
      .addChannelOption(o => o
        .setName("categoria")
        .setDescription("Categoría de tickets.")
        .addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption(o => o.setName("staff").setDescription("Rol que verá los tickets."))
      .addChannelOption(o => o
        .setName("logs")
        .setDescription("Canal de logs.")
        .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName("close").setDescription("Cierra el ticket actual."))
    .addSubcommand(s => s.setName("reopen").setDescription("Reabre el ticket actual."))
    .addSubcommand(s => s.setName("delete").setDescription("Elimina el ticket actual."))
    .addSubcommand(s => s.setName("claim").setDescription("Reclama el ticket actual."))
    .addSubcommand(s => s.setName("unclaim").setDescription("Libera el ticket actual."))
    .addSubcommand(s => s
      .setName("add")
      .setDescription("Añade un usuario al ticket.")
      .addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)))
    .addSubcommand(s => s
      .setName("remove")
      .setDescription("Quita un usuario del ticket.")
      .addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)))
    .addSubcommand(s => s
      .setName("rename")
      .setDescription("Cambia el nombre del ticket.")
      .addStringOption(o => o.setName("nombre").setDescription("Nuevo nombre.").setRequired(true)))
    .addSubcommand(s => s.setName("transcript").setDescription("Genera un transcript."))
    .addSubcommand(s => s.setName("list").setDescription("Muestra los tickets abiertos.")),

  new SlashCommandBuilder()
    .setName("modlog")
    .setDescription("Configura los logs de moderación.")
    .addSubcommand(s => s
      .setName("set")
      .setDescription("Configura el canal.")
      .addChannelOption(o => o
        .setName("canal")
        .setDescription("Canal de logs.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)))
    .addSubcommand(s => s.setName("off").setDescription("Desactiva los logs.")),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Banea a un usuario.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true))
    .addStringOption(o => o.setName("razon").setDescription("Razón.")),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Quita el ban.")
    .addStringOption(o => o.setName("usuario").setDescription("ID.").setRequired(true)),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsa a un usuario.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true))
    .addStringOption(o => o.setName("razon").setDescription("Razón.")),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Aplica timeout.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true))
    .addIntegerOption(o => o
      .setName("minutos")
      .setDescription("Minutos.")
      .setMinValue(1)
      .setMaxValue(40320)
      .setRequired(true))
    .addStringOption(o => o.setName("razon").setDescription("Razón.")),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Quita el timeout.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Advierte a un usuario.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true))
    .addStringOption(o => o.setName("razon").setDescription("Razón.").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Muestra las advertencias.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)),

  new SlashCommandBuilder()
    .setName("clearwarns")
    .setDescription("Borra las advertencias.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Borra mensajes.")
    .addIntegerOption(o => o
      .setName("cantidad")
      .setDescription("Cantidad.")
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true)),

  new SlashCommandBuilder().setName("lock").setDescription("Bloquea el canal."),
  new SlashCommandBuilder().setName("unlock").setDescription("Desbloquea el canal."),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Configura slowmode.")
    .addIntegerOption(o => o
      .setName("segundos")
      .setDescription("Segundos.")
      .setMinValue(0)
      .setMaxValue(21600)
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName("nick")
    .setDescription("Cambia un apodo.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true))
    .addStringOption(o => o.setName("nombre").setDescription("Nuevo apodo.").setRequired(true)),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Muestra información de un usuario.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario.")),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Muestra información del servidor."),

  new SlashCommandBuilder()
    .setName("post-alter")
    .setDescription("Publica el formulario para postularse como Alter."),

  new SlashCommandBuilder()
    .setName("post-staff")
    .setDescription("Publica el formulario para postularse como Helper."),

  new SlashCommandBuilder()
    .setName("vouch")
    .setDescription("Añade un vouch a un usuario.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario que recibe el vouch.").setRequired(true))
    .addStringOption(o => o.setName("mensaje").setDescription("Mensaje del vouch.").setRequired(true))
,
  new SlashCommandBuilder()
    .setName("emoji")
    .setDescription("Gestiona emojis personalizados del servidor.")
    .addSubcommand(s => s.setName("lista").setDescription("Muestra los emojis personalizados por categoría."))
    .addSubcommand(s => s
      .setName("crear")
      .setDescription("Crea un emoji personalizado desde una imagen.")
      .addStringOption(o => o.setName("nombre").setDescription("Nombre del emoji.").setRequired(true))
      .addStringOption(o => o.setName("categoria").setDescription("Tipo de emoji.").setRequired(true)
        .addChoices(
          { name: "Staff", value: "staff" },
          { name: "Moderación", value: "moderacion" },
          { name: "Owner", value: "owner" },
          { name: "Reclaim", value: "reclaim" },
          { name: "General", value: "general" }
        ))
      .addAttachmentOption(o => o.setName("imagen").setDescription("Imagen del emoji.").setRequired(true)))
    .addSubcommand(s => s
      .setName("borrar")
      .setDescription("Elimina un emoji personalizado.")
      .addStringOption(o => o.setName("id").setDescription("ID del emoji.").setRequired(true)))
].map(c => c.toJSON());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel]
});

const DASHBOARD_COMMANDS = commands.map(command => ({
  name: command.name,
  description: command.description || "",
  options: (command.options || []).map(option => ({
    name: option.name,
    description: option.description || "",
    type: option.type,
    options: (option.options || []).map(sub => ({
      name: sub.name,
      description: sub.description || ""
    }))
  }))
}));

async function registerCommands() {
  if (!TOKEN) return;
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const result = await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log(
    "Nexus: comandos registrados:",
    Array.isArray(result) ? result.map(c => c.name).join(", ") : "OK"
  );
}

function renderQuestions(questions) {
  const items = [];
  let length = 0;
  for (let i = 0; i < questions.length; i++) {
    const chunk = "**" + (i + 1) + ". " + questions[i] + "**\n> ✏️ Respuesta:\n\n";
    if (length + chunk.length > 3600) break;
    items.push(chunk);
    length += chunk.length;
  }
  return items.join("");
}

async function handleTicket(interaction) {
  const sub = interaction.options.getSubcommand();
  const gd = getGuild(interaction.guild.id);
  const channel = interaction.channel;
  const ticket = channel ? ticketByChannel(interaction.guild.id, channel.id) : null;

  if (sub === "panel") {
    if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Necesitas permisos de Staff.", ephemeral: true });
    await fetchGuildEmojis(interaction.guild);
    const target = interaction.options.getChannel("canal") || channel;
    if (!target?.isTextBased()) return interaction.reply({ content: "❌ Ese canal no admite mensajes.", ephemeral: true });
    await target.send({ embeds: [panelEmbed(interaction.guild)], components: await panelComponents(interaction.guild) });
    return interaction.reply({ content: "✅ Panel enviado en " + target + ".", ephemeral: true });
  }

  if (sub === "setup") {
    if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Necesitas permisos de Staff.", ephemeral: true });

    const category = interaction.options.getChannel("categoria");
    const staff = interaction.options.getRole("staff");
    const logs = interaction.options.getChannel("logs");

    if (category) gd.categoryId = sanitizeSnowflake(category.id);
    if (staff) gd.staffRoleId = sanitizeSnowflake(staff.id);
    if (logs) gd.logsChannelId = sanitizeSnowflake(logs.id);

    touchConfig(gd);
    db.guilds[interaction.guild.id] = gd;
    saveDB("ticket setup");
    await pushPanelState();

    return interaction.reply({
      content:
        "⚙️ **Configuración actualizada**\n" +
        "Categoría: " + channelMention(gd.categoryId) + "\n" +
        "Staff: " + roleMention(gd.staffRoleId) + "\n" +
        "Logs: " + channelMention(gd.logsChannelId),
      ephemeral: true
    });
  }

  if (sub === "list") {
    if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Necesitas permisos de Staff.", ephemeral: true });
    const open = Object.values(gd.tickets).filter(t => !t.closed);
    const description = open.length
      ? open.map(t => "<#" + t.channelId + "> • <@" + t.userId + "> • " + t.type).join("\n")
      : "📭 No hay tickets abiertos.";
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.purple).setTitle("🎫 Tickets abiertos").setDescription(description)],
      ephemeral: true
    });
  }

  if (!ticket) return interaction.reply({ content: "❌ Este canal no es un ticket.", ephemeral: true });
  if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo el Staff puede usar esta acción.", ephemeral: true });

  if (sub === "close") {
    await closeTicket(channel, interaction.user);
    return interaction.reply({ content: "🔒 Ticket cerrado.", ephemeral: true });
  }

  if (sub === "reopen") {
    await reopenTicket(channel, interaction.user);
    return interaction.reply({ content: "🔓 Ticket reabierto.", ephemeral: true });
  }

  if (sub === "claim") {
    ticket.claimedBy = interaction.user.id;
    saveDB("ticket reclamado");
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.blue)
          .setTitle("🙋 Ticket reclamado")
          .setDescription("Atendido por <@" + interaction.user.id + ">.")
      ]
    }).catch(() => {});
    await sendLog(
      interaction.guild,
      new EmbedBuilder().setColor(COLOR.blue).setTitle("🙋 Ticket reclamado")
        .setDescription("**Canal:** " + channel + "\n**Staff:** " + interaction.user)
        .setTimestamp()
    );
    return interaction.reply({ content: "🙋 Ticket reclamado.", ephemeral: true });
  }

  if (sub === "unclaim") {
    ticket.claimedBy = null;
    saveDB("ticket liberado");
    return interaction.reply({ content: "✅ Ticket liberado.", ephemeral: true });
  }

  if (sub === "add") {
    const user = interaction.options.getUser("usuario", true);
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true
    });
    return interaction.reply({ content: "✅ " + user + " fue añadido.", ephemeral: true });
  }

  if (sub === "remove") {
    const user = interaction.options.getUser("usuario", true);
    if (user.id === ticket.userId) return interaction.reply({ content: "❌ No puedes quitar al creador original del ticket.", ephemeral: true });
    await channel.permissionOverwrites.delete(user.id).catch(() => {});
    return interaction.reply({ content: "✅ " + user + " fue retirado.", ephemeral: true });
  }

  if (sub === "rename") {
    const nameValue = interaction.options.getString("nombre", true)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 90);

    if (!nameValue) return interaction.reply({ content: "❌ Nombre inválido.", ephemeral: true });
    await channel.setName(nameValue);
    recordActivity(interaction.guild.id, "Ticket renombrado", activityUser(interaction.user), "#" + nameValue);
    return interaction.reply({ content: "✅ Ticket renombrado.", ephemeral: true });
  }

  if (sub === "transcript") {
    const file = new AttachmentBuilder(await makeTranscript(channel), { name: "transcript-" + channel.id + ".txt" });
    const logs = gd.logsChannelId
      ? await interaction.guild.channels.fetch(gd.logsChannelId).catch(() => null)
      : null;

    if (logs?.isTextBased()) {
      await logs.send({
        content: "📄 Transcript de " + channel + " generado por " + interaction.user + ".",
        files: [file]
      });
      return interaction.reply({ content: "📄 Transcript enviado a logs.", ephemeral: true });
    }

    return interaction.reply({ content: "📄 Transcript generado:", files: [file], ephemeral: true });
  }

  if (sub === "delete") {
    await interaction.reply({ content: "🗑️ Eliminando ticket...", ephemeral: true });
    delete gd.tickets[ticket.channelId];
    saveDB("ticket eliminado");
    recordActivity(interaction.guild.id, "Ticket eliminado", activityUser(interaction.user), "#" + channel.name);
    await sendLog(
      interaction.guild,
      new EmbedBuilder().setColor(COLOR.red).setTitle("🗑️ Ticket eliminado")
        .setDescription("**Canal:** " + channel + "\n**Por:** " + interaction.user)
        .setTimestamp()
    );
    setTimeout(() => channel.delete().catch(() => {}), 1000);
  }
}

function canModerateTarget(actor, target) {
  if (!actor || !target) return false;
  if (target.id === actor.id) return false;
  if (target.id === client.user?.id) return false;
  return target.manageable;
}

function moderatorReason(interaction) {
  return (interaction.options.getString("razon")?.trim().slice(0, 500)) || "Sin razón indicada";
}

function safeEmbedText(text, max = 4000) {
  return String(text || "").slice(0, max);
}

client.once("ready", async () => {
  console.log("Nexus: conectado como " + client.user.tag + ".");
  client.user.setActivity("Nexus • /ticket panel", { type: 0 });

  try { await registerCommands(); }
  catch (error) { console.error("Nexus: error registrando comandos:", error); }

  await syncPanelConfig();
  await pushPanelState();

  clearInterval(globalThis.__panelSyncTimer);
  globalThis.__panelSyncTimer = setInterval(() => syncPanelConfig().catch(() => {}), 3000);

  clearInterval(globalThis.__panelPushTimer);
  globalThis.__panelPushTimer = setInterval(() => pushPanelState().catch(() => {}), 5000);
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.guild?.id === GUILD_ID && interaction.isChatInputCommand()) {
      const sub = interaction.options?.getSubcommand(false);
      recordActivity(
        interaction.guild.id,
        "Comando",
        activityUser(interaction.user),
        "/" + interaction.commandName + (sub ? " " + sub : "")
      );
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_create") {
      if (!interaction.guild) return;
      await interaction.deferReply({ ephemeral: true });
      const result = await createTicket(interaction.guild, interaction.user, interaction.values[0]);

      if (result.busy) return interaction.editReply("⏳ Ya se está creando uno de tus tickets. Espera un momento.");
      if (result.limit) {
        const current = result.channelIds.map(id => "<#" + id + ">").join(", ");
        return interaction.editReply("⚠️ Has alcanzado el límite de **2 tickets abiertos**.\nActuales: " + (current || "ninguno"));
      }
      if (result.error) return interaction.editReply("❌ " + result.error);
      return interaction.editReply("✅ Ticket creado: " + result.channel);
    }

    if (interaction.isButton() && interaction.customId.startsWith("ticket_")) {
      if (!interaction.guild || !interaction.channel) return;
      const ticket = ticketByChannel(interaction.guild.id, interaction.channel.id);
      if (!ticket) return interaction.reply({ content: "❌ Este canal no es un ticket.", ephemeral: true });

      if (interaction.customId === "ticket_close") {
        if (!isStaff(interaction.member) && interaction.user.id !== ticket.userId) {
          return interaction.reply({ content: "❌ No puedes cerrar este ticket.", ephemeral: true });
        }

        await interaction.reply({ content: "🔒 Ticket cerrado. Se eliminará en 5 segundos.", ephemeral: true });

        setTimeout(async () => {
          try {
            const gd = getGuild(interaction.guild.id);
            if (gd.tickets[interaction.channel.id]) {
              delete gd.tickets[interaction.channel.id];
              saveDB("cierre con botón");
            }
            await sendLog(
              interaction.guild,
              new EmbedBuilder().setColor(COLOR.red).setTitle("🔒 Ticket eliminado tras cerrar")
                .setDescription("**Canal:** <#" + interaction.channel.id + ">\n**Por:** " + interaction.user)
                .setTimestamp()
            );
            recordActivity(interaction.guild.id, "Ticket eliminado", activityUser(interaction.user), "Cierre automático tras 5 segundos");
            await interaction.channel.delete().catch(() => {});
          } catch (error) {
            console.error("Nexus: error cerrando ticket con botón:", error);
          }
        }, 5000);
        return;
      }

      if (interaction.customId === "ticket_reopen") {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo Staff.", ephemeral: true });
        await reopenTicket(interaction.channel, interaction.user);
        return interaction.reply({ content: "🔓 Ticket reabierto.", ephemeral: true });
      }

      if (interaction.customId === "ticket_claim") {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo Staff.", ephemeral: true });
        ticket.claimedBy = interaction.user.id;
        saveDB("ticket reclamado");
        await interaction.channel.send({
          embeds: [
            new EmbedBuilder().setColor(COLOR.blue).setTitle("🙋 Ticket reclamado")
              .setDescription("Atendido por <@" + interaction.user.id + ">.")
          ]
        }).catch(() => {});
        return interaction.reply({ content: "🙋 Ticket reclamado.", ephemeral: true });
      }

      if (interaction.customId === "ticket_transcript") {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo Staff.", ephemeral: true });
        const file = new AttachmentBuilder(await makeTranscript(interaction.channel), {
          name: "transcript-" + interaction.channel.id + ".txt"
        });
        const gd = getGuild(interaction.guild.id);
        const logs = gd.logsChannelId
          ? await interaction.guild.channels.fetch(gd.logsChannelId).catch(() => null)
          : null;

        if (logs?.isTextBased()) {
          await logs.send({
            content: "📄 Transcript de " + interaction.channel + " generado por " + interaction.user + ".",
            files: [file]
          });
          return interaction.reply({ content: "📄 Transcript enviado a logs.", ephemeral: true });
        }
        return interaction.reply({ content: "📄 Transcript:", files: [file], ephemeral: true });
      }

      if (interaction.customId === "ticket_delete") {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo Staff.", ephemeral: true });
        await interaction.reply({ content: "🗑️ Eliminando ticket...", ephemeral: true });
        const gd = getGuild(interaction.guild.id);
        delete gd.tickets[ticket.channelId];
        saveDB("ticket eliminado por botón");
        await sendLog(
          interaction.guild,
          new EmbedBuilder().setColor(COLOR.red).setTitle("🗑️ Ticket eliminado")
            .setDescription("**Canal:** " + interaction.channel + "\n**Por:** " + interaction.user)
            .setTimestamp()
        );
        setTimeout(() => interaction.channel.delete().catch(() => {}), 1000);
        return;
      }
    }

    if (!interaction.isChatInputCommand() || !interaction.guild) return;
    const name = interaction.commandName;

    if (name === "ticket") return handleTicket(interaction);

    if (name === "modlog") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Necesitas permisos de Staff.", ephemeral: true });
      const gd = getGuild(interaction.guild.id);
      if (interaction.options.getSubcommand() === "set") {
        gd.logsChannelId = sanitizeSnowflake(interaction.options.getChannel("canal", true).id);
        touchConfig(gd);
        db.guilds[interaction.guild.id] = gd;
        saveDB("modlog set");
        await pushPanelState();
        return interaction.reply({ content: "✅ Logs configurados.", ephemeral: true });
      }
      gd.logsChannelId = null;
      touchConfig(gd);
      db.guilds[interaction.guild.id] = gd;
      saveDB("modlog off");
      await pushPanelState();
      return interaction.reply({ content: "✅ Logs desactivados.", ephemeral: true });
    }

    if (name === "vouch") {
      const user = interaction.options.getUser("usuario", true);
      const message = safeEmbedText(interaction.options.getString("mensaje", true).trim(), 1000);
      const gd = getGuild(interaction.guild.id);

      if (gd.vouchChannelId && interaction.channelId !== gd.vouchChannelId) {
        return interaction.reply({
          content: "❌ El comando /vouch solo está permitido en <#" + gd.vouchChannelId + ">.",
          ephemeral: true
        });
      }
      if (!message) return interaction.reply({ content: "❌ El mensaje no puede estar vacío.", ephemeral: true });

      const count = Number(gd.vouches[user.id] || 0) + 1;
      gd.vouches[user.id] = count;
      db.guilds[interaction.guild.id] = gd;
      saveDB("vouch");

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      let nicknameUpdated = false;

      if (member?.manageable) {
        const current = String(member.nickname || member.user.globalName || member.user.username || "").trim();
        const base = current.replace(/\s*\d+V\s*$/i, "").trim();
        const newNickname = (base + " " + count + "V").trim().slice(0, 32);
        if (newNickname && newNickname !== current) {
          await member.setNickname(newNickname, "Vouch recibido").then(() => { nicknameUpdated = true; }).catch(() => {});
        }
      }

      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.green).setTitle("⭐ Vouch recibido")
          .setDescription(
            "**Usuario:** " + user + "\n" +
            "**Vouch:** " + count + "V\n" +
            "**Por:** " + interaction.user + "\n" +
            "**Mensaje:** " + message
          )
          .setTimestamp()
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder().setColor(COLOR.green).setTitle("⭐ Vouch recibido")
            .setDescription(
              "**Usuario:** " + user + "\n" +
              "**Vouch:** " + count + "V\n" +
              "**Mensaje:** " + message +
              (nicknameUpdated ? "\n\nNombre actualizado con **" + count + "V**." : "")
            )
            .setTimestamp()
        ]
      });
    }

    if (name === "emoji") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageEmojisAndStickers)) {
        return interaction.reply({ content: "❌ Necesitas **Gestionar expresiones** para usar este comando.", ephemeral: true });
      }

      const sub = interaction.options.getSubcommand();
      if (sub === "lista") {
        const emojis = [...interaction.guild.emojis.cache.values()];
        if (!emojis.length) return interaction.reply({ content: "📦 Este servidor no tiene emojis personalizados.", ephemeral: true });
        const groups = { staff: [], moderacion: [], owner: [], reclaim: [], general: [] };
        for (const e of emojis) {
          const n = e.name || "sin_nombre";
          const key = n.toLowerCase();
          const group = key.startsWith("staff_") ? "staff"
            : key.startsWith("mod_") || key.startsWith("moderacion_") ? "moderacion"
            : key.startsWith("owner_") ? "owner"
            : key.startsWith("reclaim_") ? "reclaim"
            : "general";
          groups[group].push(e);
        }
        const lines = [
          "🛡️ **STAFF:** " + (groups.staff.map(e => e.toString() + " `" + e.name + "`").join("  ") || "—"),
          "🔨 **MODERACIÓN:** " + (groups.moderacion.map(e => e.toString() + " `" + e.name + "`").join("  ") || "—"),
          "👑 **OWNER:** " + (groups.owner.map(e => e.toString() + " `" + e.name + "`").join("  ") || "—"),
          "🎟️ **RECLAIM:** " + (groups.reclaim.map(e => e.toString() + " `" + e.name + "`").join("  ") || "—"),
          "✨ **GENERAL:** " + (groups.general.map(e => e.toString() + " `" + e.name + "`").join("  ") || "—")
        ];
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLOR.purple).setTitle("✨ Emojis personalizados").setDescription(lines.join("\n\n")).setFooter({ text: BOT_BRAND + " • Emoji Manager" })]
        });
      }

      if (sub === "crear") {
        const rawName = interaction.options.getString("nombre", true).toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32);
        const categoria = interaction.options.getString("categoria", true);
        const image = interaction.options.getAttachment("imagen", true);
        if (!image.contentType?.startsWith("image/")) return interaction.reply({ content: "❌ La imagen debe ser PNG, JPG, GIF o WebP.", ephemeral: true });
        const prefix = { staff: "staff", moderacion: "mod", owner: "owner", reclaim: "reclaim", general: "emoji" }[categoria] || "emoji";
        const name = (prefix + "_" + rawName).slice(0, 32);
        try {
          const created = await interaction.guild.emojis.create({ attachment: image.url, name, reason: "Creado por " + interaction.user.tag });
          return interaction.reply("✨ Emoji creado: " + created.toString() + " **" + created.name + "**");
        } catch (error) {
          return interaction.reply({ content: "❌ No pude crear el emoji. Revisa el límite de emojis y los permisos del bot.", ephemeral: true });
        }
      }

      if (sub === "borrar") {
        const id = interaction.options.getString("id", true).trim();
        const emoji = interaction.guild.emojis.cache.get(id);
        if (!emoji) return interaction.reply({ content: "❌ No encontré ese emoji en este servidor.", ephemeral: true });
        await emoji.delete("Eliminado por " + interaction.user.tag);
        return interaction.reply("🗑️ Emoji eliminado correctamente.");
      }
    }

    if (name === "post-staff") {
      await syncPanelConfig();
      const questions = getGuild(interaction.guild.id).staffQuestions.length
        ? getGuild(interaction.guild.id).staffQuestions
        : DEFAULT_STAFF_QUESTIONS;

      const description =
        "**📋 Responde las preguntas en orden.**\n" +
        "Copia el número de cada pregunta y escribe tu respuesta debajo.\n\n" +
        renderQuestions(questions) +
        "📌 **Buscamos personas activas, responsables, respetuosas y comprometidas con la comunidad.**\n\n" +
        POST_STAFF_NOTIFY_ROLE_IDS.map(id => "<@&" + id + ">").join(" ");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.purple)
            .setTitle("🛡️ FORMULARIO — POSTULACIÓN A HELPER")
            .setDescription(description)
            .setFooter({ text: BOT_BRAND + " • Postulación a Helper" })
            .setTimestamp()
        ]
      });
    }

    if (name === "post-alter") {
      await syncPanelConfig();
      const questions = getGuild(interaction.guild.id).alterQuestions.length
        ? getGuild(interaction.guild.id).alterQuestions
        : DEFAULT_ALTER_QUESTIONS;

      const description =
        "**📋 Responde las preguntas en orden.**\n" +
        "Copia el número de cada pregunta y escribe tu respuesta debajo.\n\n" +
        renderQuestions(questions);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.purple)
            .setTitle("🎁 FORMULARIO — POSTULACIÓN A ALTER")
            .setDescription(description)
            .setFooter({ text: BOT_BRAND + " • Postulación a Alter" })
            .setTimestamp()
        ]
      });
    }

    if (name === "userinfo") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.purple)
            .setTitle("👤 Información de usuario")
            .setThumbnail(user.displayAvatarURL({ size: 256 }))
            .addFields(
              { name: "Usuario", value: safeEmbedText(user.tag, 1024), inline: true },
              { name: "ID", value: user.id, inline: true },
              { name: "Cuenta", value: "<t:" + Math.floor(user.createdTimestamp / 1000) + ":R>", inline: true },
              {
                name: "Entrada",
                value: member?.joinedTimestamp ? "<t:" + Math.floor(member.joinedTimestamp / 1000) + ":R>" : "Desconocida",
                inline: true
              }
            )
        ]
      });
    }

    if (name === "serverinfo") {
      const guild = interaction.guild;
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.purple)
            .setTitle("🏠 Información del servidor")
            .addFields(
              { name: "Nombre", value: safeEmbedText(guild.name, 1024), inline: true },
              { name: "ID", value: guild.id, inline: true },
              { name: "Miembros", value: String(guild.memberCount || 0), inline: true },
              { name: "Canales", value: String(guild.channels.cache.size), inline: true },
              { name: "Roles", value: String(guild.roles.cache.size), inline: true }
            )
        ]
      });
    }

    if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ No tienes permisos para usar este comando.", ephemeral: true });

    if (name === "ban") {
      const user = interaction.options.getUser("usuario", true);
      const reason = moderatorReason(interaction);
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (target && target.id === interaction.user.id) return interaction.reply({ content: "❌ No puedes banearte a ti mismo.", ephemeral: true });
      if (target && !target.bannable) return interaction.reply({ content: "❌ No puedo banear a ese usuario por la jerarquía.", ephemeral: true });

      await interaction.guild.members.ban(user.id, { reason });
      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.red).setTitle("🔨 Usuario baneado")
          .setDescription("**Usuario:** " + user + "\n**Moderador:** " + interaction.user + "\n**Razón:** " + reason)
          .setTimestamp()
      );
      return interaction.reply("🔨 " + user.tag + " fue baneado.");
    }

    if (name === "unban") {
      const id = interaction.options.getString("usuario", true).trim();
      if (!/^\d{17,20}$/.test(id)) return interaction.reply({ content: "❌ ID de usuario inválida.", ephemeral: true });
      await interaction.guild.members.unban(id, "Ban retirado por " + interaction.user.tag);
      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.green).setTitle("✅ Ban retirado")
          .setDescription("**Usuario ID:** " + id + "\n**Moderador:** " + interaction.user)
          .setTimestamp()
      );
      return interaction.reply("✅ Ban retirado para " + id + ".");
    }

    if (name === "kick") {
      const user = interaction.options.getUser("usuario", true);
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: "❌ No encontré a ese miembro.", ephemeral: true });
      if (!canModerateTarget(interaction.member, target) || !target.kickable) {
        return interaction.reply({ content: "❌ No puedo expulsar a ese usuario por la jerarquía.", ephemeral: true });
      }
      const reason = moderatorReason(interaction);
      await target.kick(reason);
      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.orange).setTitle("👢 Usuario expulsado")
          .setDescription("**Usuario:** " + user + "\n**Moderador:** " + interaction.user + "\n**Razón:** " + reason)
          .setTimestamp()
      );
      return interaction.reply("👢 " + user.tag + " fue expulsado.");
    }

    if (name === "timeout") {
      const user = interaction.options.getUser("usuario", true);
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: "❌ No encontré a ese miembro.", ephemeral: true });
      if (!canModerateTarget(interaction.member, target) || !target.moderatable) {
        return interaction.reply({ content: "❌ No puedo aplicar timeout a ese usuario por la jerarquía.", ephemeral: true });
      }
      const minutes = interaction.options.getInteger("minutos", true);
      const reason = moderatorReason(interaction);
      await target.timeout(minutes * 60000, reason);
      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.orange).setTitle("⏳ Timeout aplicado")
          .setDescription("**Usuario:** " + user + "\n**Moderador:** " + interaction.user + "\n**Duración:** " + minutes + " min\n**Razón:** " + reason)
          .setTimestamp()
      );
      return interaction.reply("⏳ Timeout aplicado a " + user.tag + " por " + minutes + " minutos.");
    }

    if (name === "untimeout") {
      const user = interaction.options.getUser("usuario", true);
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: "❌ No encontré a ese miembro.", ephemeral: true });
      if (!target.moderatable) return interaction.reply({ content: "❌ No puedo quitar el timeout por la jerarquía.", ephemeral: true });
      await target.timeout(null, "Timeout retirado por " + interaction.user.tag);
      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.green).setTitle("✅ Timeout retirado")
          .setDescription("**Usuario:** " + user + "\n**Moderador:** " + interaction.user)
          .setTimestamp()
      );
      return interaction.reply("✅ Timeout retirado.");
    }

    if (name === "warn") {
      const user = interaction.options.getUser("usuario", true);
      const reason = safeEmbedText(interaction.options.getString("razon", true).trim(), 500);
      const gd = getGuild(interaction.guild.id);

      if (!gd.warnings[user.id]) gd.warnings[user.id] = [];
      gd.warnings[user.id].push({
        reason,
        moderatorId: interaction.user.id,
        at: Date.now()
      });
      if (gd.warnings[user.id].length > 100) gd.warnings[user.id] = gd.warnings[user.id].slice(-100);

      db.guilds[interaction.guild.id] = gd;
      saveDB("warn");
      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.orange).setTitle("⚠️ Advertencia")
          .setDescription("**Usuario:** " + user + "\n**Moderador:** " + interaction.user + "\n**Razón:** " + reason)
          .setTimestamp()
      );
      return interaction.reply("⚠️ " + user.tag + " recibió una advertencia. Total: **" + gd.warnings[user.id].length + "**.");
    }

    if (name === "warnings") {
      const user = interaction.options.getUser("usuario", true);
      const list = getGuild(interaction.guild.id).warnings[user.id] || [];
      const text = list.length
        ? list.map((w, i) => (i + 1) + ". " + safeEmbedText(w.reason, 600) + " • <@" + (w.moderatorId || "0") + ">").join("\n")
        : "Sin advertencias.";

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.orange)
            .setTitle("⚠️ Advertencias de " + user.tag)
            .setDescription(safeEmbedText(text, 3900))
        ],
        ephemeral: true
      });
    }

    if (name === "clearwarns") {
      const user = interaction.options.getUser("usuario", true);
      const gd = getGuild(interaction.guild.id);
      delete gd.warnings[user.id];
      db.guilds[interaction.guild.id] = gd;
      saveDB("clearwarns");

      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.green).setTitle("🧹 Advertencias eliminadas")
          .setDescription("**Usuario:** " + user + "\n**Moderador:** " + interaction.user)
          .setTimestamp()
      );
      return interaction.reply("✅ Advertencias borradas.");
    }

    if (name === "clear") {
      const amount = interaction.options.getInteger("cantidad", true);
      if (!interaction.channel?.isTextBased()) return interaction.reply({ content: "❌ Este canal no admite esa acción.", ephemeral: true });
      const deleted = await interaction.channel.bulkDelete(amount, true);

      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.orange).setTitle("🧹 Mensajes borrados")
          .setDescription("**Canal:** " + interaction.channel + "\n**Cantidad:** " + deleted.size + "\n**Moderador:** " + interaction.user)
          .setTimestamp()
      );
      return interaction.reply({ content: "🧹 Se borraron " + deleted.size + " mensajes.", ephemeral: true });
    }

    if (name === "lock") {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.red).setTitle("🔒 Canal bloqueado")
          .setDescription("**Canal:** " + interaction.channel + "\n**Moderador:** " + interaction.user)
          .setTimestamp()
      );
      return interaction.reply("🔒 Canal bloqueado.");
    }

    if (name === "unlock") {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.green).setTitle("🔓 Canal desbloqueado")
          .setDescription("**Canal:** " + interaction.channel + "\n**Moderador:** " + interaction.user)
          .setTimestamp()
      );
      return interaction.reply("🔓 Canal desbloqueado.");
    }

    if (name === "slowmode") {
      const seconds = interaction.options.getInteger("segundos", true);
      await interaction.channel.setRateLimitPerUser(seconds);
      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.blue).setTitle("🐢 Slowmode actualizado")
          .setDescription("**Canal:** " + interaction.channel + "\n**Segundos:** " + seconds + "\n**Moderador:** " + interaction.user)
          .setTimestamp()
      );
      return interaction.reply("🐢 Slowmode: " + seconds + " segundos.");
    }

    if (name === "nick") {
      const user = interaction.options.getUser("usuario", true);
      const nameValue = interaction.options.getString("nombre", true).trim().slice(0, 32);
      if (!nameValue) return interaction.reply({ content: "❌ El apodo no puede estar vacío.", ephemeral: true });

      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target) return interaction.reply({ content: "❌ No encontré a ese miembro.", ephemeral: true });
      if (!canModerateTarget(interaction.member, target) || !target.manageable) {
        return interaction.reply({ content: "❌ No puedo cambiar ese apodo por la jerarquía.", ephemeral: true });
      }

      await target.setNickname(nameValue);
      await sendLog(
        interaction.guild,
        new EmbedBuilder().setColor(COLOR.blue).setTitle("✏️ Apodo actualizado")
          .setDescription("**Usuario:** " + user + "\n**Moderador:** " + interaction.user + "\n**Nuevo:** " + nameValue)
          .setTimestamp()
      );
      return interaction.reply("✏️ Apodo actualizado.");
    }
  } catch (error) {
    console.error("Nexus: interaction error:", error);
    const message = "❌ " + String(error?.message || "Ocurrió un error.").slice(0, 1800);
    if (interaction.replied || interaction.deferred) await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    else await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
  }
});

client.on("messageCreate", message => {
  if (!message.guild || message.author?.bot) return;
  recordActivity(message.guild.id, "Mensaje", activityUser(message.author), "En #" + (message.channel?.name || message.channelId));
});

client.on("messageDelete", message => {
  if (!message.guild || message.author?.bot) return;
  recordActivity(message.guild.id, "Mensaje borrado", activityUser(message.author), "En #" + (message.channel?.name || message.channelId));
});

client.on("messageUpdate", (oldMessage, newMessage) => {
  const guild = newMessage.guild || oldMessage.guild;
  if (!guild || newMessage.author?.bot) return;
  recordActivity(guild.id, "Mensaje editado", activityUser(newMessage.author), "En #" + (newMessage.channel?.name || newMessage.channelId));
});

client.on("guildMemberAdd", member => recordActivity(member.guild.id, "Miembro entró", activityUser(member.user), "Se unió"));
client.on("guildMemberRemove", member => recordActivity(member.guild.id, "Miembro salió", activityUser(member.user), "Salió o fue expulsado"));
client.on("guildBanAdd", ban => recordActivity(ban.guild.id, "Ban", activityUser(ban.user), "Usuario baneado"));
client.on("guildBanRemove", ban => recordActivity(ban.guild.id, "Unban", activityUser(ban.user), "Ban retirado"));
client.on("channelCreate", channel => { if (channel.guild) recordActivity(channel.guild.id, "Canal creado", "Sistema", "#" + channel.name); });
client.on("channelDelete", channel => { if (channel.guild) recordActivity(channel.guild.id, "Canal eliminado", "Sistema", "#" + channel.name); });
client.on("roleCreate", role => { if (role.guild) recordActivity(role.guild.id, "Rol creado", "Sistema", "@" + role.name); });
client.on("roleDelete", role => { if (role.guild) recordActivity(role.guild.id, "Rol eliminado", "Sistema", "@" + role.name); });

client.on("voiceStateUpdate", (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member?.guild) return;
  const action = !oldState.channelId && newState.channelId
    ? "Entró a voz"
    : oldState.channelId && !newState.channelId
      ? "Salió de voz"
      : "Cambió de voz";
  recordActivity(
    member.guild.id,
    action,
    activityUser(member.user),
    newState.channel?.name || oldState.channel?.name || "Voz"
  );
});

client.on("guildUpdate", (oldGuild, newGuild) => recordActivity(newGuild.id, "Servidor actualizado", "Sistema", newGuild.name));
client.on("error", error => console.error("Nexus: Discord client error:", error));

const RATE = new Map();

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const bucket = RATE.get(key);
  if (!bucket || bucket.resetAt <= now) {
    RATE.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count++;
  return bucket.count <= limit;
}

function dashboardGuildAllowed(session, guildId) {
  return guildId === GUILD_ID && session.guilds.some(g => g.id === guildId);
}

const server = http.createServer(async (req, res) => {
  try {
    const request = new URL(req.url || "/", "http://localhost");
    const requestPath = request.pathname;

    if (requestPath === "/health" || requestPath === "/api/health/dashboard") {
      return sendJSON(res, 200, {
        ok: true,
        service: "Nexus",
        guildId: GUILD_ID,
        botReady: client.isReady(),
        dataVersion: DB_VERSION,
        timestamp: Date.now()
      });
    }

    if (requestPath === "/" || requestPath === "/index.html") {
      const file = path.join(__dirname, "dashboard-final.html");
      if (!fs.existsSync(file)) return sendJSON(res, 500, { error: "Falta dashboard-final.html" });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(file, "utf8"));
    }

    if (requestPath === "/auth/password") {
      if (req.method !== "POST") return sendJSON(res, 405, { error: "Método no permitido." });
      const passwordIp = req.socket.remoteAddress || "password";
      if (!rateLimit("panel-password:" + passwordIp, 8, 5 * 60_000)) {
        return sendJSON(res, 429, { error: "Demasiados intentos. Espera unos minutos." });
      }
      let payload;
      try { payload = JSON.parse(await readBody(req, 4096)); }
      catch { return sendJSON(res, 400, { error: "Solicitud inválida." }); }

      const supplied = String(payload.password || "");
      const a = Buffer.from(supplied);
      const b = Buffer.from(PANEL_PASSWORD);
      const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!valid) return sendJSON(res, 401, { error: "Contraseña incorrecta." });

      cleanupDashboardSessions();
      if (sessions.size >= MAX_DASHBOARD_SESSIONS) {
        return sendJSON(res, 429, { error: "El panel ya tiene 2 sesiones activas. Cierra una sesión antes de entrar." });
      }

      // La contraseña desbloquea y abre el panel directamente.
      // Ya no obliga a pasar por OAuth de Discord después de introducirla.
      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, {
        user: {
          id: "panel-owner",
          username: "Panel Owner",
          global_name: "Panel Owner"
        },
        guilds: [{
          id: GUILD_ID,
          name: client.guilds.cache.get(GUILD_ID)?.name || "Servidor configurado"
        }],
        csrf: crypto.randomUUID(),
        expiresAt: Date.now() + SESSION_TTL_MS
      });

      clearPanelGateCookie(res);
      setSessionCookie(res, sessionId);
      return sendJSON(res, 200, { ok: true, authenticated: true });
    }

    if (requestPath === "/auth/discord") {
      const ip = req.socket.remoteAddress || "unknown";
      if (!rateLimit(ip, 20, 60_000)) return sendJSON(res, 429, { error: "Demasiadas solicitudes. Espera un momento." });
      if (!panelGateUser(req)) return sendJSON(res, 403, { error: "Primero introduce la contraseña del panel." });
      if (!DISCORD_CLIENT_SECRET) return sendJSON(res, 503, { error: "OAuth de Discord no está configurado." });

      const redirect = encodeURIComponent(DISCORD_REDIRECT_URI);
      return redirect
        ? res.writeHead(302, {
            Location:
              "https://discord.com/oauth2/authorize" +
              "?client_id=" + CLIENT_ID +
              "&response_type=code" +
              "&redirect_uri=" + redirect +
              "&scope=identify%20guilds"
          }).end()
        : undefined;
    }

    if (requestPath === "/auth/discord/callback") {
      const code = request.searchParams.get("code");
      if (!code || !DISCORD_CLIENT_SECRET) return sendJSON(res, 400, { error: "OAuth2 inválido o no configurado." });

      const token = await discordRequest("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: DISCORD_REDIRECT_URI
        }).toString()
      });

      if (token.status !== 200 || !token.body.access_token) return sendJSON(res, 502, { error: "Discord rechazó el inicio de sesión." });

      const me = await discordRequest("https://discord.com/api/users/@me", {
        headers: { Authorization: "Bearer " + token.body.access_token }
      });
      const guilds = await discordRequest("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: "Bearer " + token.body.access_token }
      });

      const allowed = Array.isArray(guilds.body)
        ? guilds.body.filter(g =>
            g &&
            g.id === GUILD_ID &&
            ((Number(g.permissions) & 0x20) === 0x20 || (Number(g.permissions) & 0x8) === 0x8)
          )
        : [];

      if (!allowed.length) return sendJSON(res, 403, { error: "No tienes permisos para administrar el servidor configurado." });

      cleanupDashboardSessions();
      if (sessions.size >= MAX_DASHBOARD_SESSIONS) {
        return sendJSON(res, 429, { error: "El panel ya tiene 2 sesiones activas. Cierra una sesión antes de entrar." });
      }

      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, {
        user: me.body || {},
        guilds: allowed,
        csrf: crypto.randomUUID(),
        expiresAt: Date.now() + SESSION_TTL_MS
      });

      const gate = panelGateUser(req);
      if (gate) panelGates.delete(parseCookies(req).panel_gate);
      clearPanelGateCookie(res);
      setSessionCookie(res, sessionId);
      return redirect(res, "/");
    }

    if (requestPath === "/auth/logout") {
      const cookies = parseCookies(req);
      if (cookies.dash_session) sessions.delete(cookies.dash_session);
      clearSessionCookie(res);
      return redirect(res, "/");
    }

    if (requestPath === "/api/me") {
      const session = dashboardUser(req);
      return sendJSON(res, 200, {
        authenticated: Boolean(session),
        user: session?.user || null,
        csrf: session?.csrf || null,
        expiresAt: session?.expiresAt || 0,
        maxSessions: MAX_DASHBOARD_SESSIONS,
        activeSessions: sessions.size,
        owners: DASHBOARD_OWNERS
      });
    }

    if (requestPath === "/api/guilds") {
      const session = dashboardUser(req);
      if (!session) return sendJSON(res, 401, { error: "No autenticado" });
      return sendJSON(res, 200, session.guilds.filter(g => g.id === GUILD_ID));
    }

    if (requestPath === "/api/commands") return sendJSON(res, 200, DASHBOARD_COMMANDS);

    if (requestPath.startsWith("/api/activity/")) {
      const session = requireSession(req, res);
      if (!session) return;
      const guildId = requestPath.split("/").pop();
      if (!dashboardGuildAllowed(session, guildId)) return sendJSON(res, 403, { error: "Servidor no permitido." });
      const limit = Math.min(Math.max(Number(request.searchParams.get("limit") || 100), 1), 500);
      const g = getGuild(guildId, dashboardDB);
      return sendJSON(res, 200, (g.activity || []).slice(0, limit));
    }

    if (requestPath.startsWith("/api/config/")) {
      const session = requireSession(req, res);
      if (!session) return;
      const guildId = requestPath.split("/").pop();
      if (!dashboardGuildAllowed(session, guildId)) return sendJSON(res, 403, { error: "Servidor no permitido." });

      if (req.method === "GET") return sendJSON(res, 200, publicGuildConfig(dashboardDB, guildId));
      if (req.method !== "POST") return sendJSON(res, 405, { error: "Método no permitido." });
      if (!requireCSRF(req, res, session)) return;

      let payload;
      try { payload = JSON.parse(await readBody(req)); }
      catch (error) { return sendJSON(res, 400, { error: error.message === "Payload demasiado grande." ? error.message : "JSON inválido." }); }

      const g = getGuild(guildId, dashboardDB);
      const before = g.configVersion || 0;

      if (Object.prototype.hasOwnProperty.call(payload, "categoryId")) g.categoryId = sanitizeSnowflake(payload.categoryId);
      if (Object.prototype.hasOwnProperty.call(payload, "staffRoleId")) g.staffRoleId = sanitizeSnowflake(payload.staffRoleId);
      if (Object.prototype.hasOwnProperty.call(payload, "logsChannelId")) g.logsChannelId = sanitizeSnowflake(payload.logsChannelId);
      if (Object.prototype.hasOwnProperty.call(payload, "vouchChannelId")) g.vouchChannelId = sanitizeSnowflake(payload.vouchChannelId);
      if (Object.prototype.hasOwnProperty.call(payload, "staffQuestions")) g.staffQuestions = sanitizeQuestions(payload.staffQuestions, DEFAULT_STAFF_QUESTIONS);
      if (Object.prototype.hasOwnProperty.call(payload, "alterQuestions")) g.alterQuestions = sanitizeQuestions(payload.alterQuestions, DEFAULT_ALTER_QUESTIONS);

      const now = Date.now();
      g.configVersion = Math.max(now, before + 1);
      g.updatedAt = now;
      dashboardDB.guilds[guildId] = g;
      saveDashboardDBNow("configuración");

      return sendJSON(res, 200, publicGuildConfig(dashboardDB, guildId));
    }

    if (requestPath.startsWith("/api/ai/") && req.method === "POST") {
      const session = requireSession(req, res);
      if (!session) return;
      if (!requireCSRF(req, res, session)) return;

      const guildId = requestPath.split("/").pop();
      if (!dashboardGuildAllowed(session, guildId)) return sendJSON(res, 403, { error: "Sin acceso." });

      let payload;
      try { payload = JSON.parse(await readBody(req, 32 * 1024)); }
      catch { return sendJSON(res, 400, { error: "JSON inválido." }); }

      const q = String(payload.question || "").trim().toLowerCase();
      const g = getGuild(guildId, dashboardDB);
      const events = g.activity || [];
      const publicData = publicGuildConfig(dashboardDB, guildId);
      let answer;

      if (!q) answer = "Escribe una pregunta.";
      else if (q.includes("ticket")) answer = "Hay " + publicData.openTickets + " ticket(s) abiertos ahora mismo.";
      else if (q.includes("actividad") || q.includes("últimamente") || q.includes("ultimamente") || q.includes("qué ha pasado") || q.includes("que ha pasado")) {
        answer = "Tengo " + events.length + " eventos sincronizados. " +
          (events[0] ? "El último fue " + events[0].type + " — " + events[0].details + "." : "Todavía no hay actividad.");
      } else if (q.includes("moder") || q.includes("ban") || q.includes("warn")) {
        const moderation = events.filter(event => ["Ban", "Unban", "Comando"].includes(event.type));
        answer = "Hay " + moderation.length + " eventos recientes relacionados con moderación.";
      } else if (q.includes("sync") || q.includes("sincron")) {
        answer = publicData.botOnline
          ? "El bot está sincronizando. Última sincronización: " + (publicData.lastBotSyncAt ? new Date(publicData.lastBotSyncAt).toLocaleString("es-ES") : "desconocida") + "."
          : "No tengo una sincronización reciente del bot.";
      } else {
        answer = "Puedo revisar tickets, actividad, moderación y sincronización.";
      }

      return sendJSON(res, 200, { answer });
    }

    if (requestPath.startsWith("/api/sync/")) {
      const guildId = requestPath.split("/").pop();
      if (guildId !== GUILD_ID) return sendJSON(res, 403, { error: "Servidor no permitido." });
      if (!PANEL_SYNC_SECRET || req.headers["x-panel-sync-secret"] !== PANEL_SYNC_SECRET) return sendJSON(res, 401, { error: "No autorizado." });

      const ip = req.socket.remoteAddress || "sync";
      if (!rateLimit(ip, 90, 60_000)) return sendJSON(res, 429, { error: "Límite de sincronización alcanzado." });

      const g = getGuild(guildId, dashboardDB);

      if (req.method === "GET") return sendJSON(res, 200, publicGuildConfig(dashboardDB, guildId));
      if (req.method !== "POST") return sendJSON(res, 405, { error: "Método no permitido." });

      let payload;
      try { payload = JSON.parse(await readBody(req)); }
      catch { return sendJSON(res, 400, { error: "JSON inválido." }); }

      const incomingVersion = Math.max(0, Number(payload.configVersion) || 0);
      const localVersion = Math.max(0, Number(g.configVersion) || 0);
      const shouldApplyConfig = incomingVersion > localVersion || localVersion === 0;

      if (shouldApplyConfig) {
        g.categoryId = sanitizeSnowflake(payload.categoryId);
        g.staffRoleId = sanitizeSnowflake(payload.staffRoleId);
        g.logsChannelId = sanitizeSnowflake(payload.logsChannelId);
        g.vouchChannelId = sanitizeSnowflake(payload.vouchChannelId);
        g.staffQuestions = sanitizeQuestions(payload.staffQuestions, DEFAULT_STAFF_QUESTIONS);
        g.alterQuestions = sanitizeQuestions(payload.alterQuestions, DEFAULT_ALTER_QUESTIONS);
        g.configVersion = incomingVersion;
        g.updatedAt = Date.now();
      }

      if (Array.isArray(payload.activity)) {
        g.activity = payload.activity.filter(x => x && typeof x === "object").slice(0, 500);
      }

      g.botSnapshot = {
        serverName: String(payload.serverName || "").slice(0, 100),
        botOnline: Boolean(payload.botOnline),
        syncedAt: Number(payload.syncedAt) || Date.now(),
        openTickets: Math.max(0, Number(payload.openTickets) || 0),
        warnings: Math.max(0, Number(payload.warnings) || 0),
        vouches: Math.max(0, Number(payload.vouches) || 0)
      };

      dashboardDB.guilds[guildId] = g;
      saveDashboardDBNow("sincronización bot");

      return sendJSON(res, 200, {
        acceptedVersion: g.configVersion || 0,
        applied: shouldApplyConfig
      });
    }

    return sendJSON(res, 404, { error: "Ruta no encontrada." });
  } catch (error) {
    console.error("Nexus: dashboard/server error:", error);
    return sendJSON(res, 500, { error: "Error interno del servicio." });
  }
});

if (dashboardLoaded.recovered) {
  try { saveDashboardDBNow("recuperación de backup"); } catch {}
}

setInterval(() => {
  if (!dbDirty) return;
  try { saveDBNow("flush periódico"); }
  catch (error) { console.error("Nexus: flush periódico falló:", error); }
}, 5000);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Nexus: servidor HTTP en puerto " + PORT + ".");
  console.log("Nexus: Dashboard " + DASHBOARD_URL);
});

async function startBot() {
  if (!TOKEN) {
    console.error("Nexus: falta DISCORD_TOKEN/BOT_TOKEN/TOKEN. El dashboard puede seguir funcionando, pero el bot no arrancará.");
    return;
  }
  try {
    await client.login(TOKEN);
  } catch (error) {
    console.error("Nexus: no se pudo iniciar sesión en Discord:", error.message);
    process.exitCode = 1;
  }
}

async function shutdown(signal) {
  console.log("Nexus: apagando por " + signal + "...");
  try { if (dbDirty) saveDBNow("apagado"); else saveDB("apagado"); } catch {}
  try { saveDashboardDBNow("apagado"); } catch {}
  try { client.destroy(); } catch {}
  if (dbSaveTimer) clearTimeout(dbSaveTimer);
  if (globalThis.__panelSyncTimer) clearInterval(globalThis.__panelSyncTimer);
  if (globalThis.__panelPushTimer) clearInterval(globalThis.__panelPushTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("beforeExit", () => {
  try { if (dbDirty) saveDBNow("beforeExit"); } catch {}
});
process.on("unhandledRejection", error => console.error("Nexus: unhandled rejection:", error));
process.on("uncaughtException", error => {
  console.error("Nexus: uncaught exception:", error);
  try { if (dbDirty) saveDBNow("uncaughtException"); } catch {}
});

const RUN_BOT = process.env.RUN_BOT !== "false";
if (RUN_BOT) startBot();
else console.log("Nexus: modo Dashboard activo (RUN_BOT=false).");
