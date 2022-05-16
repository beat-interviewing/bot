const log = require('./log');
const https = require('https');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const passport = require('passport');
const BasicStrategy = require('passport-http').BasicStrategy;

class Greenhouse {

  /**
   * @param {ProbotOctokit} octokit
   * @param {I18n} i18n
   */
  constructor(octokit, i18n, options) {
    this.octokit = octokit;
    this.i18n = i18n;

    let defaultOptions = {
      url: process.env.GREENHOUSE_URL,
      apiKey: process.env.GREENHOUSE_API_KEY,
    };

    this.options = {
      ...defaultOptions,
      ...options
    };
  }

  async listChallenges(req, res) {

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
      partner_test_id: repoFqn,
      candidate: {
        first_name: firstName,
        last_name: lastName,
        email: email,
        greenhouse_profile_url: profileUrl,
      },
      url
    } = req.body;

    try {
      let username = await this.lookupUsername(email);
      let [owner, repo] = repoFqn.split('/');

      const { data: issue } = await this.octokit.issues.create({
        owner: owner,
        repo: repo,
        title: `Challenge ${firstName} ${lastName} to complete \`${repo}\``,
        body: this.i18n.render('greenhouse-create-challenge', {
          username, firstName, lastName, email, profileUrl, url,
        }),
      });

      return res.json({ partner_interview_id: `${repoFqn}/${issue.number}` });
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

  async getChallengeStatus(req, res) {

    let issueFqn = req.query.partner_interview_id;
    let [owner, repo, issue] = issueFqn.split('/');

    const challenge = await this.getIssueMetadata(owner, repo, issue, 'challenge');

    return res.json({
      partner_status: challenge.status === 'graded' ? 'complete' : challenge.status,
      partner_profile_url: `https://github.com/${challenge.candidate}`,
      partner_score: 80,
      metadata: []
    });
  }

  async markChallengeCompleted(owner, repo, issue) {

    const req = https.request(`${this.options.url}/${owner}/${repo}/${issue}`, res => {

      log.info(res);

      res.on('data', d => {
        process.stdout.write(d);
      });
    });

    req.on('error', error => {
      console.error(error);
    });

    req.end();
  }

  async getIssueMetadata(owner, repo, issue, key = null) {

    const body = (await this.octokit.issues.get({
      owner,
      repo,
      issue_number: issue
    })).data.body || '';

    const match = body.match(/\n\n<!-- probot = (.*) -->/);

    if (match) {
      let data = JSON.parse(match[1]);
      let prefix = Object.keys(data)[0];
      data = data[prefix];

      return key ? data && data[key] : data;
    }
  }

  /**
   * Registers http endpoints for Greenhouse webhooks
   * 
   * @param {Router} router 
   */
  register(router) {

    passport.use(new BasicStrategy(
      function (apiKey, _, done) {
        const hash = crypto.createHash('sha512');
        if (crypto.timingSafeEqual(
          hash.copy().update(apiKey).digest(),
          hash.copy().update(this.options.apiKey).digest()
        )) {
          done(null, { apiKey });
        } else {
          done(null, false, { message: 'incorrect username or password' });
        }
      }.bind(this)
    ));

    router.use(bodyParser.json());
    router.use(passport.authenticate('basic', { session: false }));
    router.get('/challenges', this.listChallenges.bind(this));
    router.post('/challenges', this.createChallenge.bind(this));
    router.get('/challenges/status', this.getChallengeStatus.bind(this));
  }
}

module.exports.Greenhouse = Greenhouse;
