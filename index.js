
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || "";
const PORT = Number(process.env.PORT || 3000);
const TICKET_IMAGE_URL = process.env.TICKET_IMAGE_URL || "";
const BOT_BRAND = "Nexus";

if (!TOKEN) {
  console.error("Falta DISCORD_TOKEN en las variables de entorno.");
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "ticket-data.json");
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

  new SlashCommandBuilder().setName("vouch").setDescription("Da un vouch a un usuario y actualiza sus V.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario que recibe el vouch.").setRequired(true))
    .addStringOption(o => o.setName("mensaje").setDescription("Comentario del vouch.").setRequired(true).setMaxLength(500))
].map(c => c.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

async function registerCommands() {
  if (!CLIENT_ID) return;
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Comandos registrados en el servidor.");
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

      if (member && member.manageable) {
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

client.on("error", error => console.error("Discord client error:", error));

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(BOT_BRAND + " Ticket Bot online.");
});

server.listen(PORT, "0.0.0.0", () => console.log("Health server en puerto " + PORT));

client.login(TOKEN).catch(error => {
  console.error("No se pudo iniciar sesión en Discord:", error);
  process.exit(1);
});
