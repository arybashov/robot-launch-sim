export type DesignParams = {
  projectileMassG: number
  armLengthCm: number
  armMassG: number
  contractingTensionN: number
  elongatingTensionN: number
  pulleyRadiusCm: number
  muscleAttachCm: number
  muscleStrokeMm: number
  controlSignalMs: number
  brakeSignalMs: number
  sweepDeg: number
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
const ARM_POSE_ROTATION_RAD = (-110 * Math.PI) / 180
export const initialParams: DesignParams = {
  projectileMassG: 24,
  armLengthCm: 30,
  armMassG: 12,
  contractingTensionN: 8,
  elongatingTensionN: 2,
  pulleyRadiusCm: 1.8,
  muscleAttachCm: 4,
  muscleStrokeMm: 35,
  controlSignalMs: 350,
  brakeSignalMs: 150,
  sweepDeg: 50,
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
  const muscleStrokeM = params.muscleStrokeMm / 1000
  const sweepRad = (params.sweepDeg * Math.PI) / 180
  const releaseAngleRad = Math.PI + ARM_POSE_ROTATION_RAD
  const controlSignalSeconds = params.controlSignalMs / 1000
  const brakeSignalSeconds = params.brakeSignalMs / 1000
  const pivotHeightM = params.pivotHeightCm / 100
  const releaseArmRad = Math.PI / 2 + ARM_POSE_ROTATION_RAD
  const releaseHeightM = Math.max(0.01, pivotHeightM + Math.sin(releaseArmRad) * armLengthM)
  const bearingLossNm = params.bearingLossNcm / 100

  const projectileInertia = projectileMassKg * armLengthM ** 2
  const forearmInertia = (armMassKg * armLengthM ** 2) / 3
  const armInertia = projectileInertia + forearmInertia
  const requiredTravelM = muscleAttachM * sweepRad
  const contractingTorque = params.contractingTensionN * muscleAttachM
  const elongatingTorque = params.elongatingTensionN * muscleAttachM
  const netTorque = Math.max(0, contractingTorque - elongatingTorque)
  const motion = simulateMuscleMotion({
    loadedInertia: armInertia,
    releasedInertia: forearmInertia,
    muscleAttachM,
    muscleStrokeM,
    sweepRad,
    contractingTensionN: params.contractingTensionN,
    elongatingTensionN: params.elongatingTensionN,
    transferEfficiency: params.transferEfficiency,
    bearingLossNm,
    signalDurationSeconds: controlSignalSeconds,
    brakeDurationSeconds: brakeSignalSeconds,
  })
  const releaseMotionFrame = getReleaseFrame(motion.frames)
  const signalMotionFrame = getFrameAtTime(motion.frames, controlSignalSeconds)
  const muscleTravelM = signalMotionFrame.travelM
  const muscleWork = params.contractingTensionN * muscleTravelM * params.transferEfficiency
  const resistingWork = params.elongatingTensionN * muscleTravelM
  const lossWork = bearingLossNm * Math.abs(releaseMotionFrame.angleRad + sweepRad)
  const launchEnergy = 0.5 * armInertia * releaseMotionFrame.omega ** 2
  const angularSpeed = releaseMotionFrame.omega
  const tipSpeed = angularSpeed * armLengthM
  const kineticEnergy = 0.5 * projectileMassKg * tipSpeed ** 2
  const motor = simulateMotorDrive({
    params,
    armInertia,
    armLengthM,
    sweepRad,
    releaseAngleRad,
    releaseHeightM,
    projectileMassKg,
    controlSignalSeconds,
    brakeSignalSeconds,
  })

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
      forearmInertia,
      frames: motion.frames,
      muscleTravelM,
      requiredTravelM,
      muscleWork,
      resistingWork,
      lossWork,
      launchEnergy,
      netTorque,
      contractingTorque,
      elongatingTorque,
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
  armInertia,
  armLengthM,
  sweepRad,
  releaseAngleRad,
  releaseHeightM,
  projectileMassKg,
  controlSignalSeconds,
  brakeSignalSeconds,
}: {
  params: DesignParams
  armInertia: number
  armLengthM: number
  sweepRad: number
  releaseAngleRad: number
  releaseHeightM: number
  projectileMassKg: number
  controlSignalSeconds: number
  brakeSignalSeconds: number
}): MotorResult {
  const motorTorqueNm = params.motorTorqueNcm / 100
  const outputTorque = motorTorqueNm * params.gearboxRatio * params.gearboxEfficiency
  const outputSpeedLimit =
    ((params.motorNoLoadRpm / params.gearboxRatio) * 2 * Math.PI) / 60
  const rotorInertiaKgM2 = params.motorRotorInertiaGcm2 * 1e-7
  const reflectedInertia = rotorInertiaKgM2 * params.gearboxRatio ** 2
  const totalInertia = armInertia + reflectedInertia
  const motion = simulateMotorMotion({
    loadedInertia: totalInertia,
    releasedInertia: forearmInertia(params) + reflectedInertia,
    outputTorque,
    outputSpeedLimit,
    sweepRad,
    postReleaseBrakeTorque: outputTorque,
    signalDurationSeconds: controlSignalSeconds,
    brakeDurationSeconds: brakeSignalSeconds,
  })
  const releaseMotionFrame = getReleaseFrame(motion.frames)
  const signalMotionFrame = getFrameAtTime(motion.frames, controlSignalSeconds)
  const rawWork = outputTorque * Math.max(0, signalMotionFrame.angleRad + sweepRad)
  const work = rawWork
  const angularSpeed = releaseMotionFrame.omega
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
  muscleStrokeM,
  sweepRad,
  contractingTensionN,
  elongatingTensionN,
  transferEfficiency,
  bearingLossNm,
  signalDurationSeconds,
  brakeDurationSeconds,
}: {
  loadedInertia: number
  releasedInertia: number
  muscleAttachM: number
  muscleStrokeM: number
  sweepRad: number
  contractingTensionN: number
  elongatingTensionN: number
  transferEfficiency: number
  bearingLossNm: number
  signalDurationSeconds: number
  brakeDurationSeconds: number
}) {
  const dt = 0.001
  const frames: MotionFrame[] = []
  let t = 0
  let angleRad = -sweepRad
  let omega = 0
  let travelM = 0
  let released = false

  for (let step = 0; step < 5000; step += 1) {
    travelM = Math.min(muscleStrokeM, Math.max(0, (angleRad + sweepRad) * muscleAttachM))
    const signalOn = t <= signalDurationSeconds
    const brakeOn = t > signalDurationSeconds && t <= signalDurationSeconds + brakeDurationSeconds
    const hasStroke = signalOn && travelM < muscleStrokeM
    const driveTorque = hasStroke ? contractingTensionN * transferEfficiency * muscleAttachM : 0
    const resistingTorque = hasStroke ? elongatingTensionN * muscleAttachM : 0
    const lossTorque = omega > 0 && signalOn ? bearingLossNm : 0
    const brakeTorque = brakeOn ? elongatingTensionN * muscleAttachM : 0
    const torque = hasStroke ? Math.max(0, driveTorque - resistingTorque - lossTorque) : -brakeTorque

    frames.push({ t, angleRad, omega, torque, travelM, released })

    if (t > signalDurationSeconds + brakeDurationSeconds && omega <= 0) {
      break
    }

    const inertia = released ? releasedInertia : loadedInertia
    const alpha = inertia > 0 ? torque / inertia : 0
    omega += alpha * dt
    omega = Math.max(0, omega)
    angleRad += omega * dt
    t += dt

    if (!released && angleRad >= 0) {
      angleRad = 0
      released = true
    }
  }

  if (frames[frames.length - 1]?.angleRad !== angleRad) {
    frames.push({ t, angleRad, omega, torque: 0, travelM, released })
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
  brakeDurationSeconds,
}: {
  loadedInertia: number
  releasedInertia: number
  outputTorque: number
  outputSpeedLimit: number
  sweepRad: number
  postReleaseBrakeTorque: number
  signalDurationSeconds: number
  brakeDurationSeconds: number
}) {
  const dt = 0.001
  const frames: MotionFrame[] = []
  let t = 0
  let angleRad = -sweepRad
  let omega = 0
  let travelM = 0
  let speedLimited = false
  let released = false

  for (let step = 0; step < 5000; step += 1) {
    const sweptRad = Math.max(0, angleRad + sweepRad)
    const signalOn = t <= signalDurationSeconds
    const brakeOn = t > signalDurationSeconds && t <= signalDurationSeconds + brakeDurationSeconds
    const torque = signalOn ? outputTorque : brakeOn ? -postReleaseBrakeTorque : 0

    frames.push({ t, angleRad, omega, torque, travelM, released })

    if (t > signalDurationSeconds + brakeDurationSeconds && omega <= 0) {
      break
    }

    const inertia = released ? releasedInertia : loadedInertia
    const alpha = inertia > 0 ? torque / inertia : 0
    omega += alpha * dt
    omega = Math.max(0, omega)
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

  if (frames[frames.length - 1]?.angleRad !== angleRad) {
    frames.push({ t, angleRad, omega, torque: 0, travelM, released })
  }

  return { frames, speedLimited }
}

function forearmInertia(params: DesignParams) {
  const armLengthM = params.armLengthCm / 100
  const armMassKg = params.armMassG / 1000
  return (armMassKg * armLengthM ** 2) / 3
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
