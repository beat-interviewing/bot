const commands = require('probot-commands');
const metadata = require('probot-metadata');

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
   * @param {Context} context 
   * @param {Command} command 
   * @returns 
   */
  async create(context, command) {

    const meta = metadata(context);

    // Input would be in the format `/challenge @username go`. We split the 
    // command to extract the username and assignment to use.
    let [candidate, assignment] = command.arguments.split(' ');

    candidate = normalizeUsername(candidate);

    context.log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
      candidate,
      assignment
    });

    // Create a random string for added entropy.
    const rand = (Math.random() + 1).toString(36).substring(2, 5);

    const repoOwner = context.payload.repository.owner.login;
    const repo = `interview-${candidate}-${assignment}-${rand}`;

    try {
      // Check whether a challenge has already been created in this issue. If so
      // reject the request and instruct the caller to create a new issue.
      const challenge = await meta.get('challenge');
      if (challenge && challenge.repo !== '') {
        return await this.reply(context, messageChallengeExists(
          challenge.repoOwner,
          challenge.repo,
          challenge.createdBy
        ));
      }

      // Create a new repository using the assignment template. As of the time of
      // writing, GitHub apps are not able to access this API resource. Therefore 
      // we use an OAuth2 authenticated octokit client as a workaround.
      await this.octokit.repos.createUsingTemplate({
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

      await context.octokit.issues.update(context.issue({
        title: `Challenge \`@${candidate}\` to complete the \`${assignment}\` assignment]`,
        labels: [`assignment/${assignment}`]
      }));

      await meta.set('challenge', {
        repoOwner,
        repo,
        candidate,
        assignment,
        status: 'created',
        createdAt: new Date().toISOString(),
        createdBy: context.payload.issue.user.login
      });

      return await this.reply(context, messageChallengeCreated(
        repoOwner,
        repo,
        candidate
      ));
    } catch (error) {
      return await this.reply(context, messageChallengeCreateFailed(
        assignment,
        candidate,
        error
      ));
    }
  }

  /**
   * End the coding challenge for a candidate.
   * 
   * This command revokes the candidates access to the challenge.
   * 
   * @param {Context} context 
   * @param {Command} command 
   * @returns 
   */
  async end(context, command) {

    const meta = metadata(context);

    // Input would be in the format `/end`. Information is retrieved from issue
    // metadata.
    let challenge = await meta.get('challenge');
    if (!challenge) {
      return await this.reply(context, messageChallengeUnknown());
    }

    context.log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
      candidate: challenge.candidate,
      challenge: challenge.repo
    });

    try {
      await context.octokit.repos.removeCollaborator({
        owner: challenge.repoOwner,
        repo: challenge.repo,
        username: challenge.candidate,
      });

      challenge.status = 'ended';
      challenge.endedAt = new Date().toISOString();
      challenge.endedBy = context.payload.issue.user.login;

      await meta.set('challenge', challenge);

      return await this.reply(context, messageChallengeEnded(
        challenge.repoOwner,
        challenge.repo,
        challenge.candidate
      ));
    } catch (error) {
      return await this.reply(context, messageChallengeEndFailed(
        challenge.candidate,
        error
      ));
    }
  }

  /**
   * 
   * @param {Context} context 
   * @param {Command} command 
   */
  async review(context, command) {

    const meta = metadata(context);

    // Input would be in the format `/review`. Information is retrieved from 
    // issue metadata.
    let challenge = await meta.get('challenge');

    context.log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
      challenge: challenge
    });

    const reviewer = context.payload.issue.user.login;
    const reviewerEmail = 'interview@acme.com';

    try {

      // Add the reviewer as a collaborator to the candidates challenge.
      await context.octokit.repos.addCollaborator({
        owner: challenge.repoOwner,
        repo: challenge.repo,
        username: reviewer
      });

      // Grab files from ${challenge.repoOwner}/${challenge.assignment} and commit 
      // them to ${challenge.repoOwner}/${challenge.repo}.
      // 
      // These files are meant to help reviewers grade the assignment by 
      // automating parts of the process.
      let copyFiles = async (paths) => {

        await Promise.all(paths.map(async (path) => {

          // Grab reviewing material from the 'review' branch of the assignment...
          let { data: content } = await this.octokit.rest.repos.getContent({
            owner: challenge.repoOwner,
            repo: challenge.assignment,
            path,
            ref: 'review'
          });

          if (Array.isArray(content)) {
            await copyFiles(content.map(item => item.path));
          } else {
            // ...and push them to the candidates challenge.
            await this.octokit.repos.createOrUpdateFileContents({
              owner: challenge.repoOwner,
              repo: challenge.assignment,
              path: content.path,
              message: `Committing ${content.name} to assist review 🤖`,
              content: content.content,
              committer: { name: reviewer, email: reviewerEmail },
              author: { name: reviewer, email: reviewerEmail },
              
            });
            
            context.log.info({ path: content.path });
          }


        }));
      };

      const files = [
        '.github/actions',
        '.github/workflows/review.yml'
      ];

      await copyFiles(files);

      return await this.reply(context, messageChallengeReviewed(
        challenge.repoOwner,
        challenge.repo,
        reviewer
      ));
    } catch (error) {
      return await this.reply(context, messageChallengeReviewFailed(
        challenge.repoOwner,
        challenge.repo,
        reviewer,
        error
      ));
    }
  }

  /**
   * 
   * @param {Context} context 
   * @param {Command} command 
   */
  async delete(context, command) {

    const meta = metadata(context);

    context.log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
    });

    // Input would be in the format `/delete`. More information is retrieved 
    // from issue metadata.
    let challenge = await meta.get('challenge');
    if (!challenge) {
      return await this.reply(context, messageChallengeUnknown());
    }

    try {
      await this.octokit.repos.delete({
        owner: challenge.repoOwner,
        repo: challenge.repo
      });
      return await this.reply(context, messageChallengeDeleted(challenge.repo));
    } catch (error) {
      return await this.reply(context, messageChallengeDeleteFailed(challenge.repo, challenge.candidate));
    }
  }

  /**
   * 
   * @param {Context} context 
   * @param {Command} command 
   */
  async help(context, command) {
    return await this.reply(context, messageChallengeHelp());
  }

  register(robot) {
    commands(robot, 'challenge', this.create.bind(this));
    commands(robot, 'end', this.end.bind(this));
    commands(robot, 'review', this.review.bind(this));
    commands(robot, 'delete', this.delete.bind(this));
    commands(robot, 'help', this.help.bind(this));
  }

  async reply(context, message) {
    return await context.octokit.issues.createComment(context.issue({
      body: message,
    }));
  }
};

