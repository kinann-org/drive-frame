(function(exports) {
    const mathjs = require("mathjs");
    const MockSerialDriver = require("./serial/MockSerialDriver");
    const StepperDrive = require("./StepperDrive");
    const Variable = require("./Variable");
    const winston = require("winston");

    class DriveFrame {
        constructor(drives, options = {}) {
            this.type = "DriveFrame";
            this.drives = drives;
            this.serialDriver = options.serialDriver || new MockSerialDriver(options);
            var driveNames = ["X", "Y", "Z", "A", "B", "C"];
            this.drives.forEach((drive, i) => {
                if (drive.name == null) {
                    drive.name = i < driveNames.length ? driveNames[i] : ("Drive" + (i + 1));
                }
            });
            this.backlash = options.backlash == null || options.backlash;
            this.deadbandScale = options.deadbandScale || 3; // provides continuous yet quick transition across deadband
            this.deadbandHome = options.deadbandHome || 0.5; // default is homing to minPos with backoff exceeding positive deadband

            Object.defineProperty(this, "deadband", {
                enumerable: true,
                get: () => this.state.slice(this.drives.length, 2 * this.drives.length).map((p) => p),
                set: (deadband) => {
                    throw new Error("attempt to set read-only property: deadband")
                },
            });
            Object.defineProperty(this, "drivePos", {
                enumerable: true,
                get: () => this.state.slice(0, this.drives.length),
                set: (drivePos) => {
                    if (!(drivePos instanceof Array) || drivePos.length !== this.drives.length) {
                        throw new Error("Expected array of length:" + this.drives.length + " drivePos:" + JSON.stringify(drivePos));
                    }
                    drivePos = this.clipDrivePos(drivePos);
                    var newpos = drivePos.map((pos, i) => {
                        var di = this.drives[i];
                        var deadbandOld = this.$state[i + this.drives.length];
                        if (this.state[i] === pos) {
                            var deadbandNew = deadbandOld;
                        } else if (pos === di.minPos) {
                            var deadbandNew = this.deadbandHome; // homing to minPos
                        } else {
                            var posDelta = pos - this.state[i];
                            var deadbandNew = mathjs.tanh(this.deadbandScale * posDelta);
                            deadbandNew = mathjs.min(0.5, mathjs.max(deadbandOld + deadbandNew, -0.5));
                        }
                        this.$state[i + this.drives.length] = deadbandNew;
                        this.$state[i] = pos;
                        return pos;
                    });
                    return newpos;
                },
            });
            Object.defineProperty(this, "state", {
                enumerable: true,
                get: () => this.$state.map((s) => s),
                set: (state) => ((this.$state = state.map((s) => s)), state),
            });
            Object.defineProperty(this, "outputTransform", {
                value: options.outputTransform ||
                    ((frame) => frame.state.slice(0, frame.drives.length)),
            });
            Object.defineProperty(this, "output", {
                get: () => this.outputTransform(this),
            });
            options.state && (this.state = options.state) || this.clearPos();
        }

        static fromJSON(json, options={}) {
            json = typeof json === "string" ? JSON.parse(json) : json;
            var frame = null;
            if (json.type === "DriveFrame") {
                json = typeof json === "string" ? JSON.parse(json) : json;
                var drives = json.drives.map((d) => StepperDrive.fromJSON(d));
                frame = new DriveFrame(drives, json);
                if (json.calibration && options.calibrationFactory) {
                    frame.calibration = options.fromJSON(json.calibration);
                }
            }
            return frame;
        }

        toJSON() {
            var obj = {
                type: "DriveFrame",
                state: this.state,
                drivePos: this.drivePos,
                backlash: this.backlash,
                deadbandScale: this.deadbandScale,
                drives: this.drives.map((d) => d.toJSON()),
                calibration: this.calibration,
            }
            return obj;
        }

        clipDrivePos(drivePos) {
            return drivePos.map((p, i) => {
                var di = this.drives[i];
                return p == null ? null : Math.min(Math.max(di.minPos, p), di.maxPos);
            });
        }

        clearPos() {
            this.state = (
                this.drives.map((d) => null)
                .concat(this.drives.map((d) => this.deadbandHome))
            );
        }

        home(options = {}) {
            if (options instanceof Array) {
                var newDrivePos = this.drivePos.map((a,i) => {
                    var opt = options[i];
                    if (typeof opt === "number") {
                        return opt;
                    } else if (opt === true) {
                        return this.drives[i].minPos;
                    } else {
                        return a;
                    }
                });
            } else {
                var newDrivePos = this.drives.map((d) => d.minPos);
            }
            winston.debug("home() newDrivePos:", JSON.stringify(newDrivePos));
            return new Promise((resolve, reject) => {
                var motorPos = this.toMotorPos(newDrivePos);
                this.serialDriver.home(motorPos).then(result => {
                    this.drivePos = newDrivePos;
                    resolve(this);
                }).catch(err => reject(err))
            });
        }

        moveTo(position) {
            if (position instanceof Array) {
                position = {
                    axis: position,
                }
            }
            if (position.axis) {
                var newPos = position.axis;
            } else if (position.motor) {
                var newPos = this.toDrivePos(position.motor);
            } else {
                throw new Error("moveTo() unknown position:" + JSON.stringify(position));
            }
            var oldPos = this.drivePos;
            var newDrivePos = newPos.map((p, i) => p == null ? oldPos[i] : p);
            newDrivePos = this.clipDrivePos(newDrivePos);
            return new Promise((resolve, reject) => {
                var motorPos = this.toMotorPos(newDrivePos);
                this.serialDriver.moveTo(motorPos).then(result => {
                    this.drivePos = newDrivePos;
                    resolve(this);
                }).catch(err => reject(err));
            });
        }

        toDrivePos(motorPos) {
            return motorPos.map((m, i) => m == null ? null : this.drives[i].toDrivePos(m));
        }

        toMotorPos(drivePos) {
            return drivePos.map((a, i) => a == null ? null : this.drives[i].toMotorPos(a));
        }

        basisVariables() {
            var vars = this.drives.map((d) => new Variable([d.minPos, d.maxPos]))
            if (this.backlash) {
                var deadbandVars = this.drives.map((d) => new Variable([-0.5, 0.5]))
                vars = vars.concat(deadbandVars);
            }
            return vars;
        }

    } // class DriveFrame

    module.exports = exports.DriveFrame = DriveFrame;
})(typeof exports === "object" ? exports : (exports = {}));
