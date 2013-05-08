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
    var from_addr = "+27831234567";
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

function get_tester() {
    // These are used to mock API reponses
    // EXAMPLE: Response from google maps API
    var fixtures = [
       //'test/fixtures/example-geolocation.json'
    ];

    return new CustomTester(function (api) {
        api.config_store.config = JSON.stringify({
            quiz_data: JSON.parse(fs.readFileSync("fixtures/quiz-content.json")),
            contact_data: JSON.parse(fs.readFileSync("fixtures/user-pregnant.json"))
        });
        fixtures.forEach(function (f) {
            api.load_http_fixture(f);
        });
    });
}


// YOUR TESTS START HERE
// CHANGE THIS to test_your_app_name
describe("test_mama_ussd", function() {

    var tester = get_tester();

    // first test should always start 'null, null' because we haven't started interacting yet
    // this will be the first test when we aren't running quiz test
    it.skip("unregistered users - should be prompted for baby/no-baby state", function () {
        tester.check_state(null, null, "register_all_1",
            "^Welcome to MAMA. To give U the best information possible we need to " +
            "ask U a few questions. Are U pregnant, or do U have a baby\\?[^]" +
            "1. Pregnant[^]"+
            "2. Baby[^]" +
            "3. Don't Know$"
            );
    });

    // This is for testing mode only when needing to access random quiz weeks
    it("test users - should be prompted for baby/no-baby state", function () {
        tester.check_state(null, null, "register_all_1",
            "^Welcome to MAMA. To give U the best information possible we need to " +
            "ask U a few questions. Are U pregnant, or do U have a baby\\?[^]" +
            "1. Pregnant[^]"+
            "2. Baby[^]" +
            "3. Start quiz$"
            );
    });

    it("test users - quiz access - should be prompted for baby/no-baby state", function () {
        tester.check_state(null, "3", "quiz_start",
            "^Quiz for pregnant or baby\\?[^]" +
            "1. Pregnant[^]"+
            "2. Baby$"
            );
    });

    it("test users - quiz access - enter week", function () {
        var user = {
            current_state: 'quiz_start',
            answers: {
                register_all_1: 'quiz_start'
            }
        };
        tester.check_state(user,
            '1',
            "quiz_start_week",
            "^What week\\?[^]" +
            "1. 5[^]"+
            "2. 6$");
    });

    it("test users - quiz access - prebirth week 5", function () {
        var user = {
            current_state: 'quiz_start_week',
            answers: {
                register_all_1: 'quiz_start',
                quiz_start: 'prebirth'
            }
        };
        tester.check_state(user,
            '1',
            "prebirth_5_q_1",
            "^Congrats on your pregnancy! What kind of foods should you eat now\\?[^]" +
            "1. Fruit and vegetables[^]"+
            "2. Chips and soda$");
    });

    it("test users - quiz access - prebirth week 5 - answer correct", function () {
        var user = {
            current_state: 'prebirth_5_q_1',
            answers: {
                register_all_1: 'quiz_start',
                quiz_start: 'prebirth',
                quiz_start_week: '5'
            }
        };
        tester.check_state(user,
            '1',
            "prebirth_5_q_1_a_1",
            "^Yes! It's time to eat plenty of healthy fruits and vegetables to " +
            "nourish your growing baby.[^]" +
            "1. Next$");
    });

    it("test users - quiz access - prebirth week 5 - answer wrong", function () {
        var user = {
            current_state: 'prebirth_5_q_1',
            answers: {
                register_all_1: 'quiz_start',
                quiz_start: 'prebirth',
                quiz_start_week: '5'
            }
        };
        tester.check_state(user,
            '2',
            "prebirth_5_q_1_a_2",
            "^No - try to avoid junk food that is high in fat & sugar. Now is " +
            "the time to eat plenty of healthy fruits and vegetables to nourish " +
            "your growing baby.[^]" +
            "1. Next$");
    });

    it("test users - quiz access - postbirth week 6", function () {
        var user = {
            current_state: 'quiz_start_week',
            answers: {
                register_all_1: 'quiz_start',
                quiz_start: 'postbirth'
            }
        };
        tester.check_state(user,
            '2',
            "postbirth_6_q_1",
            "^Is it common for new mothers to feel sad\\?[^]" +
            "1. It is normal and you can call someone for support[^]"+
            "2. No - only weak people feel sad$");
    });

    it("test users - quiz access - postbirth week 5 - answer correct", function () {
        var user = {
            current_state: 'postbirth_6_q_1',
            answers: {
                register_all_1: 'quiz_start',
                quiz_start: 'postbirth',
                quiz_start_week: '6'
            }
        };
        tester.check_state(user,
            '1',
            "postbirth_6_q_1_a_1",
            "^Correct - feeling sad\\? Not enjoying anything\\? This is common in " +
            "new moms. Call[^]" +
            "1. Next$");
    });

    it("test users - quiz access - postbirth week 6 - answer wrong", function () {
        var user = {
            current_state: 'postbirth_6_q_1',
            answers: {
                register_all_1: 'quiz_start',
                quiz_start: 'postbirth',
                quiz_start_week: '6'
            }
        };
        tester.check_state(user,
            '2',
            "postbirth_6_q_1_a_2",
            "^Incorrect! Feeling sad\\? Not enjoying anything\\? This is common " +
            "in new moms. Call 0117281347 or talk to a health worker about " +
            "this; you may be depressed.[^]" +
            "1. Next$");
    });

    it("test users - quiz access - postbirth week 6 - Q2", function () {
        var user = {
            current_state: 'postbirth_6_q_1_a_1',
            answers: {
                register_all_1: 'quiz_start',
                quiz_start: 'postbirth',
                quiz_start_week: '6',
                postbirth_6_q_1: 'postbirth_6_q_1_a_1'
            }
        };
        tester.check_state(user,
            '1',
            "postbirth_6_q_2",
            "^How do you know your baby is drinking from your breast properly\\?[^]" +
            "1. He needs a mouthful of breast[^]"+
            "2. It's OK if he just attaches to the nipple$");
    });

    it("test users - quiz access - postbirth week 6 - Q2 - answer correct", function () {
        var user = {
            current_state: 'postbirth_6_q_2',
            answers: {
                register_all_1: 'quiz_start',
                quiz_start: 'postbirth',
                quiz_start_week: '6',
                postbirth_6_q_1: 'postbirth_6_q_1_a_1'
            }
        };
        tester.check_state(user,
            '1',
            "postbirth_6_q_2_a_1",
            "^Yes! Baby needs a good mouthful of breast & to squeeze it to get " +
            "milk. If his mouth is wide open & muscles by his ear move, he's " +
            "attached right.[^]" +
            "1. Next$");
    });

    it("test users - quiz access - postbirth week 6 - Q2 - answer wrong", function () {
        var user = {
            current_state: 'postbirth_6_q_2',
            answers: {
                register_all_1: 'quiz_start',
                quiz_start: 'postbirth',
                quiz_start_week: '6',
                postbirth_6_q_1: 'postbirth_6_q_1_a_1'
            }
        };
        tester.check_state(user,
            '2',
            "postbirth_6_q_2_a_2",
            "^No! Baby needs a good mouthful of breast & to squeeze it to get milk. " +
            "If his mouth is wide open & muscles by his ear move, he's attached right.[^]" +
            "1. Next$");
    });

    it("test users - quiz access - postbirth week 6 - end", function () {
        var user = {
            current_state: 'postbirth_6_q_2_a_2',
            answers: {
                register_all_1: 'quiz_start',
                quiz_start: 'postbirth',
                quiz_start_week: '6',
                postbirth_6_q_1: 'postbirth_6_q_1_a_1'
            }
        };
        tester.check_state(user,
            '1',
            "postbirth_6_end",
            "^Thanks! Goodbye!$");
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

    it.skip("unregistered users - unknown should exit with message (part 1)", function () {
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
            current_state: 'register_postbirth_2',
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

    it.skip("just registered users - prebirth - start quiz", function () {
        var user = {
            current_state: 'register_all_thanksandstart',
            answers: {
                register_all_1: 'pregnant',
                register_prebirth_2: '1',
                register_all_hivinfo: 'yes',
                register_all_smsoptin: 'yes'
            }
        };
        tester.check_state(user, "1", "quiz_start",
            "^Congrats on your pregnancy! What kind of foods should you eat now\\?[^]" +
            "1. Fruit and vegetables[^]"+
            "2. Chips and soda$"
            );
    });

    it.skip("just registered users - postbirth - start quiz", function () {
        var user = {
            current_state: 'register_all_thanksandstart',
            answers: {
                register_all_1: 'baby',
                register_prebirth_2: '1',
                register_all_hivinfo: 'yes',
                register_all_smsoptin: 'yes'
            }
        };
        tester.check_state(user, "1", "quiz_start",
            "^Congrats on your pregnancy! What kind of foods should you eat now\\?[^]" +
            "1. Fruit and vegetables[^]"+
            "2. Chips and soda$"
            );
    });

    it.skip("just registered users - prebirth - answer quiz", function () {
        var user = {
            current_state: 'quiz_start',
            answers: {
                register_all_1: 'pregnant',
                register_prebirth_2: '1',
                register_all_hivinfo: 'yes',
                register_all_smsoptin: 'yes',
                quiz_start: 'q_1_a_1'
            }
        };
        tester.check_state(user, "1", "q_1_a_1",
            "^Yes! It's time to eat plenty of healthy fruits and vegetables to" +
            " nourish your growing baby.[^]" +
            "1. Next$"
            );
    });

    // first quiz test should always start 'null, null' because we haven't started interacting yet
    it.skip("registered users - prebirth - load week 1", function () {
        var user = {
            current_state: 'quiz_entry'
        };
        tester.check_state(null, null, "quiz_entry",
            "^Congrats on your pregnancy! What kind of foods should you eat now\\?$");
    });

});

