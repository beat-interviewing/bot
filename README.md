# Bot

Bot is a GitHub App which enables the automation of interviewing workflows.

In some ways, it can be a viable replacement for expensive technical assessment
or remote interview platforms. By leveraging GitHub's functionality, technical
interviews happen in a platform more familiar to developers.

Technical assessments are essentially GitHub template repositories. There are no
limitations imposed from Bot as to the nature or content of the assessment, so
you are free to customize as much as you need. Out of the box Bot works well for
live coding assignments, take-home coding assignments, code review assignments.

## How it works

Bot listens and responds to slash commands present in issues or issue comments
of select repositories of an organization. With these commands, interviewers are
able to **create an assignment** for a candidate (a GitHub repository),
**invite** candidates as collaborators, and after conducting the interview,
**review and grade** assignments.

## Anatomy of an assessment

Assessments are Github _template_ repositories. They may provide scaffolding,
tests, benchmarks or automation.

We cover a variety of use cases with the example assessments below:

- [Coding Assignment](/docs/examples/coding-assignment.md)
- [Take-Home Assignment](/docs/examples/take-home-assignment.md)
- [Code Review Assignment](/docs/examples/code-review-assignment.md)

For a deep dive into each command please refer to the [reference
documentation](docs/README.md).

## Contributing

Bot is built in **Node.js** and the wonderful
[**Probot**](https://probot.github.io/docs/) framework. Install any dependencies
with `npm`.

```sh
npm install
```

Running Bot locally should be easy! Set the environment variables described in
[.env.example](.env.example). During first run, many of these variables can be
discovered by Probot itself. But make sure to modify [app.yml](app.yml) to
customize your instance.

```sh
npm start
```

Bot should be alive and kicking at port `8080`!

## Where next?

This project is in active development. Therefore new commands may be added, or
existing commands may be modified. For a full list of the supported
functionality is found by invoking the `/help` command.