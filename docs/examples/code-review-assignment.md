# Example: Code Review Assignment

TBD

<!-- 
A code review assessment is a technical interview that is typically carried out
live, where the candidate is accompanied by an interviewer and is asked to 
review a pull request supposedly submitted by the candidates peer.

The assignment is intended to test the candidates ability to identify issues in 
the functionality, design, complexity or style in a code sample.

Throughout this guide we'll use
[beat-interviewing/example-code-review-assignment](https://github.com/beat-interviewing/example-code-review-assignment)
as the code review assignment. 

## Creating the challenge

From the [new
issue](https://github.com/beat-interviewing/example-code-review-assignment/issues/new)
page we'll invoke the [`/challenge`](../challenge.md) command, using the GitHub
username of our candidate.

Shortly after the issue was created, Bot has done the following:

1. Cloned the assignment creating a new repo unique to the candidate
2. Created a pull request asking to merge the `pr` branch into `main`
2. Updated the issue title
3. Assigned the `assignment/example-code-review-assignment` label to the issue

![/challenge @BillMcKay](code-review-assignment/challenge.png)

## Inviting the candidate

When we are ready to begin, we can grant the candidate access to the repository
using the [`/join`](../join.md) command.

The candidate will receive an email inviting them to the repository. Once they
accept the invitation, they will have collaborator access to the repository.

![/join @BillMcKay](code-review-assignment/join.png)

## Conducting the interview

With the candidate having access to the repository, we're ready to conduct the
interview. This might involve a video call, where the candidate works
on the assignment with the support and guidance of an interviewer. It may alternatively be conducted asynchronously without the presence of an interviewer.

When the time allocated for the interview has elapsed, you may revoke the
candidates access to the repository using the [`/end`](../end.md) command.

![/end](code-review-assignment/end.png)

## Reviewing the submission

Once the interview has concluded, the interviewer can review and grade the
candidates submission.

To assist in reviewing the submission invoke the [`/review`](../review.md)
command. This will grant the reviewer access to the repository and (if
configured accordingly) copy files from the assessment to help with the review.

These files may range from additional tests, benchmarks, or even GitHub actions.

![/review](code-review-assignment/review.png)

Our code-review example, copied a file named `bench_test.go` which benchmarks the
candidates implementation of `FibFn()`. Since the example has a GitHub Actions 
Workflow which triggers on each `push`, a new run is triggered.

## Grading
 -->