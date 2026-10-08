
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || "1557167878183067688";
const GUILD_ID = process.env.GUILD_ID || "1554248808194642040";
const PORT = Number(process.env.PORT || 3000);
const TICKET_IMAGE_URL = process.env.TICKET_IMAGE_URL || "";
const BOT_BRAND = "Nexus";
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://nexus-control-panel.onrender.com";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = DASHBOARD_URL + "/auth/discord/callback";
const sessions = new Map();
let dashboardFile;

function dashboardData() {
  try { return fs.existsSync(dashboardFile) ? JSON.parse(fs.readFileSync(dashboardFile, "utf8")) : {}; }
  catch { return {}; }
}
function saveDashboardData(d) { fs.writeFileSync(dashboardFile, JSON.stringify(d, null, 2)); }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map(x => { const i=x.indexOf("="); return [x.slice(0,i).trim(), decodeURIComponent(x.slice(i+1))]; })); }
function sendJSON(res,status,data) { const body=JSON.stringify(data); res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Set-Cookie":"dash_session="+encodeURIComponent(data.session || "")+"; HttpOnly; Path=/; SameSite=Lax"}); res.end(body); }
function discordRequest(url, options={}) {
  return new Promise((resolve,reject)=>{ const u=new URL(url); const req=https.request(u,{method:options.method||"GET",headers:options.headers||{}},r=>{let b="";r.on("data",c=>b+=c);r.on("end",()=>{try{resolve({status:r.statusCode,body:JSON.parse(b)})}catch{resolve({status:r.statusCode,body:{}})}})});req.on("error",reject);if(options.body)req.write(options.body);req.end();});
}
function dashboardUser(req){const c=parseCookies(req);return c.dash_session?sessions.get(c.dash_session):null;}
function guildConfig(guildId){const d=dashboardData();const g=getGuild(guildId);return {...g,openTickets:Object.values(g.tickets||{}).filter(t=>!t.closed).length};}



const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "ticket-data.json");
dashboardFile = path.join(DATA_DIR, "dashboard.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ guilds: {} }, null, 2));
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("Error cargando datos:", e);
    return { guilds: {} };
  }
}

let db = loadDB();

function saveDB() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

const DEFAULT_STAFF_QUESTIONS=["👤 ¿Cuál es tu nombre/usuario de Discord?","🎂 ¿Qué edad tienes?","🌎 ¿De qué país eres y cuál es tu zona horaria?","⏰ ¿Cuánto tiempo puedes estar activo diariamente?","🧠 ¿Has tenido experiencia como Staff?","🎯 ¿Por qué quieres formar parte del Staff?","🛠️ ¿Qué harías ante spam, estafas o incumplimiento de reglas?","⚖️ Si un amigo incumple las reglas, ¿lo sancionarías? ¿Por qué?","🚨 ¿Qué harías ante una discusión entre usuarios?","⭐ ¿Qué puedes aportar como Helper?"];
const DEFAULT_ALTER_QUESTIONS=["👤 ¿Cuál es tu usuario de Discord?","🌎 ¿De qué país eres?","🎂 ¿Qué edad tienes?","📦 ¿Qué tipo de cuentas manejas?","🎮 ¿Qué cantidad de stock tienes?","🔄 ¿Con qué frecuencia repones stock?","🎉 ¿Cuántos sorteos o drops puedes realizar al día?","🎁 ¿Qué cantidad puedes aportar semanalmente?","🛡️ ¿Cómo garantizas que las cuentas funcionan?","⭐ ¿Por qué quieres ser Alter y qué puedes aportar?"];

function recordActivity(guildId, type, user, details) {
  const g = getGuild(guildId);
  if (!Array.isArray(g.activity)) g.activity = [];
  g.activity.unshift({ type, user: user || "Sistema", details: details || "", at: Date.now() });
  if (g.activity.length > 500) g.activity.length = 500;
}
function activityUser(user) {
  if (!user) return "Sistema";
  return user.tag || user.username || user.globalName || user.id || "Usuario";
}
function getGuild(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      categoryId: null,
      staffRoleId: null,
      logsChannelId: null,
      tickets: {},
      warnings: {},
      vouches: {},
      vouchChannelId: null,
      staffQuestions: [...DEFAULT_STAFF_QUESTIONS],
      alterQuestions: [...DEFAULT_ALTER_QUESTIONS]
    };
  }
  return db.guilds[guildId];
}

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

const FULL_ACCESS_ROLE_ID = "1554252558359470182";

function isStaff(member) {
  if (!member) return false;
  if (member.roles.cache.has(FULL_ACCESS_ROLE_ID)) return true;
  const gd = getGuild(member.guild.id);
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    (gd.staffRoleId && member.roles.cache.has(gd.staffRoleId));
}

function ticketByChannel(guildId, channelId) {
  return Object.values(getGuild(guildId).tickets).find(t => t.channelId === channelId) || null;
}

function panelEmbed() {
  const e = new EmbedBuilder()
    .setColor(COLOR.purple)
    .setTitle("🎫 • Sistema de Tickets")
    .setDescription(
      "🇪🇸 **Español**\n" +
      "¿Necesitas ayuda, tienes alguna consulta o quieres reclamar una recompensa?\n" +
      "Abre un ticket seleccionando la categoría que corresponda a tu solicitud.\n\n" +
      "Nuestro equipo de **Staff** revisará tu ticket y te atenderá lo antes posible.\n" +
      "Por favor, proporciona toda la información necesaria para que podamos ayudarte rápidamente.\n\n" +
      "🇬🇧 **English**\n" +
      "Need help, have a question, or want to claim a reward?\n" +
      "Open a ticket by selecting the category that best matches your request.\n\n" +
      "Our Staff Team will review your ticket and assist you as soon as possible.\n" +
      "Please provide all the necessary information so we can help you quickly.\n\n" +
      "👇 **Selecciona una categoría para comenzar.**\n" +
      "👇 **Select a category to get started.**"
    )
    .setFooter({ text: BOT_BRAND + " • Sistema de Tickets" });
  if (TICKET_IMAGE_URL) e.setImage(TICKET_IMAGE_URL);
  return e;
}

function panelComponents() {
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_create")
      .setPlaceholder("Haz una selección • Select a category")
      .addOptions(
        { label: "Soporte", description: "Obtén ayuda del staff.", value: "support", emoji: EMOJIS.support },
        { label: "Rewards", description: "Reclama tu recompensa.", value: "rewards", emoji: EMOJIS.rewards },
        { label: "Postulaciones", description: "Envía una postulación al equipo.", value: "applications", emoji: "📝" },
        { label: "Ally", description: "Cualquier otra consulta.", value: "ally", emoji: "🤝" }
      )
  )];
}

function ticketButtons(closed) {
  if (closed) return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_reopen").setLabel("Reabrir").setEmoji("🔓").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ticket_transcript").setLabel("Transcript").setEmoji("📄").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket_delete").setLabel("Eliminar").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
  );

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Cerrar ticket").setEmoji({ id: "1557199596382584842", name: "demongirl" }).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket_claim").setLabel("Reclamar").setEmoji({ id: "1557199346141761687", name: "pentagram", animated: true }).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket_transcript").setLabel("Transcript").setEmoji("📄").setStyle(ButtonStyle.Secondary)
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
      "📝 Explica tu problema con el mayor detalle posible.\n\n" +
      "Un miembro del Staff te atenderá en cuanto pueda."
    )
    .setFooter({ text: BOT_BRAND + " • Sistema de Tickets" })
    .setTimestamp();
}

async function sendLog(guild, embed) {
  const id = getGuild(guild.id).logsChannelId;
  if (!id) return;
  const ch = await guild.channels.fetch(id).catch(() => null);
  if (ch && ch.isTextBased()) await ch.send({ embeds: [embed] }).catch(() => {});
}

