const axios = require('axios').default;
const log = require('./log');
const crypto = require('crypto');
const bodyParser = require('body-parser');

class Greenhouse {

  /**
   * @param {ProbotOctokit} octokit
   * @param {I18n} i18n
   */
  constructor(octokit, i18n, options) {
    this.octokit = octokit;
    this.i18n = i18n;

    let defaultOptions = {
      apiKey: process.env.GREENHOUSE_API_KEY,
      username: process.env.GREENHOUSE_USERNAME,
      password: process.env.GREENHOUSE_PASSWORD,
    };

    this.options = {
      ...defaultOptions,
      ...options
    };

    this.http = axios.create();
    this.http.interceptors.request.use(req => {
      log.debug({ msg: 'request', req });
      return req;
    }, error => {
      log.error({ msg: 'request error', error: error.toString() });
      return Promise.reject(error);
    });
    this.http.interceptors.response.use(res => {
      log.debug({ msg: 'response', res });
      return res;
    }, error => {
      log.error({ msg: 'response error', error: error.toString() });
      return Promise.reject(error);
    });
  }

  /**
   * List Tests
   * 
   * Greenhouse will first need to retrieve the list of tests from the
   * Assessment Partner using the list_tests API endpoint. We will show the list
   * of available tests to the user, who will to select the appropriate test for
   * a given candidate.
   * 
   * Greenhouse will make a GET request to the list_tests endpoint specified by
   * the Assessment Partner.
   * 
   * See: https://developers.greenhouse.io/assessment.html#list-tests
   * 
   * @param {*} req 
   * @param {*} res 
   */
  async listChallenges(req, res) {

    const { data } = await this.octokit.search.repos({
      q: 'org:beat-interviewing+topic:greenhouse'
    });

    res.json(data.items.map(i => ({
      "partner_test_id": i.full_name,
      "partner_test_name": i.description
    })));
  }

  /**
   * Send Test
   * 
   * When a Greenhouse user sends a test to a candidate, Greenhouse will send a
   * request to the Assessment Partner’s send_test API endpoint. The Assessment
   * Partner will then email the specified candidate the specified test.
   * 
   * Greenhouse will initiate the process by sending a POST request to the
   * send_test endpoint specified by the Assessment Partner. The body of the
   * POST request will contain a JSON payload.
   * 
   *  {
   *    "partner_test_id": "12345",
   *    "candidate": {
   *      "first_name": "Harry",
   *      "last_name": "Potter",
   *      "resume_url": "https://hogwarts.com/resume",
   *      "phone_number": "123-456-7890",
   *      "email": "hpotter@hogwarts.edu",
   *      "greenhouse_profile_url": "https://app.greenhouse.io/people/17681532?application_id=26234709"
   *    },
   *    "url": "https://app.greenhouse.io/integrations/testing_partners/take_home_tests/12345"
   *  }
   * 
   * See: https://developers.greenhouse.io/assessment.html#send-test
   * 
   * @param {*} req 
   * @param {*} res 
   * @returns 
   */
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

  /**
   * Test Status
   * 
   * Tells Greenhouse the current status of a take home test.
   * 
   * See: https://developers.greenhouse.io/assessment.html#test-status
   * 
   * @param {*} req 
   * @param {*} res 
   * @returns 
   */
  async getChallengeStatus(req, res) {

    let issueFqn = req.query.partner_interview_id;
    let [owner, repo, issue] = issueFqn.split('/');

    try {
      const challenge = await this.getIssueMetadata(owner, repo, issue, 'challenge');

      return res.json({
        partner_status: challenge.status === 'graded' ? 'complete' : challenge.status,
        partner_profile_url: `https://github.com/${challenge.repoOwner}/${challenge.repo}`,
        partner_score: challenge.grade,
        metadata: {
          "Started At": challenge.createdAt,
          "Graded At": challenge.gradedAt,
          "Graded By": challenge.gradedBy,
          "Challenge": `https://github.com/${challenge.repoOwner}/${challenge.assignment}`,
          "Interview": `https://github.com/${challenge.repoOwner}/${challenge.repo}`
        }
      });
    } catch (error) {
      return res.status(400).json({ error });
    }
  }

