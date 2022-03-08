const { Challenge } = require('./challenge');
const { I18n } = require('./i18n');
const { ProbotOctokit, Probot } = require("probot");
require('dotenv').config();

const octokit = new ProbotOctokit({
  auth: {
    type: 'token',
    token: process.env.GITHUB_TOKEN,
    tokenType: 'oauth'
  },
});

/**
 * This is the main entrypoint to our Probot app
 * 
 * @param {Probot} robot
 */
module.exports = async (robot) => {

  const i18n = new I18n('i18n', 'en');
  await i18n.load();

  const challenge = new Challenge(octokit, i18n);
  challenge.register(robot);

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
