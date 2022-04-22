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
  async onStateChange(req, res) {

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
      log.error(err);
      // res.status(500).json(err);
    }
  }

  async listChallenges(req, res) {

    const topics = [
      'take-home-assignment',
      'code-review',
      'live-coding',
    ];

    const { data } = await this.octokit.search.repos({
      q: 'org:beat-interviewing+topic:greenhouse'
    });

    res.json(data.items.map(i => {
      return {
        "partner_test_id": i.full_name,
        "partner_test_name": i.description
      };
    }));
  }

  async createChallenge(req, res) {

    let {
      partner_test_id: repository,
      candidate: {
        first_name: firstName,
        last_name: lastName,
        email: email,
        greenhouse_profile_url: profileUrl
      }
    } = req.body;

    try {
      let username = await this.lookupUsername(email);

      let [repoOwner, repo] = repository.split('/');

      const { data: issue } = await this.octokit.issues.create({
        owner: repoOwner,
        repo: repo,
        title: `Challenge ${firstName} ${lastName} to complete \`${repo}\``,
        body: `/challenge @${username}`
      });

      return res.json(issue);
    } catch (err) {
      return res.json(err);
    }
  }

  async lookupUsername(email) {
    const { data: users } = await this.octokit.search.users({
      q: `${email} in:email`,
    });

    if (users.total_count > 0) {
      return users.items[0].login;
    }

    const { data: commits } = await this.octokit.search.commits({
      q: `author-email:${email}`,
      sort: 'author-date',
      per_page: 1,
    });

    if (commits.total_count === 0) {
      throw new Error(`User not found on GitHub: ${email}`);
    }

    return commits.items[0].author.login;
  }

  /**
   * Registers http endpoints for Greenhouse webhooks
   * 
   * @param {Router} router 
   */
  register(router) {
    router.use(bodyParser.json());
    router.get('/greenhouse/challenges', this.listChallenges.bind(this));
    router.post('/greenhouse/challenges', this.createChallenge.bind(this));
    router.post('/greenhouse/webhooks/candidate-state-change', this.onStateChange.bind(this));
  }
}

module.exports.Greenhouse = Greenhouse;
