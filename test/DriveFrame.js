// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("DriveFrame", function() {
    const should = require("should");
    const mathjs = require("mathjs");
    const winston = require("winston");
    const StepperDrive = require("../src/StepperDrive");
    const Variable = require("../src/Variable");
    const MockSerialDriver = require('../index').serial.MockSerialDriver;
    const DriveFrame = require("../src/DriveFrame");
    const BeltDrive = StepperDrive.BeltDrive;
    const ScrewDrive = StepperDrive.ScrewDrive;

    var belt300 = new BeltDrive({
        minPos: -1,
        maxPos: 300,
        teeth: 20,
    });
    var belt200 = new BeltDrive({
        minPos: -2,
        maxPos: 200,
    });
    var screw = new ScrewDrive({
        minPos: -3,
        lead: 1,
    });

    it("DriveFrame(drives) assigns default names to given drives", function() {
        var drives = [belt300, belt200, screw];
        var frame = new DriveFrame(drives);
        drives[0].name.should.equal("X");
        drives[1].name.should.equal("Y");
        drives[2].name.should.equal("Z");
    });
    it("DriveFrame(drives) creates a positionable drive collection", function(done) {
        var async = function*() {
            var drives = [belt300, belt200, screw];
            var frame = new DriveFrame(drives);
            frame.drives.length.should.equal(drives.length);
            should.deepEqual(frame.drivePos, [null, null, null]);
            yield(frame.home().then(r => async.next(r)));
            should.deepEqual(frame.drivePos, [-1, -2, -3]);
            done();
        }();
        async.next();
    });
    it("toDrivePos(motorPos) transforms position vector", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        should.deepEqual(frame.toDrivePos([1, 2, 3]), [
            0.0125,
            0.02,
            0.0009375,
        ]);
        should.deepEqual(frame.toDrivePos([10, 20, 30]), [
            0.125,
            0.2,
            0.009375,
        ]);
        should.deepEqual(frame.toMotorPos([0.125, 0.2, 0.0009375]), [
            10, 20, 3,
        ]);
    })
    it("drivePos is position property", function(done) {
        var async = function*() {
            var frame = new DriveFrame([belt300, belt200, screw]);
            should.deepEqual(frame.drivePos, [null, null, null]);
            yield(frame.home().then(r => async.next(r)));
            should.deepEqual(frame.drivePos, [-1, -2, -3]);
            frame.drivePos = [1, 2, 3];
            should.deepEqual(frame.drivePos, [1, 2, 3]);
            frame.drivePos = [0, 2, 3];
            should.deepEqual(frame.drivePos, [0, 2, 3]);
            frame.drivePos = [1, 0, 2];
            should.deepEqual(frame.drivePos, [1, 0, 2]);

            // only valid positions are allowed
            frame.drivePos = [1000, -1000, 1000];
            should.deepEqual(frame.drivePos, [300, -2, 100]);
            frame.drivePos = [-1000, 1000, -1000];
            should.deepEqual(frame.drivePos, [-1, 200, -3]);
            done();
        }();
        async.next();
        // NOTE: setting any axis position to its minimum changes the corresponding axis direction to 1 (homing)
    })
    it("clearPos() sets position to be undefined", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        frame.drivePos = [1, 2, 3];
        should.deepEqual(frame.drivePos, [1, 2, 3]);
        frame.clearPos();
        should.deepEqual(frame.drivePos, [null, null, null]);
    });
    it("moveTo(drivePos) moves to position", function(done) {
        var async = function*() {
            var frame = new DriveFrame([belt300, belt200, screw]);
            yield(frame.home().then(r => async.next(r)));
            var result = yield(frame.moveTo([1000, -20, 30]).then(r => async.next(r)));
            should.deepEqual(frame.drivePos, [300, -2, 30]); // motion is restricted
            yield(frame.moveTo([null, 0, 3]).then(r => async.next(r)));
            should.deepEqual(frame.drivePos, [300, 0, 3]); // motion is restricted
            yield(frame.home().then(r => async.next(r)));
            yield(frame.moveTo({
                axis: [1000, -20, 30]
            }).then(r => async.next(r)));
            should.deepEqual(frame.drivePos, [300, -2, 30]); // motion is restricted
            var motorPos = frame.toMotorPos([100, 2, 3]);
            yield(frame.moveTo({
                motor: motorPos
            }).then(r => async.next(r)));
            should.deepEqual(frame.drivePos, [100, 2, 3]);
            done();
        }();
        async.next();
    })
    it("TESThome(axes) moves one or all drives to minimum position", function(done) {
        var async = function*() {
            try {
                var asyncPromise = (p) => p.then(r=>async.next(r)).catch(e=>async.throw(e));
                var sd = new MockSerialDriver();
                var frame = new DriveFrame([belt300, belt200, screw], {
                    serialDriver: sd,
                });
                should.deepEqual(frame.drivePos, [null, null, null]);
                var result = yield asyncPromise(frame.home([true]));
                should.strictEqual(result, frame);
                should.deepEqual(frame.drivePos, [-1, null, null]);
                var result = yield asyncPromise(frame.home([null,true]));
                should.deepEqual(frame.drivePos, [-1, -2, null]);
                frame.drivePos = [10, 20, 30];
                var result = yield asyncPromise(frame.home());
                should.deepEqual(frame.state, [-1, -2, -3, 0.5, 0.5, 0.5]);
                should.throws(
                    () => yield(frame.home({axis: -1}).catch(err => async.throw(err)))
                );
                var homeMotorPos = frame.toMotorPos(frame.drives.map((d) => d.minPos));
                should.deepEqual(sd.commands, [{
                    home: [homeMotorPos[0], null, null],
                }, {
                    home: [homeMotorPos[0], homeMotorPos[1], null],
                }, {
                    home: [homeMotorPos[0], homeMotorPos[1], homeMotorPos[2], ],
                }]);
                var result = yield asyncPromise(frame.home([10,null,30]));
                should.deepEqual(frame.state, [10, -2, 30, 0.5, 0.5, 0.5]);
                done();
            } catch(err) {
                winston.error(err);
            }
        }();
        async.next(); // start async
    })
    it("deadband is backlash property that varies between -0.5 and 0.5", function(done) {
        var async = function*() {
            var frame = new DriveFrame([belt300, belt200, screw], {
                deadbandScale: 1
            });
            yield frame.home().then(r => async.next(r));
            should.deepEqual(frame.drivePos, [-1, -2, -3]);
            should.deepEqual(frame.deadband, [0.5, 0.5, 0.5]);

            // move outside deadband
            frame.drivePos = mathjs.add(frame.drivePos, [10, 10, 10]); // large covariant movement sets deadband limit
            should.deepEqual(frame.deadband, [0.5, 0.5, 0.5]);
            frame.drivePos = mathjs.add(frame.drivePos, [-5, -5, -5]); // large contravariant movement sets deadband to opposite limit
            should.deepEqual(mathjs.round(frame.deadband, 3), [-0.5, -0.5, -0.5]);

            // move inside deadband
            frame.drivePos = mathjs.add(frame.drivePos, [0.1, 0.1, 0.1]); // small contravariant movement reduces backlash
            should.deepEqual(mathjs.round(frame.deadband, 3), [-0.4, -0.4, -0.4]);
            frame.drivePos = mathjs.add(frame.drivePos, [0.1, 0.1, 0.1]); // small covariant movement increases backlash
            should.deepEqual(mathjs.round(frame.deadband, 3), [-0.301, -0.301, -0.301]);
            frame.drivePos = mathjs.add(frame.drivePos, [-0.1, -0.1, -0.1]); // small contravariant movement reduces backlash
            should.deepEqual(mathjs.round(frame.deadband, 3), [-0.4, -0.4, -0.4]);

            // move outside deadband
            frame.drivePos = mathjs.add(frame.drivePos, [5, 5, 5]); // large movement sets deadband to limit
            should.deepEqual(frame.deadband, [0.5, 0.5, 0.5]);

            // go home
            frame.drivePos = mathjs.add(frame.drivePos, [10, 10, 10]); // large covariant movement should not change 
            should.deepEqual(frame.deadband, [0.5, 0.5, 0.5]);
            done();
        }();
        async.next();
    })
    it("state is kinematic state, which includes deadband position", function(done) {
        var async = function*() {
            var frame = new DriveFrame([belt300, belt200, screw]);
            yield(frame.home().then(r => async.next(r)));
            should.deepEqual(frame.state, [-1, -2, -3, 0.5, 0.5, 0.5]);
            frame.drivePos = [10, 20, 30];
            var state123 = mathjs.round(frame.state, 5);
            frame.drivePos = [0, 20, 30];
            var state023 = mathjs.round(frame.state, 5);
            should.deepEqual(state023, [0, 20, 30, -0.5, 0.5, 0.5]);
            frame.drivePos = [10, 0, 20];
            var state102 = mathjs.round(frame.state, 5);
            should.deepEqual(state123, [10, 20, 30, 0.5, 0.5, 0.5]);
            should.deepEqual(state023, [0, 20, 30, -0.5, 0.5, 0.5]);
            should.deepEqual(state102, [10, 0, 20, 0.5, -0.5, -0.5]);
            should.deepEqual(mathjs.round(frame.state, 5), state102);

            // restore prior state
            frame.state = state123;
            should.deepEqual(mathjs.round(frame.state, 5), state123);
            frame.drivePos = [0, 20, 30];
            should.deepEqual(mathjs.round(frame.state, 5), state023);
            done();
        }();
        async.next();
    })
    it("DriveFrame.fromJSON(json).toJSON() are used to (de-)serializes DriveFrame", function() {
        var frame = new DriveFrame([belt300, belt200, screw]);
        frame.drivePos = [10, 2, 30];
        frame.drivePos = [1, 2, 3];
        var json = JSON.stringify(frame);
        var frame2 = DriveFrame.fromJSON(json);
        frame2.should.instanceOf(DriveFrame);
        should.deepEqual(frame2.state, frame.state);
        should.deepEqual(frame2.state, frame.state);
        frame2.drivePos = [1000, 1000, 1000];
        should.deepEqual(frame2.state, [300, 200, 100, 0.5, 0.5, 0.5]);
    })
    it("basisVariables() returns neural network input basisVariables", function() {
        var drives = [belt300, belt200, screw];

        // with backlash disabled, basisVariables are motion axes
        var frame = new DriveFrame(drives, {
            backlash: false
        });
        should.deepEqual(frame.basisVariables(), [
            new Variable([-1, 300]), // belt300 motion axis x
            new Variable([-2, 200]), // belt200 motion axis y
            new Variable([-3, 100]), // screw motion axis z
        ]);

        // default variables track backlash with deadband variables
        var frame = new DriveFrame(drives);
        should.deepEqual(frame.basisVariables(), [
            new Variable([-1, 300]), // belt300 motion axis x
            new Variable([-2, 200]), // belt200 motion axis y
            new Variable([-3, 100]), // screw motion axis z
            new Variable([-0.5, 0.5]), // x deadband variable
            new Variable([-0.5, 0.5]), // y deadband variable
            new Variable([-0.5, 0.5]), // z deadband variable
        ]);
    })
    it("output property provides customizable application output", function() {
        var drives = [belt300, belt200, screw];
        var c3 = new DriveFrame(drives);

        // Default output is simply drivePos
        c3.drivePos = [10, 11, 12];
        should.deepEqual(c3.output, [10, 11, 12]);
        c3.drivePos = [0, 11, 12];
        should.deepEqual(c3.output, [0, 11, 12]); // no backlash

        // change outputTransform to emulate 3-axis Cartesian with backlash
        var backlash = (driveFrame) =>
            driveFrame.deadband.map((d, i) => driveFrame.drivePos[i] + (d < 0 ? 1 : 0));
        var c3Backlash = new DriveFrame(drives, {
            outputTransform: backlash,
        });
        c3Backlash.drivePos = [10, 11, 12];
        should.deepEqual(c3Backlash.output, [10, 11, 12]);
        c3Backlash.drivePos = [0, 11, 12];
        should.deepEqual(c3Backlash.output, [1, 11, 12]); // backlash position
        should.deepEqual(c3Backlash.drivePos, [0, 11, 12]); // control position 
        c3Backlash.drivePos = [5, 11, 12];
        should.deepEqual(c3Backlash.output, [5, 11, 12]); // backlash position
        should.deepEqual(c3Backlash.drivePos, [5, 11, 12]); // control position 
    })
})
