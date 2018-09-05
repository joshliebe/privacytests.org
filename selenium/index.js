/* jshint esversion: 6 */

// ## imports

const homeDir = require('os').homedir();
const { existsSync, promises : fs } = require('fs');
const {Builder, By, Key, until} = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const memoize = require('memoizee');
const request = require('request-promise-native');
const dateFormat = require('dateformat');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

// ## Selenium setup

// Read a file called .browsterstack.json. The file should contain a JSON
// object that looks like:
// `
// {
//   "browserstack.user": "my_username",
//   "browserstack.key": "my_api_key"
// }
// `
let browserstackCredentials = memoize(
  async () => JSON.parse(await fs.readFile(homeDir + "/" + ".browserstack.json")),
  { promise: true });

// Returns a browserstack capabilities object. Required
// for producing a browserstack driver.
let fetchBrowserstackCapabilities = async function () {
  let credentials = await browserstackCredentials();
  return request("https://api.browserstack.com/automate/browsers.json", {
    'json': true,
    'auth': {
      'user': credentials["browserstack.user"],
      'pass': credentials["browserstack.key"],
      'sendImmediately': true
    }
  });
};

// Takes a long capability list from browserstack.com, and
// returns a selection of these. We choose the most recent browsers
// and OS versions.
const selectRecentBrowserstackBrowsers = function (allCapabilities) {
  let OSs = new Set();
  let browsers = new Set();
  // Get names of all operating systems and browsers
  for (let { os, browser } of allCapabilities) {
    OSs.add(os);
    browsers.add(browser);
  }
  let selectedCapabilities = [];
  for (let os of OSs) {
    for (let browser of browsers) {
      let capabilities = allCapabilities.filter(c => c.os === os && c.browser === browser);
      // Find recent versions of operating system
      let os_versions_set = new Set();
      for (let { os_version } of capabilities) {
        os_versions_set.add(os_version);
      }
      let os_versions = [... os_versions_set];
      let mobile = os === "android" || os === "ios";
      // Use two most recent os versions.
      let recent_os_versions = (mobile ? os_versions.sort() : os_versions).slice(-2);
      if (recent_os_versions.length > 0) {
        for (let os_version of recent_os_versions) {
          let capabilities2 = capabilities.filter(c => c.os_version === os_version);
          // Use three most recent browser versions or three representative devices
          selectedCapabilities = selectedCapabilities.concat(capabilities2.slice(-3));
        }
      }
    }
  }
  return selectedCapabilities;
};

// Produces a selenium driver to run tests on browserstack.com,
// with the given capabilities object.
let browserStackDriver = async function (capabilities) {
  let credentials = await browserstackCredentials();
  capabilitiesWithCred = Object.assign({}, capabilities, credentials);
  let driver = new Builder()
      .usingServer('http://hub-cloud.browserstack.com/wd/hub')
      .withCapabilities(capabilitiesWithCred)
      .build();
  return driver;
};

// Produces a selenium driver to run tests on a local browser,
// using the given capabilities object.
let localDriver = async function (capabilities) {
//  let options = new firefox.Options()
//      .setPreference('privacy.firstparty.isolate', true);
  return new Builder()
    .withCapabilities(capabilities)
    .forBrowser(capabilities["browser"])
//    .setFirefoxOptions(options)
    .build();
};

// ## Testing

// Tell the selenium driver to look at a particular elements's
// attribute and wait for it to have a value. Returns a promise.
let waitForAttribute = (driver, element, attrName, timeout) =>
    driver.wait(async () => element.getAttribute(attrName), timeout);

// Tell the selenium driver to visit a url, wait for the attribute
// "data-test-results" to have a value, and resolve that value
// in a promise. Rejects if timeout elapses first.
let loadAndGetResults = async (driver, url, timeout) => {
    console.log(`loading ${url}`);
    await driver.get(url);
    let body = await driver.findElement(By.tagName('body'));
    let testResultsString =
        await waitForAttribute(driver, body, "data-test-results", timeout);
    return JSON.parse(testResultsString);
};

