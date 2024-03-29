const commands = require('probot-commands');
const metadata = require('probot-metadata');
const minimatch = require("minimatch");
const { Greenhouse } = require('./greenhouse');
const log = require('./log');
const { Context } = require('probot');

class Challenge {

  /**
   * 
   * @param {ProbotOctokit} octokit
   * @param {Greenhouse} greenhouse
   * @param {I18n} i18n
   */
  constructor(octokit, greenhouse, i18n) {
    this.octokit = octokit;
    this.greenhouse = greenhouse;
    this.i18n = i18n;
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

    // Input would be in the format `/challenge @username [assignment]`. We
    // split the command to extract the username and assignment to use. 
    let [candidate, assignment] = command.arguments.split(' ');

    // Normalize username by removing any leading @ symbol that may be present.
    candidate = candidate.replace(/^@/, '');

    // If an assignment argument was not present, use the current repo as
    // fallback.
    if (!assignment) {
      assignment = context.issue().repo;
    }

    log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
      candidate,
      assignment
    });

    // Check whether a challenge has already been created in this issue. If so
    // reject the request and instruct the caller to create a new issue.
    let challenge = await this.getMetadata(context);
    if (challenge && challenge.repo !== '') {
      return await this.reply(context, 'challenge-exists', {
        repoOwner: challenge.repoOwner,
        repo: challenge.repo,
        createdBy: challenge.createdBy
      });
    }

    // Create a random string for added entropy.
    const rand = (Math.random() + 1).toString(36).substring(2, 5);
    const repoOwner = context.payload.repository.owner.login;
    const repo = `${assignment}-${candidate}-${rand}`;

    // Read the assignment configuration. 
    const { config } = await this.octokit.config.get({
      owner: repoOwner,
      repo: assignment,
      path: ".github/assignment.yml",
      defaults: {
        challenge: {},
        review: {},
        grade: {}
      }
    });

    log.debug({ config: config.challenge });

    // Collect the necessary information to store as metadata for this challenge
    challenge = {
      repoOwner,
      repo,
      candidate,
      assignment,
      status: 'created',
      createdAt: new Date().toISOString(),
      createdBy: context.payload.issue.user.login,
      config
    };

    // Challenges created via Greenhouse will contain text in the format:
    // 
    //  via [Greenhouse](https://app.greenhouse.io/...)
    // 
    // We'll store this URL in the challenge metadata. When the `/grade` command
    // is called, we will issue a PATCH request to Greenhouse at this URL to 
    // inform that the assignment is graded.
    const match = context.payload.issue.body.match(/via \[Greenhouse\]\((.*)\)/);
    if (match) {
      challenge = {
        ...challenge,
        ...{
          greenhouse: true,
          greenhouseUrl: match[1],
        }
      };
    }

    try {
      await this.cloneRepo(challenge);

      await this.octokit.issues.update(context.issue({
        title: `Challenge \`@${challenge.candidate}\` to complete \`${challenge.assignment}\``,
        labels: [`assignment/${challenge.assignment}`]
      }));

      await this.reply(context, 'challenge-created', { ...challenge, ...config.challenge });
    } catch (error) {
      await this.reply(context, 'challenge-create-failed', { error });
      return;
    }

    // If the challenge is configured as such, will create a pull request for
    // the candidate to review. In such cases the objective is to assess the 
    // candidates ability to give feedback or spot issues in a peer review.
    if (config.challenge && config.challenge.create_pull_request) {
      try {
        const pull = await this.createPull(challenge);

        challenge.pull = pull.number;
        challenge.pull_commit_sha = pull.head.sha;

        await this.reply(context, 'challenge-created-pr', challenge);
      } catch (error) {
        await this.reply(context, 'challenge-create-failed', { error });
      }
    }

    await this.setMetadata(context, challenge);
  }

  async cloneRepo(challenge) {

    // Create a new repository using the assignment template. As of the time
    // of writing, GitHub apps are not able to access this API resource.
    // Therefore we use an OAuth2 authenticated octokit client as a
    // workaround.
    const { data: repository } = await this.octokit.repos.createUsingTemplate({
      template_owner: challenge.repoOwner,
      template_repo: challenge.assignment,
      owner: challenge.repoOwner,
      name: challenge.repo,
      private: true,
    });

    log.info(`Repository created as ${repository.full_name}`);

    return repository;
  }

  async createPull(challenge) {

    // Create the branch which we'll copy files to
    this.createBranch(
      challenge.repoOwner,
      challenge.repo,
      challenge.config.challenge.create_pull_request.head,
      challenge.config.challenge.create_pull_request.base);

    // Grab files from ${challenge.repoOwner}/${challenge.assignment} and
    // commit them to ${challenge.repoOwner}/${challenge.repo}.
    //
    // These files are meant to help reviewers grade the assignment by
    // automating parts of the grading process.
    const files = await this.copyFiles(
      challenge.repoOwner,
      challenge.assignment,
      challenge.repo,
      challenge.config.challenge.create_pull_request.head,
      challenge.config.challenge.create_pull_request.head,
      challenge.config.challenge.create_pull_request.paths
    );

    log.info({ msg: 'Copied files', files });

    const { data: pull } = await this.octokit.pulls.create({
      owner: challenge.repoOwner,
      repo: challenge.repo,
      head: challenge.config.challenge.create_pull_request.head,
      base: challenge.config.challenge.create_pull_request.base,
      title: challenge.config.challenge.create_pull_request.title,
      body: challenge.config.challenge.create_pull_request.body,
    });

    // await this.octokit.pulls.requestReviewers({
    //   owner: challenge.repoOwner,
    //   repo: challenge.repo,
    //   pull_number: pull.number,
    //   reviewers: [ challenge.candidate ]
    // });

    return pull;
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
    let challenge = await this.getMetadata(context);
    if (!challenge) {
      return await this.reply(context, 'challenge-unknown');
    }

    log.info({
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

      await this.setMetadata(context, challenge);

      return await this.reply(context, 'challenge-ended', challenge);
    } catch (error) {
      return await this.reply(context, 'challenge-end-failed', { error });
    }
  }

  /**
   * Join the challenge as a collaborator.
   * 
   * This command grants a user access to a candidates challenge. 
   * 
   * @param {Context} context 
   * @param {Command} command 
   */
  async join(context, command) {

    const meta = metadata(context);

    // Input would be in the format `/join [username]`. The `username` is
    // optional and if omitted, will use the username of the person issuing the
    // command.
    let challenge = await this.getMetadata(context);
    if (!challenge) {
      return await this.reply(context, 'challenge-unknown');
    }

    let user = context.payload.comment.user.login;
    if (command.arguments) {
      user = command.arguments.trim().replace('@', '');
    }

    log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
      user: user,
    });

    try {
      // Add the reviewer as a collaborator to the candidates challenge.
      await context.octokit.repos.addCollaborator({
        owner: challenge.repoOwner,
        repo: challenge.repo,
        username: user
      });

      return await this.reply(context, 'challenge-joined', {
        repoOwner: challenge.repoOwner,
        repo: challenge.repo,
        user
      });
    } catch (error) {
      return await this.reply(context, 'challenge-join-failed', { user, error });
    }
  }

  /**
   * Prepare assignment for review.
   * 
   * @param {Context} context 
   * @param {Command} command 
   */
  async review(context, command) {

    // Input would be in the format `/review`. Information is retrieved from 
    // issue metadata.
    let challenge = await this.getMetadata(context);

    log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
      challenge: challenge
    });

    if (challenge.status === 'created') {
      return await this.reply(context, 'challenge-review-not-ended');
    }

    const reviewer = context.payload.issue.user.login;

    try {
      // Add the reviewer as a collaborator to the candidates challenge.
      await context.octokit.repos.addCollaborator({
        owner: challenge.repoOwner,
        repo: challenge.repo,
        username: reviewer
      });

      await this.reply(context, 'challenge-reviewed', {
        repoOwner: challenge.repoOwner,
        repo: challenge.repo,
        reviewer: reviewer,
        assignment: challenge.assignment
      });
    } catch (error) {
      await this.reply(context, 'challenge-review-failed', { error });
    }

    if (challenge.config.review.copy) {

      try {
        // Grab files from ${challenge.repoOwner}/${challenge.assignment} and
        // commit them to ${challenge.repoOwner}/${challenge.repo}.
        //
        // These files are meant to help reviewers grade the assignment by
        // automating parts of the grading process.
        const files = await this.copyFiles(
          challenge.repoOwner,
          challenge.assignment,
          challenge.repo,
          challenge.config.review.copy.head,
          challenge.config.review.copy.base,
          challenge.config.review.copy.paths
        );

        await this.reply(context, 'challenge-reviewed-uploaded', {
          repoOwner: challenge.repoOwner,
          repo: challenge.repo,
          reviewer: reviewer,
          assignment: challenge.assignment,
          files: files.join('\n')
        });
      } catch (error) {
        await this.reply(context, 'challenge-review-failed', {
          repoOwner: challenge.repoOwner,
          repo: challenge.repo,
          error: error
        });
      }
    }

    if (challenge.config.review.comments) {
      try {
        // If configured as such, create review comments on the specified pull 
        // request.
        await context.octokit.pulls.createReview({
          owner: challenge.repoOwner,
          repo: challenge.repo,
          pull_number: challenge.pull,
          commit_id: challenge.pull_commit_sha,
          event: 'COMMENT',
          comments: challenge.config.review.comments
        });

        await this.reply(context, 'challenge-reviewed-commented', challenge);

      } catch (error) {
        return await this.reply(context, 'challenge-review-failed', {
          repoOwner: challenge.repoOwner,
          repo: challenge.repo,
          error: error
        });
      }
    }
  }

  /**
   * Grade assignment.
   * 
   * @param {Context} context 
   * @param {Command} command 
   */
  async grade(context, command) {

    log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
    });

    let challenge = await this.getMetadata(context);
    if (!challenge) {
      return await this.reply(context, 'challenge-unknown');
    }

    // Input would be in the format `/grade <grade>` where `<grade>` is the 
    // final grade given by the reviewer to the assignment. 
    let grade = parseInt(command.arguments.trim());

    if (challenge.status === 'created') {
      return await this.reply(context, 'challenge-review-not-ended');
    }

    challenge = {
      ...challenge,
      ...{
        status: 'graded',
        grade: grade,
        gradedAt: new Date().toISOString(),
        gradedBy: context.payload.comment.user.login,
      }
    };

    try {
      if (challenge.greenhouse) {
        log.debug({
          msg: "Notifying greenhouse that test is completed",
          url: challenge.greenhouseUrl
        });
        await this.greenhouse.notifyChallengeStatusCompleted(challenge.greenhouseUrl);
      }

      await this.setMetadata(context, challenge);

      await this.reply(context, 'challenge-graded', challenge);
    } catch (error) {
      await this.reply(context, 'challenge-grade-failed', error);
    }
  }

  /**
   * Delete assignment.
   * 
   * @param {Context} context 
   * @param {Command} command 
   */
  async delete(context, command) {

    log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
    });

    // Input would be in the format `/delete`. More information is retrieved 
    // from issue metadata.
    let challenge = await this.getMetadata(context);
    if (!challenge) {
      return await this.reply(context, 'challenge-unknown');
    }

    try {
      await this.octokit.repos.delete({
        owner: challenge.repoOwner,
        repo: challenge.repo
      });

      await this.octokit.issues.update(context.issue({ 'state': 'closed' }));

      return await this.reply(context, 'challenge-deleted', challenge);
    } catch (error) {
      return await this.reply(context, 'challenge-delete-failed', { error });
    }
  }

  /**
   * Retrieves issue metadata.
   * 
   * @param {Context} context 
   * @returns {Promise<any>}
   */
  async getMetadata(context) {
    return metadata(context).get('challenge');
  }

  /**
   * Saves issue metadata.
   * 
   * @param {Context} context 
   * @param {Object} meta 
   * @returns {Promise<any>}
   */
  async setMetadata(context, meta) {
    return metadata(context).set('challenge', meta);
  }

  /**
   * Gets the content of files from a git repository at a given ref/branch.
   * 
   * @param {String} owner
   * @param {String} repo 
   * @param {String} ref 
   * @returns 
   */
  async getFiles(owner, repo, ref) {

    const { data: reference } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${ref}`
    });

    const { data: commit } = await this.octokit.git.getCommit({
      owner,
      repo,
      commit_sha: reference.object.sha,
    });

    const { data: tree } = await this.octokit.git.getTree({
      owner,
      repo,
      tree_sha: commit.tree.sha,
      recursive: "true"
    });

    let files = [];

    for (const file of tree.tree) {

      if (file.type !== "blob") {
        continue;
      }

      const { data: blob } = await this.octokit.git.getBlob({
        owner,
        repo,
        file_sha: file.sha
      });

      files.push({
        path: file.path,
        mode: file.mode,
        content: blob.content,
        encoding: blob.encoding
      });
    }

    return files;
  }

  /**
   * Puts file contents to a git repository at a given ref/branch.
   * 
   * @param {String} owner 
   * @param {String} repo 
   * @param {String} ref 
   * @param {Array}  files 
   */
  async putFiles(owner, repo, ref, files) {

    let tree = [];

    for (const file of files) {

      const { data: blob } = await this.octokit.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: file.encoding
      });

      tree.push({
        path: file.path,
        mode: file.mode,
        type: 'blob',
        sha: blob.sha
      });
    }

    const { data: head } = await this.octokit.git.getRef({
      owner, repo, ref: `heads/${ref}`
    });

    const { data: commit } = await this.octokit.git.getCommit({
      owner, repo, commit_sha: head.object.sha
    });

    const { data: newTree } = await this.octokit.git.createTree({
      owner,
      repo,
      tree: tree,
      base_tree: commit.tree.sha
    });

    const { data: newCommit } = await this.octokit.git.createCommit({
      owner,
      repo,
      message: "Copy files 🤖",
      tree: newTree.sha,
      parents: [commit.sha]
    });

    await this.octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${ref}`,
      sha: newCommit.sha,
    });
  }

  /**
   * Copies file contents between the branches of a git repository. 
   * 
   * Under the hood this method makes use of the getFiles/putFiles methods to
   * perform the necessary.
   * 
   * @param {*} owner 
   * @param {*} assignment 
   * @param {*} repo 
   * @param {*} head 
   * @param {*} base 
   * @param {*} paths 
   * @returns 
   */
  async copyFiles(owner, assignment, repo, head, base, paths) {

    let files = (await this.getFiles(
      owner,
      assignment,
      head
    )).filter(file => {
      for (const path of paths) {
        if (minimatch(file.path, path)) {
          return true;
        }
      }
      return false;
    });

    log.debug({ files: files.map(file => file.path) });

    await this.putFiles(
      owner,
      repo,
      base,
      files);

    return files.map(file => file.path);
  };

  async createBranch(owner, repo, head, base) {

    const { data: ref } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${base}`
    });

    await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${head}`,
      sha: ref.object.sha,
    });
  }

  async reply(context, template, view) {
    return await context.octokit.issues.createComment(context.issue({
      body: this.i18n.render(template, view),
    }));
  }

  /**
   * 
   * @param {Context} context 
   * @param {Command} command 
   */
  async help(context, command) {
    return await this.reply(context, 'challenge-help');
  }

  /**
   * Registers the commands the bit listens for
   * 
   * @param {Probot} robot 
   */
  register(robot) {
    commands(robot, 'challenge', this.create.bind(this));
    commands(robot, 'end', this.end.bind(this));
    commands(robot, 'join', this.join.bind(this));
    commands(robot, 'review', this.review.bind(this));
    commands(robot, 'grade', this.grade.bind(this));
    commands(robot, 'delete', this.delete.bind(this));
    commands(robot, 'help', this.help.bind(this));
  }
};

module.exports.Challenge = Challenge;