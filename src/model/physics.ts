export type DesignParams = {
  projectileMassG: number
  armLengthCm: number
  armMassG: number
  contractingTensionN: number
  elongatingTensionN: number
  pulleyRadiusCm: number
  muscleAttachCm: number
  frontMuscleLengthCm: number
  rearMuscleLengthCm: number
  controlSignalMs: number
  brakeStartMs: number
  brakeEndMs: number
  sweepDeg: number
  baseAngleDeg: number
  pivotHeightCm: number
  transferEfficiency: number
  bearingLossNcm: number
  motorTorqueNcm: number
  motorNoLoadRpm: number
  gearboxRatio: number
  motorRotorInertiaGcm2: number
  gearboxEfficiency: number
  dragEnabled: boolean
  dragCoefficient: number
  areaCm2: number
}

export type Point = {
  t: number
  x: number
  y: number
  vx: number
  vy: number
}

export type MechanismResult = {
  frames: MotionFrame[]
  armInertia: number
  projectileInertia: number
  forearmInertia: number
  muscleTravelM: number
  requiredTravelM: number
  muscleWork: number
  wastedEnergy: number
  resistingWork: number
  lossWork: number
  launchEnergy: number
  netTorque: number
  contractingTorque: number
  elongatingTorque: number
  angularSpeed: number
  tipSpeed: number
}

export type SimulationResult = {
  mechanism: MechanismResult
  motor: MotorResult
  points: Point[]
  initialSpeed: number
  kineticEnergy: number
  maxHeight: number
  range: number
  flightTime: number
}

export type MotorResult = {
  frames: MotionFrame[]
  points: Point[]
  rawWork: number
  workCap: number
  outputTorque: number
  outputSpeedLimit: number
  reflectedInertia: number
  totalInertia: number
  wastedEnergy: number
  work: number
  launchEnergy: number
  angularSpeed: number
  tipSpeed: number
  maxHeight: number
  range: number
  flightTime: number
  speedLimited: boolean
}

export type MotionFrame = {
  t: number
  angleRad: number
  omega: number
  torque: number
  travelM: number
  released: boolean
}

const G = 9.81
const AIR_DENSITY = 1.225

export const initialParams: DesignParams = {
  projectileMassG: 24,
  armLengthCm: 30,
  armMassG: 50,
  contractingTensionN: 8,
  elongatingTensionN: 2,
  pulleyRadiusCm: 1.8,
  muscleAttachCm: 4,
  frontMuscleLengthCm: 30,
  rearMuscleLengthCm: 25,
  controlSignalMs: 350,
  brakeStartMs: 350,
  brakeEndMs: 500,
  sweepDeg: 70,
  baseAngleDeg: 135,
  pivotHeightCm: 4,
  transferEfficiency: 0.55,
  bearingLossNcm: 1.5,
  motorTorqueNcm: 12,
  motorNoLoadRpm: 9000,
  gearboxRatio: 90,
  motorRotorInertiaGcm2: 1.8,
  gearboxEfficiency: 0.68,
  dragEnabled: true,
  dragCoefficient: 0.47,
  areaCm2: 11.3,
}

export const comparisonMasses = [15, 17, 19, 24]

