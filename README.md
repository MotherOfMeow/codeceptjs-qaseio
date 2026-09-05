##### Qase TSM

Qase integration with CodeceptJS. The test run is created automatically after the test execution.


##### Requirement

To use this plugin

```sh
npm i @motherofmeow/codeceptjs-qase --save
```

**Note:**

- You should include the test case id to make it works, otherwise, this plugin has no clue which case id to be added to test run on Qaseio.
- To avoid creating multiple testruns, add `--suites` to `run-workers` command

```sh
npx codeceptjs run-workers 3 --suites
```

An example:

```js
...
  Scenario('Search function is displayed @C12345', ({I, homePage}) => {
    I.seeElement(homePage.searchTextbox);
    I.seeElement(homePage.searchButton);
  });
...
```

**Data driven tests**

If you want to have different Data-driven test cases with different IDs in Qase for each iteration of the test you will need to populate the Data object with your a tag. This works because CodeceptJS extracts tags from test names, and data for Data-driven tests is populated in the test name.

An example:

```js
...
  let accounts = new DataTable(['testRailTag', 'user', 'password']);
  accounts.add(['@C12345', 'davert', '123456']); // add a tag for each user along with their test data
  accounts.add(['@C45678', 'admin', '123456']);
  
  Data(accounts).Scenario('Test Login', ({ I, current }) => {
    I.fillField('Username', current.login); // current is reserved!
    I.fillField('Password', current.password);
    I.click('Sign In');
    I.see('Welcome '+ current.login);
  });
...
```

A Gherkin example:

```gherkin
  @smoke
  @12345
  Scenario: Search function is displayed
    Given I am on the home page
    Then I see search textbox
    And I see search button
```

```gherkin
  @someTag
  Scenario Outline: Fill some field
    When I fill some field by text <text>
    Then I see text <text>
    
    Examples:
      | testRailTag | text      |
      | @C1234      | someText1 |
      | @C1235      | someText2 |
```

##### Configuration

Adding this plugin to CodeceptJS config file:
  
```js
...
plugins: {
    qase: {
        require: "@motherofmeow/codeceptjs-qase", 
        apiKey: "your api token",
        projectName: process.env.QASE_PROJECT_NAME,
        enabled: process.env.QASE_REPORT || false,
        runId: process.env.TEST_RUN_ID, 
        testRunTags: ['smoke-tests']
    }
}
...
```
