const pino = require('pino');
const { getTransformStream } = require('@probot/pino');

const transform = getTransformStream();
transform.pipe(pino.destination(1));
const log = pino({
    name: "probot",
    level: process.env.LOG_LEVEL || "info"
}, transform);

module.exports = log;