export function simulateDesign(params: DesignParams): SimulationResult {
  const projectileMassKg = params.projectileMassG / 1000
  const armLengthM = params.armLengthCm / 100
  const armMassKg = params.armMassG / 1000
  const muscleAttachM = Math.min(params.muscleAttachCm, params.armLengthCm) / 100
  const sweepRad = (params.sweepDeg * Math.PI) / 180
  
  // Base rotation (tilt of the installation)
  const baseRotationRad = (-params.baseAngleDeg * Math.PI) / 180
  
  // Release occurs when angleRad reaches 0 (arm is aligned with base).
  // The absolute angle in the world is baseRotationRad + current arm angle.
  // Wait, the visual arm is PI/2 + baseRotationRad when angleRad is 0.
  const releaseArmRad = Math.PI / 2 + baseRotationRad
  // The velocity vector is perpendicular to the arm radius (moving counter-clockwise)
  const releaseAngleRad = releaseArmRad + Math.PI / 2 
  
  const controlSignalSeconds = params.controlSignalMs / 1000
  const brakeStartSeconds = params.brakeStartMs / 1000
  const brakeEndSeconds = params.brakeEndMs / 1000
  const pivotHeightM = params.pivotHeightCm / 100
  const releaseHeightM = Math.max(0.01, pivotHeightM + Math.sin(releaseArmRad) * armLengthM)

  const basketMassKg = 0.01 
  const projectileInertia = projectileMassKg * armLengthM ** 2
  const forearmRodInertia = (armMassKg * armLengthM ** 2) / 3
  const basketInertia = basketMassKg * armLengthM ** 2
  const armInertia = forearmRodInertia + basketInertia
  const totalLoadedInertia = projectileInertia + armInertia
  
  const requiredTravelM = muscleAttachM * sweepRad
  
  // 1. Muscle Simulation
  const motion = simulateMuscleMotion({
    loadedInertia: totalLoadedInertia,
    releasedInertia: armInertia,
    muscleAttachM,
    frontNominalLengthM: params.frontMuscleLengthCm / 100,
    rearNominalLengthM: params.rearMuscleLengthCm / 100,
    sweepRad,
    baseRotationRad,
    transferEfficiency: params.transferEfficiency,
    signalDurationSeconds: controlSignalSeconds,
    brakeStartSeconds,
    brakeEndSeconds,
  })

  const releaseMotionFrame = getReleaseFrame(motion.frames)
  const signalMotionFrame = getFrameAtTime(motion.frames, controlSignalSeconds)
  
  // Calculate Actual Work Done by Muscle (Energy Budget)
  const muscleWork = 0.5 * 400 * (signalMotionFrame.travelM) * params.transferEfficiency;
  
  // 2. Motor Simulation (Energy Matched)
  const energyMatchedTorqueNm = muscleWork / sweepRad;
  
  const motor = simulateMotorDrive({
    params,
    energyMatchedTorqueNm, 
    armInertia: totalLoadedInertia,
    reflectedBaseInertia: forearmRodInertia,
    armLengthM,
    sweepRad,
    releaseAngleRad,
    releaseHeightM,
    projectileMassKg,
    controlSignalSeconds,
    brakeStartSeconds,
    brakeEndSeconds,
  })

  const angularSpeed = releaseMotionFrame.omega
  const tipSpeed = angularSpeed * armLengthM
  const kineticEnergy = 0.5 * projectileMassKg * tipSpeed ** 2

  const points = simulateProjectile({
    massKg: projectileMassKg,
    initialSpeed: tipSpeed,
    releaseAngleRad,
    startHeightM: releaseHeightM,
    dragEnabled: params.dragEnabled,
    dragCoefficient: params.dragCoefficient,
    areaCm2: params.areaCm2,
  })

  const maxHeight = Math.max(...points.map((point) => point.y))
  const lastPoint = points[points.length - 1]

  return {
    mechanism: {
      armInertia,
      projectileInertia,
      forearmInertia: forearmRodInertia,
      frames: motion.frames,
      muscleTravelM: signalMotionFrame.travelM,
      requiredTravelM,
      muscleWork,
      wastedEnergy: 0, // Muscle is direct drive
      resistingWork: 0,
      lossWork: 0,
      launchEnergy: 0.5 * armInertia * angularSpeed ** 2,
      netTorque: 0,
      contractingTorque: 0,
      elongatingTorque: 0,
      angularSpeed,
      tipSpeed,
    },
    motor,
    points,
    initialSpeed: tipSpeed,
    kineticEnergy,
    maxHeight,
    range: lastPoint.x,
    flightTime: lastPoint.t,
  }
}

