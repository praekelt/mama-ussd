var fs = require("fs");
var assert = require("assert");
var vumigo = require("vumigo_v01");
var app = require("../lib/mama-ussd");

// This just checks that you hooked you InteractionMachine
// up to the api correctly and called im.attach();
describe("test api", function() {
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

var quiz_file = process.env.MAMA_QUIZ_FILE || "fixtures/quiz-content.json";

describe("On MAMA USSD line", function() {

    describe("unregistered users", function() {

        // These are used to mock API reponses
        // EXAMPLE: Response from google maps API
        var fixtures = [];

        var tester = new vumigo.test_utils.ImTester(app.api, {
            custom_setup: function (api) {
                api.config_store.config = JSON.stringify({
                    quiz_data: JSON.parse(fs.readFileSync(quiz_file)),
                    testing: true,
                    testing_mock_today: [2013,4,8,11,11]
                    // testing_mock_today: [2013,5,21,16,50]
                });
                fixtures.forEach(function (f) {
                    api.load_http_fixture(f);
                });
                api._dummy_contacts = {};
                api._new_contact = {
                    key: 'contact-key',
                    surname: null,
                    user_account: null,
                    bbm_pin: null,
                    msisdn: null,
                    created_at: '2013-04-24 14:01:41.803693',
                    gtalk_id: null,
                    dob: null,
                    groups: [],
                    facebook_id: null,
                    twitter_handle: null,
                    email_address: null,
                    name: null,
                    extras: {}
                };
                api._handle_contacts_get_or_create = function(cmd, reply) {
                    var reply_contact = false;
                    for (var contact_key in api._dummy_contacts){
                        if (api._dummy_contacts[contact_key].msisdn == cmd.addr){
                            reply_contact = api._dummy_contacts[contact_key];
                        }
                    }
                    if (reply_contact){
                        reply({
                            success: true,
                            created: false,
                            contact: reply_contact
                        });
                    } else {
                        api._dummy_contacts['contact-key'] = api._new_contact;
                        api._dummy_contacts['contact-key'].msisdn = cmd.addr;
                        reply({
                            success: true,
                            created: true,
                            contact: api._new_contact
                        });
                    }
                };

                api._handle_contacts_update = function(cmd, reply) {
                    api._dummy_contacts[cmd.key] = cmd.fields;
                    reply({
                        success: true,
                        contact: api._dummy_contacts[cmd.key]
                    });
                };
                // TODO: This will break when contacts api gets changed to newer format
                api._handle_contacts_update_extras = function(cmd, reply) {
                    var success = true;
                    for (var k in cmd.fields) {
                        if (typeof cmd.fields[k]!="string"){  // This is always string ATM
                            success = false;
                            break;
                        } else {
                            api._dummy_contacts[cmd.key]['extras-'+k] = cmd.fields[k];
                        }
                    }
                    reply({
                        success: success,
                        contact: api._dummy_contacts[cmd.key]
                    });
                };
            },
            async: true
        });

        // first test should always start 'null, null' because we haven't started interacting yet
        // this will be the first test when we aren't running quiz test
        it("should be prompted for baby/no-baby status", function (done) {
            var p = tester.check_state({
                user: null,
                content: null,
                next_state: "initial_state",
                response: "^Welcome to MAMA. To give U the best information possible we need to " +
                "ask U a few questions. Are U pregnant, or do U have a baby\\?[^]" +
                "1. Pregnant[^]"+
                "2. Baby[^]" +
                "3. Don't know$"
            });
            p.then(function() {
                var metrics_store = app.api.metrics['mama-metrics'];
                var metric = metrics_store['total-visitors'];
                assert.equal(metric.agg, 'max');
                assert.deepEqual(metric.values, [1]);
            }).then(done, done);
        });

        it("unknown, should get pre-exit message", function (done) {
            var p = tester.check_state({
                user: null,
                content: "3",
                next_state: "register_all_endstate",
                response: "^If you have missed a period and have 1 or more of these, do a pregnancy test: "+
                "nausea or vomiting; tender breasts; often tired.[^]"+
                "1. Read more$"
            });
            p.then(done, done);
        });

        it("unknown, should complete exit with message", function (done) {
            var user = {
                current_state: 'register_all_endstate',
                answers: {
                    initial_state: 'dontknow'
                }
            };
            var p = tester.check_state({
                user: user,
                content: '1',
                next_state: "register_all_endstate2",
                response: "^Don't wait! The first pregnancy check-up must happen as soon as you " +
                "know. Do the test as soon as possible at any clinic, or get one at a " +
                "pharmacy. Stay well.$",
                continue_session: false
            });
            p.then(done, done);
        });

        it("prebirth, should be prompted for month", function (done) {
            var p = tester.check_state({
                user: null,
                content: "1",
                next_state: "register_prebirth_2",
                response: "^In what month is your baby due\\?[^]" +
                "1. May[^]" +
                "2. June[^]" +
                "3. July[^]" +
                "4. Aug[^]" +
                "5. Sept[^]" +
                "6. Oct[^]" +
                "7. Nov[^]" +
                "8. Dec[^]" +
                "9. Jan[^]" +
                "10. Don't Know$"
            });
            p.then(done, done);
        });

        it("prebirth, unknown due month should exit", function (done) {
            var user = {
                current_state: 'register_prebirth_2',
                answers: {
                    initial_state: 'pregnant'
                }
            };
            var p = tester.check_state({
                user: user,
                content: '10',
                next_state: "register_prebirth_2_endstate",
                response: "^To sign up, we need to know which month. Please go to the clinic to " +
                "find out, and dial us again.$",
                continue_session: false
            });
            p.then(done, done);
        });

        it("postbirth, should be prompted for how many months old baby is", function (done) {
            var p = tester.check_state({
                user: null,
                content: "2", next_state: "register_postbirth_2",
                response: "^How many months old is your baby\\?[^]" +
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
            });
            p.then(done, done);
        });

        it("postbirth, with baby over 10 months should exit with message", function (done) {
            var user = {
                current_state: 'register_postbirth_2',
                answers: {
                    initial_state: 'baby'
                }
            };
            var p = tester.check_state({
                user: user,
                content: '11',
                next_state: "register_postbirth_2_endstate",
                response: "^Sorry, the MAMA quizzes are aimed at mothers of younger babies. " +
                "You can visit askmama.mobi to read useful info, and meet other moms. Stay well.$",
                continue_session: false
            });
            p.then(done, done);
        });

        it("prebirth, should be asked if they want to get HIV-related information", function (done) {
            var user = {
                current_state: 'register_prebirth_2',
                answers: {
                    initial_state: 'pregnant',
                    register_prebirth_2: '9'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "register_all_hivinfo",
                response: "^Your quiz can include info on HIV. Would you like that\\?[^]" +
                "1. Yes[^]"+
                "2. No$"
            });
            p.then(done, done);
        });

        it("postbirth, should be asked if they want to get HIV-related information", function (done) {
            var user = {
                current_state: 'register_postbirth_2',
                answers: {
                    initial_state: 'baby',
                    register_postbirth_2: '1'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "register_all_hivinfo",
                response: "^Your quiz can include info on HIV. Would you like that\\?[^]" +
                "1. Yes[^]"+
                "2. No$"
            });
            p.then(done, done);
        });

        it("prebirth, should be asked if they want to opt in to SMSs", function (done) {
            var user = {
                current_state: 'register_all_hivinfo',
                answers: {
                    initial_state: 'pregnant',
                    register_prebirth_2: '9'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "register_all_smsoptin",
                response: "^We can send you sms's to remind you to take the next quiz. Would " +
                "you like that\\?[^]" +
                "1. Yes[^]"+
                "2. No$"
            });
            p.then(done, done);
        });

        it("postbirth, should be asked if they want to opt in to SMSs", function (done) {
            var user = {
                current_state: 'register_all_hivinfo',
                answers: {
                    initial_state: 'baby',
                    register_postbirth_2: '1'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "register_all_smsoptin",
                response: "^We can send you sms's to remind you to take the next quiz. Would " +
                "you like that\\?[^]" +
                "1. Yes[^]"+
                "2. No$"
            });
            p.then(done, done);
        });

        it("prebirth, should be thanked and asked if want quiz", function (done) {
            var user = {
                current_state: 'register_all_smsoptin',
                answers: {
                    initial_state: 'pregnant',
                    register_prebirth_2: '1',
                    register_all_hivinfo: 'yes'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "register_all_thanksandstart",
                response: "^Thank you! You can now start to learn by taking your first quiz. " +
                "Start now\\?[^]" +
                "1. Yes[^]"+
                "2. No$"
            });
            p.then(function() {
                var metrics_store = app.api.metrics['mama-metrics'];
                var metric = metrics_store['total-signups'];
                assert.equal(metric.agg, 'max');
                assert.deepEqual(metric.values, [1]);
            }).then(done, done);
        });

        it("postbirth, should be thanked and asked if want quiz", function (done) {
            var user = {
                current_state: 'register_all_smsoptin',
                answers: {
                    initial_state: 'baby',
                    register_postbirth_2: '5',
                    register_all_hivinfo: 'yes'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "register_all_thanksandstart",
                response: "^Thank you! You can now start to learn by taking your first quiz. " +
                "Start now\\?[^]" +
                "1. Yes[^]"+
                "2. No$"
            });
            p.then(function() {
                var metrics_store = app.api.metrics['mama-metrics'];
                var metric = metrics_store['total-signups'];
                assert.equal(metric.agg, 'max');
                assert.deepEqual(metric.values, [1]);
            }).then(done, done);
        });

        it("prebirth, should if not opting for quiz now, thank and exit", function (done) {
            var user = {
                current_state: 'register_all_thanksandstart',
                answers: {
                    initial_state: 'pregnant',
                    register_prebirth_2: '1',
                    register_all_hivinfo: 'yes',
                    register_all_smsoptin: 'yes'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "2",
                next_state: "register_all_endsuccess",
                response: "^Thanks for joining MAMA. Dial \\*120\\*2112\\# each week to start " +
                "learning about your growing baby.$",
                continue_session: false
            });
            p.then(done, done);
        });

        it("postbirth, should if not opting for quiz now, thank and exit", function (done) {
            var user = {
                current_state: 'register_all_thanksandstart',
                answers: {
                    initial_state: 'baby',
                    register_postbirth_2: '5',
                    register_all_hivinfo: 'yes',
                    register_all_smsoptin: 'yes'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "2",
                next_state: "register_all_endsuccess",
                response: "^Thanks for joining MAMA. Dial \\*120\\*2112\\# each week to start " +
                "learning about your growing baby.$",
                continue_session: false
            });
            p.then(done, done);
        });

        it("prebirth, opting for quiz, should start quiz", function (done) {
            var user = {
                current_state: 'register_all_thanksandstart',
                answers: {
                    initial_state: 'pregnant',
                    register_prebirth_2: '1',
                    register_all_hivinfo: 'yes',
                    register_all_smsoptin: 'yes'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "prebirth_5_q_1",
                response: "^Congrats on your pregnancy! What kind of foods should you eat now\\?[^]" +
                "1. Fruit and vegetables[^]"+
                "2. Chips and soda$"
            });
            p.then(done, done);
        });

        it("postbirth, opting for quiz, should start quiz", function (done) {
            var user = {
                current_state: 'register_all_thanksandstart',
                answers: {
                    initial_state: 'baby',
                    register_postbirth_2: '5',
                    register_all_hivinfo: 'yes',
                    register_all_smsoptin: 'yes'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "postbirth_5_q_1",
                response: "^When does your baby's birth need to be registered with Home Affairs\\?[^]" +
                "1. Within 30 days of birth[^]"+
                "2. Within 3 months$"
            });
            p.then(done, done);
        });

        it("prebirth, opting for quiz, gets quiz question right", function (done) {
            var user = {
                current_state: 'prebirth_5_q_1',
                answers: {
                    initial_state: 'pregnant',
                    register_prebirth_2: '1',
                    register_all_hivinfo: 'yes',
                    register_all_smsoptin: 'yes',
                    quiz_start: 'prebirth_5_q_1'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "prebirth_5_q_1_a_1",
                response: "^Yes! It's time to eat plenty of healthy fruits and vegetables to" +
                " nourish your growing baby.[^]" +
                "1. Next$"
            });
            p.then(done, done);
        });

        it("prebirth, opting for quiz, gets quiz question wrong", function (done) {
            var user = {
                current_state: 'prebirth_5_q_1',
                answers: {
                    initial_state: 'pregnant',
                    register_postbirth_2: '5',
                    register_all_hivinfo: 'yes',
                    register_all_smsoptin: 'yes',
                    quiz_start: 'prebirth_5_q_1'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "2",
                next_state: "prebirth_5_q_1_a_2",
                response: "^No - try to avoid junk food that is high in fat & " +
                "sugar. Now is the time to eat plenty of healthy fruits and " +
                "vegetables to nourish your growing baby.[^]" +
                "1. Next$"
            });
            p.then(done, done);
        });

        it("prebirth, gives a correct weeks-of-pregnancy calculation", function(){
            // http://www.pregnology.com/faralong.php?month=1&day=14&year=2014
            var state_creator = app.api.im.state_creator;
            var today = new Date(2013,4,14);
            var weekofpreg = state_creator.calc_weeks(today, 1);
            assert.equal(weekofpreg, 5);
            today = new Date(2013,4,21);
            weekofpreg = state_creator.calc_weeks(today, 1);
            assert.equal(weekofpreg, 6);
        });

        it("prebirth, detects a due month too far in future", function(){
            // http://www.pregnology.com/faralong.php?month=1&day=14&year=2014
            var state_creator = app.api.im.state_creator;
            var today = new Date(2013,4,21);
            var weekofpreg = state_creator.calc_weeks(today, 3);
            assert.equal(weekofpreg, false);
        });
    });

    describe("registered users", function() {

        // These are used to mock API reponses
        // EXAMPLE: Response from google maps API
        var fixtures = [];
        var tester = new vumigo.test_utils.ImTester(app.api, {
            custom_setup: function (api) {
                api.config_store.config = JSON.stringify({
                    quiz_data: JSON.parse(fs.readFileSync(quiz_file)),
                    testing: true,
                    testing_mock_today: [2013,4,8,11,11]
                });
                fixtures.forEach(function (f) {
                    api.load_http_fixture(f);
                });
                api._dummy_contacts = {
                    "f953710a2472447591bd59e906dc2c26": {
                        key: "f953710a2472447591bd59e906dc2c26",
                        surname: "Trotter",
                        user_account: "test-0-user",
                        bbm_pin: null,
                        msisdn: "1234567",
                        created_at: "2013-04-24 14:01:41.803693",
                        gtalk_id: null,
                        dob: null,
                        groups: ["group-a", "group-b"],
                        facebook_id: null,
                        twitter_handle: null,
                        email_address: null,
                        name: "Rodney",
                        "extras-mama_registered": "2013-05-24T08:27:01.209Z",
                        "extras-mama_total_signins": 0,
                        "extras-mama_status": "pregnant",
                        "extras-mama_child_dob": "2014-1",
                        "extras-mama_optin_hiv": "yes",
                        "extras-mama_optin_sms": "yes",
                        "extras-mama_completed_quizzes": '["prebirth_4"]',
                        "extras-mama_cohort_group": "initial",
                        "extras-mama_cohort_group_history": '["initial"]'
                    }
                };
                api._new_contact = {
                    key: 'contact-key',
                    surname: null,
                    user_account: null,
                    bbm_pin: null,
                    msisdn: null,
                    created_at: '2013-04-24 14:01:41.803693',
                    gtalk_id: null,
                    dob: null,
                    groups: [],
                    facebook_id: null,
                    twitter_handle: null,
                    email_address: null,
                    name: null,
                    extras: {}
                };
                api._handle_contacts_get_or_create = function(cmd, reply) {
                    var reply_contact = false;
                    for (var contact_key in api._dummy_contacts){
                        if (api._dummy_contacts[contact_key].msisdn == cmd.addr){
                            reply_contact = api._dummy_contacts[contact_key];
                        }
                    }
                    if (reply_contact){
                        reply({
                            success: true,
                            created: false,
                            contact: reply_contact
                        });
                    } else {
                        api._dummy_contacts['contact-key'] = api._new_contact;
                        api._dummy_contacts['contact-key'].msisdn = cmd.addr;
                        reply({
                            success: true,
                            created: true,
                            contact: api._new_contact
                        });
                    }
                };

                api._handle_contacts_update = function(cmd, reply) {
                    api._dummy_contacts[cmd.key] = cmd.fields;
                    reply({
                        success: true,
                        contact: api._dummy_contacts[cmd.key]
                    });
                };

                // TODO: This will break when contacts api gets changed to newer format
                api._handle_contacts_update_extras = function(cmd, reply) {
                    for (var k in cmd.fields) { api._dummy_contacts[cmd.key]['extras-'+k] = cmd.fields[k]; }
                    reply({
                        success: true,
                        contact: api._dummy_contacts[cmd.key]
                    });
                };
            },
            async: true
        });

        it("should start quiz week 5", function (done) {
            var p = tester.check_state({
                user: null,
                content: null,
                next_state: "initial_state",
                response: "^Congrats on your pregnancy! What kind of foods should you eat now\\?[^]" +
                "1. Fruit and vegetables[^]"+
                "2. Chips and soda$"
            });
            p.then(function() {
                var metrics_store = app.api.metrics['mama-metrics'];
                var metric = metrics_store['2013-05-06_initial'];
                assert.equal(metric.agg, 'max');
                assert.deepEqual(metric.values, [1]);
            }).then(done, done);
        });

        it("gets quiz question right", function (done) {
            var p = tester.check_state({
                user: null,
                content: "1",
                next_state: "prebirth_5_q_1_a_1",
                response: "^Yes! It's time to eat plenty of healthy fruits and vegetables to" +
                " nourish your growing baby.[^]" +
                "1. Next$"
            });
            p.then(done, done);
        });

        it("gets quiz question wrong", function (done) {
            var p = tester.check_state({
                user: null,
                content: "2",
                next_state: "prebirth_5_q_1_a_2",
                response: "^No - try to avoid junk food that is high in fat & " +
                "sugar. Now is the time to eat plenty of healthy fruits and " +
                "vegetables to nourish your growing baby.[^]" +
                "1. Next$"
            });
            p.then(done, done);
        });

        it("gets quiz question 2", function (done) {
            var user = {
                current_state: 'prebirth_5_q_1_a_1',
                answers: {
                    initial_state: '1'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "prebirth_5_q_2",
                response: "^Is it important to know your HIV status when " +
                "you're pregnant\\?[^]" +
                "1. Yes, very important[^]" +
                "2. No, it doesn't matter$"
            });
            p.then(done, done);
        });

        it("gets quiz question 2 right", function (done) {
            var user = {
                current_state: 'prebirth_5_q_2',
                answers: {
                    initial_state: '1',
                    prebirth_5_q_1: 'prebirth_5_q_1_a_1'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "prebirth_5_q_2_a_1",
                response: "^Yes! Knowing your HIV status is very important " +
                "in pregnancy. You can help to keep your baby HIV negative.[^]" +
                "1. Next$"
            });
            p.then(done, done);
        });

        it("gets quiz question 2 wrong", function (done) {
            var user = {
                current_state: 'prebirth_5_q_2',
                answers: {
                    initial_state: '1',
                    prebirth_5_q_1: 'prebirth_5_q_1_a_1'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "2",
                next_state: "prebirth_5_q_2_a_2",
                response: "^No - knowing your HIV status really does matter " +
                "in pregnancy. You can help to keep your baby HIV negative.[^]" +
                "1. Next$"
            });
            p.then(done, done);
        });

        it("gets quiz question 3", function (done) {
            var user = {
                current_state: 'prebirth_5_q_2_a_1',
                answers: {
                    initial_state: '1',
                    prebirth_5_q_1: 'prebirth_5_q_1_a_1',
                    prebirth_5_q_1_a_1: 'prebirth_5_q_2',
                    prebirth_5_q_2: 'prebirth_5_q_2_a_1'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "prebirth_5_q_3",
                response: "^How big is your baby right now\\?[^]" +
                "1. The size of a small bean[^]" +
                "2. The size of a lemon$"
            });
            p.then(done, done);
        });

        it("gets quiz question 3 right", function (done) {
            var user = {
                current_state: 'prebirth_5_q_3',
                answers: {
                    initial_state: '1',
                    prebirth_5_q_1: 'prebirth_5_q_1_a_1',
                    prebirth_5_q_1_a_1: 'prebirth_5_q_2',
                    prebirth_5_q_2: 'prebirth_5_q_2_a_1',
                    prebirth_5_q_2_a_1: 'prebirth_5_q_3'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "prebirth_5_q_3_a_1",
                response: "^Yes - your baby is only just the size of a very " +
                "small bean, but he already has tiny hands and feet. His heart " +
                "is beating twice as fast as yours.[^]" +
                "1. Next$"
            });
            p.then(done, done);
        });

        it("gets quiz question 3 wrong", function (done) {
            var user = {
                current_state: 'prebirth_5_q_3',
                answers: {
                    initial_state: '1',
                    prebirth_5_q_1: 'prebirth_5_q_1_a_1',
                    prebirth_5_q_1_a_1: 'prebirth_5_q_2',
                    prebirth_5_q_2: 'prebirth_5_q_2_a_1',
                    prebirth_5_q_2_a_1: 'prebirth_5_q_3'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "2",
                next_state: "prebirth_5_q_3_a_2",
                response: "^No - your baby is only just the size of a very " +
                "small bean, but he already has tiny hands and feet. His heart " +
                "is beating twice as fast as yours.[^]" +
                "1. Next$"
            });
            p.then(done, done);
        });

        it("gets quiz end state", function (done) {
            var user = {
                current_state: 'prebirth_5_q_3_a_1',
                answers: {
                    initial_state: '1',
                    prebirth_5_q_1: 'prebirth_5_q_1_a_1',
                    prebirth_5_q_1_a_1: 'prebirth_5_q_2',
                    prebirth_5_q_2: 'prebirth_5_q_2_a_1',
                    prebirth_5_q_2_a_1: 'prebirth_5_q_3',
                    prebirth_5_q_3: 'prebirth_5_q_3_a_2'
                }
            };
            var p = tester.check_state({
                user: user,
                content: "1",
                next_state: "prebirth_5_end",
                response: "^Thanks! Goodbye!$",
                continue_session: false
            });
            p.then(done, done);
        });

        it("gives a correct cohort check as initial", function(){
            var state_creator = app.api.im.state_creator;
            var today = new Date(2013,4,1,8,0,0); // 1st May
            var signup = "2013-05-01T08:27:01.209Z";
            var dates = [];
            var cohort = state_creator.check_cohort(today, signup, dates);
            assert.equal(cohort, "initial");
        });

        it("gives a correct cohort check as deactive", function(){
            var state_creator = app.api.im.state_creator;
            var today = new Date(2013,5,2,8,0,0); // 2nd June
            var signup = "2013-05-01T08:27:01.209Z";
            var dates = []; // No sign-ins
            var cohort = state_creator.check_cohort(today, signup, dates);
            assert.equal(cohort, "deactive");
        });

        it("gives a correct cohort check as active", function(){
            var state_creator = app.api.im.state_creator;
            var today = new Date(2013,5,2,8,0,0); // 2nd June
            var signup = "2013-05-01T08:27:01.209Z";
            var dates = ["2013-05-11T08:27:01.209Z", "2013-05-19T08:27:01.209Z"];
            var cohort = state_creator.check_cohort(today, signup, dates);
            assert.equal(cohort, "active");
        });

        it("gives a correct cohort check as embedded", function(){
            var state_creator = app.api.im.state_creator;
            var today = new Date(2013,4,24,18,0,0); // 24th May
            var signup = "2013-04-25T08:23:01.209Z";
            var dates = ["2013-04-25T08:27:01.209Z", "2013-04-31T08:27:01.209Z", "2013-05-06T08:27:01.209Z", "2013-05-13T08:27:01.209Z", "2013-05-20T08:27:01.209Z", "2013-05-24T08:27:01.209Z"];
            var cohort = state_creator.check_cohort(today, signup, dates);
            assert.equal(cohort, "embedded");
        });

    });
});

