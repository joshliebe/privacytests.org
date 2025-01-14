# PrivacyTests.org tests
This project runs browser privacy tests (fingerprinting resistance, partitioning between websites, etc.), saves the results to a JSON file, and renders those results in web pages.

**NOTE**: privacytests.org no longer uses selenium because it is incompatible with some privacy protections such as Safari's ITP. The code is undergoing many changes and currently only works on macOS. There is no longer
browserstack support.

## Set up

First on Linux (for when it is supported in the future):

`sudo apt-get install libpng-dev libxtst-dev libx11-dev`

For iOS testing (run on MacOS), we need:

`brew install ideviceinstaller`

Then, on all platforms:

`npm install`

Next run
```
brew install mkcert
mkcert -install
```

You're ready to go!

* test.js runs the browser tests.
* render.js takes the results of the browser tests and renders them to a web page.

## Usage

To run tests, point to a .yaml file:

`node test config/desktop.yaml`

Config files are YAML arrays. Each item in the array is an object
that describes what should go into a single test. All parameters
are optional, except `browser`:

```
browsers:                # Possible values include chrome, firefox, brave, opera, edge, vivaldi, etc.
  - chrome
  - firefox
  - brave
  - edge
android: false,          # Set to true to run on Android platform (default: false)
ios: false,              # Set to true to run on iOS platform (default: false)
incognito: false,        # Set incognito to true for testing private browsing windows. (default: false)
tor: true                # Set tor to true for 'Brave Private Window with Tor.' (default: false)
repeat: 1                # Integer, how many times we should repeat this test (default: 1)
aggregate: true          # Whether to combine repeated runs of a browser into a single column (default: true)
debug: false             # Whether to leave browsers open after test is done (default: false)
```

You can also use these flags on the command line, after the yaml file or instead of one:

* `--browsers chrome,firefox,vivaldi`: use the specified browsers, separated by commas
* `--repeat 10`: repeat the whole set of tests 10 times
* `--debug`: Don't close browser(s) after test is done
* `--only brave`: Only run a single browser in the config file with the name given
* `--aggregate`: Combine results from the same browser into a single column (enabled by default)
* `--ios`: Add flag to run on iOS
* `--android`: Add flag to run on Android

## Development

To hack on the code, and get fast feedback, use:

`npm run develop`

When you run browser tests, when they complete the /results.html page will be updated. If you save a change to render.js, the page will also be updated.

