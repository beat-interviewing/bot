const { Challenge } = require('./challenge');
const { I18n } = require('./i18n');
const { ProbotOctokit, Probot } = require("probot");
const express = require('express');
const app = express();

/**
 * This is the main entrypoint to our Probot app
 * 
 * For more information on building apps:
 * https://probot.github.io/docs/
 * 
 * To get your app running against GitHub, see:
 * https://probot.github.io/docs/development/
 * 
 * @param {Probot} bot
 */
module.exports = async (bot) => {

  const i18n = new I18n('i18n', 'en');
  await i18n.load();

  const octokit = new ProbotOctokit({
    auth: {
      type: 'token',
      token: process.env.GITHUB_TOKEN,
      tokenType: 'oauth'
    },
  });

  const challenge = new Challenge(octokit, i18n);
  challenge.register(bot);
};