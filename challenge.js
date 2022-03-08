const commands = require('probot-commands');
const metadata = require('probot-metadata');
const minimatch = require("minimatch");
const log = require('./log');

class Challenge {

  /**
   * 
   * @param {ProbotOctokit} octokit 
   */
  constructor(octokit, i18n) {
    this.octokit = octokit;
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

    const meta = metadata(context);

    // Input would be in the format `/challenge @username go-take-home`. We
    // split the command to extract the username and assignment to use.
    let [candidate, assignment] = command.arguments.split(' ');

    candidate = candidate.replace('@', '');
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

    try {
      // Check whether a challenge has already been created in this issue. If so
      // reject the request and instruct the caller to create a new issue.
      const challenge = await meta.get('challenge');
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
          review: {}
        }
      });

      log.debug({ config: config.challenge });

      // Create a new repository using the assignment template. As of the time of
      // writing, GitHub apps are not able to access this API resource. Therefore 
      // we use an OAuth2 authenticated octokit client as a workaround.
      const { data: repository } = await this.octokit.repos.createUsingTemplate({
        template_owner: repoOwner,
        template_repo: assignment,
        owner: repoOwner,
        name: repo,
        private: true,
      });

      log.info(`Repository created as ${repository.full_name}`);

      await meta.set('challenge', {
        repoOwner,
        repo,
        candidate,
        assignment,
        status: 'created',
        createdAt: new Date().toISOString(),
        createdBy: context.payload.issue.user.login,
        config
      });

      // If the challenge is configured as such, will create a pull request for
      // the candidate to review. In such cases the objective is to assess the 
      // candidates ability to give feedback or spot issues in a peer review.
      if (config.challenge.create_pull_request) {

        // Create the branch which we'll copy files to
        this._createBranch(
          repoOwner,
          repo,
          config.challenge.create_pull_request.head,
          config.challenge.create_pull_request.base);

        // Grab files from ${challenge.repoOwner}/${challenge.assignment} and
        // commit them to ${challenge.repoOwner}/${challenge.repo}.
        //
        // These files are meant to help reviewers grade the assignment by
        // automating parts of the grading process.
        const files = await this._copyFiles(
          repoOwner,
          assignment,
          repo,
          config.challenge.create_pull_request.head,
          config.challenge.create_pull_request.head,
          config.challenge.create_pull_request.paths
        );

        log.info({ msg: 'Copied files', files });

        await this.octokit.pulls.create({
          owner: repoOwner,
          repo: repo,
          head: config.challenge.create_pull_request.head,
          base: config.challenge.create_pull_request.base,
          title: config.challenge.create_pull_request.title,
          body: config.challenge.create_pull_request.body,
        });
      }

      // Add the candidate as a collaborator to the newly created repository.
      const { data: collaborator } = await context.octokit.repos.addCollaborator({
        owner: repoOwner,
        repo: repo,
        username: candidate,
      });

      log.info({ msg: 'Invited collaborator', invitee: collaborator.invitee.login });

      await context.octokit.issues.update(context.issue({
        title: `Challenge \`@${candidate}\` to complete \`${assignment}\``,
        labels: [`assignment/${assignment}`]
      }));

      return await this.reply(context, 'challenge-created', {
        repoOwner,
        repo,
        candidate
      });
    } catch (error) {
      return await this.reply(context, 'challenge-create-failed', {
        assignment,
        candidate,
        error
      });
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

      await meta.set('challenge', challenge);

      return await this.reply(context, 'challenge-ended', challenge);
    } catch (error) {
      return await this.reply(context, 'challenge-end-failed', {
        reviewer,
        repoOwner: challenge.repoOwner,
        repo: challenge.repo,
        error
      });
    }
  }

  /**
   * Join the challenge as a reviewer.
   * 
   * This command grants the reviewer access to the candidates challenge. 
   * 
   * @param {Context} context 
   * @param {Command} command 
   */
  async join(context, command) {

    const meta = metadata(context);

    log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
    });

    // Input would be in the format `/join`. More information is retrieved from 
    // issue metadata.
    let challenge = await meta.get('challenge');
    if (!challenge) {
      return await this.reply(context, 'challenge-unknown');
    }

    const reviewer = context.payload.issue.user.login;

    try {
      // Add the reviewer as a collaborator to the candidates challenge.
      await context.octokit.repos.addCollaborator({
        owner: challenge.repoOwner,
        repo: challenge.repo,
        username: reviewer
      });

      return await this.reply(context, 'challenge-joined', {
        repoOwner: challenge.repoOwner,
        repo: challenge.repo,
        reviewer: reviewer
      });
    } catch (error) {
      return await this.reply(context, 'challenge-join-failed', {
        repoOwner: challenge.repoOwner,
        repo: challenge.repo,
        reviewer: reviewer
      });
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

    log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
      challenge: challenge
    });

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
      return await this.reply(context, 'challenge-review-failed', {
        repoOwner: challenge.repoOwner,
        repo: challenge.repo,
        reviewer: reviewer,
        error: error
      });
    }

    try {
      // Grab files from ${challenge.repoOwner}/${challenge.assignment} and
      // commit them to ${challenge.repoOwner}/${challenge.repo}.
      //
      // These files are meant to help reviewers grade the assignment by
      // automating parts of the grading process.
      const files = await this._copyFiles(
        challenge.repoOwner,
        challenge.assignment,
        challenge.repo,
        challenge.config.review.copy.head,
        challenge.config.review.copy.base,
        challenge.config.review.copy.paths
      );

      return await this.reply(context, 'challenge-reviewed-uploaded', {
        repoOwner: challenge.repoOwner,
        repo: challenge.repo,
        reviewer: reviewer,
        assignment: challenge.assignment,
        files: files.join('\n')
      });
    } catch (error) {
      return await this.reply(context, 'challenge-review-failed', {
        repoOwner: challenge.repoOwner,
        repo: challenge.repo,
        reviewer: reviewer,
        error: error
      });
    }
  }

  /**
   * 
   * @param {Context} context 
   * @param {Command} command 
   */
  async delete(context, command) {

    const meta = metadata(context);

    log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
    });

    // Input would be in the format `/delete`. More information is retrieved 
    // from issue metadata.
    let challenge = await meta.get('challenge');
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
      return await this.reply(context, 'challenge-delete-failed', challenge);
    }
  }

  async _getFiles(owner, repo, ref) {

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

  async _uploadFiles(owner, repo, ref, files) {

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
      // force: true
    });
  }

  async _copyFiles(owner, assignment, repo, head, base, paths) {

    let files = (await this._getFiles(
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

    // log.info({ files: files.map(file => file.path) });

    await this._uploadFiles(
      owner,
      repo,
      base,
      files);

    return files.map(file => file.path);
  };

  async _createBranch(owner, repo, head, base) {

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

  /**
   * 
   * @param {Context} context 
   * @param {Command} command 
   */
  async help(context, command) {
    return await this.reply(context, 'challenge-help');
  }

  register(robot) {
    commands(robot, 'challenge', this.create.bind(this));
    commands(robot, 'end', this.end.bind(this));
    commands(robot, 'join', this.join.bind(this));
    commands(robot, 'review', this.review.bind(this));
    commands(robot, 'delete', this.delete.bind(this));
    commands(robot, 'help', this.help.bind(this));
  }

  async reply(context, template, view) {
    return await context.octokit.issues.createComment(context.issue({
      body: this.i18n.render(template, view),
    }));
  }
};

module.exports.Challenge = Challenge;