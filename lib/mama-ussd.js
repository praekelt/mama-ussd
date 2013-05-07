var vumigo = require("vumigo_v01");
var jed = require("jed");

if (typeof api === "undefined") {
    // testing hook (supplies api when it is not passed in by the real sandbox)
    var api = this.api = new vumigo.dummy_api.DummyApi();
    api._handle_contacts_get = function(cmd, reply) {
        //console.log('got contacts.get command', cmd.delivery_class, cmd.msisdn);
        reply({contact: im.config.contact_data});
    };
    api._handle_contacts_get_or_create = function(cmd, reply) {
        //console.log('got contacts.get_or_create command', cmd.delivery_class, cmd.msisdn);
        reply({success: true, contact: im.config.contact_data});
    };
    api._handle_contacts_update_extra = function(cmd, reply) {
        //console.log('got contacts.update_extra command', cmd.contact_key);
        reply({success: true});
    };
}

var Promise = vumigo.promise.Promise;
var success = vumigo.promise.success;
var Choice = vumigo.states.Choice;
var ChoiceState = vumigo.states.ChoiceState;
var FreeText = vumigo.states.FreeText;
var EndState = vumigo.states.EndState;
var InteractionMachine = vumigo.state_machine.InteractionMachine;
var StateCreator = vumigo.state_machine.StateCreator;

function MamaUssdError(msg) {
    var self = this;
    self.msg = msg;

    self.toString = function() {
        return "<MamaUssdError: " + self.msg + ">";
    };
}

