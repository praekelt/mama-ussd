var vumigo = require("vumigo_v01");
var jed = require("jed");

if (typeof api === "undefined") {
    // testing hook (supplies api when it is not passed in by the real sandbox)
    var api = this.api = new vumigo.dummy_api.DummyApi();
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
    StateCreator.call(self, 'initial_state');

    self.calc_weeks = function(today, due_month) {
        // today should be var today = new Date();
        // due_month should be 1 bound (1 = Jan)
        // check if month provided is this year
        // console.log("Today:", today);
        // console.log("Due Month:", due_month);
        var month_is_this_year = ((today.getMonth()+1) < due_month ? true : false);
        // console.log("Month this year?", month_is_this_year);
        // set the due year to this or next
        var due_year = (month_is_this_year ? today.getFullYear() : today.getFullYear()+1);
        // console.log("Due Year:", due_year);
        // due dates are estimated at mid-month
        var due_date = new Date(due_month+"/14/"+due_year);
        // console.log("Due date:", due_date);
        // calc diff betwen now and due day
        var diff = (due_date - today);
        // console.log("Dates diff:", diff);
        // get it in weeks
        var diff_weeks = Math.floor((diff / (1000*7*24*60*60)));
        // console.log("Dates diff in weeks:", diff_weeks);
        // get preg week
        var preg_week = 40-diff_weeks;
        // console.log("Week of preg:", preg_week);
        // You can't be less than two week preg
        if (preg_week <= 1) {
            return false;
        } else {
            return preg_week;
        }
    };

    self.calc_months = function(today, birth_month) {
        // today should be var today = new Date();
        // birth_month should be 1 bound (1 = Jan)
        // check if month provided is this year
        var month_old = 0;
        // console.log("Today:", today);
        // console.log("Birth Month:", birth_month);
        var today_month = today.getMonth()+1;
        // console.log("Current Month (1 bound)", today_month);
        if (birth_month >= today_month) {
            // console.log("Birth was last year");
            month_old = ((12-birth_month)+today_month);
        } else {
            // console.log("Birth is this year");
            month_old = (today_month-birth_month);
        }
        if (month_old >= 11) {
            // console.log("Baby over 10 months now");
            return false;
        } else {
            // console.log("Baby is how old?", month_old);
            return month_old;
        }
    };

    self.make_initial_quiz_state = function(state_name, prefix, question) {
            var choices = question.choices.map(function(choice) {
                var name = prefix + "_" + choice[0];
                var value = choice[1];
                return new Choice(name, value);
            });

            return new ChoiceState(
                    state_name,
                    function(choice) {
                        return choice.value;
                    },
                    question.question,
                    choices);
    };

    self.get_today = function(im) {
        var today = null;
        if (im.config.testing) {
            return new Date(im.config.testing_mock_today[0],
                             im.config.testing_mock_today[1],
                             im.config.testing_mock_today[2]);
        } else {
            return new Date();
        }
    };


    self.add_creator('initial_state', function(state_name, im) {
        // Check if they've already registered
        var p = im.api_request('contacts.get_or_create', {
            delivery_class: 'ussd',
            addr: im.user_addr
        });

        p.add_callback(function(result) {
            if (result.contact["extras-mama_registered"] !== undefined){
                var today = self.get_today(im);
                // TODO: cohort group analysis goes here 
                var fields = {
                    "mama_last_accessed": today.toISOString(),
                    "mama_total_signins": parseInt(result.contact["extras-mama_total_signins"])+1
                };
                return im.api_request('contacts.update_extras', {
                    key: result.contact.key,
                    fields: fields
                });
            } else {
                return result;
            }
        });

        p.add_callback(function(result) {
            var contact = result.contact;
            if (contact["extras-mama_registered"] !== undefined){
                var week = null;
                var today = self.get_today(im);
                var prefix = contact["extras-mama_status"] == "pregnant" ? "prebirth" : "postbirth";
                if (prefix == "prebirth") {
                    week = self.calc_weeks(today, contact["extras-mama_child_dob"].split("-")[1]);
                } else {
                    week = self.calc_months(today, contact["extras-mama_child_dob"].split("-")[1]);
                }
                if (contact["extras-mama_completed_quizzes"] !== undefined) {
                    var completed = JSON.parse(contact["extras-mama_completed_quizzes"]);
                } else {
                    var completed = [];
                }
                var quiz_week = prefix + "_" + week;
                if (completed.indexOf(quiz_week) == -1){  // They've not done this week already
                    var question = im.config.quiz_data[quiz_week]['quiz_details']['questions'][im.config.quiz_data[quiz_week]["start"]];
                    return self.make_initial_quiz_state(state_name, quiz_week, question);
                } else {  // User has done this quiz before
                    return new ChoiceState(
                        state_name,
                        function(choice) { return choice.value; },
                        "Welcome to MAMA. You have already taken this week's quiz. " +
                        "Would you like to try it again?",
                        [
                            new Choice(quiz_week + "_" + im.config.quiz_data[quiz_week]["start"], "Yes"),
                            new Choice("quiz_noretake", "No")
                        ]
                    );
                }
            } else {
                // show the registration choices
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
                        new Choice("dontknow", "Don't know")
                    ]
                );
            }
        });
        return p;
    });


    self.add_creator('register_prebirth_2', function(state_name, im) {
        var choices = [
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
        ];
        var today = self.get_today(im);
        var month = today.getMonth(); // 0-bound
        var choices_show = [];
        for (var i=0;i<9;i++){
            var val = (i+month >= 12 ? month+(i-12) : month+i);
            choices_show[i] = choices[val];
        }
        choices_show[choices_show.length] = new Choice("dontknow", "Don't Know");

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
            choices_show
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
        "initial_state"
    ));

    self.add_state(new EndState(
        "register_prebirth_2_endstate",
        "To sign up, we need to know which month. Please go to the clinic to " +
        "find out, and dial us again.",
        "initial_state"
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
        "initial_state"
    ));

    self.add_creator('register_all_hivinfo', function(state_name, im) {
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
        var today = self.get_today(im);
        var birth = "";
        if (im.get_user_answer('initial_state') == "pregnant") {
            // Pregnant flow
            var reg_month = parseInt(im.get_user_answer('register_prebirth_2'));
            var this_month = today.getMonth(); // 0-bound
            var due_month = (reg_month+this_month >= 12 ? this_month+(reg_month-12) : this_month+reg_month);
            // check if month provided is this year
            var month_is_this_year = ((today.getMonth()+1) < due_month ? true : false);
            // set the due year to this or next
            var due_year = (month_is_this_year ? today.getFullYear() : today.getFullYear()+1);
            var preg_week = self.calc_weeks(today,due_month);
            birth = due_year + "-" + due_month;
            // console.log("Birth is", birth);
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

        // save the SMS opt-in
        var p = im.api_request('contacts.get_or_create', {
            delivery_class: 'ussd',
            addr: im.user_addr
        });

        p.add_callback(function(result) {
            var contact = result.contact;
            var fields = {
                "mama_registered": today.toISOString(),
                "mama_last_accessed": today.toISOString(),
                "mama_child_dob": birth,
                "mama_status": im.get_user_answer('initial_state'),
                "mama_optin_hiv": im.get_user_answer('register_all_hivinfo'),
                "mama_optin_sms": im.get_user_answer('register_all_smsoptin'),
                "mama_completed_quizzes": JSON.stringify([]),
                "mama_total_signins": 0,
                "mama_cohort_group": "initial",
                "mama_cohort_group_history": JSON.stringify(["initial"])
            };
            if(contact['extras-mama_reminder_group'] === undefined) {
                fields["mama_reminder_group"] = Math.floor((Math.random()*4)+1).toString();
            }
            return im.api_request('contacts.update_extras', {
                key: contact.key,
                fields: fields
            });
        });

        p.add_callback(function(result) {
            if (result.success) {
                var prefix = im.get_user_answer('initial_state') == "pregnant" ? "prebirth" : "postbirth";
                var week = 0;
                var today = self.get_today(im);
                if (prefix == "prebirth"){
                    week = preg_week;
                } else {
                    week = baby_age;
                }
                // console.log("Entry: ", prefix + "_" + week);
                var quiz_entry_point = prefix + "_" + week + "_" + im.config.quiz_data[prefix + "_" + week]["start"];
                return new ChoiceState(
                    state_name,
                    function(choice) {
                        return (choice.value == "yes" ? quiz_entry_point : 'register_all_endsuccess');
                    },
                    "Thank you! You can now start to learn by taking your first quiz. " +
                    "Start now?",
                    [
                        new Choice("yes", "Yes"),
                        new Choice("no", "No")
                    ]
                );
            } else {
                return new EndState(
                    "end_state_error",
                    "Sorry! Something went wrong. Please redial and try again.",
                    "register_all_thanksandstart"
                );
            }
        });
        return p;
    });

    self.add_state(new EndState(
        "register_all_endsuccess",
        "Thanks for joining MAMA. Dial *120*2112# each week to start learning about " +
        "your growing baby.",
        "initial_state"
    ));

    self.add_state(new EndState(
        "quiz_endsuccess",
        "Thanks for taking the quiz. Every week you will get a new quiz about " +
        "your growing baby. Dial *120*2112* again next week to learn more.",
        "initial_state"
    ));

    self.add_state(new EndState(
        "quiz_noretake",
        "Every week you will get a new quiz about " +
        "your growing baby. Dial *120*2112* again next week to learn more.",
        "initial_state"
    ));

    self.add_state(new EndState(
        "end_state",
        "Thank you and bye bye!",
        "initial_state"
    ));

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
                    return prefix + "_" + choice.value;
                },
                answer.response,
                [
                    new Choice(answer["next"], "Next")
                ]
            );
        };
    },

    self.make_end_state = function(prefix) {
        return function(state_name, im) {
            return new EndState(
                prefix+"_end",
                im.config.quiz_data[prefix].end,
                "initial_state",
                {
                    on_enter: function(state) {
                        // mark the quiz as completed
                        var p = im.api_request('contacts.get_or_create', {
                            delivery_class: 'ussd',
                            addr: im.user_addr
                        });

                        p.add_callback(function(result) {
                            var completed = JSON.parse(result.contact["extras-mama_completed_quizzes"]);
                            var quiz = state_name.substring(0,state_name.lastIndexOf("_"));
                            completed.push(quiz);
                            return im.api_request('contacts.update_extras', {
                                key: result.contact.key,
                                fields: {
                                    "mama_completed_quizzes": JSON.stringify(completed)
                                }
                            });
                        });
                        return p;
                    }
                }
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
                    self.make_answer_state(quiz_name, answer));
            }

            // create the end state
            if(self.state_creators.hasOwnProperty(quiz_name+"_end")) {
                continue;
            }
            self.add_creator(quiz_name+"_end",
                self.make_end_state(quiz_name));
        }
    };
}

// launch app
var states = new MamaUssd();
var im = new InteractionMachine(api, states);
im.attach();

