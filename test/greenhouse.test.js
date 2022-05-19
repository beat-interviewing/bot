const axios = require('axios');
const { ProbotOctokit } = require("probot");
const express = require("express");
const { I18n } = require("../i18n");
const { Greenhouse } = require("../greenhouse");

jest.mock('axios');

describe("Greenhouse", () => {

  const octokit = new ProbotOctokit();

  octokit.search.repos = jest.fn(async () => {
    data: {
      items: [
        { full_name: "foo/foo", description: "Foo" },
        { full_name: "bar/bar", description: "Bar" },
      ];
    }
  });


  const i18n = new I18n('i18n', 'en');

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
    // See: https://jestjs.io/docs/mock-functions#mocking-modules
    axios.patch.mockResolvedValue({});

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

    const res = {
      json: jest.fn()
    };

    try {
      await greenhouse.listChallenges(null, res);
      expect(res.json.mock.calls.length).toEqual(1);
      // console.log(res.json.mock.results)
      // expect(res.json.mock.results.length).toEqual(2);

      // expect(res.json.mock.results[0][0].full_name).toEqual('foo/foo');
    } catch (error) {
      console.log(error);
      expect(error).toBeNull();
    }
  });
});