async function createTicket(guild, user, type) {
  const gd = getGuild(guild.id);
  const openTickets = Object.values(gd.tickets).filter(t => t.userId === user.id && !t.closed);
  if (openTickets.length >= 2) return { limit: true, channelIds: openTickets.map(t => t.channelId) };

  const category = gd.categoryId ? guild.channels.cache.get(gd.categoryId) : null;
  const staffRole = gd.staffRoleId ? guild.roles.cache.get(gd.staffRoleId) : null;
  const fullAccessRole = guild.roles.cache.get(FULL_ACCESS_ROLE_ID);
  const displayName = user.globalName || user.username || "usuario";
  const safe = displayName.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 18) || "usuario";
  const ticketNames = { support: "soporte", rewards: "rewards", applications: "postulaciones", ally: "ally" };
  const ticketPrefix = ticketNames[type] || "ticket";

  const channel = await guild.channels.create({
    name: ticketPrefix + "-" + safe,
    type: ChannelType.GuildText,
    parent: category && category.type === ChannelType.GuildCategory ? category.id : undefined,
    topic: "Ticket de " + user.tag + " • " + type,
    permissionOverwrites: [
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
      ...(fullAccessRole ? [{
        id: fullAccessRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.AttachFiles
        ]
      }] : [])
    ]
  });

  gd.tickets[user.id] = {
    channelId: channel.id,
    userId: user.id,
    type,
    closed: false,
    claimedBy: null,
    createdAt: Date.now()
  };
  saveDB();

  await channel.send({
    content: user + " <@&" + "1557203534133330010" + ">" + (type === "rewards" ? " <@&" + "1554248808194642048" + ">" : ""),
    embeds: [welcomeEmbed(user, type)],
    components: [ticketButtons(false)]
  });

  await sendLog(guild, new EmbedBuilder()
    .setColor(COLOR.green)
    .setTitle("🎫 Ticket creado")
    .setDescription("**Usuario:** " + user + "\n**Canal:** " + channel + "\n**Categoría:** " + type)
    .setTimestamp()
  );

  return { channel };
}

async function makeTranscript(channel) {
  const messages = [];
  let before;

  for (let page = 0; page < 20; page++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || !batch.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  messages.reverse();
  const lines = messages.map(m => {
    const files = [...m.attachments.values()].map(a => a.url).join(" ");
    return "[" + new Date(m.createdTimestamp).toISOString() + "] " + m.author.tag + ": " + (m.content || "") + (files ? " " + files : "");
  });

  return Buffer.from(lines.join("\n") || "Sin mensajes.", "utf8");
}

async function closeTicket(channel, actor) {
  const ticket = ticketByChannel(channel.guild.id, channel.id);
  if (!ticket) return false;
  ticket.closed = true;
  saveDB();
  await channel.permissionOverwrites.edit(ticket.userId, { ViewChannel: false, SendMessages: false }).catch(() => {});
  await channel.send({
    embeds: [new EmbedBuilder().setColor(COLOR.red).setTitle("🔒 Ticket cerrado").setDescription("Cerrado por " + actor + ".").setTimestamp()],
    components: [ticketButtons(true)]
  });
  return true;
}

async function reopenTicket(channel, actor) {
  const ticket = ticketByChannel(channel.guild.id, channel.id);
  if (!ticket) return false;
  ticket.closed = false;
  saveDB();
  await channel.permissionOverwrites.edit(ticket.userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
  await channel.send({
    embeds: [new EmbedBuilder().setColor(COLOR.green).setTitle("🔓 Ticket reabierto").setDescription("Reabierto por " + actor + ".").setTimestamp()],
    components: [ticketButtons(false)]
  });
  return true;
}

const commands = [
  new SlashCommandBuilder().setName("ticket").setDescription("Sistema completo de tickets.")
    .addSubcommand(s => s.setName("panel").setDescription("Publica el panel de tickets.")
      .addChannelOption(o => o.setName("canal").setDescription("Canal donde se publicará.").addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName("setup").setDescription("Configura categoría, staff y logs.")
      .addChannelOption(o => o.setName("categoria").setDescription("Categoría de tickets.").addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption(o => o.setName("staff").setDescription("Rol que verá los tickets."))
      .addChannelOption(o => o.setName("logs").setDescription("Canal de logs.").addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName("close").setDescription("Cierra el ticket actual."))
    .addSubcommand(s => s.setName("reopen").setDescription("Reabre el ticket actual."))
    .addSubcommand(s => s.setName("delete").setDescription("Elimina el ticket actual."))
    .addSubcommand(s => s.setName("claim").setDescription("Reclama el ticket actual."))
    .addSubcommand(s => s.setName("unclaim").setDescription("Libera el ticket actual."))
    .addSubcommand(s => s.setName("add").setDescription("Añade un usuario al ticket.").addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Quita un usuario del ticket.").addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)))
    .addSubcommand(s => s.setName("rename").setDescription("Cambia el nombre del ticket.").addStringOption(o => o.setName("nombre").setDescription("Nuevo nombre.").setRequired(true)))
    .addSubcommand(s => s.setName("transcript").setDescription("Genera un transcript."))
    .addSubcommand(s => s.setName("list").setDescription("Muestra los tickets abiertos.")),

  new SlashCommandBuilder().setName("modlog").setDescription("Configura los logs de moderación.")
    .addSubcommand(s => s.setName("set").setDescription("Configura el canal.").addChannelOption(o => o.setName("canal").setDescription("Canal de logs.").addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName("off").setDescription("Desactiva los logs.")),

  new SlashCommandBuilder().setName("ban").setDescription("Banea a un usuario.").addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)).addStringOption(o => o.setName("razon").setDescription("Razón.")),
  new SlashCommandBuilder().setName("unban").setDescription("Quita el ban.").addStringOption(o => o.setName("usuario").setDescription("ID.").setRequired(true)),
  new SlashCommandBuilder().setName("kick").setDescription("Expulsa a un usuario.").addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)).addStringOption(o => o.setName("razon").setDescription("Razón.")),
  new SlashCommandBuilder().setName("timeout").setDescription("Aplica timeout.").addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)).addIntegerOption(o => o.setName("minutos").setDescription("Minutos.").setMinValue(1).setMaxValue(40320).setRequired(true)).addStringOption(o => o.setName("razon").setDescription("Razón.")),
  new SlashCommandBuilder().setName("untimeout").setDescription("Quita el timeout.").addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)),
  new SlashCommandBuilder().setName("warn").setDescription("Advierte a un usuario.").addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)).addStringOption(o => o.setName("razon").setDescription("Razón.").setRequired(true)),
  new SlashCommandBuilder().setName("warnings").setDescription("Muestra las advertencias.").addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)),
  new SlashCommandBuilder().setName("clearwarns").setDescription("Borra las advertencias.").addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)),
  new SlashCommandBuilder().setName("clear").setDescription("Borra mensajes.").addIntegerOption(o => o.setName("cantidad").setDescription("Cantidad.").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("lock").setDescription("Bloquea el canal."),
  new SlashCommandBuilder().setName("unlock").setDescription("Desbloquea el canal."),
  new SlashCommandBuilder().setName("slowmode").setDescription("Configura slowmode.").addIntegerOption(o => o.setName("segundos").setDescription("Segundos.").setMinValue(0).setMaxValue(21600).setRequired(true)),
  new SlashCommandBuilder().setName("nick").setDescription("Cambia un apodo.").addUserOption(o => o.setName("usuario").setDescription("Usuario.").setRequired(true)).addStringOption(o => o.setName("nombre").setDescription("Nuevo apodo.").setRequired(true)),
  new SlashCommandBuilder().setName("userinfo").setDescription("Muestra información de un usuario.").addUserOption(o => o.setName("usuario").setDescription("Usuario.")),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Muestra información del servidor."),
  new SlashCommandBuilder().setName("post-alter").setDescription("Publica el formulario para postularse como Alter."),
  new SlashCommandBuilder().setName("post-staff").setDescription("Publica el formulario para postularse como Helper.")
].map(c => c.toJSON());

