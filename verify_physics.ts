import { simulateDesign, initialParams } from './src/model/physics';

function runVerification() {
  console.log("--- Physics Verification Report (double pendulum) ---");

  const result = simulateDesign(initialParams);

  const muscleFrames = result.mechanism.frames;
  const motorFrames = result.motor.frames;

  const release = muscleFrames.find((f) => f.released);
  console.log(`\n[Muscle Drive]`);
  console.log(`Total Frames: ${muscleFrames.length}`);
  console.log(`Peak |knee rate|: ${Math.max(...muscleFrames.map((f) => Math.abs(f.omega2 - f.omega1))).toFixed(2)} rad/s`);
  console.log(`Peak |hip omega|: ${Math.max(...muscleFrames.map((f) => Math.abs(f.omega1))).toFixed(2)} rad/s`);
  if (release) {
    console.log(`Release t=${release.t.toFixed(3)}s  hip=${release.hipRad.toFixed(3)} shank=${release.shankRad.toFixed(3)} knee=${release.kneeRad.toFixed(3)}`);
  } else {
    console.log(`Release: NEVER (knee did not fully extend)`);
  }
  console.log(`Muscle work: ${result.mechanism.muscleWork.toFixed(4)} J`);
  console.log(`Tip speed: ${result.mechanism.tipSpeed.toFixed(2)} m/s`);

  console.log(`\n[Motor Drive]`);
  console.log(`Total Frames: ${motorFrames.length}`);
  console.log(`Out torque: ${result.motor.outputTorque.toFixed(4)} Nm  speedLimited=${result.motor.speedLimited}`);
  console.log(`Tip speed: ${result.motor.tipSpeed.toFixed(2)} m/s`);
  console.log(`Reflected inertia: ${result.motor.reflectedInertia.toExponential(2)}`);

  console.log(`\n[Energy]`);
  console.log(`Launch KE (muscle): ${result.kineticEnergy.toFixed(4)} J`);
  console.log(`Launch KE (motor):  ${result.motor.launchEnergy.toFixed(4)} J`);

  console.log(`\n[Trajectory]`);
  const points = result.points;
  console.log(`Launch angle: ${(Math.atan2(points[0].vy, points[0].vx) * 180 / Math.PI).toFixed(1)} deg`);
  console.log(`Start: x=${points[0].x.toFixed(3)}, y=${points[0].y.toFixed(3)}`);
  console.log(`End:   x=${points[points.length - 1].x.toFixed(3)}, y=${points[points.length - 1].y.toFixed(3)}`);
  console.log(`Max Height: ${result.maxHeight.toFixed(3)}  Range: ${result.range.toFixed(3)}`);
}

runVerification();
