# acme-interviewing[bot]

This is a proof of concept exploring the automation of interviewing workflows.
It is intended to improve the time taken by reviewers to grade take-home
assignments, and make it easier on candidates when submitting them.

## Setup

```sh
npm install
npm start
```

## Docker

```sh
docker build -t bot .
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> bot
```

## Usage

The bot listens for slash commands posted on issues or pull requests in
repositories of the [acme-interviewing](https://github.com/acme-interviewing)
organization.

As an example, lets prepare the coding challenge for
[@robpike](https://github.com/robpike). He aced the recruiter screen but now its
time to show is if he can handle our take-home assignment.

To kick off the process, [create an
issue](https://github.com/acme-interviewing/interview/issues/new). The title
wont't matter for now, but in the body we'll use the `/challenge` slash command.

```
/challenge <candidate> <assignment>
```

Where `<candidate>` is the GitHub username of the candidate and `<assignment>`
should match a repository under the
[acme-interviewing](https://github.com/acme-interviewing) organization. This
repository **must** be a template repository.

![challenge](challenge.png)

At this point the candidate should have received an invitation to collaborate on the newly created repository.

The candidate is given sufficient (pre-determined) time to complete the assignment. To submit the assignment they must create a pull request asking to merge their changes to `main`.

To end the challenge, we'll use the `/end` command in the same issue thread.

```
/end <candidate> <repository>
```

Where `<repository>` is the challenges repository name.

![challenge-end](challenge-end.png)

At this point, the candidate no longer has access to the challenge and is therefore unable to commit any new changes.

## Copyright

© 2022 BEAT Research B.V.
