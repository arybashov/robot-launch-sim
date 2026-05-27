import { simulateDesign, initialParams } from './src/model/physics';

function runVerification() {
  console.log("--- Physics Verification Report ---");
  
  const result = simulateDesign(initialParams);
  
  const muscleFrames = result.mechanism.frames;
  const motorFrames = result.motor.frames;
  
  console.log(`\n[Muscle Drive]`);
  console.log(`Total Frames: ${muscleFrames.length}`);
  console.log(`Peak Omega: ${Math.max(...muscleFrames.map(f => f.omega)).toFixed(3)} rad/s`);
  console.log(`Final Angle: ${muscleFrames[muscleFrames.length-1].angleRad.toFixed(3)} rad (Target: ${(-initialParams.sweepDeg * Math.PI / 180).toFixed(3)})`);
  
  // Check for jitter (oscillation near end)
  const last100 = muscleFrames.slice(-100);
  const maxOmegaLast100 = Math.max(...last100.map(f => Math.abs(f.omega)));
  console.log(`Stability (last 100ms omega): ${maxOmegaLast100.toFixed(5)} rad/s`);
  
  console.log(`\n[Motor Drive]`);
  console.log(`Total Frames: ${motorFrames.length}`);
  console.log(`Peak Omega: ${Math.max(...motorFrames.map(f => f.omega)).toFixed(3)} rad/s`);
  console.log(`Final Angle: ${motorFrames[motorFrames.length-1].angleRad.toFixed(3)} rad`);
  
  const motorLast100 = motorFrames.slice(-100);
  const maxOmegaMotorLast100 = Math.max(...motorLast100.map(f => Math.abs(f.omega)));
  console.log(`Stability (last 100ms omega): ${maxOmegaMotorLast100.toFixed(5)} rad/s`);

  // Energy check (simplistic)
  const launchFrame = muscleFrames.find(f => f.released);
  if (launchFrame) {
    const kineticEnergy = 0.5 * result.mechanism.armInertia * launchFrame.omega ** 2;
    console.log(`\n[Energy]`);
    console.log(`Launch Kinetic Energy: ${kineticEnergy.toFixed(4)} J`);
  }
  
  console.log(`\n[Trajectory Points Sample]`);
  const points = result.points;
  console.log(`Start: x=${points[0].x.toFixed(3)}, y=${points[0].y.toFixed(3)}`);
  console.log(`End:   x=${points[points.length-1].x.toFixed(3)}, y=${points[points.length-1].y.toFixed(3)}`);
  console.log(`Max Height: ${result.maxHeight.toFixed(3)}`);
  console.log(`Range: ${result.range.toFixed(3)}`);
}

runVerification();
