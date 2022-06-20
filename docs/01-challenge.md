# Challenge

To create a challenge, we must create a [new
issue](/beat-interviewing/example/issues/new) at the assessment repository and
invoke the `/challenge` command.

![](img/challenge-candidate.gif)

Let's unpack what happened here. We've created a new issue, and in the body of
the issue we included the line

> /challenge @billmckay

Soon after we've created the issue, Bot replied with a message

> Created challenge beat-interviewing/example-live-billmckay-esl for @billmckay.
>
> When ready, use `/join @billmckay` to invite them as a collaborator.

From the reply, we see that a unique repository was created for the candidate,
using the current repository as a template. In this case
[beat-interviewing/example-live-billmckay-esl](/beat-interviewing/example-live-billmckay-esl).
The name of this new repository includes the candidates username, as well as a
random suffix for uniqueness.

Bot also let us know that our candidate does not yet have access to this
repository. But when we are ready to invite them, we should use the `/join`
command. We'll cover that soon! 

To keep things tidy, the issue title has been changed to maintain consistency. A
label has also been added to the issue to help us search in the future.

Bot also supports more elaborate challenges. These may require configuration,
and are described in more detail [here](todo).

Next, we'll [invite the candidate to collaborate](02-join.md)!

> _NOTE:_ Any metadata relating to this challenge is stored inside the issue
> body in JSON format. See the
> [metadata](https://probot.github.io/docs/extensions/#metadata) extension on
> how metadata is handled.