// Fuente única para el Dashboard: refleja automáticamente los comandos definidos en el bot.
const DASHBOARD_COMMANDS = commands.map(c => ({name:c.name,description:c.description||"",options:(c.options||[]).map(o => ({name:o.name,description:o.description||"",type:o.type,options:(o.options||[]).map(s => ({name:s.name,description:s.description||""}))}))}));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Channel]
});

async function registerCommands() {
  if (!CLIENT_ID) return;
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  if (GUILD_ID) {
    const result = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Comandos registrados en el servidor:", Array.isArray(result) ? result.map(c => c.name).join(", ") : "OK");
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("Comandos globales registrados.");
  }
}

async function handleTicket(interaction) {
  const sub = interaction.options.getSubcommand();
  const gd = getGuild(interaction.guild.id);
  const channel = interaction.channel;
  const ticket = channel ? ticketByChannel(interaction.guild.id, channel.id) : null;

  if (sub === "panel") {
    if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Necesitas permisos de Staff.", ephemeral: true });
    const target = interaction.options.getChannel("canal") || channel;
    await target.send({ embeds: [panelEmbed()], components: panelComponents() });
    return interaction.reply({ content: "✅ Panel enviado en " + target + ".", ephemeral: true });
  }

  if (sub === "setup") {
    if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Necesitas permisos de Staff.", ephemeral: true });
    const category = interaction.options.getChannel("categoria");
    const staff = interaction.options.getRole("staff");
    const logs = interaction.options.getChannel("logs");

    if (category) gd.categoryId = category.id;
    if (staff) gd.staffRoleId = staff.id;
    if (logs) gd.logsChannelId = logs.id;
    saveDB();

    return interaction.reply({
      content: "⚙️ Configuración actualizada.\nCategoría: " + (gd.categoryId ? "<#" + gd.categoryId + ">" : "no configurada") +
        "\nStaff: " + (gd.staffRoleId ? "<@&" + gd.staffRoleId + ">" : "no configurado") +
        "\nLogs: " + (gd.logsChannelId ? "<#" + gd.logsChannelId + ">" : "no configurado"),
      ephemeral: true
    });
  }

  if (sub === "list") {
    if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Necesitas permisos de Staff.", ephemeral: true });
    const open = Object.values(gd.tickets).filter(t => !t.closed);
    const text = open.length ? open.map(t => "<#" + t.channelId + "> • <@" + t.userId + "> • " + t.type).join("\n") : "📭 No hay tickets abiertos.";
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.purple).setTitle("🎫 Tickets abiertos").setDescription(text)], ephemeral: true });
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
    saveDB();
    await channel.send({ embeds: [new EmbedBuilder().setColor(COLOR.blue).setTitle("🙋 Ticket reclamado").setDescription("Atendido por <@" + interaction.user.id + ">.")] });
    return interaction.reply({ content: "🙋 Ticket reclamado.", ephemeral: true });
  }

  if (sub === "unclaim") {
    ticket.claimedBy = null;
    saveDB();
    return interaction.reply({ content: "✅ Ticket liberado.", ephemeral: true });
  }

  if (sub === "add") {
    const user = interaction.options.getUser("usuario", true);
    await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    return interaction.reply({ content: "✅ " + user + " fue añadido.", ephemeral: true });
  }

  if (sub === "remove") {
    const user = interaction.options.getUser("usuario", true);
    await channel.permissionOverwrites.delete(user.id).catch(() => {});
    return interaction.reply({ content: "✅ " + user + " fue retirado.", ephemeral: true });
  }

  if (sub === "rename") {
    const name = interaction.options.getString("nombre", true).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90);
    await channel.setName(name || "ticket");
    return interaction.reply({ content: "✅ Ticket renombrado.", ephemeral: true });
  }

  if (sub === "transcript") {
    const file = new AttachmentBuilder(await makeTranscript(channel), { name: "transcript-" + channel.id + ".txt" });
    const logs = gd.logsChannelId ? await interaction.guild.channels.fetch(gd.logsChannelId).catch(() => null) : null;
    if (logs && logs.isTextBased()) {
      await logs.send({ content: "📄 Transcript de " + channel + " generado por " + interaction.user + ".", files: [file] });
      return interaction.reply({ content: "📄 Transcript enviado a logs.", ephemeral: true });
    }
    return interaction.reply({ content: "📄 Transcript generado:", files: [file], ephemeral: true });
  }

  if (sub === "delete") {
    await interaction.reply({ content: "🗑️ Eliminando ticket...", ephemeral: true });
    delete gd.tickets[ticket.userId];
    saveDB();
    return setTimeout(() => channel.delete().catch(() => {}), 1000);
  }
}

