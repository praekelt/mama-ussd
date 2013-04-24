var fs = require("fs");
var assert = require("assert");
// CHANGE THIS to your-app-name 
var app = require("../lib/mama-ussd");


function fresh_api() {
    var api = app.api;
    api.reset();
    reset_im(api.im);
    return api;
}

function reset_im(im) {
    im.user = null;
    im.i18n = null;
    im.i18n_lang = null;
    im.current_state = null;
}

function maybe_call(f, that, args) {
    if (typeof f != "undefined" && f !== null) {
        f.apply(that, args);
    }
}

function check_state(user, content, next_state, expected_response, setup,
                     teardown) {
    // setup api
    var api = fresh_api();
    var from_addr = "1234567";
    var user_key = "users." + from_addr;
    api.kv_store[user_key] = user;

    maybe_call(setup, this, [api]);

    api.add_reply({
        cmd: "outbound.reply_to"
    });

    // send message
    api.on_inbound_message({
        cmd: "inbound-message",
        msg: {
            from_addr: from_addr,
            content: content,
            message_id: "123"
        }
    });

    // check result
    var saved_user = api.kv_store[user_key];
    assert.equal(saved_user.current_state, next_state);
    var reply = api.request_calls.shift();
    var response = reply.content;
    try {
        assert.ok(response);
        assert.ok(response.match(expected_response));
        assert.ok(response.length <= 163);
    } catch (e) {
        console.log(api.logs);
        console.log(response);
        console.log(expected_response);
        if (typeof response != 'undefined')
            console.log("Content length: " + response.length);
        throw e;
    }
    assert.deepEqual(app.api.request_calls, []);
    assert.equal(app.api.done_calls, 1);

    maybe_call(teardown, this, [api, saved_user]);
}

function CustomTester(custom_setup, custom_teardown) {
    var self = this;

    self._combine_setup = function(custom_setup, orig_setup) {
        var combined_setup = function (api) {
            maybe_call(custom_setup, self, [api]);
            maybe_call(orig_setup, this, [api]);
        };
        return combined_setup;
    };

    self._combine_teardown = function(custom_teardown, orig_teardown) {
        var combined_teardown = function (api, saved_user) {
            maybe_call(custom_teardown, self, [api, saved_user]);
            maybe_call(orig_teardown, this, [api, saved_user]);
        };
        return combined_teardown;
    };

    self.check_state = function(user, content, next_state, expected_response,
                                setup, teardown) {
        return check_state(user, content, next_state, expected_response,
                           self._combine_setup(custom_setup, setup),
                           self._combine_teardown(custom_teardown, teardown));
    };

    self.check_close = function(user, next_state, setup, teardown) {
        return check_close(user, next_state,
                           self._combine_setup(custom_setup, setup),
                           self._combine_teardown(custom_teardown, teardown));
    };
}

describe("test_api", function() {
    it("should exist", function() {
        assert.ok(app.api);
    });
    it("should have an on_inbound_message method", function() {
        assert.ok(app.api.on_inbound_message);
    });
    it("should have an on_inbound_event method", function() {
        assert.ok(app.api.on_inbound_event);
    });
});

