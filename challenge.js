const commands = require('probot-commands');
const metadata = require('probot-metadata');
const minimatch = require("minimatch");

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

    // Input would be in the format `/challenge @username go-take-home`. We
    // split the command to extract the username and assignment to use.
    let [candidate, assignment] = command.arguments.split(' ');

    candidate = normalizeUsername(candidate);

    context.log.info({
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
        return await this.reply(context, messageChallengeExists(
          challenge.repoOwner,
          challenge.repo,
          challenge.createdBy
        ));
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

      context.log.info({ config });

      // Create a new repository using the assignment template. As of the time of
      // writing, GitHub apps are not able to access this API resource. Therefore 
      // we use an OAuth2 authenticated octokit client as a workaround.
      const { data: repository } = await this.octokit.repos.createUsingTemplate({
        template_owner: repoOwner,
        template_repo: assignment,
        owner: repoOwner,
        name: repo,
        private: true,
        include_all_branches: config.challenge.clone.include_all_branches,
      });

      context.log.info({ repository });

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

      if (config.challenge.create_pull_request) {
        await this.octokit.pulls.create({
          owner: repoOwner,
          repo: repo,
          head: config.challenge.create_pull_request.head,
          base: config.challenge.create_pull_request.base,
        });
      }

      // Add the candidate as a collaborator to the newly created repository.
      const { data: collaborator } = await context.octokit.repos.addCollaborator({
        owner: repoOwner,
        repo: repo,
        username: candidate,
      });

      context.log.info({ collaborator });

      await context.octokit.issues.update(context.issue({
        title: `Challenge \`@${candidate}\` to complete \`${assignment}\``,
        labels: [`assignment/${assignment}`]
      }));

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
  async join(context, command) {

    const meta = metadata(context);

    context.log.info({
      event: context.name,
      command: command.name,
      issue: context.issue(),
    });

    // Input would be in the format `/join`. More information is retrieved from 
    // issue metadata.
    let challenge = await meta.get('challenge');
    if (!challenge) {
      return await this.reply(context, messageChallengeUnknown());
    }

    const reviewer = context.payload.issue.user.login;

    try {
      // Add the reviewer as a collaborator to the candidates challenge.
      const { data: collaborator } = await context.octokit.repos.addCollaborator({
        owner: challenge.repoOwner,
        repo: challenge.repo,
        username: reviewer
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

    try {
      // Add the reviewer as a collaborator to the candidates challenge.
      const { data: collaborator } = await context.octokit.repos.addCollaborator({
        owner: challenge.repoOwner,
        repo: challenge.repo,
        username: reviewer
      });

      context.log.info({ collaborator });

      await this.reply(context, messageChallengeReviewed(
        challenge.repoOwner,
        challenge.repo,
        reviewer,
        challenge.assignment
      ));
    } catch (error) {
      return await this.reply(context, messageChallengeReviewFailed(
        challenge.repoOwner,
        challenge.repo,
        reviewer,
        error
      ));
    }

    try {
      // Grab files from ${challenge.repoOwner}/${challenge.assignment} and
      // commit them to ${challenge.repoOwner}/${challenge.repo}.
      //
      // These files are meant to help reviewers grade the assignment by
      // automating parts of the grading process.
      let copyFiles = async (paths) => {

        let files = (await this._getFiles(
          challenge.repoOwner,
          challenge.assignment,
          challenge.config.review.copy.head
        )).filter(file => {
          for (const path of paths) {
            if (minimatch(file.path, path)) {
              return true;
            }
          }
          return false;
        });

        context.log.info({ files: files.map(file => file.path) });

        await this._uploadFiles(
          challenge.repoOwner,
          challenge.repo,
          challenge.config.review.copy.base,
          files);

        return files.map(file => file.path);
      };

      const files = await copyFiles(challenge.config.review.copy.paths);

      return await this.reply(context, messageChallengeReviewedUploaded(
        challenge.repoOwner,
        challenge.repo,
        reviewer,
        challenge.assignment,
        files
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
      message: "Copying review files 🤖",
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
    // commands(robot, 'join', this.join.bind(this));
    // commands(robot, 'invite', this.invite.bind(this));
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
  return `Unable to create ${assignment} challenge for @${candidate}. ${messageErrorStack(error)}`;
};

let messageChallengeEnded = (repoOwner, repo, candidate) => {
  return `Ended challenge for @${candidate}. They no longer have access to [${repoOwner}/${repo}](/${repoOwner}/${repo})`;
};

let messageChallengeEndFailed = (candidate, error) => {
  return `Unable to end the challenge for @${candidate}. ${messageErrorStack(error)}`;
};

let messageChallengeUnknown = () => {
  return `Unable to identify challenge. Metadata is either corrupt or missing`;
};

let messageChallengeDeleted = (challenge) => {
  return `Deleted challenge ${challenge}`;
};

let messageChallengeDeleteFailed = (challenge, error) => {
  return `Unable to delete challenge ${challenge}. ${messageErrorStack(error)}`;
};

let messageChallengeReviewed = (repoOwner, repo, reviewer, assignment) => {
  return `
@${reviewer} is now a collaborator on [${repoOwner}/${repo}](/${repoOwner}/${repo}). Happy reviewing!

Meanwhile, I'll prepare the repository for review by copying files from the [${repoOwner}/${assignment}](/${repoOwner}/${assignment}) repo to help make reviewing easier!

Please bear with me as it might take me some time. I'm just a poor bot 🤖
`;
};

let messageChallengeReviewedUploaded = (repoOwner, repo, reviewer, assignment, paths) => {
  return `

Ok, all set ${reviewer}! I've copied the following files from [${repoOwner}/${assignment}](/${repoOwner}/${assignment}) to [${repoOwner}/${repo}](/${repoOwner}/${repo}). 

\`\`\`
${[paths.join('\n')]}
\`\`\`
`;
};

let messageChallengeReviewFailed = (repoOwner, repo, reviewer, error) => {
  return `
Unable to make @${reviewer} a collaborator on [${repoOwner}/${repo}](/${repoOwner}/${repo}). ${messageErrorStack(error)}`;
};

let messageErrorStack = (error) => {
  return `

\`\`\`
${error.stack}
\`\`\` 

<details>
  <summary>Request</summary>

\`\`\`
${error.request.method} ${error.request.url}

${error.request.body}
\`\`\`
</details>

<details>
  <summary>Response</summary>
  
\`\`\`
${JSON.stringify(error.response.data, null, '  ')}
\`\`\`  
</details>   
`;
};

let messageChallengeHelp = () => {
  return `
Hey! I can help you facilitate coding challenge assignments with our candidates.

To create a challenge for a candidate, use the \`/challenge\` command. It takes 
the arguments \`candidate\` and \`assignment\`. Like so:

> /challenge @username go-take-home

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}