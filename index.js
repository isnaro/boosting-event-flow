const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const moment = require('moment-timezone');
require('dotenv').config();
const keepAlive = require('./keep_alive'); // Import keep_alive.js

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
const rolesFilePath = './roles.json'; // Path to the roles tracking file
const boosterParentRoleId = '1230560850201415680'; // Parent role ID under which custom roles should appear

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    keepAlive(); // Call the keepAlive function
    loadRolesData();
});

// Load roles data from file
let rolesData = {};
function loadRolesData() {
    if (fs.existsSync(rolesFilePath)) {
        rolesData = JSON.parse(fs.readFileSync(rolesFilePath, 'utf8'));
    }
}

// Save roles data to file
function saveRolesData() {
    fs.writeFileSync(rolesFilePath, JSON.stringify(rolesData, null, 2));
}

// Listener for new boosts
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
        console.log(`Member ${newMember.user.tag} has started boosting in guild ${newMember.guild.id}.`);
        if (newMember.guild.id === serverId) {
            sendBoostEmbed(newMember);
        } else {
            console.log(`Boost not in target guild: ${newMember.guild.id}`);
        }
    }
});

// Function to send boost embed
async function sendBoostEmbed(member) {
    try {
        if (!member.guild) {
            console.error('Guild not found for member');
            return;
        }

        console.log(`Sending boost embed for member ${member.user.tag} in guild ${member.guild.id}`);

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

// Command to manually send the boost embed for testing
client.on('messageCreate', async message => {
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
        const subAction = args.shift().toLowerCase();
        const subValue = args.join(' ');

        let userRoles = rolesData[message.member.id] || { roleId: null, giftedTo: [], boosts: 0 };

        if (subCommand === 'role') {
            const loadingMessage = await message.reply('<a:FLOW_Boosts:1240791270822117386>');

            if (subAction === 'name') {
                if (userRoles.roleId && await message.guild.roles.fetch(userRoles.roleId)) {
                    await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> You can only create one custom role.`);
                    return;
                }
                if (!subValue) {
                    await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Please provide a role name.`);
                    return;
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
                saveRolesData();
                await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Successfully created the role ${role.name}`);
                return;
            }

            if (!userRoles.roleId) {
                await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> You must first create a custom role using the "role name <role-name>" command.`);
                return;
            }

            const role = await message.guild.roles.fetch(userRoles.roleId);

            if (subAction === 'color') {
                if (!/^#[0-9A-F]{6}$/i.test(subValue)) {
                    await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Please provide a valid hex color code.`);
                    return;
                }
                await role.setColor(subValue);
                await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Successfully set the color to ${subValue}`);
                return;
            }

            if (subAction === 'icon') {
                if (message.attachments.size > 0) {
                    const iconUrl = message.attachments.first().url;
                    await role.setIcon(iconUrl);
                    await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Successfully set the icon to the uploaded image.`);
                    return;
                } else if (subValue) {
                    await role.setIcon(subValue);
                    await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Successfully set the icon to ${subValue}`);
                    return;
                } else {
                    await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Please provide an image link or upload an image.`);
                    return;
                }
            }

            if (subAction === 'gift') {
                const mentionedUser = message.mentions.members.first();
                if (!mentionedUser) {
                    await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Please mention a user to gift the role to.`);
                    return;
                }

                const memberBoosts = message.member.premiumSinceTimestamp ? 1 : 0;
                if (userRoles.boosts < memberBoosts) {
                    userRoles.boosts = memberBoosts;
                    rolesData[message.member.id] = userRoles;
                    saveRolesData();
                }

                const maxGifts = userRoles.boosts === 1 ? 4 : 10;
                if (userRoles.giftedTo.length >= maxGifts) {
                    await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> You have reached the maximum number of gifts.`);
                    return;
                }

                await mentionedUser.roles.add(role);
                userRoles.giftedTo.push(mentionedUser.id);
               
                userRoles.giftedTo.push(mentionedUser.id);
                rolesData[message.member.id] = userRoles;
                saveRolesData();
                await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Successfully gifted the role to ${mentionedUser.user.tag} ${userRoles.giftedTo.length}/${maxGifts}`);
                return;
            }

            if (subAction === 'delete') {
                if (!userRoles.roleId) {
                    await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> You don't have a custom role to delete.`);
                    return;
                }

                const role = await message.guild.roles.fetch(userRoles.roleId);
                if (role) {
                    await role.delete();
                }

                delete rolesData[message.member.id];
                saveRolesData();
                await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Successfully deleted your custom role.`);
                return;
            }

            if (subAction === 'remove') {
                const mentionedUser = message.mentions.members.first();
                if (!mentionedUser) {
                    await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Please mention a user to remove the role from.`);
                    return;
                }

                if (!userRoles.giftedTo.includes(mentionedUser.id)) {
                    await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> The mentioned user does not have the role.`);
                    return;
                }

                const role = await message.guild.roles.fetch(userRoles.roleId);
                if (!role) {
                    await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Custom role not found.`);
                    return;
                }

                await mentionedUser.roles.remove(role);
                userRoles.giftedTo = userRoles.giftedTo.filter(id => id !== mentionedUser.id);
                rolesData[message.member.id] = userRoles;
                saveRolesData();
                await loadingMessage.edit(`<a:FLOW_verifed:1238504822676656218> Successfully removed the role from ${mentionedUser.user.tag}.`);
                return;
            }
        }

        // Handle boost help command
        if (subCommand === 'boost' && subAction === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('Boosting Roles Help')
                .setDescription('Here is the full help about the boosting roles:')
                .addFields(
                    { name: 'Create Custom Role', value: '`role name <role-name>`: Create a custom role with the specified name.' },
                    { name: 'Update Role Name', value: '`role name <role-name>`: Update the name of your custom role.' },
                    { name: 'Set Role Color', value: '`role color <hex-code>`: Set the color of your custom role using a hex code.' },
                    { name: 'Set Role Icon', value: '`role icon <image-link or upload>`: Set the icon of your custom role using an image link or upload.' },
                    { name: 'Gift Role', value: '`role gift <user-mention>`: Gift your custom role to a specified user. You can gift the role to up to 4 friends if you have boosted once, and up to 10 friends if you have boosted twice.' },
                    { name: 'Remove Role', value: '`role remove <user-mention>`: Remove the custom role from a specified user, freeing up a slot for another friend.' },
                    { name: 'Delete Role', value: '`role delete`: Delete your custom role.' }
                )
                .setFooter({ text: 'FLOW | BOOSTING SYSTEM' })
                .setTimestamp();

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
