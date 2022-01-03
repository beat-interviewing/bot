# ACME Interview Automation

This repository is a proof of concept demonstrating the automation of interview
workflows. It is intended to improve the time taken by reviewers to grade
take-home assignments, and make it easier on candidates when submitting them.

## Coding Challenge

The coding challenge is ACME's usual take-home assignment (THA).

### Create coding challenge

This workflow initiates the coding challenge creates a new repository under the
`acme-interviewing` organization and invites the candidate as a collaborator to
the repository. Then commits certain files to the newly created repository.

### End coding challenge

This workflow ends the coding challenge by revoking the candidates access to the
repository. At the time of writing this is performed manually by specifying the
repository and candidate in question.