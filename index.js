const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const moment = require('moment-timezone');
require('dotenv').config();
const keepAlive = require('./keep_alive'); // Import keep_alive.js
const db = require('./database'); // Import the database module

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const testBoostPrefix = '?'; // Prefix for test boost command
const boostChannelId = '1201162198647590952'; // Hardcoded boost channel ID
const serverId = '758051172803411998'; // Server ID
const boosterRoleId = '1228815979426087052'; // Role ID for server boosters
const commandChannelId = '1201097582244540426'; // Channel ID for the command
const adminCommandChannelId = '1238929943795204156'; // Admin commands channel ID
const boosterParentRoleId = '1252035185382260786'; // Parent role ID under which custom roles should appear

const basicBoosterRoleId = '1247590901165850767'; // ☄️・Basic Booster role ID
const premiumBoosterRoleId = '1247588473297309718'; // 💎・Premium Booster role ID

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    keepAlive(); // Call the keepAlive function
    loadRolesData();
});

// Load roles data from the database
let rolesData = {};
function loadRolesData() {
    db.serialize(() => {
        db.all("SELECT * FROM roles", (err, rows) => {
            if (err) {
                console.error(err.message);
                return;
            }
            rolesData = rows.reduce((acc, row) => {
                acc[row.user_id] = {
                    roleId: row.role_id,
                    giftedTo: JSON.parse(row.gifted_to),
                    boosts: row.boosts
                };
                return acc;
            }, {});
        });
    });
}

// Save roles data to the database
function saveRolesData(userId, roleData) {
    const { roleId, giftedTo, boosts } = roleData;
    db.run(`INSERT OR REPLACE INTO roles (user_id, role_id, gifted_to, boosts) VALUES (?, ?, ?, ?)`, [userId, roleId, JSON.stringify(giftedTo), boosts], (err) => {
        if (err) {
            console.error(err.message);
        }
    });
}

function deleteRoleData(userId) {
    db.run(`DELETE FROM roles WHERE user_id = ?`, [userId], (err) => {
        if (err) {
            console.error(err.message);
        }
    });
}