client.once("ready", async () => {
  console.log(BOT_BRAND + " conectado como " + client.user.tag);
  client.user.setActivity("🎫 Nexus • /ticket panel", { type: 0 });
  try { await registerCommands(); } catch (e) { console.error("Error registrando comandos:", e); }
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_create") {
      await interaction.deferReply({ ephemeral: true });
      const result = await createTicket(interaction.guild, interaction.user, interaction.values[0]);
      if (result.limit) return interaction.editReply("⚠️ Has alcanzado el límite de **2 tickets abiertos**. Cierra uno antes de abrir otro.");
      return interaction.editReply("✅ Ticket creado: " + result.channel);
    }

    if (interaction.isButton() && interaction.customId.startsWith("ticket_")) {
      const ticket = ticketByChannel(interaction.guild.id, interaction.channel.id);
      if (!ticket) return interaction.reply({ content: "❌ Este canal no es un ticket.", ephemeral: true });

      if (interaction.customId === "ticket_close") {
        if (!isStaff(interaction.member) && interaction.user.id !== ticket.userId) return interaction.reply({ content: "❌ No puedes cerrar este ticket.", ephemeral: true });
        await interaction.reply({ content: "🔒 Ticket cerrado. Se eliminará en 5 segundos.", ephemeral: true });
        setTimeout(async () => {
          const gd = getGuild(interaction.guild.id);
          delete gd.tickets[ticket.userId];
          saveDB();
          await interaction.channel.delete().catch(() => {});
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
        saveDB();
        await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(COLOR.blue).setTitle("🙋 Ticket reclamado").setDescription("Atendido por <@" + interaction.user.id + ">.")] });
        return interaction.reply({ content: "🙋 Ticket reclamado.", ephemeral: true });
      }

      if (interaction.customId === "ticket_transcript") {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo Staff.", ephemeral: true });
        const file = new AttachmentBuilder(await makeTranscript(interaction.channel), { name: "transcript-" + interaction.channel.id + ".txt" });
        const gd = getGuild(interaction.guild.id);
        const logs = gd.logsChannelId ? await interaction.guild.channels.fetch(gd.logsChannelId).catch(() => null) : null;
        if (logs && logs.isTextBased()) {
          await logs.send({ content: "📄 Transcript de " + interaction.channel + " generado por " + interaction.user + ".", files: [file] });
          return interaction.reply({ content: "📄 Transcript enviado a logs.", ephemeral: true });
        }
        return interaction.reply({ content: "📄 Transcript:", files: [file], ephemeral: true });
      }

      if (interaction.customId === "ticket_delete") {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo Staff.", ephemeral: true });
        await interaction.reply({ content: "🗑️ Eliminando ticket...", ephemeral: true });
        const gd = getGuild(interaction.guild.id);
        delete gd.tickets[ticket.userId];
        saveDB();
        return setTimeout(() => interaction.channel.delete().catch(() => {}), 1000);
      }
    }

    if (!interaction.isChatInputCommand() || !interaction.guild) return;

    const name = interaction.commandName;

    if (name === "ticket") return handleTicket(interaction);

    if (name === "modlog") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Necesitas permisos de Staff.", ephemeral: true });
      const gd = getGuild(interaction.guild.id);
      if (interaction.options.getSubcommand() === "set") {
        gd.logsChannelId = interaction.options.getChannel("canal", true).id;
        saveDB();
        return interaction.reply({ content: "✅ Logs configurados.", ephemeral: true });
      }
      gd.logsChannelId = null;
      saveDB();
      return interaction.reply({ content: "✅ Logs desactivados.", ephemeral: true });
    }

    if (name === "vouch") {
      const user = interaction.options.getUser("usuario", true);
      const message = interaction.options.getString("mensaje", true).trim();
      const gd = getGuild(interaction.guild.id);

      if (!gd.vouches) gd.vouches = {};
      const previous = Number(gd.vouches[user.id] || 0);
      const count = previous + 1;
      gd.vouches[user.id] = count;
      saveDB();

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      let nicknameUpdated = false;

      if (target && target.manageable) {
        const current = member.nickname || member.user.globalName || member.user.username;
        const base = current.replace(/\\s*\\d+V\\s*$/i, "").trim();
        const newNickname = (base + " " + count + "V").slice(0, 32);
        if (newNickname !== current) {
          await member.setNickname(newNickname, "Vouch recibido").then(() => {
            nicknameUpdated = true;
          }).catch(() => {});
        }
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.green)
            .setTitle("Vouch recibido")
            .setDescription(
              "**Usuario:** " + user + "\\n" +
              "**Vouch:** " + count + "V\\n" +
              "**Mensaje:** " + message +
              (nicknameUpdated ? "\\n\\nNombre actualizado a **" + count + "V**." : "")
            )
            .setTimestamp()
        ]
      });
    }

    if (name === "post-staff") {
      const questions = getGuild(interaction.guild.id).staffQuestions?.length ? getGuild(interaction.guild.id).staffQuestions : DEFAULT_STAFF_QUESTIONS;

      const embed = new EmbedBuilder()
        .setColor(COLOR.purple)
        .setTitle("🛡️ FORMULARIO — POSTULACIÓN A HELPER")
        .setDescription(
          "**📋 Responde las preguntas en orden.**\n" +
          "Copia el número de cada pregunta y escribe tu respuesta debajo.\n\n" +
          questions.map((q, i) => "**" + (i + 1) + ". " + q + "**\n> ✏️ Respuesta:").join("\n\n") +
          "\n\n📌 **Buscamos personas activas, responsables, respetuosas y comprometidas con la comunidad.**\n\n" +
          "<@&1554708798499725393> <@&1554708987700715531>"
        )
        .setFooter({ text: BOT_BRAND + " • Postulación a Helper" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (name === "post-alter") {
      const questions = getGuild(interaction.guild.id).alterQuestions?.length ? getGuild(interaction.guild.id).alterQuestions : DEFAULT_ALTER_QUESTIONS;

      const embed = new EmbedBuilder()
        .setColor(COLOR.purple)
        .setTitle("🎁 FORMULARIO — POSTULACIÓN A ALTER")
        .setDescription(
          "**📋 Responde las preguntas en orden.**\n" +
          "Copia el número de cada pregunta y escribe tu respuesta debajo.\n\n" +
          questions.map((q, i) => "**" + (i + 1) + ". " + q + "**\n> ✏️ Respuesta:").join("\n\n")
        )
        .setFooter({ text: BOT_BRAND + " • Postulación a Alter" })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (name === "userinfo") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const m = await interaction.guild.members.fetch(user.id).catch(() => null);
      return interaction.reply({ embeds: [
        new EmbedBuilder().setColor(COLOR.purple).setTitle("👤 Información de usuario")
          .setThumbnail(user.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: "Usuario", value: user.tag, inline: true },
            { name: "ID", value: user.id, inline: true },
            { name: "Cuenta", value: "<t:" + Math.floor(user.createdTimestamp / 1000) + ":R>", inline: true },
            { name: "Entrada", value: m?.joinedTimestamp ? "<t:" + Math.floor(m.joinedTimestamp / 1000) + ":R>" : "Desconocida", inline: true }
          )
      ]});
    }

    if (name === "serverinfo") {
      const g = interaction.guild;
      return interaction.reply({ embeds: [
        new EmbedBuilder().setColor(COLOR.purple).setTitle("🏠 Información del servidor")
          .addFields(
            { name: "Nombre", value: g.name, inline: true },
            { name: "ID", value: g.id, inline: true },
            { name: "Miembros", value: String(g.memberCount), inline: true },
            { name: "Canales", value: String(g.channels.cache.size), inline: true },
            { name: "Roles", value: String(g.roles.cache.size), inline: true }
          )
      ]});
    }

    if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ No tienes permisos para usar este comando.", ephemeral: true });

    if (name === "ban") {
      const user = interaction.options.getUser("usuario", true);
      const reason = interaction.options.getString("razon") || "Sin razón indicada";
      await interaction.guild.members.ban(user.id, { reason });
      await sendLog(interaction.guild, new EmbedBuilder().setColor(COLOR.red).setTitle("🔨 Usuario baneado").setDescription("**Usuario:** " + user + "\n**Moderador:** " + interaction.user + "\n**Razón:** " + reason).setTimestamp());
      return interaction.reply("🔨 " + user.tag + " fue baneado.");
    }

    if (name === "unban") {
      const id = interaction.options.getString("usuario", true);
      await interaction.guild.members.unban(id);
      return interaction.reply("✅ Ban retirado para " + id + ".");
    }

    if (name === "kick") {
      const user = interaction.options.getUser("usuario", true);
      const target = await interaction.guild.members.fetch(user.id);
      if (!target.kickable) return interaction.reply({ content: "❌ No puedo expulsar a ese usuario por la jerarquía.", ephemeral: true });
      await target.kick(interaction.options.getString("razon") || "Sin razón indicada");
      return interaction.reply("👢 " + user.tag + " fue expulsado.");
    }

    if (name === "timeout") {
      const user = interaction.options.getUser("usuario", true);
      const target = await interaction.guild.members.fetch(user.id);
      if (!target.moderatable) return interaction.reply({ content: "❌ No puedo aplicar timeout a ese usuario.", ephemeral: true });
      const minutes = interaction.options.getInteger("minutos", true);
      await target.timeout(minutes * 60000, interaction.options.getString("razon") || "Sin razón indicada");
      return interaction.reply("⏳ Timeout aplicado a " + user.tag + " por " + minutes + " minutos.");
    }

    if (name === "untimeout") {
      const user = interaction.options.getUser("usuario", true);
      const target = await interaction.guild.members.fetch(user.id);
      await target.timeout(null, "Timeout retirado");
      return interaction.reply("✅ Timeout retirado.");
    }

    if (name === "warn") {
      const user = interaction.options.getUser("usuario", true);
      const reason = interaction.options.getString("razon", true);
      const gd = getGuild(interaction.guild.id);
      if (!gd.warnings[user.id]) gd.warnings[user.id] = [];
      gd.warnings[user.id].push({ reason, moderatorId: interaction.user.id, at: Date.now() });
      saveDB();
      return interaction.reply("⚠️ " + user.tag + " recibió una advertencia. Total: **" + gd.warnings[user.id].length + "**.");
    }

    if (name === "warnings") {
      const user = interaction.options.getUser("usuario", true);
      const list = getGuild(interaction.guild.id).warnings[user.id] || [];
      const text = list.length ? list.map((w, i) => (i + 1) + ". " + w.reason + " • <@" + w.moderatorId + ">").join("\n") : "Sin advertencias.";
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.orange).setTitle("⚠️ Advertencias de " + user.tag).setDescription(text)], ephemeral: true });
    }

    if (name === "clearwarns") {
      const user = interaction.options.getUser("usuario", true);
      const gd = getGuild(interaction.guild.id);
      delete gd.warnings[user.id];
      saveDB();
      return interaction.reply("✅ Advertencias borradas.");
    }

    if (name === "clear") {
      const amount = interaction.options.getInteger("cantidad", true);
      const deleted = await interaction.channel.bulkDelete(amount, true);
      return interaction.reply({ content: "🧹 Se borraron " + deleted.size + " mensajes.", ephemeral: true });
    }

    if (name === "lock") {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      return interaction.reply("🔒 Canal bloqueado.");
    }

    if (name === "unlock") {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
      return interaction.reply("🔓 Canal desbloqueado.");
    }

    if (name === "slowmode") {
      const seconds = interaction.options.getInteger("segundos", true);
      await interaction.channel.setRateLimitPerUser(seconds);
      return interaction.reply("🐢 Slowmode: " + seconds + " segundos.");
    }

    if (name === "nick") {
      const user = interaction.options.getUser("usuario", true);
      const target = await interaction.guild.members.fetch(user.id);
      if (!target.manageable) return interaction.reply({ content: "❌ No puedo cambiar ese apodo por la jerarquía.", ephemeral: true });
      await target.setNickname(interaction.options.getString("nombre", true));
      return interaction.reply("✏️ Apodo actualizado.");
    }
  } catch (error) {
    console.error("Interaction error:", error);
    const msg = "❌ " + (error?.message || "Ocurrió un error.").slice(0, 1800);
    if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    else await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

client.on("messageCreate", async message => {
  try {
    if (message.author.bot || !message.guild) return;

    const match = message.content.match(/^vouch\\s+<@!?([0-9]+)>\\s+(.+)$/i);
    if (!match) return;

    const userId = match[1] || null;
    const mentionedName = match[2] || null;
    const vouchMessage = match[3].trim();
    if (!vouchMessage) return;

    const gd = getGuild(message.guild.id);
    if (gd.vouchChannelId && message.channel.id !== gd.vouchChannelId) return;
    if (!gd.vouches) gd.vouches = {};
    if (!member && !targetId) return;

    const target = member || (targetId ? await message.guild.members.fetch(targetId).catch(() => null) : null);
    if (!target) return message.reply("No encontré a ese usuario en el servidor.");

    const current = target.nickname || target.user.globalName || target.user.username;
    const existing = current.match(/(\\d+)V\\s*$/i);
    const count = Number(gd.vouches[target.id] ?? (existing ? existing[1] : 0)) + 1;
    gd.vouches[target.id] = count;
    saveDB();

    let member = userId ? await message.guild.members.fetch(userId).catch(() => null) : null;
    if (!member && mentionedName) {
      member = message.guild.members.cache.find(m =>
        m.user.username.toLowerCase() === mentionedName.toLowerCase() ||
        (m.user.globalName && m.user.globalName.toLowerCase() === mentionedName.toLowerCase()) ||
        (m.nickname && m.nickname.toLowerCase() === mentionedName.toLowerCase())
      ) || null;
    }
    const targetId = member ? member.id : userId;
    let nicknameUpdated = false;

    if (member && member.manageable) {
      const current = member.nickname || member.user.globalName || member.user.username;
      const base = current.replace(/\\s*\\d+V\\s*$/i, "").trim();
      const newNickname = (base + " " + count + "V").slice(0, 32);

      if (newNickname !== currentName) {
        await target.setNickname(newNickname, "Vouch recibido").then(() => {
          nicknameUpdated = true;
        }).catch(() => {});
      }
    }

    await message.reply(
      "**Vouch recibido**\\n" +
      "Usuario: <@" + userId + ">\\n" +
      "Vouch: **" + count + "V**\\n" +
      "Mensaje: " + vouchMessage +
      (nicknameUpdated ? "\\nNombre actualizado a **" + count + "V**." : "")
    );
  } catch (error) {
    console.error("Vouch error:", error);
  }
});

client.on("messageCreate", message => {
  if (!message.guild || message.author?.bot) return;
  recordActivity(message.guild.id, "Mensaje", activityUser(message.author), "En #" + (message.channel?.name || message.channelId));
});
client.on("messageUpdate", (oldMessage, newMessage) => {
  const g = newMessage.guild || oldMessage.guild;
  if (!g || newMessage.author?.bot) return;
  recordActivity(g.id, "Mensaje editado", activityUser(newMessage.author), "En #" + (newMessage.channel?.name || newMessage.channelId));
});
client.on("messageDelete", message => {
  if (!message.guild || message.author?.bot) return;
  recordActivity(message.guild.id, "Mensaje borrado", activityUser(message.author), "En #" + (message.channel?.name || message.channelId));
});
client.on("guildMemberAdd", member => recordActivity(member.guild.id, "Miembro entró", activityUser(member.user), "Se unió al servidor"));
client.on("guildMemberRemove", member => recordActivity(member.guild.id, "Miembro salió", activityUser(member.user), "Salió o fue expulsado"));
client.on("guildBanAdd", ban => recordActivity(ban.guild.id, "Ban", activityUser(ban.user), "Usuario baneado"));
client.on("guildBanRemove", ban => recordActivity(ban.guild.id, "Unban", activityUser(ban.user), "Ban retirado"));
client.on("channelCreate", channel => { if (channel.guild) recordActivity(channel.guild.id, "Canal creado", "Sistema", "#" + channel.name); });
client.on("channelDelete", channel => { if (channel.guild) recordActivity(channel.guild.id, "Canal eliminado", "Sistema", "#" + channel.name); });
client.on("channelUpdate", (oldChannel, newChannel) => { if (newChannel.guild) recordActivity(newChannel.guild.id, "Canal actualizado", "Sistema", "#" + newChannel.name); });
client.on("roleCreate", role => { if (role.guild) recordActivity(role.guild.id, "Rol creado", "Sistema", "@" + role.name); });
client.on("roleDelete", role => { if (role.guild) recordActivity(role.guild.id, "Rol eliminado", "Sistema", "@" + role.name); });
client.on("roleUpdate", (oldRole, newRole) => { if (newRole.guild) recordActivity(newRole.guild.id, "Rol actualizado", "Sistema", "@" + newRole.name); });
client.on("voiceStateUpdate", (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member?.guild) return;
  let action = "Voz actualizada";
  if (!oldState.channelId && newState.channelId) action = "Entró a voz";
  else if (oldState.channelId && !newState.channelId) action = "Salió de voz";
  else if (oldState.channelId !== newState.channelId) action = "Cambió de voz";
  recordActivity(member.guild.id, action, activityUser(member.user), newState.channel?.name || oldState.channel?.name || "Canal de voz");
});
client.on("guildUpdate", (oldGuild, newGuild) => recordActivity(newGuild.id, "Servidor actualizado", "Sistema", newGuild.name));
client.on("interactionCreate", interaction => {
  if (!interaction.guild || !interaction.isChatInputCommand()) return;
  recordActivity(interaction.guild.id, "Comando", activityUser(interaction.user), "/" + interaction.commandName);
});
\nclient.on("error", error => console.error("Discord client error:", error));

