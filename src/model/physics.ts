export type DesignParams = {
  projectileMassG: number
  armLengthCm: number
  armMassG: number
  upperLinkCm: number
  upperLinkMassG: number
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
  // Double pendulum, absolute angles measured from the downward vertical (CCW+).
  hipRad: number // theta1 — upper link (thigh) angle about the ceiling hinge (joint 2)
  shankRad: number // theta2 — lower link (shank/forearm) angle
  kneeRad: number // relative knee angle phi = theta2 - theta1 (joint 1)
  omega1: number
  omega2: number
  torque: number // knee actuator torque (for display)
  travelM: number // muscle stroke (for display)
  released: boolean
}

const G = 9.81
const AIR_DENSITY = 1.225

export const initialParams: DesignParams = {
  projectileMassG: 24,
  armLengthCm: 30,
  armMassG: 50,
  upperLinkCm: 20,
  upperLinkMassG: 30,
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
  baseAngleDeg: 0,
  pivotHeightCm: 60,
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

// ---------------------------------------------------------------------------
// Double pendulum with an actuated knee
//
// The rig is suspended from a top hinge (joint 2 = hip). An upper link (thigh)
// hangs from it, then a free knee (joint 1) connects the lower link (shank /
// forearm) that carries the payload at its tip. The antagonistic muscle pair
// crosses the knee and extends it; the hip swings freely under gravity, so the
// whole thing is a "pendulum with one knee". Angles are absolute, measured from
// the downward vertical, counter-clockwise positive.
// ---------------------------------------------------------------------------

type LinkGeometry = {
  L1: number
  L2: number
  m1: number
  m2: number
  c1: number
  c2: number
  Ic1: number
  Ic2: number
}

type ReleaseState = {
  hipRad: number
  shankRad: number
  omega1: number
  omega2: number
}

type KneeContext = {
  t: number
  phi: number
  kneeExtension: number
  kneeRate: number
  signalOn: boolean
  brakeOn: boolean
  released: boolean
}

type KneeDriveResult = {
  frames: MotionFrame[]
  work: number
  release: ReleaseState | null
}

// Generalised mass-matrix coefficients for a planar double pendulum carrying a
// point mass mTip at the tip of the lower link.
function pendulumCoeffs(geom: LinkGeometry, mTip: number) {
  const { L1, L2, m1, m2, c1, c2, Ic1, Ic2 } = geom
  const alpha = m1 * c1 ** 2 + Ic1 + (m2 + mTip) * L1 ** 2
  const beta = m2 * c2 ** 2 + Ic2 + mTip * L2 ** 2
  const gamma = (m2 * c2 + mTip * L2) * L1
  const P1 = m1 * c1 + (m2 + mTip) * L1
  const P2 = m2 * c2 + mTip * L2
  return { alpha, beta, gamma, P1, P2 }
}

function tipVelocity(rel: ReleaseState, L1: number, L2: number) {
  const vx = L1 * rel.omega1 * Math.cos(rel.hipRad) + L2 * rel.omega2 * Math.cos(rel.shankRad)
  const vy = L1 * rel.omega1 * Math.sin(rel.hipRad) + L2 * rel.omega2 * Math.sin(rel.shankRad)
  return { vx, vy, speed: Math.hypot(vx, vy), angle: Math.atan2(vy, vx) }
}

function tipHeight(rel: ReleaseState, L1: number, L2: number, hipHeightM: number) {
  return hipHeightM - L1 * Math.cos(rel.hipRad) - L2 * Math.cos(rel.shankRad)
}

function fallbackRelease(frames: MotionFrame[]): ReleaseState {
  const f = frames[frames.length - 1]
  return { hipRad: f.hipRad, shankRad: f.shankRad, omega1: f.omega1, omega2: f.omega2 }
}

// Shared integrator: a double pendulum whose KNEE (joint 1) is driven by an
// external torque supplied by `kneeTorque`. The hip (joint 2) is a free hinge.
// The arm starts folded (phi = -sweepRad) and the knee extends to release at
// phi = 0 (full extension), at which point the payload leaves the tip.
function simulateKneeDrive({
  geom,
  payloadMassKg,
  basketMassKg,
  momentArmM,
  sweepRad,
  initialHipRad,
  extraKneeInertia,
  signalDurationSeconds,
  brakeStartSeconds,
  brakeEndSeconds,
  kneeTorque,
}: {
  geom: LinkGeometry
  payloadMassKg: number
  basketMassKg: number
  momentArmM: number
  sweepRad: number
  initialHipRad: number
  extraKneeInertia: number
  signalDurationSeconds: number
  brakeStartSeconds: number
  brakeEndSeconds: number
  kneeTorque: (ctx: KneeContext) => number
}): KneeDriveResult {
  const dt = 0.0005
  const frames: MotionFrame[] = []
  const cHip = 0.012 // hip viscous damping (free swing)
  const cKnee = 0.004 // knee viscous damping

  let t = 0
  let theta1 = initialHipRad
  let theta2 = initialHipRad - sweepRad // phi = theta2 - theta1 = -sweepRad (folded)
  let omega1 = 0
  let omega2 = 0
  let released = false
  let work = 0
  let release: ReleaseState | null = null

  for (let step = 0; step < 20000; step += 1) {
    const signalOn = t <= signalDurationSeconds
    const brakeOn = t >= brakeStartSeconds && t <= brakeEndSeconds
    const phi = theta2 - theta1
    const kneeRate = omega2 - omega1
    const kneeExtension = phi + sweepRad // 0 (folded) .. sweepRad (extended)

    const mTip = released ? basketMassKg : payloadMassKg + basketMassKg
    const { alpha, beta, gamma, P1, P2 } = pendulumCoeffs(geom, mTip)
    // Reflected rotor inertia (motor) is added at the knee. Approximated as a
    // diagonal term on the shank coordinate (ignores the small cross-coupling).
    const betaEff = beta + extraKneeInertia

    const tau = kneeTorque({ t, phi, kneeExtension, kneeRate, signalOn, brakeOn, released })

    // Soft joint limits: knee cannot hyperextend past straight (phi > 0) and
    // cannot fold past ~170 degrees.
    let limitTau = 0
    if (phi > 0.05) limitTau -= (phi - 0.05) * 8 + kneeRate * 0.1
    else if (phi < -Math.PI * 0.95) limitTau += (-Math.PI * 0.95 - phi) * 8

    const Qg1 = -G * P1 * Math.sin(theta1)
    const Qg2 = -G * P2 * Math.sin(theta2)
    const hipDamp = cHip * omega1
    const kneeDamp = cKnee * kneeRate
    const tauNet = tau + limitTau
    const Q1 = Qg1 - tauNet - hipDamp + kneeDamp
    const Q2 = Qg2 + tauNet - kneeDamp

    const delta = theta1 - theta2
    const sinD = Math.sin(delta)
    const M12 = gamma * Math.cos(delta)
    const R1 = Q1 - gamma * sinD * omega2 ** 2
    const R2 = Q2 + gamma * sinD * omega1 ** 2
    const det = alpha * betaEff - M12 ** 2
    const a1 = det !== 0 ? (betaEff * R1 - M12 * R2) / det : 0
    const a2 = det !== 0 ? (alpha * R2 - M12 * R1) / det : 0

    if (step % 2 === 0) {
      frames.push({
        t,
        hipRad: theta1,
        shankRad: theta2,
        kneeRad: phi,
        omega1,
        omega2,
        torque: tau,
        travelM: momentArmM * Math.max(0, kneeExtension),
        released,
      })
    }

    if (signalOn) work += Math.max(0, tau) * Math.max(0, kneeRate) * dt

    // Semi-implicit Euler
    omega1 += a1 * dt
    omega2 += a2 * dt
    theta1 += omega1 * dt
    theta2 += omega2 * dt
    t += dt

    if (!released && theta2 - theta1 >= 0) {
      released = true
      release = { hipRad: theta1, shankRad: theta2, omega1, omega2 }
    }

    if (t > Math.max(signalDurationSeconds, brakeEndSeconds) + 2.0) {
      if (Math.abs(omega1) < 0.03 && Math.abs(omega2) < 0.03) break
    }
    if (t > 8.0) break
  }

  return { frames, work, release }
}

export function simulateDesign(params: DesignParams): SimulationResult {
  const projectileMassKg = params.projectileMassG / 1000
  const basketMassKg = 0.01
  const L2 = params.armLengthCm / 100 // shank / forearm (lower link, carries payload)
  const L1 = params.upperLinkCm / 100 // thigh (upper link, hangs from the hip)
  const m2 = params.armMassG / 1000
  const m1 = params.upperLinkMassG / 1000
  const momentArmM = Math.min(params.muscleAttachCm, params.armLengthCm) / 100
  const sweepRad = (params.sweepDeg * Math.PI) / 180
  const initialHipRad = (params.baseAngleDeg * Math.PI) / 180 // starting tilt of the hung thigh
  const hipHeightM = params.pivotHeightCm / 100

  const geom: LinkGeometry = {
    L1,
    L2,
    m1,
    m2,
    c1: L1 / 2,
    c2: L2 / 2,
    Ic1: (m1 * L1 ** 2) / 12,
    Ic2: (m2 * L2 ** 2) / 12,
  }

  // Inertias about the knee (feed the UI tradeoff panel)
  const projectileInertia = projectileMassKg * L2 ** 2
  const forearmRodInertia = (m2 * L2 ** 2) / 3
  const basketInertia = basketMassKg * L2 ** 2
  const armInertia = forearmRodInertia + basketInertia

  const controlSignalSeconds = params.controlSignalMs / 1000
  const brakeStartSeconds = params.brakeStartMs / 1000
  const brakeEndSeconds = params.brakeEndMs / 1000
  const eta = params.transferEfficiency
  const frontMaxStrokeM = (params.frontMuscleLengthCm / 100) * 0.25
  const rearMaxStrokeM = (params.rearMuscleLengthCm / 100) * 0.25

  const MAX_FORCE_N = 400
  // Muscle contraction-speed limit expressed as a knee angular rate
  // (Festo muscles cannot shorten arbitrarily fast).
  const V_MAX_RAD_S = 18

  // 1. Muscle drive — antagonistic Festo DMSP-20 pair across the knee.
  const muscleMotion = simulateKneeDrive({
    geom,
    payloadMassKg: projectileMassKg,
    basketMassKg,
    momentArmM,
    sweepRad,
    initialHipRad,
    extraKneeInertia: 0,
    signalDurationSeconds: controlSignalSeconds,
    brakeStartSeconds,
    brakeEndSeconds,
    kneeTorque: ({ kneeExtension, kneeRate, signalOn, brakeOn }) => {
      const velocityFactor = Math.max(0, 1 - Math.abs(kneeRate) / V_MAX_RAD_S)
      const frontStroke = momentArmM * Math.max(0, kneeExtension)
      let tau = 0
      // Extensor (front) muscle straightens the knee.
      if (signalOn && frontStroke < frontMaxStrokeM) {
        const forceFactor = 1 - frontStroke / frontMaxStrokeM
        tau += MAX_FORCE_N * forceFactor * velocityFactor * eta * momentArmM
      } else if (brakeOn) {
        tau += MAX_FORCE_N * 0.4 * velocityFactor * eta * momentArmM
      }
      // Flexor (rear) muscle brakes during co-contraction.
      if (brakeOn) {
        const rearStroke = momentArmM * Math.max(0, sweepRad - kneeExtension)
        if (rearStroke < rearMaxStrokeM) {
          const forceFactor = 1 - rearStroke / rearMaxStrokeM
          tau -= MAX_FORCE_N * 0.8 * forceFactor * velocityFactor * eta * momentArmM
        }
      }
      return tau
    },
  })

  const muscleRelease = muscleMotion.release ?? fallbackRelease(muscleMotion.frames)
  const muscleTip = tipVelocity(muscleRelease, L1, L2)
  const muscleReleaseHeight = Math.max(0.01, tipHeight(muscleRelease, L1, L2, hipHeightM))
  const tipSpeed = muscleTip.speed
  const kineticEnergy = 0.5 * projectileMassKg * tipSpeed ** 2
  const muscleWork = muscleMotion.work
  const signalFrame = getFrameAtTime(muscleMotion.frames, controlSignalSeconds)

  const points = simulateProjectile({
    massKg: projectileMassKg,
    initialSpeed: tipSpeed,
    releaseAngleRad: muscleTip.angle,
    startHeightM: muscleReleaseHeight,
    dragEnabled: params.dragEnabled,
    dragCoefficient: params.dragCoefficient,
    areaCm2: params.areaCm2,
  })
  const maxHeight = Math.max(...points.map((point) => point.y))
  const lastPoint = points[points.length - 1]

  // 2. Motor drive — energy-matched torque at the knee, with reflected inertia.
  const motor = simulateMotorDrive({
    params,
    geom,
    momentArmM,
    sweepRad,
    initialHipRad,
    hipHeightM,
    payloadMassKg: projectileMassKg,
    basketMassKg,
    energyBudget: muscleWork,
    signalDurationSeconds: controlSignalSeconds,
    brakeStartSeconds,
    brakeEndSeconds,
    L1,
    L2,
  })

  return {
    mechanism: {
      armInertia,
      projectileInertia,
      forearmInertia: forearmRodInertia,
      frames: muscleMotion.frames,
      muscleTravelM: signalFrame.travelM,
      requiredTravelM: momentArmM * sweepRad,
      muscleWork,
      wastedEnergy: 0, // muscle is direct drive
      resistingWork: 0,
      lossWork: 0,
      launchEnergy: kineticEnergy,
      netTorque: signalFrame.torque,
      contractingTorque: 0,
      elongatingTorque: 0,
      angularSpeed: muscleRelease.omega2,
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
  geom,
  momentArmM,
  sweepRad,
  initialHipRad,
  hipHeightM,
  payloadMassKg,
  basketMassKg,
  energyBudget,
  signalDurationSeconds,
  brakeStartSeconds,
  brakeEndSeconds,
  L1,
  L2,
}: {
  params: DesignParams
  geom: LinkGeometry
  momentArmM: number
  sweepRad: number
  initialHipRad: number
  hipHeightM: number
  payloadMassKg: number
  basketMassKg: number
  energyBudget: number
  signalDurationSeconds: number
  brakeStartSeconds: number
  brakeEndSeconds: number
  L1: number
  L2: number
}): MotorResult {
  const outputSpeedLimit = ((params.motorNoLoadRpm / params.gearboxRatio) * 2 * Math.PI) / 60
  const rotorInertiaKgM2 = params.motorRotorInertiaGcm2 * 1e-7
  const reflectedInertia = rotorInertiaKgM2 * params.gearboxRatio ** 2
  const outputTorque = sweepRad > 0 ? energyBudget / sweepRad : 0

  let speedLimited = false

  const motion = simulateKneeDrive({
    geom,
    payloadMassKg,
    basketMassKg,
    momentArmM,
    sweepRad,
    initialHipRad,
    extraKneeInertia: reflectedInertia,
    signalDurationSeconds,
    brakeStartSeconds,
    brakeEndSeconds,
    kneeTorque: ({ kneeRate, signalOn, brakeOn }) => {
      if (signalOn) {
        if (kneeRate >= outputSpeedLimit) {
          speedLimited = true
          return 0
        }
        return outputTorque
      }
      if (brakeOn) return -outputTorque
      return -0.01
    },
  })

  const release = motion.release ?? fallbackRelease(motion.frames)
  const tip = tipVelocity(release, L1, L2)
  const releaseHeight = Math.max(0.01, tipHeight(release, L1, L2, hipHeightM))
  const tipSpeed = tip.speed
  const kneeRateRelease = release.omega2 - release.omega1
  const wastedEnergy = 0.5 * reflectedInertia * kneeRateRelease ** 2
  const launchEnergy = 0.5 * payloadMassKg * tipSpeed ** 2
  const rawWork = motion.work
  const baseBeta = pendulumCoeffs(geom, payloadMassKg + basketMassKg).beta

  const points = simulateProjectile({
    massKg: payloadMassKg,
    initialSpeed: tipSpeed,
    releaseAngleRad: tip.angle,
    startHeightM: releaseHeight,
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
    totalInertia: baseBeta + reflectedInertia,
    wastedEnergy,
    work: rawWork,
    launchEnergy,
    angularSpeed: release.omega2,
    tipSpeed,
    maxHeight,
    range: lastPoint.x,
    flightTime: lastPoint.t,
    speedLimited,
  }
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
