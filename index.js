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

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    keepAlive(); // Call the keepAlive function
});

// Listener for new boosts
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
        console.log(`Member ${newMember.user.tag} has started boosting.`);
        sendBoostEmbed(newMember);
    }
});

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
