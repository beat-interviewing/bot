const axios = require('axios');
const { ProbotOctokit } = require("probot");
const express = require("express");
const { I18n } = require("../lib/i18n");
const { Greenhouse } = require("../lib/greenhouse");

// jest.mock('axios');

describe("Greenhouse", () => {

  const octokit = new ProbotOctokit();

  const i18n = new I18n('en');

  const greenhouse = new Greenhouse(octokit, i18n);
  greenhouse.register(express.Router());

  beforeEach(async () => {
    await i18n.load();
  });

  test("notifyChallengeStatusCompleted", async () => {

    // Mock underlying HTTP client used by notifyChallengeStatusCompleted. Under
    // normal circumstances this method receives a URL as an argument and issues
    // a PATCH while supplying Basic Authentication credentials.
    // 
    // See: https://jestjs.io/docs/mock-functions#mock-return-values
    greenhouse.http.patch = jest.fn();
    greenhouse.http.patch.mockResolvedValue({});

    // This URL is provided via the POST /challenges endpoint. Greenhouse will
    // issue this request
    const url = 'https://app.greenhouse.io/integrations/testing_partners/take_home_tests/12345';

    try {
      const res = await greenhouse.notifyChallengeStatusCompleted(url);
      expect(res).toEqual({});
    } catch (error) {
      expect(error).toBeNull();
    }
  });

  test("listChallenges", async () => {

    // Listing challenges relies on the GitHub API to list repositories in our
    // organization. We therefore mock the octokit client to avoid network calls
    octokit.search.repos = jest.fn();
    octokit.search.repos.mockResolvedValue({
      data: {
        items: [
          { full_name: "foo/foo", description: "Foo" },
          { full_name: "bar/bar", description: "Bar" },
        ]
      }
    });

    // A stub implementation a route's response object. A handler typically 
    // receives two arguments, a request and a response. The latter allows the 
    // handler to manipulate the response being sent back to the client.
    const res = {
      json: jest.fn()
    };

    try {
      await greenhouse.listChallenges(null, res);
      expect(res.json.mock.calls.length).toEqual(1);
      const data = res.json.mock.calls[0][0];
      expect(data[0].partner_test_id).toEqual('foo/foo');
      expect(data[0].partner_test_name).toEqual('Foo');
      expect(data[1].partner_test_id).toEqual('bar/bar');
      expect(data[1].partner_test_name).toEqual('Bar');
    } catch (error) {
      expect(error).toBeNull();
    }
  });
});