function simulateMotorDrive({
  params,
  energyMatchedTorqueNm,
  armInertia,
  reflectedBaseInertia,
  armLengthM,
  sweepRad,
  releaseAngleRad,
  releaseHeightM,
  projectileMassKg,
  controlSignalSeconds,
  brakeStartSeconds,
  brakeEndSeconds,
}: {
  params: DesignParams
  energyMatchedTorqueNm: number
  armInertia: number
  reflectedBaseInertia: number
  armLengthM: number
  sweepRad: number
  releaseAngleRad: number
  releaseHeightM: number
  projectileMassKg: number
  controlSignalSeconds: number
  brakeStartSeconds: number
  brakeEndSeconds: number
}): MotorResult {
  const outputTorque = energyMatchedTorqueNm; 
  const outputSpeedLimit =
    ((params.motorNoLoadRpm / params.gearboxRatio) * 2 * Math.PI) / 60

  const rotorInertiaKgM2 = params.motorRotorInertiaGcm2 * 1e-7
  const reflectedInertia = rotorInertiaKgM2 * params.gearboxRatio ** 2
  const totalInertia = armInertia + reflectedInertia
  const motion = simulateMotorMotion({
    loadedInertia: totalInertia,
    releasedInertia: reflectedBaseInertia + reflectedInertia,
    outputTorque,
    outputSpeedLimit,
    sweepRad,
    postReleaseBrakeTorque: outputTorque,
    signalDurationSeconds: controlSignalSeconds,
    brakeStartSeconds,
    brakeEndSeconds,
  })
  const releaseMotionFrame = getReleaseFrame(motion.frames)
  const signalMotionFrame = getFrameAtTime(motion.frames, controlSignalSeconds)
  const rawWork = outputTorque * Math.max(0, signalMotionFrame.angleRad + sweepRad)
  const work = rawWork
  const angularSpeed = releaseMotionFrame.omega
  const wastedEnergy = 0.5 * reflectedInertia * angularSpeed ** 2
  const launchEnergy = 0.5 * totalInertia * angularSpeed ** 2
  const tipSpeed = angularSpeed * armLengthM
  const points = simulateProjectile({
    massKg: projectileMassKg,
    initialSpeed: tipSpeed,
    releaseAngleRad,
    startHeightM: releaseHeightM,
    dragEnabled: params.dragEnabled,
    dragCoefficient: params.dragCoefficient,
    areaCm2: params.areaCm2,
  })
  const maxHeight = Math.max(...points.map((point) => point.y))
  const lastPoint = points[points.length - 1]

  return {
    frames: motion.frames,
    points,
    rawWork,
    workCap: rawWork,
    outputTorque,
    outputSpeedLimit,
    reflectedInertia,
    totalInertia,
    wastedEnergy,
    work,
    launchEnergy,
    angularSpeed,
    tipSpeed,
    maxHeight,
    range: lastPoint.x,
    flightTime: lastPoint.t,
    speedLimited: motion.speedLimited,
  }
}

