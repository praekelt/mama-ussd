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

    self.post_headers = {
        'Content-Type': ['application/x-www-form-urlencoded']
    };

    // The first state to enter
    StateCreator.call(self, 'initial_state');

    var SECONDS_IN_A_DAY = 24 * 60 * 60;
    var MILLISECONDS_IN_A_DAY = SECONDS_IN_A_DAY * 1000;

    self.log_result = function() {
        return function (result) {
            var p = im.log('Got result ' + JSON.stringify(result));
            p.add_callback(function() { return result; });
            return p;
        };
    };

    self.is_month_this_year = function(today, month) {
        return ((today.getMonth() + 1)) <= month;
    };

    self.calc_weeks = function(today, due_month) {
        // today should be var today = new Date();
        // due_month should be 1 bound (1 = Jan)
        // check if month provided is this year
        // console.log("Today:", today);
        // console.log("Due Month:", due_month);
        var month_is_this_year = self.is_month_this_year(today, due_month);
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

    self.get_monday = function(today) {
        // Monday is day 1
        var offset = today.getDay() - 1;
        var monday = today - (offset * MILLISECONDS_IN_A_DAY);
        return new Date(monday);
    };

    self.make_initial_quiz_state = function(state_name, prefix, question, cohort_group) {
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
                    choices,
                    null,
                    {
                        on_enter: function(){
                            var today = self.get_today(im);
                            var monday = self.get_monday(today).toISOString().substring(0,10);
                            // Creates a key like "2013-06-10_initial"
                            var metric_key = monday+"_"+cohort_group;
                            var p = im.api_request('kv.incr', {
                                key: metric_key,
                                amount: 1
                            });
                            p.add_callback(function(result) {
                                return im.api_request('metrics.fire', {
                                    store: 'mama_metrics',
                                    metric: metric_key,
                                    value: result.value,
                                    agg: 'max'
                                });
                            });
                            return p;
                        }
                    }
                    );
    };

    self.get_today = function(im) {
        var today = null;
        if (im.config.testing) {
            return new Date(im.config.testing_mock_today[0],
                             im.config.testing_mock_today[1],
                             im.config.testing_mock_today[2],
                             im.config.testing_mock_today[3],
                             im.config.testing_mock_today[4]);
        } else {
            return new Date();
        }
    };

    self.check_embedded = function(today, dates) {
        // takes an array of ISO string formatted dates and determines
        // they have signed in a minimum 1x per week over the past four weeks
        var week = 7*24*60*60*1000;
        dates.sort();
        dates.reverse();
        if (dates.length < 4){
            // hasn't visited more than 4 times yet
            return false;
        } else {
            // been 4 times so validate no less than 7 days between each visit
            var fourth = new Date(dates[3]); // Check 4th date not over 4 weeks
            var last = new Date(dates[dates.length-1]); // Check last date no less than 4 weeks
            if (((today-fourth)/(week*4))>1 || (today-last) < (week*4)){
                // the 4th date is older than 4 weeks old might as well stop now
                return false;
            } else {
                var last_date = new Date(dates[0]); // skip the first
                for (var i=1;i<dates.length;i++){
                    var this_date = new Date(dates[i]);
                    if (((today-this_date)/(week*4))<1){
                        // still under four weeks
                        if ((last_date-this_date)>week) {
                            // Gap is greater than 7 days
                            return false;
                        } else {
                            // Gap is less, get ready for next loop
                            last_date = this_date;
                        }
                    } else {
                        // we're now over four weeks without issues from today so stop
                        return true;
                    }
                }
                return true; // In case there's just four good weeks
            }
        }
    };

    self.check_cohort = function(today, signup, dates) {
        // Checks for the following scenarios and returns one of the four states:
        // 1. Embedded (Sign in minimum 1x per week over the past 4 weeks)
        // 2. Active (Sign in a minimum of 1x per month in the past 4 weeks)
        // 3. Deactive (Have been part of the platform for more than 4 weeks and yet have not
        // achieved Active or Embedded status)
        // 4. Initial (have signed in but have not been part of the platform for a full month yet)
        // signup should be timestamp of signup, dates an array of ISO string formatted dates
        // today is passed in to allow for testing against fixed dates. Expects date obj.
        var week = 7*24*60*60*1000;
        var sign_up = new Date(signup);
        if (((today-sign_up)/(week*4))<1){
            // less than four weeks since signup
            return "initial";
        } else {
            // more than four weeks since signup
            if (dates.length === 0){
                return "deactive";
            } else {
                if (self.check_embedded(today, dates)) {
                    return "embedded";
                } else {
                    // check if any of the dates are in the last month
                    dates.sort();
                    dates.reverse();
                    for (var i=0;i<dates.length;i++){
                        var this_date = new Date(dates[i]);
                        if (((today-this_date)/(week*4))<1){
                            return "active";
                        }
                    }
                    // drop back to deactive
                    return "deactive";
                }
            }
        }
    };

    self.send_sms = function(content, to_addr) {
        var sms_tag = im.config.sms_tag;
        if (!sms_tag) return success(true);
        im.log('outbound.send_to_tag with ' + content + ' and ' + to_addr);
        return im.api_request("outbound.send_to_tag", {
            to_addr: to_addr,
            content: content,
            tagpool: sms_tag[0],
            tag: sms_tag[1]
        });
    };

    self.hs_post = function(path, data) {
        var url = im.config.airtime_hs_url + path;
        data["as_json"] = true; // append this for all POSTS
        data = self.url_encode(data);
        var p = im.api_request("http.post", {
            url: url,
            headers: self.post_headers,
            data: data
        });
        p.add_callback(function(result) {
            var json = self.check_reply(result, url, 'POST', data, false);
            return json;
        });
        return p;
    };

    self.url_encode = function(params) {
        var items = [];
        for (var key in params) {
            items[items.length] = (encodeURIComponent(key) + '=' +
                                   encodeURIComponent(params[key]));
        }
        return items.join('&');
    };

    self.check_reply = function(reply, url, method, data, ignore_error) {
        var error;
        if (reply.success && (reply.code >= 200 && reply.code < 300))  {
            if (reply.body) {
                var json = JSON.parse(reply.body);
                return json;
            } else {
                return null;
            }
        }
        else {
            error = reply.reason;
        }
        var error_msg = ("API " + method + " to " + url + " failed: " +
                         error);
        if (typeof data != 'undefined') {
            error_msg = error_msg + '; data: ' + JSON.stringify(data);
        }

        im.log(error_msg);
        if (!ignore_error) {
            throw new MamaUssdError(error_msg);
        }
    };

    self.network_lookup = function(msisdn) {
        var mapping = im.config.network_mapping;
        for (var i=0; i<mapping.length; i++){
            var llen = (msisdn.substr(0,4)=='2771' || msisdn.substr(0,4)=='2781') ? 5 : 4;
            if (mapping[i][1].indexOf(msisdn.substr(0,llen)) != -1){
                return mapping[i][0];
            }
        }
        return "UNKNOWN";
    };

    self.airtime_credit = function(msisdn, network, denomination){
        // airtime is given in cents
        var login = {
            username: im.config.airtime_hs_login[0],
            password: im.config.airtime_hs_login[1]
        };
        var p = self.hs_post("login/", login);
        p.add_callback(function(result){
            var today = self.get_today(im);
            var reference = today.valueOf();
            if (result.response.status === "0000"){
                var credit = {
                    token: result.response.token,
                    username: im.config.airtime_hs_login[0],
                    recipient_msisdn: msisdn,
                    product_code: "AIRTIME",
                    denomination: denomination,
                    network_code: network,
                    reference: reference,
                    notes: "MAMA for " + msisdn,
                };
                return self.hs_post("recharge/", credit);
            } else {
                return im.log('HOTSOCKET ERROR: ' + JSON.stringify(result));
            }
        });
        return p;
    };

    self.is_winner = function() {
        if(im.config.testing) {
            return true;
        }

        return (Math.random() * 100) < im.config.airtime_chance;
    };

    // Creates a key like "2013-06-10_airtime"
    self.get_week_airtime_key = function() {
        var monday = self.get_monday(self.get_today(im));
        var monday_date_str = monday.toISOString().substring(0,10);
        return monday_date_str + '_airtime_committed';
    };

    self.is_airtime_to_be_issued = function() {
        var metric_key = self.get_week_airtime_key();
        var p = im.api_request('kv.get', {
            key: metric_key
        });
        p.add_callback(function(result) {
            return result.value < im.config.airtime_max_per_week;
        });
        return p;
    };

    self.increment_weekly_counter = function() {
        var metric_key = self.get_week_airtime_key();
        return im.api_request('kv.incr', {
            key: metric_key,
            amount: 1
        });
    };

    self.run_airtime_giveaway = function(){
        // check user hits random jackpot
        if(self.is_winner()){
            // returns a boolean for the current week
            var p = self.is_airtime_to_be_issued();
            p.add_callback(function(airtime_to_be_issued){
                if (airtime_to_be_issued) {
                    // airtime still available to give
                    var network = self.network_lookup(im.user_addr);
                    var p_fs = self.airtime_credit(im.user_addr, network, im.config.airtime_values[network]);
                    p_fs.add_callback(function(){
                        // send SMS
                        return self.send_sms(im.config.airtime_sms, im.user_addr);
                    });
                    p_fs.add_callback(self.increment_weekly_counter);
                    return p_fs;
                }
            });
            return p;
        } else { // not a winner
            return true;
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
                // START - Registered User
                var today = self.get_today(im);
                var access_dates = null;
                if (result.contact["extras-mama_access_dates"] !== undefined) {
                    access_dates = JSON.parse(result.contact["extras-mama_access_dates"]);
                    access_dates.push(today.toISOString());
                } else {
                    access_dates = [today.toISOString()];
                }
                var fields = {
                    "mama_last_accessed": today.toISOString(),
                    "mama_total_signins": String(parseInt(result.contact["extras-mama_total_signins"])+1),
                    "mama_access_dates": JSON.stringify(access_dates)
                };
                var cohort_group = self.check_cohort(today,
                                        result.contact["extras-mama_registered"],
                                        access_dates);
                if (cohort_group != result.contact["extras-mama_cohort_group"]){
                    // cohort has changed, update current and history
                    fields["mama_cohort_group"] = cohort_group;
                    var cohort_history = JSON.parse(result.contact["extras-mama_cohort_group_history"]);
                    cohort_history.push(cohort_group);
                    fields["mama_cohort_group_history"] = JSON.stringify(cohort_history);
                }
                // Run the extras update
                return im.api_request('contacts.update_extras', {
                    key: result.contact.key,
                    fields: fields
                });
                // END - Registered User
            } else {
                // Unregistered User so just pass previous callback result on
                return result;
            }
        });

        p.add_callback(function(result) {
            if (result.success){
                var contact = result.contact;
                if (contact["extras-mama_registered"] !== undefined){
                    // START - Registered User - Load Quiz
                    var week = null;
                    var today = self.get_today(im);
                    var prefix = contact["extras-mama_status"] == "pregnant" ? "prebirth" : "postbirth";
                    if (prefix == "prebirth") {
                        week = self.calc_weeks(today, contact["extras-mama_child_dob"].split("-")[1]);
                    } else {
                        week = self.calc_months(today, contact["extras-mama_child_dob"].split("-")[1]);
                    }
                    var completed;
                    if (contact["extras-mama_completed_quizzes"] !== undefined) {
                        completed = JSON.parse(contact["extras-mama_completed_quizzes"]);
                    } else {
                        completed = [];
                    }
                    var quiz_week = prefix + "_" + week;
                    if (completed.indexOf(quiz_week) == -1){  // They've not done this week already
                        var question = im.config.quiz_data[quiz_week]['quiz_details']['questions'][im.config.quiz_data[quiz_week]["start"]];
                        return self.make_initial_quiz_state(state_name, quiz_week, question, contact["extras-mama_cohort_group"]);
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
                    // END - Registered User
                } else {
                    // START - Unregistered User - show the registration choices
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
                        ],
                        null,
                        {
                            on_enter: function(){
                                var p = im.api_request('kv.incr', {
                                    key: 'mama-total-visitors',
                                    amount: 1
                                });
                                p.add_callback(function(result) {
                                    return im.api_request('metrics.fire', {
                                        store: 'mama_metrics',
                                        metric: 'total_visitors',
                                        value: result.value,
                                        agg: 'max'
                                    });
                                });
                                return p;
                            }
                        }
                    );
                }
            // END - Unregistered user
            } else {
                return new EndState(
                    "end_state_error",
                    "Sorry! Something went wrong. Please redial and try again.",
                    "initial_state"
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
            // check if month provided is this year
            var month_is_this_year = self.is_month_this_year(today, reg_month);
            // set the due year to this or next
            var due_year = (month_is_this_year ? today.getFullYear() : today.getFullYear()+1);
            var preg_week = self.calc_weeks(today,reg_month);
            birth = due_year + "-" + reg_month;
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
                "mama_total_signins": '0',
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
                    ],
                    null,
                    {
                        on_enter: function(){
                            var p = im.api_request('kv.incr', {
                                key: 'mama-total-signups',
                                amount: 1
                            });
                            p.add_callback(function(result) {
                                return im.api_request('metrics.fire', {
                                    store: 'mama_metrics',
                                    metric: 'total_signups',
                                    value: result.value,
                                    agg: 'max'
                                });
                            });
                            return p;
                        }
                    }
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
                        p.add_callback(function() {
                            return self.run_airtime_giveaway();
                        });
                        return p;
                    }
                }
            );
        };
    },

    self.on_config_read = function(event) {
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

