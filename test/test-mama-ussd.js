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



describe("On MAMA USSD line", function() {

    describe("unregistered users", function() {

        // These are used to mock API reponses
        // EXAMPLE: Response from google maps API
        var fixtures = [];

        var tester = new vumigo.test_utils.ImTester(app.api, {
            custom_setup: function (api) {
                api.config_store.config = JSON.stringify({
                    quiz_data: JSON.parse(fs.readFileSync("fixtures/quiz-content.json"))
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
                            contact: api._dummy_contacts[cmd.addr]
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

                api._handle_contacts_update_extras = function(cmd, reply) {
                    api._dummy_contacts[cmd.key]['extras'] = cmd.fields;
                    reply({
                        success: true,
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
                next_state: "register_all_1",
                response: "^Welcome to MAMA. To give U the best information possible we need to " +
                "ask U a few questions. Are U pregnant, or do U have a baby\\?[^]" +
                "1. Pregnant[^]"+
                "2. Baby[^]" +
                "3. Don't know$"
            });
            p.then(done, done);
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
                    register_all_1: 'dontknow'
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
            });
            p.then(done, done);
        });

        it("prebirth, unknown due month should exit", function (done) {
            var user = {
                current_state: 'register_prebirth_2',
                answers: {
                    register_all_1: 'pregnant'
                }
            };
            var p = tester.check_state({
                user: user,
                content: '13',
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
                    register_all_1: 'baby'
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
                    register_all_1: 'pregnant',
                    register_prebirth_2: '1'
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
                    register_all_1: 'baby',
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
                    register_all_1: 'pregnant',
                    register_prebirth_2: '1'
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
                    register_all_1: 'baby',
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
                    register_all_1: 'pregnant',
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
             p.then(done, done);
        });

        it("postbirth, should be thanked and asked if want quiz", function (done) {
            var user = {
                current_state: 'register_all_smsoptin',
                answers: {
                    register_all_1: 'baby',
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
            p.then(done, done);
        });

        it("prebirth, should if not opting for quiz now, thank and exit", function (done) {
            var user = {
                current_state: 'register_all_thanksandstart',
                answers: {
                    register_all_1: 'pregnant',
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
                    register_all_1: 'baby',
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

        it("prebirth, opting for quiz, should start quiz", function (done) {
            var user = {
                current_state: 'register_all_thanksandstart',
                answers: {
                    register_all_1: 'pregnant',
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
                    register_all_1: 'baby',
                    register_prebirth_2: '1',
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
                    register_all_1: 'pregnant',
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
                    register_all_1: 'pregnant',
                    register_prebirth_2: '1',
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
    });

    describe("registered users", function() {

        // These are used to mock API reponses
        // EXAMPLE: Response from google maps API
        var fixtures = [];
        var tester = new vumigo.test_utils.ImTester(app.api, {
            custom_setup: function (api) {
                api.config_store.config = JSON.stringify({
                    quiz_data: JSON.parse(fs.readFileSync("fixtures/quiz-content.json"))
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
                        name: "Rodney"
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
                            contact: api._dummy_contacts[cmd.addr]
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

                api._handle_contacts_update_extras = function(cmd, reply) {
                    api._dummy_contacts[cmd.key]['extras'] = cmd.fields;
                    reply({
                        success: true,
                        contact: api._dummy_contacts[cmd.key]
                    });
                };
            },
            async: true
        });

        it.skip("test users - should be prompted for baby/no-baby state", function (done) {
            var p = tester.check_state({
                user: null,
                content: null,
                next_state: "register_all_1",
                response: "^Welcome to MAMA. To give U the best information possible we need to " +
                "ask U a few questions. Are U pregnant, or do U have a baby\\?[^]" +
                "1. Pregnant[^]"+
                "2. Baby[^]" +
                "3. Start quiz$"
            });
            p.then(done, done);
        });

        // it("test users - quiz access - should be prompted for baby/no-baby state", function (done) {
        //     var p = tester.check_state(
        //         user: null, "3", "quiz_start",
        //         "^Quiz for pregnant or baby\\?[^]" +
        //         "1. Pregnant[^]"+
        //         "2. Baby$"
        //         );
        // });

        // it("test users - quiz access - enter week", function (done) {
        //     var user = {
        //         current_state: 'quiz_start',
        //         answers: {
        //             register_all_1: 'quiz_start'
        //         }
        //     };
        //     var p = tester.check_state(
        //         user: user,
        //         '1',
        //         "quiz_start_week",
        //         "^What week\\?[^]" +
        //         "1. 5[^]"+
        //         "2. 6$");
        // });

        // it("test users - quiz access - prebirth week 5", function (done) {
        //     var user = {
        //         current_state: 'quiz_start_week',
        //         answers: {
        //             register_all_1: 'quiz_start',
        //             quiz_start: 'prebirth'
        //         }
        //     };
        //     var p = tester.check_state(
        //         user: user,
        //         '1',
        //         "prebirth_5_q_1",
        //         "^Congrats on your pregnancy! What kind of foods should you eat now\\?[^]" +
        //         "1. Fruit and vegetables[^]"+
        //         "2. Chips and soda$");
        // });

        // it("test users - quiz access - prebirth week 5 - answer correct", function (done) {
        //     var user = {
        //         current_state: 'prebirth_5_q_1',
        //         answers: {
        //             register_all_1: 'quiz_start',
        //             quiz_start: 'prebirth',
        //             quiz_start_week: '5'
        //         }
        //     };
        //     var p = tester.check_state(
        //         user: user,
        //         '1',
        //         "prebirth_5_q_1_a_1",
        //         "^Yes! It's time to eat plenty of healthy fruits and vegetables to " +
        //         "nourish your growing baby.[^]" +
        //         "1. Next$");
        // });

        // it("test users - quiz access - prebirth week 5 - answer wrong", function (done) {
        //     var user = {
        //         current_state: 'prebirth_5_q_1',
        //         answers: {
        //             register_all_1: 'quiz_start',
        //             quiz_start: 'prebirth',
        //             quiz_start_week: '5'
        //         }
        //     };
        //     var p = tester.check_state(
        //         user: user,
        //         '2',
        //         "prebirth_5_q_1_a_2",
        //         "^No - try to avoid junk food that is high in fat & sugar. Now is " +
        //         "the time to eat plenty of healthy fruits and vegetables to nourish " +
        //         "your growing baby.[^]" +
        //         "1. Next$");
        // });

        // it("test users - quiz access - postbirth week 6", function (done) {
        //     var user = {
        //         current_state: 'quiz_start_week',
        //         answers: {
        //             register_all_1: 'quiz_start',
        //             quiz_start: 'postbirth'
        //         }
        //     };
        //     var p = tester.check_state(
        //         user: user,
        //         '2',
        //         "postbirth_6_q_1",
        //         "^Is it common for new mothers to feel sad\\?[^]" +
        //         "1. It is normal and you can call someone for support[^]"+
        //         "2. No - only weak people feel sad$");
        // });

        // it("test users - quiz access - postbirth week 5 - answer correct", function (done) {
        //     var user = {
        //         current_state: 'postbirth_6_q_1',
        //         answers: {
        //             register_all_1: 'quiz_start',
        //             quiz_start: 'postbirth',
        //             quiz_start_week: '6'
        //         }
        //     };
        //     var p = tester.check_state(
        //         user: user,
        //         '1',
        //         "postbirth_6_q_1_a_1",
        //         "^Correct - feeling sad\\? Not enjoying anything\\? This is common in " +
        //         "new moms. Call[^]" +
        //         "1. Next$");
        // });

        // it("test users - quiz access - postbirth week 6 - answer wrong", function (done) {
        //     var user = {
        //         current_state: 'postbirth_6_q_1',
        //         answers: {
        //             register_all_1: 'quiz_start',
        //             quiz_start: 'postbirth',
        //             quiz_start_week: '6'
        //         }
        //     };
        //     var p = tester.check_state(
        //         user: user,
        //         '2',
        //         "postbirth_6_q_1_a_2",
        //         "^Incorrect! Feeling sad\\? Not enjoying anything\\? This is common " +
        //         "in new moms. Call 0117281347 or talk to a health worker about " +
        //         "this; you may be depressed.[^]" +
        //         "1. Next$");
        // });

        // it("test users - quiz access - postbirth week 6 - Q2", function (done) {
        //     var user = {
        //         current_state: 'postbirth_6_q_1_a_1',
        //         answers: {
        //             register_all_1: 'quiz_start',
        //             quiz_start: 'postbirth',
        //             quiz_start_week: '6',
        //             postbirth_6_q_1: 'postbirth_6_q_1_a_1'
        //         }
        //     };
        //     var p = tester.check_state(
        //         user: user,
        //         '1',
        //         "postbirth_6_q_2",
        //         "^How do you know your baby is drinking from your breast properly\\?[^]" +
        //         "1. He needs a mouthful of breast[^]"+
        //         "2. It's OK if he just attaches to the nipple$");
        // });

        // it("test users - quiz access - postbirth week 6 - Q2 - answer correct", function (done) {
        //     var user = {
        //         current_state: 'postbirth_6_q_2',
        //         answers: {
        //             register_all_1: 'quiz_start',
        //             quiz_start: 'postbirth',
        //             quiz_start_week: '6',
        //             postbirth_6_q_1: 'postbirth_6_q_1_a_1'
        //         }
        //     };
        //     var p = tester.check_state(
        //         user: user,
        //         '1',
        //         "postbirth_6_q_2_a_1",
        //         "^Yes! Baby needs a good mouthful of breast & to squeeze it to get " +
        //         "milk. If his mouth is wide open & muscles by his ear move, he's " +
        //         "attached right.[^]" +
        //         "1. Next$");
        // });

        // it("test users - quiz access - postbirth week 6 - Q2 - answer wrong", function (done) {
        //     var user = {
        //         current_state: 'postbirth_6_q_2',
        //         answers: {
        //             register_all_1: 'quiz_start',
        //             quiz_start: 'postbirth',
        //             quiz_start_week: '6',
        //             postbirth_6_q_1: 'postbirth_6_q_1_a_1'
        //         }
        //     };
        //     var p = tester.check_state(
        //         user: user,
        //         '2',
        //         "postbirth_6_q_2_a_2",
        //         "^No! Baby needs a good mouthful of breast & to squeeze it to get milk. " +
        //         "If his mouth is wide open & muscles by his ear move, he's attached right.[^]" +
        //         "1. Next$");
        // });

        // it("test users - quiz access - postbirth week 6 - end", function (done) {
        //     var user = {
        //         current_state: 'postbirth_6_q_2_a_2',
        //         answers: {
        //             register_all_1: 'quiz_start',
        //             quiz_start: 'postbirth',
        //             quiz_start_week: '6',
        //             postbirth_6_q_1: 'postbirth_6_q_1_a_1'
        //         }
        //     };
        //     var p = tester.check_state(
        //         user: user,
        //         '1',
        //         "postbirth_6_end",
        //         "^Thanks! Goodbye!$");
        // });

    });
});