function simulateMuscleMotion({
  loadedInertia,
  releasedInertia,
  muscleAttachM,
  frontNominalLengthM,
  rearNominalLengthM,
  sweepRad,
  baseRotationRad,
  transferEfficiency,
  signalDurationSeconds,
  brakeStartSeconds,
  brakeEndSeconds,
}: {
  loadedInertia: number
  releasedInertia: number
  muscleAttachM: number
  frontNominalLengthM: number
  rearNominalLengthM: number
  sweepRad: number
  baseRotationRad: number
  transferEfficiency: number
  signalDurationSeconds: number
  brakeStartSeconds: number
  brakeEndSeconds: number
}) {
  const dt = 0.0005 
  const frames: MotionFrame[] = []
  let t = 0
  let angleRad = -sweepRad
  let omega = 0
  let released = false

  // Max stroke for DMSP-20 is 25% of nominal length
  const frontMaxStrokeM = frontNominalLengthM * 0.25
  const rearMaxStrokeM = rearNominalLengthM * 0.25

  // Anchor positions (from diagram logic)
  const shoulderDistM = 0.17 * (170/170); // Match diagram scale
  const shoulderAngleRad = Math.PI + baseRotationRad
  const releaseArmRad = Math.PI / 2 + baseRotationRad
  
  const shoulderX = Math.cos(shoulderAngleRad) * shoulderDistM
  const shoulderY = Math.sin(shoulderAngleRad) * shoulderDistM

  for (let step = 0; step < 20000; step += 1) {
    const signalOn = t <= signalDurationSeconds
    const brakeOn = t >= brakeStartSeconds && t <= brakeEndSeconds
    
    // Current positions of attachment points
    const currentArmRad = releaseArmRad + angleRad
    const attachX = Math.cos(currentArmRad) * muscleAttachM
    const attachY = Math.sin(currentArmRad) * muscleAttachM
    
    const rearAttachX = -attachX
    const rearAttachY = -attachY

    // Geometric lengths
    const currentFrontLen = Math.hypot(shoulderX - attachX, shoulderY - attachY)
    const currentRearLen = Math.hypot(shoulderX - rearAttachX, shoulderY - rearAttachY)

    // Strokes (how much contracted from nominal)
    const frontStrokeM = Math.max(0, frontNominalLengthM - currentFrontLen)
    const rearStrokeM = Math.max(0, rearNominalLengthM - currentRearLen)

    // Festo DMSP-20 Characteristics with Speed Limit
    const MAX_FORCE_N = 400 
    const V_MAX_RAD_S = 60 
    const velocityFactor = Math.max(0, 1 - Math.abs(omega) / V_MAX_RAD_S)
    
    // Front Muscle
    let driveTension = 0
    if (signalOn && frontStrokeM < frontMaxStrokeM) {
      const forceFactor = 1 - (frontStrokeM / frontMaxStrokeM)
      driveTension = MAX_FORCE_N * forceFactor * velocityFactor * transferEfficiency
    } else if (brakeOn) {
      driveTension = MAX_FORCE_N * 0.4 * velocityFactor * transferEfficiency
    } else {
      driveTension = 0.01 
    }

    // Rear Muscle
    let returnTension = 0
    if (brakeOn && rearStrokeM < rearMaxStrokeM) {
      const forceFactor = 1 - (rearStrokeM / rearMaxStrokeM)
      returnTension = MAX_FORCE_N * 0.8 * forceFactor * velocityFactor * transferEfficiency
    } else {
      returnTension = 0.01 
    }

    // Torque calculation
    const crossProductFront = (attachX * (shoulderY - attachY) - attachY * (shoulderX - attachX)) / currentFrontLen
    const crossProductRear = (rearAttachX * (shoulderY - rearAttachY) - rearAttachY * (shoulderX - rearAttachX)) / currentRearLen

    const driveTorque = driveTension * crossProductFront
    const returnTorque = returnTension * crossProductRear
    
    // Gravity torque
    const armMassKg = (released ? 1 : 1.2) * 0.02 
    const centerOfMassM = 0.15 
    const gravityTorque = -armMassKg * G * centerOfMassM * Math.cos(angleRad + Math.PI/2 + baseRotationRad)

    // Air Resistance and Joint Limits
    const dragCoeff = 0.0005 
    const viscousDamping = 0.002
    const frictionTorque = (dragCoeff * omega * Math.abs(omega)) + (viscousDamping * omega)
    
    let limitTorque = 0
    const jointLimitRad = Math.PI * 0.9 
    const currentRotation = angleRad + sweepRad
    if (Math.abs(currentRotation) > jointLimitRad) {
      const overshoot = Math.abs(currentRotation) - jointLimitRad
      limitTorque = Math.sign(currentRotation) * overshoot * 10 
      omega *= 0.9 
    }

    const torque = driveTorque + returnTorque + gravityTorque - frictionTorque - limitTorque

    if (step % 2 === 0) {
      frames.push({ t, angleRad, omega, torque, travelM: frontStrokeM, released })
    }

    // Stop condition relative to actual base orientation
    const verticalDownRad = -Math.PI/2 - baseRotationRad;
    
    if (t > Math.max(signalDurationSeconds, brakeEndSeconds) + 2.0) {
      if (Math.abs(omega) < 0.01 && Math.abs(angleRad - verticalDownRad) < 0.1) {
        break
      }
    }
    
    if (t > 8.0) break; // Absolute limit for simulation length

    const inertia = released ? releasedInertia : loadedInertia
    const alpha = inertia > 0 ? torque / inertia : 0
    
    // Semi-implicit Euler (Velocity then Position)
    omega += alpha * dt
    angleRad += omega * dt
    t += dt

    if (!released && angleRad >= 0) {
      angleRad = 0
      released = true
    }
  }

  return { frames }
}

