const { Greenhouse } = require('./greenhouse');
const { I18n } = require('./i18n');
const { ProbotOctokit } = require("probot");
const serverless = require('serverless-http');
const express = require('express');
const app = express();
const bot = require("./bot");

require('dotenv').config();

const {
  createLambdaFunction,
  createProbot,
} = require("@probot/adapter-aws-lambda-serverless");

module.exports.github = createLambdaFunction(bot, {
  probot: createProbot(),
});

async function createGreenhouseLambdaFunction() {

  const octokit = new ProbotOctokit({
    auth: {
      type: 'token',
      token: process.env.GITHUB_TOKEN,
      tokenType: 'oauth'
    },
  });

  const i18n = new I18n('i18n', 'en');
  await i18n.load();

  const gh = new Greenhouse(octokit, i18n);
  const ghRouter = express.Router();
  app.use('/api/greenhouse', ghRouter);
  gh.register(ghRouter);

  return serverless(app);
}

module.exports.greenhouse = createGreenhouseLambdaFunction();