const dashboardHTML = `<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Nexus Control</title><style>\n:root{--bg:#08060d;--p:#130d1d;--p2:#1b1026;--line:#4b197c;--a:#8b2cff;--a2:#c16cff;--t:#f8f3ff;--m:#aa9bb8;--g:#57f287}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% -10%,#35104f,#100819 38%,#08060d 75%);color:var(--t);font:15px system-ui,sans-serif}.app{min-height:100vh;display:flex}.side{width:245px;background:#09070eeb;border-right:1px solid #35134d;padding:22px 14px;position:sticky;top:0;height:100vh}.brand{font-size:25px;font-weight:900;padding:5px 12px 24px}.brand span{color:var(--a2);text-shadow:0 0 18px #8b2cff}.brand small{display:block;font-size:9px;color:#756980;letter-spacing:.2em}.nav-title,.eyebrow{font-size:10px;color:#86699a;letter-spacing:.18em;text-transform:uppercase}.nav-title{padding:10px}.nav button{width:100%;border:1px solid transparent;background:0;color:#a99caf;text-align:left;padding:12px;border-radius:10px;margin:2px 0;cursor:pointer}.nav button:hover,.nav button.active{color:#fff;background:linear-gradient(90deg,#29103d,#160b20);border-color:#56217b;box-shadow:0 0 18px #8b2cff22}.side-bottom{position:absolute;left:14px;right:14px;bottom:18px}.main{width:100%;max-width:1200px;padding:28px 32px}.top{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:24px}.top h1{margin:4px 0 0;font-size:30px}.guild{width:auto!important;min-width:230px!important;margin:0!important}.hero,.card{background:linear-gradient(145deg,#1b1026f5,#0d0912f5);border:1px solid #42195b;border-radius:14px;box-shadow:0 0 25px #21072f33}.hero{padding:25px;margin-bottom:16px}.hero h2{font-size:27px;margin:5px 0}.card{padding:18px;margin-bottom:15px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:15px}.muted{color:var(--m);line-height:1.55}.stat{font-size:27px;font-weight:900;margin-top:5px}.purple{color:#d49aff}.btn{border:1px solid #7d2bc2;background:linear-gradient(135deg,#8b2cff,#60209e);color:#fff;border-radius:9px;padding:10px 14px;cursor:pointer;font-weight:800}.btn.secondary{background:#21152b;border-color:#4a3157}.btn.danger{background:#54202c;border-color:#873143}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.input,select,textarea{width:100%;background:#0a0710;border:1px solid #432052;color:#fff;border-radius:9px;padding:11px;margin:7px 0 14px;outline:0}.input:focus,select:focus,textarea:focus{border-color:#a34cff}label{display:block;font-size:13px;font-weight:700;color:#d9cce2}.pill{display:inline-flex;background:#241532;border:1px solid #512469;border-radius:999px;padding:5px 9px;font-size:12px}.dot{width:7px;height:7px;border-radius:50%;background:var(--g);box-shadow:0 0 8px var(--g);display:inline-block}.cmd,.q{background:#0b0810;border:1px solid #351642;border-radius:8px;padding:10px;margin:7px 0}.q textarea{min-height:70px}.login{max-width:480px;margin:14vh auto;padding:30px}.hidden{display:none!important}.toast{position:fixed;right:20px;bottom:20px;background:#20112b;border:1px solid #7d35a6;padding:12px 16px;border-radius:10px;display:none}@media(max-width:850px){.grid{grid-template-columns:repeat(2,1fr)}.side{width:210px}.main{padding:20px}}@media(max-width:650px){.app{display:block}.side{position:relative;width:100%;height:auto;border:0;border-bottom:1px solid #35134d}.side-bottom{position:static;margin-top:12px}.nav{display:grid;grid-template-columns:1fr 1fr}.main{padding:16px}.grid,.grid2{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}.guild{width:100%!important}}\n</style></head><body>\n<div id=\"login\" class=\"card login hidden\"><div class=\"eyebrow\">Nexus Studio</div><h1>Nexus Control</h1><p class=\"muted\">Panel de administración con estilo oscuro y morado.</p><a class=\"btn\" href=\"/auth/discord\">Entrar con Discord →</a></div>\n<div id=\"app\" class=\"app hidden\"><aside class=\"side\"><div class=\"brand\">Nexus <span>Control</span><small>ADMINISTRATION PANEL</small></div><div class=\"nav-title\">GENERAL</div><div class=\"nav\"><button data-page=\"home\" class=\"active\">⌂ &nbsp; Inicio</button><button data-page=\"tickets\">◈ &nbsp; Tickets</button><button data-page=\"moderation\">◆ &nbsp; Moderación</button><button data-page=\"applications\">✦ &nbsp; Postulaciones</button><button data-page=\"vouches\">★ &nbsp; Vouches</button><button data-page=\"logs\">▤ &nbsp; Logs</button><button data-page=\"roles\">♙ &nbsp; Roles</button></div><div class=\"side-bottom\"><button class=\"btn secondary\" id=\"logout\" style=\"width:100%\">Cerrar sesión</button></div></aside>\n<main class=\"main\"><div class=\"top\"><div><div class=\"eyebrow\">Nexus Control Panel</div><h1 id=\"title\">Inicio</h1></div><select id=\"guild\" class=\"guild\"></select></div><section id=\"page\"></section></main></div><div id=\"toast\" class=\"toast\"></div>\n<script>\nconst $=s=>document.querySelector(s),state={guild:null,config:{},guilds:[]},titles={home:'Inicio',tickets:'Tickets',moderation:'Moderación',applications:'Postulaciones',vouches:'Vouches',logs:'Logs',roles:'Roles'};let current='home';\nasync function api(u,o){const r=await fetch(u,o);if(r.status===401)throw Error('auth');const j=await r.json();if(!r.ok)throw Error(j.error||'Error');return j}\nfunction esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]))}\nfunction toast(t){const x=$('#toast');x.textContent=t;x.style.display='block';clearTimeout(window.tt);window.tt=setTimeout(()=>x.style.display='none',2200)}\nfunction commandLabels(x){const out=["/"+x.name];for(const o of (x.options||[])){if(o.type===1||o.type===2)out.push("/"+x.name+" "+o.name)}return out} function cmds(a){const dynamic=DASHBOARD_COMMANDS.flatMap(commandLabels);const list=[...new Set([...(a||[]),...dynamic])];return '<div class="card"><div class="row" style="justify-content:space-between"><h2>Comandos de Nexus</h2><span class="pill">Sincronizados con el bot</span></div>'+list.map(x=>'<div class="cmd">'+esc(x)+'</div>').join('')+'</div>'}
async function save(p){state.config={...state.config,...p};await api('/api/config/'+state.guild.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});toast('✓ Guardado correctamente')}\nasync function load(){state.config=await api('/api/config/'+state.guild.id);render(current)}\nfunction active(p){document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p))}\nfunction render(p){current=p;active(p);$('#title').textContent=titles[p];const c=state.config;\nif(p==='home'){const open=c.openTickets||0,w=Object.values(c.warnings||{}).reduce((a,v)=>a+(v?.length||0),0),v=Object.values(c.vouches||{}).reduce((a,x)=>a+Number(x||0),0);$('#page').innerHTML='<div class=\"hero\"><div class=\"eyebrow\">BIENVENIDO A NEXUS</div><h2>Todo tu servidor, en un solo panel.</h2><p class=\"muted\">Tickets, moderación, postulaciones, vouches, logs y roles. Los comandos se sincronizan automáticamente con el código actual del bot.</p><span class=\"pill\"><span class=\"dot\"></span> Sistema conectado</span></div><div class=\"grid\"><div class=\"card\"><div class=\"muted\">Tickets abiertos</div><div class=\"stat\">'+open+'</div></div><div class=\"card\"><div class=\"muted\">Advertencias</div><div class=\"stat\">'+w+'</div></div><div class=\"card\"><div class=\"muted\">Vouches</div><div class=\"stat\">'+v+'</div></div><div class=\"card\"><div class=\"muted\">Estado</div><div class=\"stat purple\">ONLINE</div></div></div><div class=\"grid2\"><div class=\"card\"><h2>Configuración</h2><p class=\"muted\">Servidor: <b>'+esc(state.guild.name)+'</b></p><p class=\"muted\">Categoría: '+(c.categoryId?'<span class=\"pill\">'+esc(c.categoryId)+'</span>':'No configurada')+'</p><p class=\"muted\">Staff: '+(c.staffRoleId?'<span class=\"pill\">'+esc(c.staffRoleId)+'</span>':'No configurado')+'</p><p class=\"muted\">Logs: '+(c.logsChannelId?'<span class=\"pill\">'+esc(c.logsChannelId)+'</span>':'No configurado')+'</p></div><div class=\"card\"><h2>Acciones rápidas</h2><div class=\"row\"><button class=\"btn\" data-go=\"tickets\">Tickets</button><button class=\"btn secondary\" data-go=\"applications\">Postulaciones</button></div></div></div>';document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>render(b.dataset.go));return}\nif(p==='tickets'){$('#page').innerHTML='<div class=\"hero\"><div class=\"eyebrow\">TICKETS</div><h2>Sistema de soporte</h2><p class=\"muted\">Configura lo mismo que usa <code>/ticket setup</code>.</p></div><div class=\"card\"><div class=\"grid2\"><div><label>ID categoría</label><input class=\"input\" id=\"cat\" value=\"'+esc(c.categoryId||'')+'\"></div><div><label>ID rol Staff</label><input class=\"input\" id=\"staff\" value=\"'+esc(c.staffRoleId||'')+'\"></div></div><label>ID canal de logs</label><input class=\"input\" id=\"log\" value=\"'+esc(c.logsChannelId||'')+'\"><button class=\"btn\" id=\"save\">Guardar</button></div>'+cmds(['/ticket panel','/ticket setup','/ticket close','/ticket reopen','/ticket delete','/ticket claim','/ticket unclaim','/ticket add','/ticket remove','/ticket rename','/ticket transcript','/ticket list']);$('#save').onclick=()=>save({categoryId:$('#cat').value.trim()||null,staffRoleId:$('#staff').value.trim()||null,logsChannelId:$('#log').value.trim()||null});return}\nif(p==='moderation'){$('#page').innerHTML='<div class=\"hero\"><div class=\"eyebrow\">MODERATION</div><h2>Control y seguridad</h2><p class=\"muted\">Todos los comandos de moderación del bot están agrupados aquí.</p></div><div class=\"card\"><label>Canal de logs</label><input class=\"input\" id=\"ml\" value=\"'+esc(c.logsChannelId||'')+'\"><button class=\"btn\" id=\"save\">Guardar</button></div>'+cmds(['/ban','/unban','/kick','/timeout','/untimeout','/warn','/warnings','/clearwarns','/clear','/lock','/unlock','/slowmode','/nick','/userinfo','/serverinfo']);$('#save').onclick=()=>save({logsChannelId:$('#ml').value.trim()||null});return}\nif(p==='applications'){const box=(key,title,arr)=>'<div class=\"card\"><div style=\"display:flex;justify-content:space-between;gap:10px\"><h2>'+title+'</h2><button class=\"btn secondary\" data-add=\"'+key+'\">+ Añadir</button></div><p class=\"muted\">Estas preguntas serán usadas por el comando correspondiente.</p><div>'+arr.map((q,i)=>'<div class=\"q\"><b class=\"purple\">'+(i+1)+'.</b><textarea data-q=\"'+key+'\">'+esc(q)+'</textarea><button class=\"btn danger\" data-del=\"'+key+'\" data-i=\"'+i+'\">Eliminar</button></div>').join('')+'</div><button class=\"btn\" data-save=\"'+key+'\">Guardar preguntas</button></div>';$('#page').innerHTML='<div class=\"hero\"><div class=\"eyebrow\">APPLICATIONS</div><h2>Panel de postulaciones</h2><p class=\"muted\">Aquí puedes cambiar exactamente las preguntas de <b>/post-staff</b> y <b>/post-alter</b>.</p></div>'+box('staffQuestions','Post-Staff',c.staffQuestions||[])+box('alterQuestions','Post-Alter',c.alterQuestions||[])+cmds(['/post-staff','/post-alter']);document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{state.config[b.dataset.add]=[...(state.config[b.dataset.add]||[]),'Nueva pregunta'];render('applications')});document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{state.config[b.dataset.del].splice(+b.dataset.i,1);render('applications')});document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>save({[b.dataset.save]:[...document.querySelectorAll('[data-q=\"'+b.dataset.save+'\"]')].map(x=>x.value.trim()).filter(Boolean)}));return}\nif(p==='vouches'){const total=Object.values(c.vouches||{}).reduce((a,x)=>a+Number(x||0),0);$('#page').innerHTML='<div class=\"hero\"><div class=\"eyebrow\">VOUCHES</div><h2>Reputación del servidor</h2><p class=\"muted\">Total registrado: <b>'+total+'</b>. Puedes limitar el comando a un canal.</p></div><div class=\"card\"><label>ID canal de vouches</label><input class=\"input\" id=\"vc\" value=\"'+esc(c.vouchChannelId||'')+'\" placeholder=\"Vacío = cualquier canal\"><button class=\"btn\" id=\"save\">Guardar</button></div>'+cmds(['/vouch']);$('#save').onclick=()=>save({vouchChannelId:$('#vc').value.trim()||null});return}\nif(p==='logs'){$('#page').innerHTML='<div class=\"hero\"><div class=\"eyebrow\">LOGS</div><h2>Registro de actividad</h2><p class=\"muted\">Canal usado por los logs del sistema.</p></div><div class=\"card\"><label>ID canal de logs</label><input class=\"input\" id=\"lg\" value=\"'+esc(c.logsChannelId||'')+'\"><div class=\"row\"><button class=\"btn\" id=\"save\">Guardar</button><button class=\"btn secondary\" id=\"off\">Desactivar</button></div></div>'+cmds(['/modlog set','/modlog off']);$('#save').onclick=()=>save({logsChannelId:$('#lg').value.trim()||null});$('#off').onclick=()=>save({logsChannelId:null});return}\nif(p==='roles'){$('#page').innerHTML='<div class=\"hero\"><div class=\"eyebrow\">ROLES</div><h2>Permisos de Nexus</h2><p class=\"muted\">El Staff configurado aquí se usa en tickets.</p></div><div class=\"card\"><label>ID rol Staff</label><input class=\"input\" id=\"rl\" value=\"'+esc(c.staffRoleId||'')+'\"><button class=\"btn\" id=\"save\">Guardar</button></div><div class=\"card\"><h2>Acceso completo</h2><span class=\"pill\">1554252558359470182</span></div>'+cmds(['/ticket setup']);$('#save').onclick=()=>save({staffRoleId:$('#rl').value.trim()||null})}}\nasync function boot(){try{const me=await api('/api/me');if(!me.authenticated){$('#login').classList.remove('hidden');return}$('#app').classList.remove('hidden');state.guilds=await api('/api/guilds');if(!state.guilds.length)throw Error('No tienes un servidor administrable con Nexus.');state.guild=state.guilds[0];$('#guild').innerHTML=state.guilds.map(g=>'<option value=\"'+esc(g.id)+'\">'+esc(g.name)+'</option>').join('');$('#guild').onchange=async()=>{state.guild=state.guilds.find(g=>g.id===$('#guild').value)||state.guild[0];await load()};await load()}catch(e){if(e.message==='auth')location.reload();else document.body.innerHTML='<div class=\"card login\"><h1>Nexus Control</h1><p>'+esc(e.message)+'</p><a class=\"btn\" href=\"/auth/discord\">Volver</a></div>'}}\ndocument.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>render(b.dataset.page));$('#logout').onclick=()=>location.href='/auth/logout';boot();\n</script></body></html>`;
const server = http.createServer(async (req,res) => {
 try {
  const requestPath=new URL(req.url,"http://localhost").pathname;
  if(requestPath==="/"||requestPath==="/index.html"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});return res.end(fs.readFileSync(path.join(__dirname,"dashboard-v2.html"),"utf8"))}
  if(requestPath==="/auth/discord"){const redirect=encodeURIComponent(DISCORD_REDIRECT_URI);return res.writeHead(302,{Location:"https://discord.com/oauth2/authorize?client_id="+CLIENT_ID+"&response_type=code&redirect_uri="+redirect+"&scope=identify%20guilds"}).end()}
  if(requestPath.startsWith("/auth/discord/callback")){const code=new URL(req.url,"http://localhost").searchParams.get("code");if(!code||!DISCORD_CLIENT_SECRET)return res.end(JSON.stringify({error:"Falta configurar DISCORD_CLIENT_SECRET."}));const token=await discordRequest("https://discord.com/api/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:CLIENT_ID,client_secret:DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code,redirect_uri:DISCORD_REDIRECT_URI}).toString()});if(token.status!==200)return res.end(JSON.stringify({error:"OAuth2 rechazado por Discord.",status:token.status}));const me=await discordRequest("https://discord.com/api/users/@me",{headers:{Authorization:"Bearer "+token.body.access_token}});const gs=await discordRequest("https://discord.com/api/users/@me/guilds",{headers:{Authorization:"Bearer "+token.body.access_token}});const id=require("node:crypto").randomUUID();sessions.set(id,{user:me.body,guilds:gs.body.filter(g=>(Number(g.permissions)&0x20)===0x20||(Number(g.permissions)&0x8)===0x8)});res.writeHead(302,{"Set-Cookie":"dash_session="+id+"; HttpOnly; Path=/; SameSite=Lax","Location":"/"});return res.end()}
  if(requestPath==="/auth/logout"){res.writeHead(302,{"Set-Cookie":"dash_session=; Max-Age=0; Path=/","Location":"/"});return res.end()}
  if(requestPath==="/api/me"){const u=dashboardUser(req);res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify({authenticated:!!u,user:u?.user||null}))}
  if(requestPath==="/api/guilds"){const u=dashboardUser(req);if(!u)return sendJSON(res,401,{error:"No autenticado"});res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify(u.guilds))}
  if(requestPath.startsWith("/api/activity/")){
    const u=dashboardUser(req); if(!u)return sendJSON(res,401,{error:"No autenticado"});
    const guildId=requestPath.split("/").pop(); if(!u.guilds.some(g=>g.id===guildId))return sendJSON(res,403,{error:"Sin acceso"});
    const limit=Math.min(Math.max(Number(new URL(req.url,"http://localhost").searchParams.get("limit")||100),1),500);
    const events=getGuild(guildId).activity||[];
    res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"}); return res.end(JSON.stringify(events.slice(0,limit)));
  }
  if(requestPath.startsWith("/api/ai/") && req.method==="POST"){
    const u=dashboardUser(req); if(!u)return sendJSON(res,401,{error:"No autenticado"});
    const guildId=requestPath.split("/").pop(); if(!u.guilds.some(g=>g.id===guildId))return sendJSON(res,403,{error:"Sin acceso"});
    let body=""; req.on("data",x=>body+=x); req.on("end",()=>{
      try {
        const q=String(JSON.parse(body||"{}").question||"").trim().toLowerCase();
        const g=getGuild(guildId), events=g.activity||[], recent=events.slice(0,20);
        const counts=events.reduce((m,e)=>(m[e.type]=(m[e.type]||0)+1,m),{});
        let answer;
        if(!q) answer="Escribe una pregunta y analizaré la actividad del servidor.";
        else if(q.includes("qué ha pasado")||q.includes("que ha pasado")||q.includes("actividad")||q.includes("últimamente")||q.includes("ultimamente")){
          const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>k+": "+v).join(", ");
          answer="He registrado "+events.length+" eventos. Los tipos más frecuentes son "+(top||"ninguno")+". Último evento: "+(recent[0]?recent[0].type+" — "+recent[0].details:"sin actividad reciente")+".";
        } else if(q.includes("ticket")){
          const open=Object.values(g.tickets||{}).filter(t=>!t.closed).length;
          answer="Ahora mismo hay "+open+" ticket(s) abiertos. Puedes gestionar el sistema desde la sección Tickets o usar /ticket.";
        } else if(q.includes("moder")||q.includes("ban")||q.includes("warn")){
          const mod=events.filter(e=>["Ban","Unban","Comando"].includes(e.type)).slice(0,8);
          answer="En moderación tengo "+mod.length+" eventos recientes relevantes. "+(mod[0]?"El último fue "+mod[0].type+" de "+mod[0].user+".":"No veo acciones recientes de ese tipo.");
        } else if(q.includes("error")||q.includes("problema")||q.includes("bug")){
          answer="Puedo detectar actividad de Discord, pero los errores internos de Node aparecen en los logs de Fadehost/Render. En este panel sí puedo señalar eventos anómalos o actividad reciente.";
        } else if(q.includes("cómo")||q.includes("como")||q.includes("ayuda")||q.includes("configur")){
          answer="Puedes usar Tickets para configurar soporte, Postulaciones para editar preguntas, Logs/Actividad para revisar eventos y este chat para analizar lo ocurrido.";
        } else {
          answer="Entiendo la pregunta. En este momento puedo analizar "+events.length+" eventos guardados, tickets, moderación y configuración. Prueba: “¿qué ha pasado últimamente?”, “¿cuántos tickets hay?” o “¿qué actividad de moderación hubo?”.";
        }
        res.writeHead(200,{"Content-Type":"application/json"}); res.end(JSON.stringify({answer}));
      } catch { res.writeHead(400,{"Content-Type":"application/json"}); res.end(JSON.stringify({error:"Pregunta inválida"})); }
    }); return;
  }
  if(requestPath.startsWith("/api/config/")){const u=dashboardUser(req);if(!u)return sendJSON(res,401,{error:"No autenticado"});const guildId=req.url.split("/").pop();if(!u.guilds.some(g=>g.id===guildId))return sendJSON(res,403,{error:"Sin acceso"});if(req.method==="GET"){res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify(guildConfig(guildId)))}let body="";req.on("data",x=>body+=x);req.on("end",()=>{try{const p=JSON.parse(body||"{}"),g=getGuild(guildId);for(const k of ["categoryId","staffRoleId","logsChannelId","vouchChannelId"])if(Object.prototype.hasOwnProperty.call(p,k))g[k]=p[k]||null;for(const k of ["staffQuestions","alterQuestions"])if(Array.isArray(p[k]))g[k]=p[k].filter(x=>typeof x==="string"&&x.trim()).slice(0,20);saveDB();res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify(guildConfig(guildId)))}catch{res.writeHead(400,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"JSON inválido"}))}});return}
  if(req.method==="GET"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});return res.end(dashboardHTML)}
  res.writeHead(404,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"Ruta no encontrada"}));
 }catch(e){console.error("Dashboard error:",e);res.writeHead(500,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"Error interno del dashboard."}))}
});
setInterval(() => { try { saveDB(); } catch {} }, 5000);\nserver.listen(PORT,"0.0.0.0",()=>console.log("Health server en puerto "+PORT));
const RUN_BOT = process.env.RUN_BOT === "true" || !process.env.RENDER_SERVICE_ID;
if (RUN_BOT) {
  if (!TOKEN) {
    console.error("FATAL: falta DISCORD_TOKEN (también acepta BOT_TOKEN o TOKEN). El bot no puede iniciar.");
  } else {
    client.login(TOKEN).then(()=>console.log("Nexus conectado a Discord correctamente.")).catch(error=>{
      console.error("No se pudo iniciar sesión en Discord:", error?.message || error);
      process.exit(1);
    });
  }
} else {
  console.log("Servicio de Dashboard: bot Discord desactivado.");
}
