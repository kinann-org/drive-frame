(function(exports) {
    ////////////////// constructor
    function DriveFrame() {
        var that = this;
        return that;
    }

    ///////////////// class ////////////////////
    DriveFrame.Variable = require("./src/Variable");
    DriveFrame.DriveFrame = require("./src/DriveFrame");
    DriveFrame.StepperDrive = require("./src/StepperDrive");
    DriveFrame.serial = {
        MockSerialDriver: require("./src/serial/MockSerialDriver"),
        MockSerialPort: require("./src/serial/MockSerialPort"),
        SerialDriver: require("./src/serial/SerialDriver"),
        FireStepDriver: require("./src/serial/FireStepDriver"),
        MockFireStep: require("./src/serial/MockFireStep"),
    };

    module.exports = exports.DriveFrame = DriveFrame;
})(typeof exports === "object" ? exports : (exports = {}));

