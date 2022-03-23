Hey! I can help you facilitate coding challenge assignments with our candidates.

To create a challenge for a candidate, use the `/challenge` command. It takes the arguments `candidate` and optionally `assignment`. Like so:

    /challenge @username [assignment]

To end the challenge, use the `/end` command. This will revoke the candidates access to the challenge repository.

    /end

When you are ready to review, use the `/review` command. It will grant you access to the challenge repository where you can review the challenge. 

If configured, I may be able to help make reviewing easier for you. I can copy files from the assignment template to the candidates challenge.

    /review

To gain access to a challenge, use the `/join` command to join in on the fun! It takes an optional `@username` argument if you are inviting someone else.

    /join [@username]

If for some reason you wish to delete a challenge, use the `/delete` command. It will delete the repository. **Warning!** this action will irreversibly delete the repository. Be careful when using this command.

    /delete