// Causes driver to connect to our supercookie tests. Returns
// a map of test names to test results.
let runSupercookieTests = async function (driver) {
  let secret = Math.random().toString().slice(2);
  let writeResults = await loadAndGetResults(
    driver, `https://arthuredelstein.net/resist-fingerprinting-js/tests/supercookies.html?write=true&secret=${secret}`, 10000);
  console.log("writeResults:", writeResults);
  let readParamsString = encodeURIComponent(JSON.stringify(writeResults));
  let readResultsSameFirstParty = await loadAndGetResults(
    driver, `https://arthuredelstein.net/resist-fingerprinting-js/tests/supercookies.html?read=true&readParams=${readParamsString}`, 10000);
  console.log("readResultsSameFirstParty:", readResultsSameFirstParty);
  let readResultsDifferentFirstParty = await loadAndGetResults(
    driver, `https://arthuredelstein.github.io/resist-fingerprinting-js/tests/supercookies.html?read=true&readParams=${readParamsString}`, 10000);
  for (let test in readResultsDifferentFirstParty) {
    let passed = (readResultsDifferentFirstParty[test].result !== secret);
    readResultsDifferentFirstParty[test].passed = passed;
  }
  console.log("readResultsDifferentFirstParty:", readResultsDifferentFirstParty);
  return readResultsDifferentFirstParty;
};

// Causes driver to connect to our tor network test page.
// Returns a map of test names to test results.
let runTorTests = async function (driver) {
  let tor = await loadAndGetResults(
    driver, 'https://arthuredelstein.github.io/resist-fingerprinting-js/tests/tor.html', 10000);
  return tor ? { "TorNetworkUse" : tor } : null;
};

// Run all of our privacy tests using selenium. Returns
// a map of test types to test result maps. Such as:
// `
// { "fingerprinting" : { "window.screen.width" : { /* results */ }, ... }
//   "tor" : { ... }
//   "supercookies" : { ... } }
let runTests = async function (driver) {
  try {
    let fingerprinting = await loadAndGetResults(
      driver, 'https://arthuredelstein.github.io/resist-fingerprinting-js/tests/fingerprinting.html', 10000);
    let tor = await runTorTests(driver);
    let supercookies = await runSupercookieTests(driver);
    await driver.quit();
    return { fingerprinting, tor, supercookies };
  } catch (e) {
    console.log(e);
    return null;
  }
};

// Reads the current git commit hash for this program in a string. Used
// when reporting results, to make them easier to reproduce.
let gitHash = async function () {
  const { stdout, stderr } = await exec('git rev-parse HEAD');
  if (stderr) {
    throw new Error(stderr);
  } else {
    return stdout.trim();
  }
};

// Runs a batch of tests (multiple browsers) for a given driver.
// Returns results in a JSON object.
let runTestsBatch = async function (driverType, capabilityList) {
  let driverConstructor = { browserstack: browserStackDriver,
                            firefox: localDriver,
                            chrome: localDriver }[driverType];
  if (!driverConstructor) {
    throw new Error(`unknown driver type ${driverType}`);
  }
  let all_tests = [];
  let timeStarted = new Date().toISOString();
  let git = await gitHash();
  for (let capabilities of capabilityList) {
    capabilities.browserName = capabilities.browser;
    console.log(capabilities);
    let driver = await driverConstructor(capabilities);
    let timeStarted = new Date().toISOString();
    let testResults = await runTests(driver);
    all_tests.push({ capabilities, testResults, timeStarted });
  }
  let timeStopped = new Date().toISOString();
  return { all_tests, git, timeStarted, timeStopped };
};

// ## Writing results

// Takes our results in a JSON object and writes them to disk.
// The file name looks like `results_yyyymmdd__HHMMss.json`.
let writeData = async function (data) {
  let dateStub = dateFormat(new Date(), "yyyymmdd_HHMMss", true);
  if (!(existsSync("results"))) {
    await fs.mkdir("results");
  }
  let filePath = `results/results_${dateStub}.json`;
  await fs.writeFile(filePath, JSON.stringify(data));
  console.log(`Wrote results to "${filePath}".`);
};

// ## Main program

// Reads the command line, sets up requested selenium driver(s),
// runs our browser privacy tests, and writes the result to disk.
let main = async function () {
  let driverType = process.argv[2];
  if (driverType === "chromium") {
    driverType = "chrome";
  }
  console.log(driverType);
  let browserPath = process.argv[3];
  let capabilityList;
  if (driverType === "browserstack") {
    capabilityList = selectRecentBrowserstackBrowsers(
      await fetchBrowserstackCapabilities());
  } else if (driverType === "firefox") {
    capabilityList = [{"browser": "firefox"}];
    if (browserPath) {
      capabilityList[0]["moz:firefoxOptions"] = {binary: browserPath};
    }
  } else if (driverType === "chrome") {
    capabilityList = [{"browser": "chrome"}];
  } else {
    throw new Error(`Unknown driver type '${driverType}'.`);
  }
  await writeData(await runTestsBatch(driverType, capabilityList));
};

main();
