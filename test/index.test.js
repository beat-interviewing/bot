const nock = require("nock");
const robot = require("..");
const { Probot, ProbotOctokit } = require("probot");
const { I18n } = require("../i18n");

describe("Challenger", () => {

  let probot;

  beforeEach(() => {
    nock.disableNetConnect();
    probot = new Probot({
      appId: 123,
      githubToken: "xxx",
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    });
    probot.load(robot);
  });

  test("creates a challenge when invoked", async () => {
    
    const mock = nock("https://api.github.com")
      .post("/repos/acme-interviewing/interview/issues/41/comments", (body) => {
        expect(body).toMatchObject({
          body: "Created challenge"
        });
        return true;
      })
      .reply(200);

    await probot.receive({
      name: "issues",
      payload: {
        action: "opened",
        issue: {
          number: 41,
          user: {
            login: "alexkappa"
          },
          body: "/challenge @alexkappa go-take-home"
        },
        repository: {
          name: "interview",
          owner: {
            login: "acme-interviewing"
          }
        },
        installation: {
          id: 1
        }
      }
    });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
});

describe("i18n", () => {
  
  test("loads all templates", async () => {
    const i18n = new I18n('i18n', 'en');
    await i18n.load();

    const message = i18n.render('challenge-create-failed', {
      assignment: 'foo',
      candidate: 'alexkappa',
      error: {
        stack: 'foo:1\nbar:12',
        request: { method: 'PUT', url: '/foo', body: `{"foo":"bar"}` },
        response: { data: { foo: 'bar' }}
      }
    });

    expected = `
Unable to create foo challenge for @alexkappa.

\`\`\`
foo:1
bar:12
\`\`\`

<details>
  <summary>Request</summary>

\`\`\`
PUT /foo

{"foo":"bar"}
\`\`\`
</details>

<details>
  <summary>Response</summary>

\`\`\`
{"foo":"bar"}
\`\`\`
</details>`;

    expect(message).toStrictEqual(expected)
  })
});

// For more information about testing with Jest see:
// https://facebook.github.io/jest/

// For more information about testing with Nock see:
// https://github.com/nock/nock
