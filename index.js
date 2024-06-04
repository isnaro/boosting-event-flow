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
    if (message.channel.id === commandChannelId && message.member.roles.cache.has(boosterRoleId)) {
        const args = message.content.trim().split(/ +/);
        const subCommand = args.shift().toLowerCase();
        const subAction = args.shift().toLowerCase();
        const subValue = args.join(' ');

        let userRoles = rolesData[message.member.id] || { roleId: null, giftedTo: [], boosts: 0 };

        if (subCommand === 'custom') {
            if (subAction === 'name') {
                if (userRoles.roleId && await message.guild.roles.fetch(userRoles.roleId)) {
                    return message.reply('You can only create one custom role.');
                }
                if (!subValue) {
                    return message.reply('Please provide a role name.');
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
                return message.reply(`Successfully created the role ${role.name}`);
            }

            if (!userRoles.roleId) {
                return message.reply('You must first create a custom role using the "custom name <role-name>" command.');
            }

            const role = await message.guild.roles.fetch(userRoles.roleId);

            if (subAction === 'color') {
                if (!/^#[0-9A-F]{6}$/i.test(subValue)) {
                    return message.reply('Please provide a valid hex color code.');
                }
                await role.setColor(subValue);
                return message.reply(`Successfully set the color to ${subValue}`);
            }

            if (subAction === 'icon') {
                if (message.attachments.size > 0) {
                    const iconUrl = message.attachments.first().url;
                    await role.setIcon(iconUrl);
                    return message.reply(`Successfully set the icon to the uploaded image.`);
                } else if (subValue) {
                    await role.setIcon(subValue);
                    return message.reply(`Successfully set the icon to ${subValue}`);
                } else {
                    return message.reply('Please provide an image link or upload an image.');
                }
            }

            if (subAction === 'gift') {
                const friend = await message.guild.members.fetch(subValue).catch(err => {
                    console.error('Error fetching user:', err);
                    return null;
                });

                if (!friend) {
                    return message.reply('User not found.');
                }

                const memberBoosts = message.member.premiumSinceTimestamp ? 1 : 0;
                if (userRoles.boosts < memberBoosts) {
                    userRoles.boosts = memberBoosts;
                    rolesData[message.member.id] = userRoles;
                    saveRolesData();
                }

                const maxGifts = userRoles.boosts === 1 ? 4 : 10;
                if (userRoles.giftedTo.length >= maxGifts) {
                    return message.reply('You have reached the maximum number of gifts.');
                }

                await friend.roles.add(role);
                userRoles.giftedTo.push(friend.id);
                rolesData[message.member.id] = userRoles;
                saveRolesData();
                return message.reply(`Successfully gifted the role to ${friend.user.tag}`);
            }
        }
    }

    // Handle boost help command
    if (subCommand === 'boost' && subAction === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('Boosting Roles Help')
            .setDescription('Here is the full help about the boosting roles:')
            .addFields(
                { name: 'Create Custom Role', value: '`custom name <role-name>`: Create a custom role with the specified name.' },
                { name: 'Update Role Name', value: '`custom name <role-name>`: Update the name of your custom role.' },
                { name: 'Set Role Color', value: '`custom color <hex-code>`: Set the color of your custom role using a hex code.' },
                { name: 'Set Role Icon', value: '`custom icon <image-link or upload>`: Set the icon of your custom role using an image link or upload.' },
                { name: 'Gift Role', value: '`custom gift <user-id>`: Gift your custom role to a specified user. You can gift the role to up to 4 friends if you have boosted once, and up to 10 friends if you have boosted twice.' }
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
