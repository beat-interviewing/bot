const fs = require('fs/promises');
const path = require('path');
const Mustache = require('mustache');
const pino = require('pino');
const { getTransformStream } = require('@probot/pino');

const transform = getTransformStream();
transform.pipe(pino.destination(1));
const logger = pino({ name: "probot", }, transform);

class I18n {

  constructor(dir, locale = 'en') {
    this.dir = path.join(__dirname, dir, locale);
    this.templates = {};
    this.templatePartials = {};
  }

  async load() {
    this.templates = await this.readDir(this.dir);
    this.templatePartials = await this.readDir(path.join(this.dir, 'partials'));
    logger.info({
      templates: Object.keys(this.templates),
      partials: Object.keys(this.templatePartials)
    });
  }

  async readDir(dir) {
    const files = await fs.readdir(dir);
    const contents = {};
    for (const file of files) {
      const stat = await fs.stat(path.join(dir, file));
      if (stat.isDirectory()) {
        continue;
      }
      contents[path.parse(file).name] = await fs.readFile(path.join(dir, file), { encoding: 'utf8' });
    }
    return contents;
  }

  render(message, view) {
    return Mustache.render(this.templates[message], view, this.partials);
  }
}

module.exports.I18n = I18n;