# ACME Interview Automation

This repository is a proof of concept demonstrating the automation of interview
workflows. It is intended to improve the time taken by reviewers to grade
take-home assignments, and make it easier on candidates when submitting them.

## Begin Interview Workflow

This workflow creates a new repository under the `acme-interviewing`
organization and invites the candidate as a collaborator to the repository. Then
commits certain files to the newly created repository.

## Pull Request Automation Workflow

In order to help both candidates as well as interviewers, this workflow will perform certain

## End Interview Workflow

This workflow ends the interview by revoking the candidates access to the
repository. At the time of writing this is performed manually by specifying the
repository and candidate in question.