module.exports.Challenge = Challenge;

let normalizeUsername = (username) => {
  return username.replace('@', '');
};

let messageChallengeExists = (repoOwner, repo, createdBy) => {
  return `Challenge [${repoOwner}/${repo}](/${repoOwner}/${repo}) already created by @${createdBy}. To create a new one, file a new issue.`;
};

let messageChallengeCreated = (repoOwner, repo, candidate) => {
  return `Created challenge [${repoOwner}/${repo}](/${repoOwner}/${repo}) and invited @${candidate} as a collaborator`;
};

let messageChallengeCreateFailed = (assignment, candidate, error) => {
  return `Unable to create ${assignment} challenge for @${candidate}. ${error}`;
};

let messageChallengeEnded = (repoOwner, repo, candidate) => {
  return `Ended challenge for @${candidate}. They no longer have access to [${repoOwner}/${repo}](/${repoOwner}/${repo})`;
};

let messageChallengeEndFailed = (candidate, error) => {
  return `Unable to end the challenge for @${candidate}. ${error}`;
};

let messageChallengeUnknown = () => {
  return `Unable to identify challenge. Metadata is either corrupt or missing`;
};

let messageChallengeDeleted = (challenge) => {
  return `Deleted challenge ${challenge}`;
};

let messageChallengeDeleteFailed = (challenge, error) => {
  return `Unable to delete challenge ${challenge}. ${error}`;
};

let messageChallengeReviewed = (repoOwner, repo, reviewer) => {
  return `@${reviewer} is now a collaborator on [${repoOwner}/${repo}](/${repoOwner}/${repo}). Happy reviewing!`;
};

let messageChallengeReviewFailed = (repoOwner, repo, reviewer, error) => {
  return `Unable to make @${reviewer} a collaborator on [${repoOwner}/${repo}](/${repoOwner}/${repo}). ${error}`;
};

let messageChallengeHelp = () => {
  return `
Hey! I can help you facilitate coding challenge assignments with our candidates.

To create a challenge for a candidate, use the \`/challenge\` command. It takes 
the arguments \`candidate\` and \`assignment\`. Like so:

> /challenge @username go

To end the challenge, use the \`/end\` command. This will revoke the candidates 
access to the challenge repository.

> /end

When you are ready to review, use the \`/review\` command. It will grant you 
access to the challenge repository where you can review the challenge. It will 
most likely be in the form of a pull request.

> /review

If for some reason you wish to delete a challenge, use the \`/delete\` command. It 
will delete the repository. **Warning!** this action will irreversibly delete 
the repository. Be careful when using this command.

> /delete
`;
};
