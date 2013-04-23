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
    StateCreator.call(self, 'register_all_1');

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
                }
            },
            "Welcome to MAMA. To give U the best information possible we need " +
            "to ask U a few questions. Are U pregnant, or do U have a baby?",
            [
                new Choice("pregnant", "Pregnant"),
                new Choice("baby", "Baby"),
                new Choice("dontknow", "Don't Know")
            ]
            );
    });


    self.add_creator('register_prebirth_2', function(state_name, im) {
        var choices = [];
        choices[0] = new Choice("01", "Jan");
        choices[1] = new Choice("02", "Feb");
        choices[2] = new Choice("03", "March");
        choices[3] = new Choice("04", "April");
        choices[4] = new Choice("05", "May");
        choices[5] = new Choice("06", "June");
        choices[6] = new Choice("07", "July");
        choices[7] = new Choice("08", "Aug");
        choices[8] = new Choice("09", "Sept");
        choices[9] = new Choice("10", "Oct");
        choices[10] = new Choice("11", "Nov");
        choices[11] = new Choice("12", "Dec");
        choices[12] = new Choice("dontknow", "Don't Know");

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
            "In what month is your baby due?", choices
            );
    });

    self.add_creator('register_all_endstate', function(state_name, im) {
        var choices = [];
        choices[0] = new Choice("register_all_endstate2", "Read more");

        return new ChoiceState(
            state_name,
            "register_all_endstate2",
            "If you have missed a period and have 1 or more of these, do a " +
            "pregnancy test: nausea or vomiting; tender breasts; often tired.",
            choices
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
        for (i=0;i<10;i++){
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
        return new ChoiceState(
            state_name,
            function(choice) {
                return (choice.value == 'yes' ? 'quiz_endsuccess' : 'register_all_endsuccess');
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
}

// launch app
var states = new MamaUssd();
var im = new InteractionMachine(api, states);
im.attach();