// Listen for messages in the system messages channel to detect boosts
client.on('messageCreate', async message => {
    if (message.channel.id === boostChannelId && message.type === 'USER_PREMIUM_GUILD_SUBSCRIPTION') {
        const member = message.member;
        console.log(`Member ${member.user.tag} has boosted the server.`);
        await handleBoostUpdate(member);
        await sendBoostEmbed(member);
    }

    if (message.author.bot) return;

    // Handle test boost command
    if (message.content.startsWith(testBoostPrefix)) {
        const args = message.content.slice(testBoostPrefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (command === 'testboost') {
            const userId = args[0];
            const user = await message.guild.members.fetch(userId).catch(err => {
                console.error('Error fetching user:', err);
                return null;
            });

            if (!user) {
                return message.reply('User not found.');
            }

            sendBoostEmbed(user);
        }
    }

    // Handle custom role commands for boosters
    if ((message.channel.id === commandChannelId || message.channel.id === adminCommandChannelId) && message.member.roles.cache.has(boosterRoleId)) {
        const args = message.content.trim().split(/ +/);
        const subCommand = args.shift().toLowerCase();
        const subAction = args.length > 0 ? args.shift().toLowerCase() : null;
        const subValue = args.join(' ');

        let userRoles = rolesData[message.member.id] || { roleId: null, giftedTo: [], boosts: 0 };

        if (subCommand === 'role') {
            const loadingMessage = await message.reply('<a:FLOW_Boosts:1240791270822117386> Loading...');

            if (subAction === 'create') {
                if (userRoles.roleId && await message.guild.roles.fetch(userRoles.roleId)) {
                    const embed = new EmbedBuilder()
                        .setTitle('Role Creation Failed')
                        .setDescription('You can only create one custom role.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    return loadingMessage.edit({ content: '', embeds: [embed] });
                }
                if (!subValue) {
                    const embed = new EmbedBuilder()
                        .setTitle('Role Creation Failed')
                        .setDescription('Please provide a role name.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    return loadingMessage.edit({ content: '', embeds: [embed] });
                }
                const role = await message.guild.roles.create({
                    name: subValue,
                    color: '#FFFFFF',
                    permissions: [],
                    position: (await message.guild.roles.fetch(boosterParentRoleId)).position - 1
                });
                await message.member.roles.add(role);
                userRoles.roleId = role.id;
                rolesData[message.member.id] = userRoles;
                saveRolesData(message.member.id, userRoles);
                const embed = new EmbedBuilder()
                    .setTitle('Role Created')
                    .setDescription(`Successfully created the role **${role.name}**. Write 'accept' to confirm.`)
                    .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                    .setTimestamp();
                await loadingMessage.edit({ content: '<a:FLOW_Boosts:1240791270822117386>', embeds: [embed] });

                const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === 'accept';
                const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

                collector.on('collect', async () => {
                    const successEmbed = new EmbedBuilder()
                        .setTitle('Role Created')
                        .setDescription('<a:FLOW_verifed:1238504822676656218> Successfully created the role.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await message.reply({ embeds: [successEmbed] });
                });
                return;
            }

            if (!userRoles.roleId) {
                const embed = new EmbedBuilder()
                    .setTitle('Role Management Failed')
                    .setDescription('You must first create a custom role using the `role create <role-name>` command.')
                    .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                    .setTimestamp();
                await loadingMessage.edit({ content: '', embeds: [embed] });
                return;
            }

            const role = await message.guild.roles.fetch(userRoles.roleId);

            if (subAction === 'name') {
                if (!subValue) {
                    const embed = new EmbedBuilder()
                        .setTitle('Role Management Failed')
                        .setDescription('Please provide a new role name.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await loadingMessage.edit({ content: '', embeds: [embed] });
                    return;
                }
                const embed = new EmbedBuilder()
                    .setTitle('Confirm Role Name Change')
                    .setDescription(`You are about to change the role name to **${subValue}**. Write 'accept' to confirm.`)
                    .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                    .setTimestamp();
                await loadingMessage.edit({ content: '<a:FLOW_Boosts:1240791270822117386>', embeds: [embed] });

                const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === 'accept';
                const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

                collector.on('collect', async () => {
                    await role.setName(subValue);
                    const successEmbed = new EmbedBuilder()
                        .setTitle('Role Name Updated')
                        .setDescription(`<a:FLOW_verifed:1238504822676656218> Successfully updated the role name to **${subValue}**.`)
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await message.reply({ embeds: [successEmbed] });
                });
                return;
            }

            if (subAction === 'color') {
                if (!/^#[0-9A-F]{6}$/i.test(subValue)) {
                    const embed = new EmbedBuilder()
                        .setTitle('Role Management Failed')
                        .setDescription('Please provide a valid hex color code.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await loadingMessage.edit({ content: '', embeds: [embed] });
                    return;
                }
                const embed = new EmbedBuilder()
                    .setTitle('Confirm Role Color Change')
                    .setDescription(`You are about to change the role color to **${subValue}**. Write 'accept' to confirm.`)
                    .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                    .setTimestamp();
                await loadingMessage.edit({ content: '<a:FLOW_Boosts:1240791270822117386>', embeds: [embed] });

                const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === 'accept';
                const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

                collector.on('collect', async () => {
                    await role.setColor(subValue);
                    const successEmbed = new EmbedBuilder()
                        .setTitle('Role Color Updated')
                        .setDescription(`<a:FLOW_verifed:1238504822676656218> Successfully set the color to **${subValue}**.`)
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await message.reply({ embeds: [successEmbed] });
                });
                return;
            }

            if (subAction === 'icon') {
                if (message.attachments.size > 0) {
                    const iconUrl = message.attachments.first().url;
                    const embed = new EmbedBuilder()
                        .setTitle('Confirm Role Icon Change')
                        .setDescription('You are about to change the role icon to the uploaded image. Write \'accept\' to confirm.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await loadingMessage.edit({ content: '<a:FLOW_Boosts:1240791270822117386>', embeds: [embed] });

                    const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === 'accept';
                    const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

                    collector.on('collect', async () => {
                        await role.setIcon(iconUrl);
                        const successEmbed = new EmbedBuilder()
                            .setTitle('Role Icon Updated')
                            .setDescription('<a:FLOW_verifed:1238504822676656218> Successfully set the icon to the uploaded image.')
                            .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                            .setTimestamp();
                        await message.reply({ embeds: [successEmbed] });
                    });
                    return;
                } else if (subValue) {
                    const embed = new EmbedBuilder()
                        .setTitle('Confirm Role Icon Change')
                        .setDescription(`You are about to change the role icon to **${subValue}**. Write 'accept' to confirm.`)
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await loadingMessage.edit({ content: '<a:FLOW_Boosts:1240791270822117386>', embeds: [embed] });

                    const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === 'accept';
                    const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

                    collector.on('collect', async () => {
                        await role.setIcon(subValue);
                        const successEmbed = new EmbedBuilder()
                            .setTitle('Role Icon Updated')
                            .setDescription(`<a:FLOW_verifed:1238504822676656218> Successfully set the icon to **${subValue}**.`)
                            .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                            .setTimestamp();
                        await message.reply({ embeds: [successEmbed] });
                    });
                    return;
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle('Role Management Failed')
                        .setDescription('Please provide an image link or upload an image.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await loadingMessage.edit({ content: '', embeds: [embed] });
                    return;
                }
            }

            if (subAction === 'gift') {
                const mentionedUser = message.mentions.members.first();
                if (!mentionedUser) {
                    const embed = new EmbedBuilder()
                        .setTitle('Role Management Failed')
                        .setDescription('Please mention a user to gift the role to.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await loadingMessage.edit({ content: '', embeds: [embed] });
                    return;
                }

                const isPremium = message.member.roles.cache.has(premiumBoosterRoleId);
                const maxGifts = isPremium ? 10 : 3;

                if (userRoles.giftedTo.length >= maxGifts) {
                    const embed = new EmbedBuilder()
                        .setTitle('Role Management Failed')
                        .setDescription('You have reached the maximum number of gifts.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await loadingMessage.edit({ content: '', embeds: [embed] });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle('Confirm Role Gift')
                    .setDescription(`You are about to gift the role to ${mentionedUser.user.tag}. Write 'accept' to confirm.`)
                    .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                    .setTimestamp();
                await loadingMessage.edit({ content: '<a:FLOW_Boosts:1240791270822117386>', embeds: [embed] });

                const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === 'accept';
                const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

                collector.on('collect', async () => {
                    await mentionedUser.roles.add(role);
                    userRoles.giftedTo.push(mentionedUser.id);
                    rolesData[message.member.id] = userRoles;
                    saveRolesData(message.member.id, userRoles);
                    const successEmbed = new EmbedBuilder()
                        .setTitle('Role Gifted')
                        .setDescription(`<a:FLOW_verifed:1238504822676656218> Successfully gifted the role to ${mentionedUser.user.tag}. ${userRoles.giftedTo.length}/${maxGifts}`)
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await message.reply({ embeds: [successEmbed] });
                });
                return;
            }

            if (subAction === 'delete') {
                if (!userRoles.roleId) {
                    const embed = new EmbedBuilder()
                        .setTitle('Role Management Failed')
                        .setDescription('You don\'t have a custom role to delete.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await loadingMessage.edit({ content: '', embeds: [embed] });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle('Confirm Role Deletion')
                    .setDescription('You are about to delete your custom role. Write \'accept\' to confirm.')
                    .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                    .setTimestamp();
                await loadingMessage.edit({ content: '<a:FLOW_Boosts:1240791270822117386>', embeds: [embed] });

                const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === 'accept';
                const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

                collector.on('collect', async () => {
                    const role = await message.guild.roles.fetch(userRoles.roleId);
                    if (role) {
                        await role.delete();
                    }

                    delete rolesData[message.member.id];
                    deleteRoleData(message.member.id);
                    const successEmbed = new EmbedBuilder()
                        .setTitle('Role Deleted')
                        .setDescription('<a:FLOW_verifed:1238504822676656218> Successfully deleted your custom role.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await message.reply({ embeds: [successEmbed] });
                });
                return;
            }

            if (subAction === 'remove') {
                const mentionedUser = message.mentions.members.first();
                if (!mentionedUser) {
                    const embed = new EmbedBuilder()
                        .setTitle('Role Management Failed')
                        .setDescription('Please mention a user to remove the role from.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await loadingMessage.edit({ content: '', embeds: [embed] });
                    return;
                }

                if (!userRoles.giftedTo.includes(mentionedUser.id)) {
                    const embed = new EmbedBuilder()
                        .setTitle('Role Management Failed')
                        .setDescription('The mentioned user does not have the role.')
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await loadingMessage.edit({ content: '', embeds: [embed] });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle('Confirm Role Removal')
                    .setDescription(`You are about to remove the role from ${mentionedUser.user.tag}. Write 'accept' to confirm.`)
                    .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                    .setTimestamp();
                await loadingMessage.edit({ content: '<a:FLOW_Boosts:1240791270822117386>', embeds: [embed] });

                const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === 'accept';
                const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

                collector.on('collect', async () => {
                    const role = await message.guild.roles.fetch(userRoles.roleId);
                    if (!role) {
                        const embed = new EmbedBuilder()
                            .setTitle('Role Management Failed')
                            .setDescription('Custom role not found.')
                            .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                            .setTimestamp();
                        await message.reply({ embeds: [embed] });
                        return;
                    }

                    await mentionedUser.roles.remove(role);
                    userRoles.giftedTo = userRoles.giftedTo.filter(id => id !== mentionedUser.id);
                    rolesData[message.member.id] = userRoles;
                    saveRolesData(message.member.id, userRoles);
                    const successEmbed = new EmbedBuilder()
                        .setTitle('Role Removed')
                        .setDescription(`<a:FLOW_verifed:1238504822676656218> Successfully removed the role from ${mentionedUser.user.tag}.`)
                        .setFooter({ text: 'FLOW | ROLE MANAGEMENT' })
                        .setTimestamp();
                    await message.reply({ embeds: [successEmbed] });
                });
                return;
            }
        }

        // Handle boost help command
        if (subCommand === 'boost' && subAction === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('Boosting Roles Help')
                .setDescription('Here is the full help about the boosting roles:')
                .addFields(
                    { name: 'Create Custom Role', value: '`role create <role-name>`: Create a custom role with the specified name.' },
                    { name: 'Update Role Name', value: '`role name <role-name>`: Update the name of your custom role.' },
                    { name: 'Set Role Color', value: '`role color <hex-code>`: Set the color of your custom role using a hex code.' },
                    { name: 'Set Role Icon', value: '`role icon <image-link or upload>`: Set the icon of your custom role using an image link or upload.' },
                    { name: 'Gift Role', value: '`role gift <user-mention>`: Gift your custom role to a specified user. You can gift the role to up to 3 friends if you have boosted once, and up to 10 friends if you have boosted twice.' },
                    { name: 'Remove Role', value: '`role remove <user-mention>`: Remove the custom role from a specified user, freeing up a slot for another friend.' },
                    { name: 'Delete Role', value: '`role delete`: Delete your custom role.' }
                )
                .setFooter({ text: 'FLOW | BOOSTING SYSTEM' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // Handle boosters list command
        if (subCommand === 'boosters' && subAction === 'list') {
            await message.guild.members.fetch(); // Ensure all members are fetched

            const boosters = message.guild.members.cache.filter(member => member.premiumSince);

            if (boosters.size === 0) {
                return message.reply('No members are currently boosting the server.');
            }

            // Handle pagination
            const boostersArray = Array.from(boosters.values());
            const pageSize = 10;
            const totalPages = Math.ceil(boostersArray.length / pageSize);

            let currentPage = 0;

            const generateEmbed = (page) => {
                const embed = new EmbedBuilder()
                    .setTitle('Server Boosters')
                    .setDescription('Here is the list of members currently boosting the server and the number of boosts they have:')
                    .setFooter({ text: `FLOW | BOOSTING SYSTEM | Page ${page + 1} of ${totalPages}` })
                    .setTimestamp();

                const start = page * pageSize;
                const end = start + pageSize;
                const pageBoosters = boostersArray.slice(start, end);

                pageBoosters.forEach(member => {
                    const customRole = rolesData[member.id];
                    const roleName = customRole ? `<@&${customRole.roleId}>` : 'No custom role';
                    embed.addFields({ name: member.user.tag, value: `Boosts: ${member.premiumSince}\nCustom Role: ${roleName}` });
                });

                return embed;
            };

            const generateButtons = (page) => {
                return new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('previous_page')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === 0),
                        new ButtonBuilder()
                            .setCustomId('next_page')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === totalPages - 1)
                    );
            };

            const embedMessage = await message.reply({ embeds: [generateEmbed(currentPage)], components: [generateButtons(currentPage)] });

            const collector = embedMessage.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async interaction => {
                if (interaction.customId === 'previous_page') {
                    currentPage--;
                } else if (interaction.customId === 'next_page') {
                    currentPage++;
                }

                await interaction.update({ embeds: [generateEmbed(currentPage)], components: [generateButtons(currentPage)] });
            });

            collector.on('end', () => {
                embedMessage.edit({ components: [] });
            });

            return;
        }

        // Handle boosters roles command
        if (subCommand === 'boosters' && subAction === 'roles') {
            const customRoles = Object.entries(rolesData);
            if (customRoles.length === 0) {
                return message.reply('No custom roles have been created by boosters.');
            }

            const embed = new EmbedBuilder()
                .setTitle('Boosters Custom Roles')
                .setDescription('Here is a list of all the custom roles created by boosters:')
                .setFooter({ text: 'FLOW | BOOSTING SYSTEM' })
                .setTimestamp();

            for (const [userId, data] of customRoles) {
                const member = await message.guild.members.fetch(userId).catch(() => null);
                if (!member) continue;
                const role = await message.guild.roles.fetch(data.roleId).catch(() => null);
                if (!role) continue;
                embed.addFields({
                    name: role.name,
                    value: `Owner: ${member.user.tag}\nMembers: ${role.members.size}\nCreated At: ${role.createdAt.toDateString()}`
                });
            }

            return message.reply({ embeds: [embed] });
        }
    }
});

// Button interaction listener
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'boosting_advantages') {
        if (!interaction.replied) {
            await interaction.reply({ content: 'Check the boosting advantages from here: <#1201478443532029974>', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

// Function to handle boost updates
async function handleBoostUpdate(member) {
    const boosts = member.guild.premiumSubscriptionCount;

    if (boosts >= 2) {
        await member.roles.add(premiumBoosterRoleId);
        await member.roles.remove(basicBoosterRoleId);
    } else if (boosts === 1) {
        await member.roles.add(basicBoosterRoleId);
        await member.roles.remove(premiumBoosterRoleId);
    }

    const userRoles = rolesData[member.id] || { roleId: null, giftedTo: [], boosts: 0 };
    userRoles.boosts = boosts;
    rolesData[member.id] = userRoles;
    saveRolesData(member.id, userRoles);

    updateGiftingLimits(member);
}

// Function to handle boost removals
async function handleBoostRemoval(member) {
    const boosts = member.guild.premiumSubscriptionCount;

    if (boosts === 1) {
        await member.roles.add(basicBoosterRoleId);
        await member.roles.remove(premiumBoosterRoleId);
        updateGiftingLimits(member);
    } else {
        await member.roles.remove(basicBoosterRoleId);
        await member.roles.remove(premiumBoosterRoleId);
        await removeCustomRole(member);
    }
}

// Function to remove custom role
async function removeCustomRole(member) {
    if (rolesData[member.id] && rolesData[member.id].roleId) {
        const role = await member.guild.roles.fetch(rolesData[member.id].roleId);
        if (role) {
            await role.delete();
        }
        delete rolesData[member.id];
        deleteRoleData(member.id);
    }
}

// Function to update gifting limits
async function updateGiftingLimits(member) {
    const userRoles = rolesData[member.id] || { roleId: null, giftedTo: [], boosts: 0 };
    const isPremium = member.roles.cache.has(premiumBoosterRoleId);
    const maxGifts = isPremium ? 10 : 3;

    if (userRoles.giftedTo.length > maxGifts) {
        const role = await member.guild.roles.fetch(userRoles.roleId);
        if (role) {
            const usersToRemove = userRoles.giftedTo.slice(maxGifts);
            for (const userId of usersToRemove) {
                const user = await member.guild.members.fetch(userId);
                await user.roles.remove(role);
            }
            userRoles.giftedTo = userRoles.giftedTo.slice(0, maxGifts);
            rolesData[member.id] = userRoles;
            saveRolesData(member.id, userRoles);
        }
    }
}

// Function to send boost embed
async function sendBoostEmbed(member) {
    try {
        if (!member.guild) {
            console.error('Guild not found for member');
            return;
        }

        const boostChannel = member.guild.channels.cache.get(boostChannelId);
        if (!boostChannel) {
            console.error('Boost channel not found');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('NEW Server Boost!')
            .setDescription(`A big thanks to ${member} for helping out with the Flow server upgrade! The community will really appreciate it`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setImage('https://media.discordapp.net/attachments/470983675157151755/1229087659977085078/mf8Uagt.png?ex=66569dd5&is=66554c55&hm=bbbbf8319f421641ce5a9762eaddd701a03e50479d377fdeb545e16d359973c6&format=webp&quality=lossless&width=889&height=554&')
            .setFooter({ text: 'FLOW | BOOSTING SYSTEM' })
            .setTimestamp();

        const boostButton = new ButtonBuilder()
            .setStyle(ButtonStyle.Primary)
            .setLabel('Boosting Advantages')
            .setEmoji('1229089677630505032')
            .setCustomId('boosting_advantages');

        const row = new ActionRowBuilder().addComponents(boostButton);

        await boostChannel.send({ embeds: [embed], components: [row] });
        console.log(`Boost embed sent to channel ${boostChannelId}`);
    } catch (error) {
        console.error('Error sending boost embed:', error);
    }
}
