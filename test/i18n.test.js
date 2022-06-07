const { I18n } = require("../lib/i18n");

describe("I18n.render", () => {
  
  const i18n = new I18n('en');

  beforeEach(async () => {
    await i18n.load();
  })

  test("challenge-created", async () => {
    const message = i18n.render('challenge-created', {
      repoOwner: 'foo',
      repo: 'foo',
      candidate: 'robpike',
      replit: true
    });
    expect(message).toMatch(/@robpike/)
    expect(message).toMatch('[foo/foo](/foo/foo)')
    expect(message).toMatch('[![Run on Repl.it](https://repl.it/badge/github/foo/foo)](https://repl.it/github/foo/foo)')
  })

  test("challenge-created-pr", async () => {
    const message = i18n.render('challenge-created-pr', {
      repoOwner: 'foo',
      repo: 'foo',
      pull: 1
    });
    expect(message).toEqual('Pull request [#1](/foo/foo/pull/1) is ready for review.')
  })
})