// YOUR TESTS START HERE
// CHANGE THIS to test_your_app_name 
describe("test_mama_ussd", function() {

    // These are used to mock API reponses
    // EXAMPLE: Response from google maps API
    var fixtures = [
       //'test/fixtures/example-geolocation.json'
    ];

    var tester = new CustomTester(function (api) {
        api.config_store.config = JSON.stringify({});
        // fixtures.forEach(function (f) {
        //     api.load_http_fixture(f);
        // });
    });

    // first test should always start 'null, null' because we haven't started interacting yet
    it("unregistered users - should be prompted for baby/no-baby state", function () {
        tester.check_state(null, null, "register_all_1",
            "^Welcome to MAMA. To give U the best information possible we need to " +
            "ask U a few questions. Are U pregnant, or do U have a baby\\?[^]" +
            "1. Pregnant[^]"+
            "2. Baby[^]" +
            "3. Don't Know$"
            );
    });

    it("unregistered users - prebirth - should be prompted for month", function () {
        tester.check_state(null, "1", "register_prebirth_2",
            "^In what month is your baby due\\?[^]" +
            "1. Jan[^]"+
            "2. Feb[^]" +
            "3. March[^]" +
            "4. April[^]" +
            "5. May[^]" +
            "6. June[^]" +
            "7. July[^]" +
            "8. Aug[^]" +
            "9. Sept[^]" +
            "10. Oct[^]" +
            "11. Nov[^]" +
            "12. Dec[^]" +
            "13. Don't Know$"
            );
    });

    it("unregistered users - unknown should exit with message (part 1)", function () {
        tester.check_state(null, "3", "register_all_endstate",
            "^If you have missed a period and have 1 or more of these, do a pregnancy test: "+
            "nausea or vomiting; tender breasts; often tired.[^]"+
            "1. Read more$"
            );
    });

    it("unregistered users - unknown should exit with message (part 2)", function () {
        var user = {
            current_state: 'register_all_endstate',
            answers: {
                register_all_1: 'dontknow'
            }
        };
        tester.check_state(user,
            '1',
            "register_all_endstate2",
            "^Don't wait! The first pregnancy check-up must happen as soon as you " +
            "know. Do the test as soon as possible at any clinic, or get one at a " +
            "pharmacy. Stay well.$");
    });


    it("unregistered users - prebirth - unknown should exit", function () {
        var user = {
            current_state: 'register_prebirth_2',
            answers: {
                register_all_1: 'pregnant'
            }
        };
        tester.check_state(user,
            '13',
            "register_prebirth_2_endstate",
            "^To sign up, we need to know which month. Please go to the clinic to " +
            "find out, and dial us again.$");
    });

    it("unregistered users - postbirth - should be prompted for month old", function () {
        tester.check_state(null, "2", "register_postbirth_2",
            "^How many months old is your baby\\?[^]" +
            "1. 1[^]"+
            "2. 2[^]" +
            "3. 3[^]" +
            "4. 4[^]" +
            "5. 5[^]" +
            "6. 6[^]" +
            "7. 7[^]" +
            "8. 8[^]" +
            "9. 9[^]" +
            "10. 10[^]" +
            "11. More than 10$"
            );
    });

    it("unregistered users - postbirth - over 10 months should exit with message", function () {
        var user = {
            current_state: 'register_postbirth_2',
            answers: {
                register_all_1: 'baby'
            }
        };
        tester.check_state(user,
            '11',
            "register_postbirth_2_endstate",
            "^Sorry, the MAMA quizzes are aimed at mothers of younger babies. " +
            "You can visit askmama.mobi to read useful info, and meet other moms. Stay well.$");
    });

    it("unregistered users - prebirth - get HIV information", function () {
        var user = {
            current_state: 'register_prebirth_2',
            answers: {
                register_all_1: 'pregnant'
            }
        };
        tester.check_state(user, "1", "register_all_hivinfo",
            "^Your quiz can include info on HIV. Would you like that\\?[^]" +
            "1. Yes[^]"+
            "2. No$"
            );
    });

    it("unregistered users - postbirth - get HIV information", function () {
        var user = {
            current_state: 'register_prebirth_2',
            answers: {
                register_all_1: 'baby'
            }
        };
        tester.check_state(user, "1", "register_all_hivinfo",
            "^Your quiz can include info on HIV. Would you like that\\?[^]" +
            "1. Yes[^]"+
            "2. No$"
            );
    });

    it("unregistered users - prebirth - sms opt in", function () {
        var user = {
            current_state: 'register_all_hivinfo',
            answers: {
                register_all_1: 'pregnant',
                register_prebirth_2: '10'
            }
        };
        tester.check_state(user, "1", "register_all_smsoptin",
            "^We can send you sms's to remind you to take the next quiz. Would " +
            "you like that\\?[^]" +
            "1. Yes[^]"+
            "2. No$"
            );
    });

    it("unregistered users - postbirth - sms opt in", function () {
        var user = {
            current_state: 'register_all_hivinfo',
            answers: {
                register_all_1: 'baby',
                register_postbirth_2: '1'
            }
        };
        tester.check_state(user, "1", "register_all_smsoptin",
            "^We can send you sms's to remind you to take the next quiz. Would " +
            "you like that\\?[^]" +
            "1. Yes[^]"+
            "2. No$"
            );
    });

    it("unregistered users - prebirth - thanks and want quiz", function () {
        var user = {
            current_state: 'register_all_smsoptin',
            answers: {
                register_all_1: 'pregnant',
                register_prebirth_2: '1',
                register_all_hivinfo: 'yes'
            }
        };
        tester.check_state(user, "1", "register_all_thanksandstart",
            "^Thank you! You can now start to learn by taking your first quiz. " +
            "Start now\\?[^]" +
            "1. Yes[^]"+
            "2. No$"
            );
    });

    it("unregistered users - postbirth - thanks and want quiz", function () {
        var user = {
            current_state: 'register_all_smsoptin',
            answers: {
                register_all_1: 'baby',
                register_prebirth_2: '1',
                register_all_hivinfo: 'yes'
            }
        };
        tester.check_state(user, "1", "register_all_thanksandstart",
            "^Thank you! You can now start to learn by taking your first quiz. " +
            "Start now\\?[^]" +
            "1. Yes[^]"+
            "2. No$"
            );
    });

    it("unregistered users - prebirth - end success", function () {
        var user = {
            current_state: 'register_all_thanksandstart',
            answers: {
                register_all_1: 'pregnant',
                register_prebirth_2: '1',
                register_all_hivinfo: 'yes',
                register_all_smsoptin: 'yes'
            }
        };
        tester.check_state(user, "2", "register_all_endsuccess",
            "^Thanks for joining MAMA. Dial \\*120\\*2112\\# each week to start " +
            "learning about your growing baby.$"
            );
    });

    it("unregistered users - postbirth - end success", function () {
        var user = {
            current_state: 'register_all_thanksandstart',
            answers: {
                register_all_1: 'baby',
                register_prebirth_2: '1',
                register_all_hivinfo: 'yes',
                register_all_smsoptin: 'yes'
            }
        };
        tester.check_state(user, "2", "register_all_endsuccess",
            "^Thanks for joining MAMA. Dial \\*120\\*2112\\# each week to start " +
            "learning about your growing baby.$"
            );
    });

    it("just registered users - prebirth - end quiz success", function () {
        var user = {
            current_state: 'register_all_thanksandstart',
            answers: {
                register_all_1: 'pregnant',
                register_prebirth_2: '1',
                register_all_hivinfo: 'yes',
                register_all_smsoptin: 'yes'
            }
        };
        tester.check_state(user, "1", "quiz_endsuccess",
            "^Thanks for taking the quiz. Every week you will get a new quiz " +
            "about your growing baby. Dial \\*120\\*2112\\* again next week to "+
            "learn more.$"
            );
    });

    it("just registered users - postbirth - end quiz success", function () {
        var user = {
            current_state: 'register_all_thanksandstart',
            answers: {
                register_all_1: 'baby',
                register_prebirth_2: '1',
                register_all_hivinfo: 'yes',
                register_all_smsoptin: 'yes'
            }
        };
        tester.check_state(user, "1", "quiz_endsuccess",
            "^Thanks for taking the quiz. Every week you will get a new quiz " +
            "about your growing baby. Dial \\*120\\*2112\\* again next week to "+
            "learn more.$"
            );
    });

});

