# Bot

Bot is a GitHub App which enables the automation of interviewing workflows.

In some ways, it can be a viable replacement for expensive technical assessment
or remote interview platforms. By leveraging GitHub's functionality, technical
interviews happen in a platform more familiar to developers.

Technical assessments are essentially GitHub template repositories. There are no
limitations imposed from Bot as to the nature or content of the assessment, so
you are free to customize as much as you need.

## Overview

Bot listens and responds to slash commands present in issues or issue comments
of select repositories of an organization. With these commands, interviewers are
able to **create an assignment** for a candidate (a GitHub repository),
**invite** candidates as collaborators, and after conducting the interview,
**review and grade** assignments.

In its simplest form, to challenge Github user `@candidate` to take our FizzBuzz 
assessment `beat-interviewing/example-assessment`, Bot can create the 
repository `beat-interviewing/example-assessment-candidate-xyz`. It can then 
grant or revoke access to the repository. And finally, support in reviewing and 
grading the candidates submission.

Coding assignments may be a straightforward use case for Bot, but where it can
really shine is with assessments that require some initial setup. A code review
type of assessment was strong motivation for the development of this tool.

Check out [the docs](docs/index.md) for details on setting Bot up in your 
organization.

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