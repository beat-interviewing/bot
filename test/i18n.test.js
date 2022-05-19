const { I18n } = require("../i18n");

describe("I18n.render", () => {
  
  const i18n = new I18n('i18n', 'en');

  beforeEach(async () => {
    await i18n.load();
  })

  test("challenge-created", async () => {
    const message = i18n.render('challenge-created', {
      repoOwner: 'foo',
      repo: 'foo',
      candidate: 'robpike'
    });
    expect(message).toMatch(/@robpike/)
    expect(message).toMatch(/\[foo\/foo\]\(\/foo\/foo\)/)
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