function simulateMotorMotion({
  loadedInertia,
  releasedInertia,
  outputTorque,
  outputSpeedLimit,
  sweepRad,
  postReleaseBrakeTorque,
  signalDurationSeconds,
  brakeStartSeconds,
  brakeEndSeconds,
}: {
  loadedInertia: number
  releasedInertia: number
  outputTorque: number
  outputSpeedLimit: number
  sweepRad: number
  postReleaseBrakeTorque: number
  signalDurationSeconds: number
  brakeStartSeconds: number
  brakeEndSeconds: number
}) {
  const dt = 0.0005
  const frames: MotionFrame[] = []
  let t = 0
  let angleRad = -sweepRad
  let omega = 0
  let travelM = 0
  let speedLimited = false
  let released = false
  const viscousDamping = 0.005

  for (let step = 0; step < 20000; step += 1) {
    const sweptRad = Math.max(0, angleRad + sweepRad)
    const signalOn = t <= signalDurationSeconds
    const brakeOn = t >= brakeStartSeconds && t <= brakeEndSeconds
    
    const dampingTorque = viscousDamping * omega
    let torque = (signalOn ? outputTorque : brakeOn ? -postReleaseBrakeTorque : -0.05) - dampingTorque
    
    if (angleRad <= -sweepRad && torque < 0) {
      angleRad = -sweepRad
      omega = 0
      torque = 0
    }

    if (step % 2 === 0) {
      frames.push({ t, angleRad, omega, torque, travelM, released })
    }

    if (t > Math.max(signalDurationSeconds, brakeEndSeconds) + 0.5 && angleRad <= -sweepRad + 0.001 && Math.abs(omega) < 0.01) {
      break
    }

    const inertia = released ? releasedInertia : loadedInertia
    const alpha = inertia > 0 ? torque / inertia : 0
    
    omega += alpha * dt
    if (omega > outputSpeedLimit) {
      omega = outputSpeedLimit
      speedLimited = true
    }
    angleRad += omega * dt
    travelM = sweptRad
    t += dt

    if (!released && angleRad >= 0) {
      angleRad = 0
      released = true
    }
  }

  return { frames, speedLimited }
}



function getReleaseFrame(frames: MotionFrame[]) {
  return frames.find((frame) => frame.released) ?? frames[frames.length - 1]
}

function getFrameAtTime(frames: MotionFrame[], t: number) {
  return frames.find((frame) => frame.t >= t) ?? frames[frames.length - 1]
}

function simulateProjectile({
  massKg,
  initialSpeed,
  releaseAngleRad,
  startHeightM,
  dragEnabled,
  dragCoefficient,
  areaCm2,
}: {
  massKg: number
  initialSpeed: number
  releaseAngleRad: number
  startHeightM: number
  dragEnabled: boolean
  dragCoefficient: number
  areaCm2: number
}) {
  const dt = 0.002
  const areaM2 = areaCm2 / 10000
  const dragK = dragEnabled ? 0.5 * AIR_DENSITY * dragCoefficient * areaM2 : 0

  let t = 0
  let x = 0
  let y = startHeightM
  let vx = initialSpeed * Math.cos(releaseAngleRad)
  let vy = initialSpeed * Math.sin(releaseAngleRad)
  const points: Point[] = [{ t, x, y, vx, vy }]

  for (let step = 0; step < 20000; step += 1) {
    const speed = Math.hypot(vx, vy)
    const dragAx = massKg > 0 ? (-dragK * speed * vx) / massKg : 0
    const dragAy = massKg > 0 ? (-dragK * speed * vy) / massKg : 0

    vx += dragAx * dt
    vy += (-G + dragAy) * dt
    x += vx * dt
    y += vy * dt
    t += dt

    points.push({ t, x, y, vx, vy })

    if (y <= 0 && t > dt) {
      break
    }
  }

  return points
}
