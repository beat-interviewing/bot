const commands = require('probot-commands');

const repoOwner = process.env.GITHUB_REPO_OWNER;

class Challenge {

  /**
   * 
   * @param {ProbotOctokit} octokit 
   */
  constructor(octokit) {
    this.octokit = octokit;
  }

  /**
   * Create a coding challenge for a candidate.
   * 
   * This command creates a new repository from a template repository (the 
   * assignment) and assigns the candidate as a collaborator.
   * 
   * @param {*} context 
   * @param {*} command 
   * @returns 
   */
  async create(context, command) {

    // Input would be in the format `/challenge @username go`. We split the 
    // command to extract the username and assignment to use.
    let [candidate, assignment] = command.arguments.split(' ');

    candidate = normalizeUsername(candidate);

    context.log.info({
      event: context.name,
      command: command.name,
      candidate,
      assignment
    });

    // Create a random string for added entropy.
    const entropy = (Math.random() + 1).toString(36).substring(2, 5);
    const repo = `interview-${candidate}-${assignment}-${entropy}`;

    try {
      // Create a new repository using the assignment template. As of the time of
      // writing, GitHub apps are not able to access this API resource. Therefore 
      // we use an OAuth2 authenticated octokit client as a workaround.
      const { data: repository } = await this.octokit.repos.createUsingTemplate({
        template_owner: repoOwner,
        template_repo: assignment,
        owner: repoOwner,
        name: repo,
        private: true
      });

      // Add the candidate as a collaborator to the newly created repository.
      await context.octokit.repos.addCollaborator({
        owner: repoOwner,
        repo: repo,
        username: candidate,
      });

      return await context.octokit.issues.createComment(context.issue({
        body: `Created challenge [${repository.full_name}](${repository.html_url}) and invited @${candidate} as a collaborator`,
      }));
    } catch (error) {

      return await context.octokit.issues.createComment(context.issue({
        body: `Unable to create ${assignment} challenge for @${candidate}. ${error}`,
      }));
    }
  };

  /**
   * End the coding challenge for a candidate.
   * 
   * This command revokes the candidates access to the challenge.
   * 
   * @param {*} context 
   * @param {*} command 
   * @returns 
   */
  async end(context, command) {

    // Input would be in the format `/end @username interview-username-go-y5z`. We
    // split the command to extract the username and assignment to use.
    let [candidate, challenge] = command.arguments.split(' ');

    candidate = normalizeUsername(candidate);
    challenge = normalizeRepository(challenge);

    context.log.info({
      event: context.name,
      command: command.name,
      candidate,
      challenge
    });

    try {
      const { data: repository } = await this.octokit.repos.get({
        owner: repoOwner,
        repo: challenge,
      });

      await context.octokit.repos.removeCollaborator({
        owner: repoOwner,
        repo: challenge,
        username: candidate,
      });

      return await context.octokit.issues.createComment(context.issue({
        body: `Kicked @${candidate} from [${repository.full_name}](${repository.html_url})`,
      }));

    } catch (error) {

      return await context.octokit.issues.createComment(context.issue({
        body: `Unable to end the challenge for @${candidate}. ${error}`,
      }));
    }
  };

  register(robot) {
    commands(robot, 'challenge', this.create.bind(this));
    commands(robot, 'end', this.end.bind(this));
  }
};

let normalizeUsername = (username) => {
  return username.replace('@', '');
};

let normalizeRepository = (repository) => {
  return repository.replace(`${repoOwner}/`, '');
};

module.exports.Challenge = Challenge