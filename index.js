
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

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || "1557167878183067688";
const GUILD_ID = process.env.GUILD_ID || "1554248808194642040";
const PORT = Number(process.env.PORT || 3000);
const TICKET_IMAGE_URL = process.env.TICKET_IMAGE_URL || "";
const BOT_BRAND = "Nexus";
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://nexush-1xmz.onrender.com";
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


if (!TOKEN) {
  console.error("Falta DISCORD_TOKEN en las variables de entorno.");
  process.exit(1);
}

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

function getGuild(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      categoryId: null,
      staffRoleId: null,
      logsChannelId: null,
      tickets: {},
      warnings: {},
      vouches: {}
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

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
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
      const questions = [
        "👤 ¿Cuál es tu nombre/usuario de Discord?",
        "🎂 ¿Qué edad tienes?",
        "🌎 ¿De qué país eres y cuál es tu zona horaria?",
        "⏰ ¿Cuánto tiempo puedes estar activo en el servidor diariamente?",
        "🧠 ¿Has tenido experiencia como Helper, Moderador o Staff en otros servidores?",
        "🎯 ¿Por qué quieres formar parte del Staff de nuestro servidor?",
        "🛠️ ¿Qué harías si un usuario está haciendo spam, estafando o incumpliendo las reglas?",
        "⚖️ Si un amigo tuyo incumple las reglas, ¿lo sancionarías? ¿Por qué?",
        "🚨 ¿Qué harías si dos usuarios tienen una discusión dentro del servidor?",
        "⭐ ¿Por qué deberíamos elegirte como Helper y qué puedes aportar al servidor?"
      ];

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
      const questions = [
        "👤 ¿Cuál es tu usuario de Discord?",
        "🌎 ¿De qué país eres?",
        "🎂 ¿Qué edad tienes?",
        "📦 ¿De dónde consigues las cuentas que entregas?",
        "🎮 ¿Qué tipo de cuentas manejas y qué cantidad de stock tienes actualmente?",
        "🔄 ¿Con qué frecuencia puedes reponer tu stock?",
        "🎉 ¿Cuántos sorteos o drops podrías realizar al día?",
        "🎁 ¿Qué cantidad de cuentas podrías aportar semanalmente?",
        "🛡️ ¿Cómo garantizas que las cuentas que entregas funcionan correctamente?",
        "⭐ ¿Por qué quieres ser Alter de nuestro servidor y qué puedes aportar?"
      ];

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

client.on("error", error => console.error("Discord client error:", error));

const dashboardHTML = "<!doctype html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>Nexus Control</title>\n<style>\n:root{--bg:#15131b;--panel:#211d2b;--panel2:#292334;--border:#393044;--text:#f5f2fa;--muted:#aaa1b8;--accent:#8b2cff;--accent2:#a65cff;--green:#57f287;--red:#ed4245}\n*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#241536 0,#15131b 42%);color:var(--text);font:15px system-ui,-apple-system,Segoe UI,sans-serif}.app{min-height:100vh;display:flex}.side{width:245px;background:#18151f;border-right:1px solid var(--border);padding:22px 14px}.brand{font-size:22px;font-weight:800;padding:10px 12px 22px}.brand span{color:var(--accent2)}.nav button{width:100%;border:0;background:transparent;color:var(--muted);text-align:left;padding:12px;border-radius:10px;margin:2px 0;cursor:pointer;font-size:14px}.nav button.active,.nav button:hover{background:#2b2038;color:#fff}.main{flex:1;padding:28px;max-width:1050px}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:24px}.top h1{margin:0;font-size:28px}.muted{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:14px}.card h2{margin:0 0 8px;font-size:18px}.stat{font-size:26px;font-weight:800}.row{display:flex;gap:10px;flex-wrap:wrap}.btn{background:var(--accent);color:#fff;border:0;border-radius:9px;padding:10px 14px;cursor:pointer;font-weight:700}.btn.secondary{background:#342c3e}.btn.danger{background:#7e2930}.input,select{width:100%;background:#17141d;border:1px solid var(--border);color:#fff;border-radius:9px;padding:11px;margin:7px 0 14px}label{display:block;color:#d7d0df;font-weight:650}.pill{display:inline-block;background:#342c3e;border-radius:999px;padding:5px 9px;font-size:12px;color:#ddd}.cmd{font-family:ui-monospace,monospace;background:#17141d;border:1px solid var(--border);padding:9px;border-radius:8px;margin:7px 0;color:#ddd}.login{max-width:500px;margin:15vh auto;padding:26px}.hidden{display:none}@media(max-width:760px){.side{width:190px}.grid{grid-template-columns:1fr}.main{padding:18px}.top{align-items:flex-start;flex-direction:column}}\n</style>\n</head>\n<body>\n<div id=\"login\" class=\"card login hidden\"><h1>Nexus Control</h1><p class=\"muted\">Panel de administración para tu bot Nexus.</p><a class=\"btn\" href=\"/auth/discord\">Iniciar sesión con Discord</a></div>\n<div id=\"app\" class=\"app hidden\">\n<aside class=\"side\"><div class=\"brand\">Nexus <span>Control</span></div><div class=\"nav\">\n<button data-page=\"home\">⌂ Inicio</button><button data-page=\"tickets\">🎫 Tickets</button><button data-page=\"moderation\">🛡️ Moderación</button><button data-page=\"applications\">📝 Postulaciones</button><button data-page=\"vouches\">⭐ Vouches</button><button data-page=\"logs\">📋 Logs</button><button data-page=\"roles\">👥 Roles</button>\n</div><button class=\"btn secondary\" id=\"logout\" style=\"width:100%;margin-top:20px\">Salir</button></aside>\n<main class=\"main\"><div class=\"top\"><div><h1 id=\"title\">Inicio</h1><div class=\"muted\">Panel adaptado a los comandos reales de <b>Nexus</b>.</div></div><select id=\"guild\" style=\"width:auto;min-width:220px;margin:0\"></select></div><section id=\"page\"></section></main>\n</div>\n<script>\nconst $=s=>document.querySelector(s);const state={guild:null,config:{},guilds:[]};\nasync function api(url,opt){const r=await fetch(url,opt);if(r.status===401)throw new Error('auth');const j=await r.json();if(!r.ok)throw new Error(j.error||'Error');return j}\nfunction esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]))}\nfunction commands(list){return '<div class=\"card\"><h2>Comandos disponibles</h2>'+list.map(x=>'<div class=\"cmd\">'+esc(x)+'</div>').join('')+'</div>'}\nasync function loadConfig(){state.config=await api('/api/config/'+state.guild.id);renderPage(current)}\nasync function saveConfig(p){state.config={...state.config,...p};await api('/api/config/'+state.guild.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});alert('Configuración guardada.')}\nlet current='home';\nfunction renderPage(page){current=page;const titles={home:'Inicio',tickets:'Tickets',moderation:'Moderación',applications:'Postulaciones',vouches:'Vouches',logs:'Logs',roles:'Roles'};$('#title').textContent=titles[page]||'Inicio';let c=state.config;\nif(page==='home'){$('#page').innerHTML='<div class=\"grid\"><div class=\"card\"><div class=\"muted\">Servidor</div><div class=\"stat\">'+esc(state.guild.name)+'</div></div><div class=\"card\"><div class=\"muted\">Tickets abiertos</div><div class=\"stat\">'+esc(c.openTickets??'—')+'</div></div><div class=\"card\"><div class=\"muted\">Sistema</div><div class=\"stat\">Online</div></div></div><div class=\"card\"><h2>Configuración actual</h2><p class=\"muted\">Categoría: '+(c.categoryId?'<span class=\"pill\">'+esc(c.categoryId)+'</span>':'No configurada')+' · Staff: '+(c.staffRoleId?'<span class=\"pill\">'+esc(c.staffRoleId)+'</span>':'No configurado')+' · Logs: '+(c.logsChannelId?'<span class=\"pill\">'+esc(c.logsChannelId)+'</span>':'No configurado')+'</p></div>'+commands(['/ticket panel','/ticket setup','/ticket list','/modlog set']);return}\nif(page==='tickets'){$('#page').innerHTML='<div class=\"card\"><h2>🎫 Sistema de Tickets</h2><p class=\"muted\">Estas opciones corresponden directamente a <code>/ticket setup</code> del bot.</p><label>ID de categoría</label><input class=\"input\" id=\"categoryId\" value=\"'+esc(c.categoryId||'')+'\" placeholder=\"ID de categoría\"><label>ID del rol Staff</label><input class=\"input\" id=\"staffRoleId\" value=\"'+esc(c.staffRoleId||'')+'\" placeholder=\"ID del rol\"><label>ID del canal de logs</label><input class=\"input\" id=\"logsChannelId\" value=\"'+esc(c.logsChannelId||'')+'\" placeholder=\"ID del canal\"><button class=\"btn\" id=\"save\">Guardar configuración</button></div>'+commands(['/ticket panel','/ticket setup','/ticket close','/ticket reopen','/ticket delete','/ticket claim','/ticket unclaim','/ticket add','/ticket remove','/ticket rename','/ticket transcript','/ticket list']);$('#save').onclick=()=>saveConfig({categoryId:$('#categoryId').value.trim()||null,staffRoleId:$('#staffRoleId').value.trim()||null,logsChannelId:$('#logsChannelId').value.trim()||null});return}\nif(page==='moderation'){$('#page').innerHTML='<div class=\"card\"><h2>🛡️ Moderación</h2><p class=\"muted\">Los comandos de esta sección requieren Staff/Admin según el bot.</p></div>'+commands(['/ban','/unban','/kick','/timeout','/untimeout','/warn','/warnings','/clearwarns','/clear','/lock','/unlock','/slowmode','/nick','/userinfo','/serverinfo']);return}\nif(page==='applications'){$('#page').innerHTML='<div class=\"card\"><h2>📝 Postulaciones</h2><p>Publica los formularios directamente desde Discord.</p><div class=\"row\"><button class=\"btn\" id=\"staff\">/post-staff</button><button class=\"btn\" id=\"alter\">/post-alter</button></div><p class=\"muted\" style=\"margin-top:12px\">Los formularios y sus preguntas están definidos en el código actual del bot.</p></div>'+commands(['/post-staff','/post-alter']);return}\nif(page==='vouches'){$('#page').innerHTML='<div class=\"card\"><h2>⭐ Vouches</h2><p class=\"muted\">Sistema de vouches del bot. El contador se guarda por servidor.</p></div>'+commands(['/vouch']);return}\nif(page==='logs'){$('#page').innerHTML='<div class=\"card\"><h2>📋 Logs</h2><p class=\"muted\">El canal configurado aquí es el mismo que usa <code>/modlog set</code> y el sistema de tickets.</p><label>ID del canal de logs</label><input class=\"input\" id=\"log\" value=\"'+esc(c.logsChannelId||'')+'\"><button class=\"btn\" id=\"save\">Guardar</button></div>'+commands(['/modlog set','/modlog off','/ticket setup']);$('#save').onclick=()=>saveConfig({logsChannelId:$('#log').value.trim()||null});return}\nif(page==='roles'){$('#page').innerHTML='<div class=\"card\"><h2>👥 Roles</h2><p class=\"muted\">Rol Staff usado por <code>/ticket setup</code>.</p><label>ID del rol Staff</label><input class=\"input\" id=\"role\" value=\"'+esc(c.staffRoleId||'')+'\"><button class=\"btn\" id=\"save\">Guardar</button></div>'+commands(['/ticket setup']);$('#save').onclick=()=>saveConfig({staffRoleId:$('#role').value.trim()||null});}\n}\nasync function boot(){try{const me=await api('/api/me');if(!me.authenticated){$('#login').classList.remove('hidden');return}$('#app').classList.remove('hidden');state.guilds=await api('/api/guilds');if(!state.guilds.length)throw new Error('No tienes un servidor administrable con Nexus.');state.guild=state.guilds[0];$('#guild').innerHTML=state.guilds.map(g=>'<option value=\"'+esc(g.id)+'\">'+esc(g.name)+'</option>').join('');$('#guild').onchange=async()=>{state.guild=state.guilds.find(g=>g.id===$('#guild').value);await loadConfig()};await loadConfig()}catch(e){if(e.message==='auth')location.reload();else{document.body.innerHTML='<div class=\"card login\"><h1>Nexus Control</h1><p>'+esc(e.message)+'</p><a class=\"btn\" href=\"/auth/discord\">Volver a iniciar sesión</a></div>'}}}\ndocument.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>renderPage(b.dataset.page));$('#logout').onclick=()=>location.href='/auth/logout';boot();\n</script>\n</body></html>";
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/" || req.url === "/index.html") { res.writeHead(200, {"Content-Type":"text/html; charset=utf-8"}); return res.end(dashboardHTML); }
    if (req.url === "/auth/discord") { const redirect=encodeURIComponent(DISCORD_REDIRECT_URI); return res.writeHead(302,{Location:"https://discord.com/oauth2/authorize?client_id="+CLIENT_ID+"&response_type=code&redirect_uri="+redirect+"&scope=identify%20guilds"}).end(); }
    if (req.url.startsWith("/auth/discord/callback")) {
      const code=new URL(req.url,"http://localhost").searchParams.get("code"); if(!code||!DISCORD_CLIENT_SECRET)return res.end(JSON.stringify({error:"Falta configurar DISCORD_CLIENT_SECRET."}));
      const token=await discordRequest("https://discord.com/api/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:CLIENT_ID,client_secret:DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code,redirect_uri:DISCORD_REDIRECT_URI}).toString()});
      if(token.status!==200)return res.end(JSON.stringify({error:"OAuth2 rechazado por Discord.",status:token.status}));
      const me=await discordRequest("https://discord.com/api/users/@me",{headers:{Authorization:"Bearer "+token.body.access_token}});
      const gs=await discordRequest("https://discord.com/api/users/@me/guilds",{headers:{Authorization:"Bearer "+token.body.access_token}});
      const id=require("node:crypto").randomUUID();sessions.set(id,{user:me.body,guilds:gs.body.filter(g=>(Number(g.permissions)&0x20)===0x20 || (Number(g.permissions)&0x8)===0x8)});res.writeHead(302,{"Set-Cookie":"dash_session="+id+"; HttpOnly; Path=/; SameSite=Lax","Location":"/"});return res.end();
    }
    if(req.url==="/auth/logout"){res.writeHead(302,{"Set-Cookie":"dash_session=; Max-Age=0; Path=/","Location":"/"});return res.end();}
    if(req.url==="/api/me"){const u=dashboardUser(req);res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify({authenticated:!!u,user:u?.user||null}));}
    if(req.url==="/api/guilds"){const u=dashboardUser(req);if(!u)return sendJSON(res,401,{error:"No autenticado"});res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify(u.guilds));}
    if(req.url.startsWith("/api/config/")){const u=dashboardUser(req);if(!u)return sendJSON(res,401,{error:"No autenticado"});const guildId=req.url.split("/").pop();if(!u.guilds.some(g=>g.id===guildId))return sendJSON(res,403,{error:"Sin acceso"});if(req.method==="GET"){res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify(guildConfig(guildId)));}let body="";req.on("data",c=>body+=c);req.on("end",()=>{try{const p=JSON.parse(body||"{}");const g=getGuild(guildId);for(const k of ["categoryId","staffRoleId","logsChannelId"])if(Object.prototype.hasOwnProperty.call(p,k))g[k]=p[k]||null;saveDB();res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify(guildConfig(guildId)));}catch{sendJSON(res,400,{error:"JSON inválido"})}});return;}
    res.writeHead(200, {"Content-Type":"text/plain; charset=utf-8"});res.end(BOT_BRAND+" Ticket Bot online.");
  } catch(e) { console.error("Dashboard error:",e);res.writeHead(500,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"Error interno del dashboard."})); }
});
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(BOT_BRAND + " Ticket Bot online.");
});

server.listen(PORT, "0.0.0.0", () => console.log("Health server en puerto " + PORT));

client.login(TOKEN).catch(error => {
  console.error("No se pudo iniciar sesión en Discord:", error);
  process.exit(1);
});
