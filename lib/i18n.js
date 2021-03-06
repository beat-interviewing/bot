const fs = require('fs').promises;
const path = require('path');
const Handlebars = require("handlebars");
const log = require('./log');

class I18n {

  constructor(locale = 'en') {
    // The directory containing templates and partials.
    this.dir = path.join(__dirname, '..', 'i18n', locale);

    // The loaded templates and partials.
    this.templates = {};

    // Handlebars instance and configured helpers.
    this.handlebars = Handlebars.create();
    this.handlebars.registerHelper('json', function (context) {
      return JSON.stringify(context);
    });
    this.handlebars.registerHelper('isDefined', function (value) {
      return value !== undefined;
    });
  }

  async load() {

    const templates = await this.readDir(this.dir);
    for (const name in templates) {
      if (Object.hasOwnProperty.call(templates, name)) {
        this.templates[name] = this.handlebars.compile(templates[name]);
      }
    }

    const partials = await this.readDir(path.join(this.dir, 'partials'));
    for (const name in partials) {
      if (Object.hasOwnProperty.call(partials, name)) {
        this.handlebars.registerPartial(name, partials[name]);
      }
    }

    log.debug({ templates: Object.keys(this.templates) });
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

  render(message, context) {
    const template = this.templates[message];
    log.debug({ template: template });
    return template(context);
  }
}

module.exports.I18n = I18n;