  /**
   * Mark Test as Completed
   * 
   * When a candidate completes a test, send this request to the URL sent in the
   * initial Send Test request to signal Greenhouse that the test has been
   * completed. Upon this, Greenhouse will send a request to your Test Status
   * endpoint.
   * 
   * See: https://developers.greenhouse.io/assessment.html#patch-mark-test-as-completed
   * 
   * @param {*} req 
   * @param {*} res 
   * @returns 
   */
  async patchChallengeStatus(req, res) {

    let issueFqn = req.query.partner_interview_id;
    let [owner, repo, issue] = issueFqn.split('/');

    const challenge = await this.getIssueMetadata(owner, repo, issue, 'challenge');

    try {
      await this.notifyChallengeStatusCompleted(challenge.greenhouseUrl);
      return res.sendStatus(204);
    } catch (error) {
      return res.status(400).json({
        message: error.message,
        status: error.status
      });
    }
  }

  async notifyChallengeStatusCompleted(url) {
    return this.http.patch(url, null, {
      auth: {
        username: this.options.username,
        password: this.options.password,
      }
    });
  }

  /**
   * Greenhouse Response Error
   * 
   * When Greenhouse receives a malformed response for any of Assessment
   * Partner’s API endpoints, we would like to report the errors to the
   * Assessment Partner. As such, each Assessment Partner should provide an API
   * endpoint to ingest this information.
   * 
   * See: https://developers.greenhouse.io/assessment.html#response-error
   * 
   * @param {*} req 
   * @param {*} res 
   */
  async postError(req, res) {
    log.error(req.body);
    res.status(200).json({ status: 200 });
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
   * Authentication middleware adapted from Passport-HTTP.
   * 
   * The reason for the in-line implementation is that Greenhouse omits the
   * password field from basic authentication credentials. Instead it encodes
   * credentials as base64("<username>:").
   * 
   * Passport-HTTP fails authentication if the request is missing a password.
   * 
   * See: 
   *  - http://www.passportjs.org/packages/passport-http/
   *  - https://github.com/jaredhanson/passport-http
   * 
   * @param {*} req 
   * @param {*} res 
   * @param {*} next 
   * @returns 
   */
  async authentication(req, res, next) {

    let fail = (err) => {
      res.set('WWW-Authenticate', `Basic realm="Greenhouse"`);
      res.status(401).json({ error: err });
    };

    var authorization = req.headers['authorization'];
    if (!authorization) {
      return fail('missing authorization header');
    }

    var parts = authorization.split(' ');
    if (parts.length < 2) {
      return fail('invalid authentication header');
    }

    let scheme = parts[0];
    if (!/Basic/i.test(scheme)) {
      return fail('invalid authentication scheme');
    }

    let [apiKey, _] = Buffer.from(parts[1], 'base64').toString().split(':');
    if (apiKey != this.options.apiKey) { }

    const hash = crypto.createHash('sha512');

    if (!crypto.timingSafeEqual(
      hash.copy().update(apiKey).digest(),
      hash.copy().update(this.options.apiKey).digest()
    )) {
      return fail('incorrect username or password');
    }

    req.user = apiKey;

    next();
  }

  /**
   * Registers http endpoints for Greenhouse webhooks
   * 
   * @param {Router} router 
   */
  register(router) {

    router.use(bodyParser.json());
    router.use(this.authentication.bind(this));
    router.get('/challenges', this.listChallenges.bind(this));
    router.post('/challenges', this.createChallenge.bind(this));
    router.get('/challenges/status', this.getChallengeStatus.bind(this));
    router.patch('/challenges/status', this.patchChallengeStatus.bind(this));
    router.post('/errors', this.postError.bind(this));
  }
}

module.exports.Greenhouse = Greenhouse;