function MamaUssd() {
    var self = this;
    // The first state to enter
    StateCreator.call(self, 'register_all_1');

    self.calc_weeks = function(today, due_month) {
        // today should be var today = new Date();
        // due_month should be 1 bound (1 = Jan)
        // check if month provided is this year
        var month_is_this_year = ((today.getMonth()+1) < due_month ? true : false);
        // set the due year to this or next
        var due_year = (month_is_this_year ? today.getFullYear() : today.getFullYear()+1);
        // due dates are estimated at mid-month
        var due_date = new Date(due_month+"/14/"+due_year);
        // calc diff betwen now and due day
        var diff = (due_date - today);
        // get it in weeks
        var diff_weeks = Math.floor((diff / (1000*7*24*60*60)));
        // get preg week
        var preg_week = 40-diff_weeks;
        // TODO: check for errors (negative etc.)
        return preg_week;
    };

    self.add_creator('register_all_1', function(state_name, im) {
        return new ChoiceState(
            state_name,
            function(choice) {
                switch(choice.value){
                    case "pregnant":
                        return "register_prebirth_2";
                    case "baby":
                        return "register_postbirth_2";
                    case "dontknow":
                        return "register_all_endstate";
                    // This will be removed in production
                    case "quiz_start":
                        return "quiz_start";
                    // End of code to be removed
                }
            },
            "Welcome to MAMA. To give U the best information possible we need " +
            "to ask U a few questions. Are U pregnant, or do U have a baby?",
            [
                new Choice("pregnant", "Pregnant"),
                new Choice("baby", "Baby"),
                // new Choice("dontknow", "Dont know")
                // This will be removed in production - drop , too above
                new Choice("quiz_start", "Start quiz")
                // End of code to be removed
            ]
            );
    });


    self.add_creator('register_prebirth_2', function(state_name, im) {
        return new ChoiceState(
            state_name,
            function(choice) {
                switch(choice.value){
                    case "dontknow":
                        return "register_prebirth_2_endstate";
                    default:
                        return "register_all_hivinfo";
                }
            },
            "In what month is your baby due?",
            [
                new Choice("1", "Jan"),
                new Choice("2", "Feb"),
                new Choice("3", "March"),
                new Choice("4", "April"),
                new Choice("5", "May"),
                new Choice("6", "June"),
                new Choice("7", "July"),
                new Choice("8", "Aug"),
                new Choice("9", "Sept"),
                new Choice("10", "Oct"),
                new Choice("11", "Nov"),
                new Choice("12", "Dec"),
                new Choice("dontknow", "Don't Know")
            ]
            );
    });

    self.add_creator('register_all_endstate', function(state_name, im) {
        return new ChoiceState(
            state_name,
            "register_all_endstate2",
            "If you have missed a period and have 1 or more of these, do a " +
            "pregnancy test: nausea or vomiting; tender breasts; often tired.",
            [
                new Choice("register_all_endstate2", "Read more")
            ]
            );
    });

    self.add_state(new EndState(
        "register_all_endstate2",
        "Don't wait! The first pregnancy check-up must happen as soon as you " +
        "know. Do the test as soon as possible at any clinic, or get one at a " +
        "pharmacy. Stay well.",
        "register_all_1"
    ));

    self.add_state(new EndState(
        "register_prebirth_2_endstate",
        "To sign up, we need to know which month. Please go to the clinic to " +
        "find out, and dial us again.",
        "register_all_1"
    ));

    self.add_creator('register_postbirth_2', function(state_name, im) {
        var choices = [];
        for (var i=0;i<10;i++){
            choices[i] = new Choice(i+1,i+1);
        }
        choices[choices.length] = new Choice("over10", "More than 10");

        return new ChoiceState(
            state_name,
            function(choice) {
                switch(choice.value){
                    case "over10":
                        return "register_postbirth_2_endstate";
                    default:
                        return "register_all_hivinfo";
                }
            },
            "How many months old is your baby?", choices
            );
    });

    self.add_state(new EndState(
        "register_postbirth_2_endstate",
        "Sorry, the MAMA quizzes are aimed at mothers of younger babies. " +
        "You can visit askmama.mobi to read useful info, and meet other moms. Stay well.",
        "register_all_1"
    ));

    self.add_creator('register_all_hivinfo', function(state_name, im) {
        // Process the input from the last state
        var today = new Date();
        var birth = "";
        if (im.get_user_answer('register_all_1') == "pregnant") {
            // Pregnant flow
            var due_month = im.get_user_answer('register_prebirth_2');
            // check if month provided is this year
            var month_is_this_year = ((today.getMonth()+1) < due_month ? true : false);
            // set the due year to this or next
            var due_year = (month_is_this_year ? today.getFullYear() : today.getFullYear()+1);
            var preg_week = self.calc_weeks(today,due_month);
            birth = due_year + "-" + due_month;
        } else {
            // Post-birth flow
            var baby_age = im.get_user_answer('register_postbirth_2');
            var month_curr = today.getMonth()+1;
            var year_curr = today.getFullYear();
            var month_of_birth = month_curr - baby_age;
            if (month_of_birth < 1) {
                birth = (year_curr - 1)+"-"+(12 + month_of_birth);
            } else {
                birth = year_curr + "-" + month_of_birth;
            }
        }
        // Write the contact data now.
        var contact = {};
        var p = new Promise();
        p.add_callback(function(reply) {
            contact = reply.contact;
            //console.log('received contact');
        });

        api.request('contacts.get_or_create', {
            delivery_class: 'sms',
            msisdn: im.user_addr
        }, p.callback);

        var q = new Promise();
        q.add_callback(function(reply) {
            //console.log('updated extra', reply.success);
        });

        api.request('contacts.update_extra', {
            contact_key: contact.key,
            field: "mama_child_dob",
            value: birth
        }, q.callback);

        return new ChoiceState(
            state_name,
            "register_all_smsoptin",
            "Your quiz can include info on HIV. Would you like that?",
            [
                new Choice("yes", "Yes"),
                new Choice("no", "No")
            ]
            );
    });

    self.add_creator('register_all_smsoptin', function(state_name, im) {
        var contact = {};
        var p = new Promise();
        p.add_callback(function(reply) {
            contact = reply.contact;
            //console.log('received contact');
        });

        api.request('contacts.get', {
            delivery_class: 'sms',
            msisdn: im.user_addr
        }, p.callback);

        return new ChoiceState(
            state_name,
            "register_all_thanksandstart",
            "We can send you sms's to remind you to take the next quiz. Would " +
            "you like that?",
            [
                new Choice("yes", "Yes"),
                new Choice("no", "No")
            ]
            );
    });

    self.add_creator('register_all_thanksandstart', function(state_name, im) {
        return new ChoiceState(
            state_name,
            function(choice) {
                return (choice.value == 'yes' ? 'quiz_start' : 'register_all_endsuccess');
            },
            "Thank you! You can now start to learn by taking your first quiz. " +
            "Start now?",
            [
                new Choice("yes", "Yes"),
                new Choice("no", "No")
            ]
            );
    });

    self.add_state(new EndState(
        "register_all_endsuccess",
        "Thanks for joining MAMA. Dial *120*2112# each week to start learning about " +
        "your growing baby.",
        "register_all_1"
    ));

    self.add_state(new EndState(
        "quiz_endsuccess",
        "Thanks for taking the quiz. Every week you will get a new quiz about " +
        "your growing baby. Dial *120*2112* again next week to learn more.",
        "register_all_1"
    ));

    self.add_state(new EndState(
        "end_state",
        "Thank you and bye bye!",
        "register_all_1"
    ));

    // THIS IS JUST FOR TESTING QUIZ ACCESS
    self.add_creator('quiz_start', function(state_name, im) {
        return new ChoiceState(
            state_name,
            "quiz_start_week",
            "Quiz for pregnant or baby?",
            [
                new Choice("prebirth", "Pregnant"),
                new Choice("postbirth", "Baby")
            ]
            );
    });


    self.add_creator('quiz_start_week', function(state_name, im) {
        return new ChoiceState(
            state_name,
            function(choice) {
                console.log("start is:", im.config.quiz_data["prebirth_"+choice.value]["start"]);
                return im.get_user_answer('quiz_start')+"_"+choice.value+"_"+im.config.quiz_data["prebirth_"+choice.value]["start"];
            },
            "What week?",
            [
                new Choice("5", "5"),
                new Choice("6", "6")
            ]
            );
    });
    // END OF TESTING QUIZ ACCESS


    self.make_question_state = function(prefix, question) {
        return function(state_name, im) {
            var choices = question.choices.map(function(choice) {
                var name = prefix + "_" + choice[0];
                var value = choice[1];
                return new Choice(name, value);
            });

            return new ChoiceState(state_name, function(choice) {
                return choice.value;
            }, question.question, choices);
        };
    },

    self.make_answer_state = function(prefix, answer) {
        return function(state_name, im) {
            return new ChoiceState(
                state_name,
                function(choice) {
                    return choice.value;
                },
                answer.response,
                [
                    new Choice(answer["next"], "Next")
                ]
            );
        };
    },

    self.on_config_read = function(event){
        for (var quiz_name in im.config.quiz_data){
            var quiz = im.config.quiz_data[quiz_name];

            // Create the quiz
            for (var question_name in quiz.quiz_details.questions){
                var question = quiz.quiz_details.questions[question_name];
                var question_state_name = quiz_name + "_" + question_name;

                // do not recreate states that already exist.
                if(self.state_creators.hasOwnProperty(question_state_name)) {
                    continue;
                }

                // construct a function using make_question_state()
                // to prevent getting a wrongly scoped 'question'
                self.add_creator(question_state_name,
                    self.make_question_state(quiz_name, question));
            }

            // create the answer states
            for (var answer_name in quiz.quiz_details.answers){
                var answer = quiz.quiz_details.answers[answer_name];
                var answer_state_name = quiz_name + "_" + answer_name;

                if(self.state_creators.hasOwnProperty(answer_state_name)) {
                    continue;
                }

                self.add_creator(answer_state_name,
                    self.make_answer_state(answer_name, answer));
            }
        }
    };



    // self.add_creator('quiz_start', function(state_name, im) {
    //     var user_type = "pregnant";
    //     var quiz_id = "5";

    //     var quiz = im.config.quiz_data[quiz_id];
    //     var question = quiz.quiz_details.questions[quiz["start"]];
    //     var choices = [];
    //     for (var i=0;i<question.choices.length;i++){
    //         choices[i] = new Choice(question.choices[i][0],question.choices[i][1]);
    //     }
    //     return new ChoiceState(
    //         state_name,
    //         function(choice){ return choice.value; },
    //         question.question,
    //         choices
    //         );
    // });

    // self.add_creator('q_1_a_1', function(state_name, im) {
    //     var user_type = "pregnant";
    //     var quiz_id = "5";

    //     var quiz = im.config.quiz_data[quiz_id];
    //     var answer = quiz.quiz_details.answers[state_name];
    //     return new ChoiceState(
    //         state_name,
    //         function(choice){ return choice.value; },
    //         answer.response,
    //         [
    //             new Choice(answer["next"], "Next")
    //         ]
    //         );
    // });
}

// launch app
var states = new MamaUssd();
var im = new InteractionMachine(api, states);
im.attach();

