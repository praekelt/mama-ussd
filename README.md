mama-ussd
================

*Author:* Mike Jones [mike@westerncapelabs.com]

This application provides registration for new users and quiz content for returning users

## Application layout

    lib/
    lib/mama-ussd.js
    test/test.js
    test/test-mama-ussd.js
    test/fixtures/
    package.json


## Test it!

    $ npm install mocha vumigo_v01 jed
    $ npm test

Though if you want a beautiful test output (includes nicely grouped test names etc.) that runs against the codebase:

    $ ./node_modules/.bin/mocha -R spec --watch

[![Build Status](https://travis-ci.org/praekelt/mama-ussd.png?branch=develop)](https://travis-ci.org/praekelt/mama-ussd)
