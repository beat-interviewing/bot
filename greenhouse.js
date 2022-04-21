const log = require('./log');
const bodyParser = require('body-parser');

class Greenhouse {

  /**
   * @param {ProbotOctokit} octokit
   * @param {I18n} i18n
   */
  constructor(octokit, i18n) {
    this.octokit = octokit;
    this.i18n = i18n;
  }

  /**
   * @param {*} req 
   * @param {*} res 
   */
  async handler(req, res) {

    log.info(req.body);

    let payload = req.body.payload;

    try {
      if (payload.current_stage.name !== 'Exercise IX') {
        res.status(201).end();
      }
      
      let username = payload.candidate.custom_fields.github_username.value;
      
      await this.octokit.issues.create({
        owner: 'beat-interviewing',
        repo: 'go-code-review',
        title: `Challenge @${username}`,
        body: `/challenge @${username}`
      });

      res.send('OK');
    } catch (err) {
      log.error(err)
      // res.status(500).json(err);
    }
  }

  /**
   * Registers http endpoints for Greenhouse webhooks
   * 
   * @param {Router} router 
   */
  register(router) {
    router.use(bodyParser.json());
    router.post('/greenhouse', this.handler.bind(this));
  }
}

module.exports.Greenhouse = Greenhouse;
