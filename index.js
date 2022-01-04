const { Challenge } = require('./challenge');
const { ProbotOctokit } = require("probot");
require('dotenv').config();

const octokit = new ProbotOctokit({
  auth: {
    type: 'token',
    token: process.env.GITHUB_TOKEN,
    tokenType: 'oauth'
  },
});

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} robot
 */
module.exports = (robot) => {

  robot.log.info("acme-interviewing[bot] starting...");

  let challenge = new Challenge(octokit);
  challenge.register(robot);

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
