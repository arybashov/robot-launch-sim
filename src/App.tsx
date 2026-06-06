import { useEffect, useMemo, useRef, useState } from 'react'
import {
  comparisonMasses,
  initialParams,
  type DesignParams,
  type MotionFrame,
  type SimulationResult,
  simulateDesign,
} from './model/physics'
import './App.css'

type Lang = 'en' | 'ru'

function tr(lang: Lang, en: string, ru: string) {
  return lang === 'ru' ? ru : en
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function getFrameAtTime<T extends { t: number }>(frames: T[], time: number) {
  const lastFrame = frames[frames.length - 1]

  return frames.find((frame) => frame.t >= time) ?? lastFrame ?? frames[0]
}

function getFirstReleasedFrame<T extends { released?: boolean }>(frames: T[]) {
  return frames.find((frame) => frame.released) ?? frames[frames.length - 1]
}

function getPointAtTime(points: SimulationResult['points'], t: number) {
  return points.find((point) => point.t >= t) ?? points[points.length - 1] ?? points[0]
}

// ---- Two-link pendulum diagram geometry -----------------------------------
// The rig hangs from a fixed hip hinge (joint 2) near the top. Angles are
// measured from the downward vertical (CCW+), so a point at angle θ, distance d
// from a parent is (parent.x + d·sinθ, parent.y + d·cosθ) in SVG (y-down).
const ARM_SCALE = 5.15 // px per cm
const HIP = { x: 320, y: 72 } // ceiling-hinge position in the diagrams
const WORLD_SCALE = ARM_SCALE * 100 // px per metre (matches link scale)

function linkGeometry(frame: MotionFrame, params: DesignParams) {
  const L1px = params.upperLinkCm * ARM_SCALE
  const L2px = params.armLengthCm * ARM_SCALE
  const knee = {
    x: HIP.x + Math.sin(frame.hipRad) * L1px,
    y: HIP.y + Math.cos(frame.hipRad) * L1px,
  }
  const tip = {
    x: knee.x + Math.sin(frame.shankRad) * L2px,
    y: knee.y + Math.cos(frame.shankRad) * L2px,
  }
  return { knee, tip, L1px, L2px }
}

function useSimulationProgress(durationSeconds: number, speed: number) {
  const [progress, setProgress] = useState(0)
  const speedRef = useRef(speed)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    let frameId = 0
    let last = performance.now()
    let elapsed = 0
    const holdSeconds = 0.5
    const cycleSeconds = durationSeconds + holdSeconds

    const tick = (now: number) => {
      // Accumulate scaled real time so changing speed mid-play stays smooth
      // (cap dt to avoid a jump after the tab was backgrounded).
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      elapsed = (elapsed + dt * speedRef.current) % cycleSeconds
      setProgress(clamp01(elapsed / durationSeconds))
      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [durationSeconds])

  return progress
}

function PlaybackSpeedControl({
  speed,
  onChange,
  lang,
}: {
  speed: number
  onChange: (value: number) => void
  lang: Lang
}) {
  return (
    <div className="playback-speed">
      <span className="playback-speed-label">{tr(lang, 'Speed', 'Скорость')}</span>
      <input
        type="range"
        min={0.05}
        max={2}
        step={0.05}
        value={speed}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={tr(lang, 'Playback speed', 'Скорость проигрывания')}
      />
      <strong>{formatNumber(speed, 2)}×</strong>
    </div>
  )
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}) {
  return (
    <label className="control">
      <span>
        {label}
        <strong>
          {formatNumber(value, step < 1 ? 2 : 0)} {unit}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function CombinedTrajectoryPlot({
  title,
  musclePoints,
  motorPoints,
  muscleRange,
  motorRange,
  muscleMaxHeight,
  motorMaxHeight,
  progress,
  muscleLabel,
  motorLabel,
}: {
  title: string
  musclePoints: SimulationResult['points']
  motorPoints: SimulationResult['points']
  muscleRange: number
  motorRange: number
  muscleMaxHeight: number
  motorMaxHeight: number
  progress: number
  muscleLabel: string
  motorLabel: string
}) {
  const width = 640
  const height = 220
  const padding = 28
  const plotWidth = width - padding * 2
  const plotHeight = height - padding * 2

  // Determine physical bounds
  const maxPhysX = Math.max(muscleRange, motorRange, 0.15) * 1.05
  const maxPhysY = Math.max(muscleMaxHeight, motorMaxHeight, 0.15) * 1.10

  // Calculate scales (pixels per meter)
  const scaleX = plotWidth / maxPhysX
  const scaleY = plotHeight / maxPhysY

  // Enforce 1:1 aspect ratio by taking the smallest scale (most restrictive)
  const scale = Math.min(scaleX, scaleY)

  // Recalculate max values based on the uniform scale to draw grid correctly
  const maxX = plotWidth / scale
  const maxY = plotHeight / scale

  const xTicks = Array.from({ length: 5 }, (_, index) => {
    const value = (maxX * index) / 4
    const x = padding + value * scale
    return { value, x }
  })
  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const value = (maxY * index) / 3
    const y = height - padding - value * scale
    return { value, y }
  })

  const makePath = (points: SimulationResult['points']) => {
    if (!points || points.length === 0) return '';
    return points
      .map((point, index) => {
        const px = padding + point.x * scale
        const py = height - padding - point.y * scale
        return `${index === 0 ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`
      })
      .join(' ')
  }
  const musclePath = makePath(musclePoints)
  const motorPath = makePath(motorPoints)
  const muscleProgressIndex = Math.min(musclePoints.length - 1, Math.max(0, Math.floor(progress * (musclePoints.length - 1))))
  const motorProgressIndex = Math.min(motorPoints.length - 1, Math.max(0, Math.floor(progress * (motorPoints.length - 1))))
  const muscleActivePoint = musclePoints[muscleProgressIndex]
  const motorActivePoint = motorPoints[motorProgressIndex]
  const muscleActiveX = padding + muscleActivePoint.x * scale
  const muscleActiveY = height - padding - muscleActivePoint.y * scale
  const motorActiveX = padding + motorActivePoint.x * scale
  const motorActiveY = height - padding - motorActivePoint.y * scale

  return (
    <div className="plot-shell compact-plot">
      <div className="plot-title">
        {title}
        <span className="plot-legend">
          <span><i className="legend-dot muscle-dot" />{muscleLabel}</span>
          <span><i className="legend-dot motor-dot" />{motorLabel}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <rect className="plot-bg" x="0" y="0" width={width} height={height} />
        {xTicks.map((tick) => (
          <g key={`x-${tick.value}`}>
            <line className="grid-line" x1={tick.x} x2={tick.x} y1={padding} y2={height - padding} />
            <text className="axis-label" x={tick.x} y={height - 8} textAnchor="middle">
              {formatNumber(tick.value * 100, 0)}
            </text>
          </g>
        ))}
        {yTicks.map((tick) => (
          <g key={`y-${tick.value}`}>
            <line className="grid-line" x1={padding} x2={width - padding} y1={tick.y} y2={tick.y} />
            <text className="axis-label" x={padding - 8} y={tick.y + 4} textAnchor="end">
              {formatNumber(tick.value * 100, 0)}
            </text>
          </g>
        ))}
        <line className="axis-line" x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
        <line className="axis-line" x1={padding} x2={padding} y1={padding} y2={height - padding} />
        <text className="axis-unit" x={padding + 8} y={padding + 14}>
          cm
        </text>
        <path className="trajectory trajectory-muscle" d={musclePath} pathLength={1} style={{ strokeDashoffset: 1 - progress }} />
        <path className="trajectory trajectory-motor" d={motorPath} pathLength={1} style={{ strokeDashoffset: 1 - progress }} />
        <circle className="projectile" cx={muscleActiveX} cy={muscleActiveY} r="7" />
        <circle className="projectile motor-projectile" cx={motorActiveX} cy={motorActiveY} r="6" />
      </svg>
    </div>
  )
}

function EfficiencyPlot({
  title,
  params,
  result,
  lang,
}: {
  title: string
  params: DesignParams
  result: SimulationResult
  lang: Lang
}) {
  const width = 640
  const height = 220
  const massKg = params.projectileMassG / 1000
  const muscleUseful = 0.5 * massKg * result.mechanism.tipSpeed ** 2
  const motorUseful = 0.5 * massKg * result.motor.tipSpeed ** 2
  const muscleInput = Math.max(result.mechanism.muscleWork, muscleUseful, 0.001)
  const motorInput = Math.max(result.motor.rawWork, motorUseful, 0.001)
  const muscleEfficiency = muscleUseful / muscleInput
  const motorEfficiency = motorUseful / motorInput
  const inertiaPenalty = result.motor.totalInertia / Math.max(result.mechanism.armInertia, 0.000001)
  const rows = [
    {
      name: tr(lang, 'muscle', 'мышца'),
      useful: muscleUseful,
      input: muscleInput,
      efficiency: muscleEfficiency,
      y: 72,
      className: 'muscle-bar',
    },
    {
      name: tr(lang, 'motor', 'мотор'),
      useful: motorUseful,
      input: motorInput,
      efficiency: motorEfficiency,
      y: 142,
      className: 'motor-bar',
    },
  ]

  return (
    <div className="plot-shell compact-plot">
      <div className="plot-title">
        {title}
        <span className="plot-note">{tr(lang, 'projectile energy / drive work', 'энергия снаряда / работа привода')}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <rect className="plot-bg" x="0" y="0" width={width} height={height} />
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const x = 130 + tick * 390
          return (
            <g key={tick}>
              <line className="grid-line" x1={x} x2={x} y1="42" y2="170" />
              <text className="axis-label" x={x} y="194" textAnchor="middle">
                {formatNumber(tick * 100, 0)}%
              </text>
            </g>
          )
        })}
        {rows.map((row) => {
          const usefulWidth = Math.max(0, Math.min(390, row.efficiency * 390))
          return (
            <g key={row.name}>
              <text className="bar-label" x="32" y={row.y + 6}>
                {row.name}
              </text>
              <rect className="bar-track" x="130" y={row.y - 16} width="390" height="32" rx="5" />
              <rect className={`bar-fill ${row.className}`} x="130" y={row.y - 16} width={usefulWidth} height="32" rx="5" />
              <text className="bar-value" x="536" y={row.y + 6}>
                {formatNumber(row.efficiency * 100, 0)}%
              </text>
            </g>
          )
        })}
        <text className="efficiency-caption" x="32" y="210">
          {tr(lang, 'inertia penalty', 'штраф инерции')}: {formatNumber(inertiaPenalty, 1)}x
        </text>
      </svg>
    </div>
  )
}

function MechanismDiagram({
  params,
  result,
  simulationTime,
  playbackSpeed,
  onPlaybackSpeedChange,
  lang,
}: {
  params: DesignParams
  result: SimulationResult
  simulationTime: number
  playbackSpeed: number
  onPlaybackSpeedChange: (value: number) => void
  lang: Lang
}) {
  const width = 640
  const height = 400

  const motionFrame = getFrameAtTime(result.mechanism.frames, simulationTime)
  const releaseFrame = getFirstReleasedFrame(result.mechanism.frames)
  const projectileReleased = simulationTime >= releaseFrame.t

  const { knee, tip, L1px } = linkGeometry(motionFrame, params)
  const releaseGeo = linkGeometry(releaseFrame, params)

  // Unit directions along / across the two links (SVG, y-down).
  const thighUx = Math.sin(motionFrame.hipRad)
  const thighUy = Math.cos(motionFrame.hipRad)
  const thighNx = Math.cos(motionFrame.hipRad)
  const thighNy = -Math.sin(motionFrame.hipRad)
  const shankUx = Math.sin(motionFrame.shankRad)
  const shankUy = Math.cos(motionFrame.shankRad)
  const shankNx = Math.cos(motionFrame.shankRad)
  const shankNy = -Math.sin(motionFrame.shankRad)

  const pinDist = Math.min(params.muscleAttachCm, params.armLengthCm) * ARM_SCALE
  const originDist = L1px * 0.85 // muscle ends sit high on the thigh, near hip hinge (joint 2)
  const pinOffset = 13 // spread the two shank pins (joints 3 & 4) further apart
  const originOffset = 7
  // Muscle insertions on the shank (just below the knee) and origins on the thigh.
  const frontPin = { x: knee.x + shankUx * pinDist + shankNx * pinOffset, y: knee.y + shankUy * pinDist + shankNy * pinOffset }
  const rearPin = { x: knee.x + shankUx * pinDist - shankNx * pinOffset, y: knee.y + shankUy * pinDist - shankNy * pinOffset }
  const frontOrigin = { x: knee.x - thighUx * originDist + thighNx * originOffset, y: knee.y - thighUy * originDist + thighNy * originOffset }
  const rearOrigin = { x: knee.x - thighUx * originDist - thighNx * originOffset, y: knee.y - thighUy * originDist - thighNy * originOffset }

  const extensorLengthCm = Math.hypot(frontPin.x - frontOrigin.x, frontPin.y - frontOrigin.y) / ARM_SCALE
  const flexorLengthCm = Math.hypot(rearPin.x - rearOrigin.x, rearPin.y - rearOrigin.y) / ARM_SCALE

  const projectilePoint = getPointAtTime(result.points, Math.max(0, simulationTime - releaseFrame.t))
  const releaseHeightM = result.points[0]?.y ?? 0
  const projectileX = projectileReleased ? releaseGeo.tip.x + projectilePoint.x * WORLD_SCALE : tip.x
  const projectileY = projectileReleased
    ? releaseGeo.tip.y - (projectilePoint.y - releaseHeightM) * WORLD_SCALE
    : tip.y

  const contractingActive = (simulationTime <= params.controlSignalMs / 1000 && motionFrame.travelM < (params.frontMuscleLengthCm * 0.25) / 100) || (simulationTime >= params.brakeStartMs / 1000 && simulationTime <= params.brakeEndMs / 1000)
  const elongatingActive = simulationTime >= params.brakeStartMs / 1000 && simulationTime <= params.brakeEndMs / 1000

  // Numbered joints. 1 = free knee, 2 = fixed hip hinge, 3/4 = muscle pins.
  const joints = [
    { n: 1, x: knee.x, y: knee.y, bx: knee.x - 34, by: knee.y - 6 },
    { n: 2, x: HIP.x, y: HIP.y, bx: HIP.x - 30, by: HIP.y + 4 },
    { n: 3, x: frontPin.x, y: frontPin.y, bx: knee.x + shankUx * 56 + shankNx * 26, by: knee.y + shankUy * 56 + shankNy * 26 },
    { n: 4, x: rearPin.x, y: rearPin.y, bx: knee.x + shankUx * 56 - shankNx * 26, by: knee.y + shankUy * 56 - shankNy * 26 },
  ]

  return (
    <div className="diagram-shell">
      <PlaybackSpeedControl speed={playbackSpeed} onChange={onPlaybackSpeedChange} lang={lang} />
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lever mechanism diagram">
        <defs>
          <marker id="arrowhead" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M 0 0 L 8 4 L 0 8 z" />
          </marker>
        </defs>
        <rect className="diagram-bg" x="0" y="0" width={width} height={height} />
        
        {/* Ground Line */}
        <line x1="0" y1={height - 20} x2={width} y2={height - 20} stroke="#444" strokeWidth="2" strokeDasharray="5,5" />
        <text x="10" y={height - 5} fill="#666" fontSize="12">Ground Level</text>

        <text className="diagram-title" x="28" y="34">
          Antagonistic muscle pair
        </text>
        <text className="diagram-note" x="28" y="58">
          Torque comes from tension difference, not from a motor mounted on the pivot.
        </text>

        {/* Top suspension mount: the rig hangs from the fixed hip hinge */}
        <line x1="120" y1="34" x2="520" y2="34" stroke="#555" strokeWidth="6" strokeLinecap="round" />
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`hatch-${i}`} x1={132 + i * 42} y1="34" x2={120 + i * 42} y2="22" stroke="#555" strokeWidth="3" />
        ))}
        <line x1={HIP.x} y1="34" x2={HIP.x} y2={HIP.y} stroke="#777" strokeWidth="4" />
        <circle cx={HIP.x} cy="34" r="5" fill="#777" />

        {/* Two-link pendulum: thigh (hip→knee) + shank (knee→tip) */}
        <line className="upper-arm-line" x1={HIP.x} y1={HIP.y} x2={knee.x} y2={knee.y} />
        <line className="forearm-shell" x1={knee.x} y1={knee.y} x2={tip.x} y2={tip.y} />
        <line className="arm-line" x1={knee.x} y1={knee.y} x2={tip.x} y2={tip.y} />

        {/* Muscles crossing the knee: extensor (front) + flexor (rear) */}
        <line
          className="muscle-line"
          x1={frontOrigin.x} y1={frontOrigin.y} x2={frontPin.x} y2={frontPin.y}
          style={{ stroke: contractingActive ? '#ff8c00' : '#4a9eff', strokeWidth: contractingActive ? 8 : 4, transition: 'stroke 0.1s' }}
        />
        <line
          className="muscle-line"
          x1={rearOrigin.x} y1={rearOrigin.y} x2={rearPin.x} y2={rearPin.y}
          style={{ stroke: elongatingActive ? '#ff8c00' : '#4a9eff', strokeWidth: elongatingActive ? 8 : 4, transition: 'stroke 0.1s' }}
        />

        {/* Hip hinge (fixed, joint 2) */}
        <circle className="shoulder-joint" cx={HIP.x} cy={HIP.y} r="11" />
        {/* Free knee (joint 1) */}
        <circle className="elbow-joint" cx={knee.x} cy={knee.y} r="13" />
        <circle className="pivot" cx={knee.x} cy={knee.y} r="6" />
        {/* Muscle pins */}
        <circle className="attach-dot" cx={frontPin.x} cy={frontPin.y} r="6" />
        <circle className="attach-dot rear-attach-dot" cx={rearPin.x} cy={rearPin.y} r="6" />
        <circle className="mount-dot contracting-mount" cx={frontOrigin.x} cy={frontOrigin.y} r="5" />
        <circle className="mount-dot" cx={rearOrigin.x} cy={rearOrigin.y} r="5" />
        {projectileReleased && <circle className="wrist-dot" cx={tip.x} cy={tip.y} r="6" />}
        <circle className={projectileReleased ? 'payload-dot released-payload' : 'payload-dot'} cx={projectileX} cy={projectileY} r="13" />

        {/* Joint key */}
        <g className="joint-key">
          {[
            'free knee (joint 1)',
            'hip hinge — fixed (joint 2)',
            'extensor pin (shank)',
            'flexor pin (shank)',
          ].map((label, i) => (
            <g key={`key-${i}`} transform={`translate(28, ${88 + i * 26})`}>
              <circle cx="9" cy="9" r="9" fill="#10151f" stroke="#ff8c00" strokeWidth="2" />
              <text x="9" y="13" textAnchor="middle" fontSize="11" fontWeight="700" fill="#ffb259">{i + 1}</text>
              <text x="26" y="13" fontSize="12" fill="#aab4c4">{label}</text>
            </g>
          ))}
        </g>

        {/* Numbered joints */}
        {joints.map((j) => (
          <g key={`joint-${j.n}`} className="joint-badge">
            <line x1={j.x} y1={j.y} x2={j.bx} y2={j.by} stroke="#ff8c00" strokeWidth="1.5" />
            <circle cx={j.bx} cy={j.by} r="10" fill="#10151f" stroke="#ff8c00" strokeWidth="2" />
            <text x={j.bx} y={j.by + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#ffb259">{j.n}</text>
          </g>
        ))}

        <g className="diagram-stats">
          <rect x="500" y="82" width="184" height="132" rx="8" />
          <text x="516" y="112" style={{ fontWeight: 'bold', fill: '#ff8c00' }}>Festo DMSP-20</text>
          <text x="516" y="140">knee torque: {formatNumber(motionFrame.torque, 2)} Nm</text>
          <text x="516" y="168">tip speed: {formatNumber(result.mechanism.tipSpeed, 2)} m/s</text>
          <text x="516" y="196">muscle work: {formatNumber(result.mechanism.muscleWork, 3)} J</text>
        </g>

        <text className="dimension-label" x="78" y="372">
          flexor length: {formatNumber(flexorLengthCm, 1)} cm
        </text>
        <text className="dimension-label" x="442" y="372">
          extensor length: {formatNumber(extensorLengthCm, 1)} cm
        </text>
      </svg>
    </div>
  )
}

function MotorDiagram({
  params,
  result,
  simulationTime,
  playbackSpeed,
  onPlaybackSpeedChange,
  lang,
}: {
  params: DesignParams
  result: SimulationResult
  simulationTime: number
  playbackSpeed: number
  onPlaybackSpeedChange: (value: number) => void
  lang: Lang
}) {
  const width = 640
  const height = 400

  const motionFrame = getFrameAtTime(result.motor.frames, simulationTime)
  const releaseFrame = getFirstReleasedFrame(result.motor.frames)
  const projectileReleased = simulationTime >= releaseFrame.t

  const { knee, tip } = linkGeometry(motionFrame, params)
  const releaseGeo = linkGeometry(releaseFrame, params)
  const motorGearRadius = 30

  const projectilePoint = getPointAtTime(result.motor.points, Math.max(0, simulationTime - releaseFrame.t))
  const releaseHeightM = result.motor.points[0]?.y ?? 0
  const projectileX = projectileReleased ? releaseGeo.tip.x + projectilePoint.x * WORLD_SCALE : tip.x
  const projectileY = projectileReleased
    ? releaseGeo.tip.y - (projectilePoint.y - releaseHeightM) * WORLD_SCALE
    : tip.y

  return (
    <div className="diagram-shell">
      <PlaybackSpeedControl speed={playbackSpeed} onChange={onPlaybackSpeedChange} lang={lang} />
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Motor drive diagram">
        <defs>
          <marker id="motor-arrowhead" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M 0 0 L 8 4 L 0 8 z" />
          </marker>
        </defs>
        <rect className="diagram-bg" x="0" y="0" width={width} height={height} />
        
        {/* Ground Line */}
        <line x1="0" y1={height - 20} x2={width} y2={height - 20} stroke="#444" strokeWidth="2" strokeDasharray="5,5" />
        <text x="10" y={height - 5} fill="#666" fontSize="12">Ground Level</text>

        <text className="diagram-title" x="28" y="34">Motor at the knee</text>
        <text className="diagram-note" x="28" y="58">
          Torque is generated through a gearbox mounted at the knee (joint 1).
        </text>

        {/* Top suspension mount: the rig hangs from the fixed hip hinge */}
        <line x1="120" y1="34" x2="520" y2="34" stroke="#555" strokeWidth="6" strokeLinecap="round" />
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`hatch-${i}`} x1={132 + i * 42} y1="34" x2={120 + i * 42} y2="22" stroke="#555" strokeWidth="3" />
        ))}
        <line x1={HIP.x} y1="34" x2={HIP.x} y2={HIP.y} stroke="#777" strokeWidth="4" />
        <circle cx={HIP.x} cy="34" r="5" fill="#777" />

        {/* Two-link pendulum: thigh (hip→knee) + shank (knee→tip) */}
        <line className="upper-arm-line" x1={HIP.x} y1={HIP.y} x2={knee.x} y2={knee.y} />
        <line className="forearm-shell" x1={knee.x} y1={knee.y} x2={tip.x} y2={tip.y} />
        <line className="arm-line" x1={knee.x} y1={knee.y} x2={tip.x} y2={tip.y} />
        <circle className="shoulder-joint" cx={HIP.x} cy={HIP.y} r="11" />
        <circle className="motor-gear-unit" cx={knee.x} cy={knee.y} r={motorGearRadius} />
        <circle className="elbow-joint motor-elbow-joint" cx={knee.x} cy={knee.y} r="14" />
        {projectileReleased && <circle className="wrist-dot" cx={tip.x} cy={tip.y} r="6" />}
        <circle className={projectileReleased ? 'payload-dot released-payload' : 'payload-dot'} cx={projectileX} cy={projectileY} r="13" />
        <text className="diagram-label" x={HIP.x - 96} y={HIP.y + 4}>hip hinge</text>
        <text className="diagram-label" x={knee.x + motorGearRadius + 6} y={knee.y + 4}>motor + gearbox</text>

        <g className="diagram-stats">
          <rect x="414" y="82" width="194" height="158" rx="8" />
          <text x="430" y="112">out torque: {formatNumber(result.motor.outputTorque, 3)} Nm</text>
          <text x="430" y="140">out speed: {formatNumber(result.motor.outputSpeedLimit, 1)} rad/s</text>
          <text x="430" y="168">ref inertia: {formatNumber(result.motor.reflectedInertia, 5)}</text>
          <text x="430" y="196">tip speed: {formatNumber(result.motor.tipSpeed, 2)} m/s</text>
          <text x="430" y="224">{result.motor.speedLimited ? 'speed limited' : 'energy limited'}</text>
        </g>
      </svg>
    </div>
  )
}

function DiagramLegend({ lang }: { lang: Lang }) {
  return (
    <div className="legend-strip">
      <div><span className="swatch swatch-arm" /> {tr(lang, 'lever / active arm', 'рычаг')}</div>
      <div><span className="swatch swatch-start" /> {tr(lang, 'start position', 'стартовое положение')}</div>
      <div><span className="swatch swatch-contract" /> {tr(lang, 'contracting muscle', 'сокращающаяся мышца')}</div>
      <div><span className="swatch swatch-elongate" /> {tr(lang, 'elongating / return muscle', 'растяжение / возврат')}</div>
      <div><span className="swatch swatch-payload" /> {tr(lang, 'payload', 'снаряд')}</div>
      <div><span className="swatch swatch-motor" /> {tr(lang, 'motor / gearbox', 'мотор / редуктор')}</div>
    </div>
  )
}

function DriveTradeoff({ result, lang }: { result: SimulationResult; lang: Lang }) {
  const inertiaRatio =
    result.mechanism.armInertia > 0
      ? result.motor.reflectedInertia / result.mechanism.armInertia
      : 0
  const speedRatio =
    result.motor.tipSpeed > 0 ? result.mechanism.tipSpeed / result.motor.tipSpeed : 0

  return (
    <section className="panel tradeoff-panel">
      <div className="tradeoff-header">
        <div>
          <h2>{tr(lang, 'Why the muscle pair can win', 'Почему мышечная пара может выиграть')}</h2>
          <p>{tr(lang, 'Both systems try to create a short angular impulse, but they pay different penalties.', 'Обе схемы создают короткий угловой импульс, но платят за это разными потерями.')}</p>
        </div>
      </div>

      <div className="tradeoff-grid">
        <div className="tradeoff-card muscle-card">
          <h3>{tr(lang, 'Muscle pair path', 'Путь мышечной пары')}</h3>
          <div className="flow-row">
            <span>{tr(lang, 'remote tension', 'натяжение сбоку')}</span>
            <span>{tr(lang, 'light pulley', 'легкая ось')}</span>
            <span>{tr(lang, 'short impulse', 'короткий импульс')}</span>
            <span>{tr(lang, 'fast lever', 'быстрый рычаг')}</span>
          </div>
          <p>
            {tr(lang, 'The force source sits away from the pivot. The pivot mostly sees the pulley and arm, so the energy goes into the lever instead of spinning a heavy drive train.', 'Источник силы вынесен от оси. На оси в основном шкив и рычаг, поэтому энергия уходит в бросок, а не в раскрутку тяжелого привода.')}
          </p>
        </div>

        <div className="tradeoff-card motor-card">
          <h3>{tr(lang, 'Motor path', 'Путь мотора')}</h3>
          <div className="flow-row">
            <span>{tr(lang, 'motor torque', 'момент мотора')}</span>
            <span>{tr(lang, 'gearbox', 'редуктор')}</span>
            <span>{tr(lang, 'speed cap', 'предел скорости')}</span>
            <span>{tr(lang, 'reflected inertia', 'инерция редуктора')}</span>
          </div>
          <p>
            {tr(lang, 'To get enough torque, the motor usually needs reduction. The reduction multiplies torque, but it divides output speed and reflects rotor inertia into the pivot.', 'Чтобы получить момент, мотору нужен редуктор. Он умножает момент, но режет скорость и добавляет отраженную инерцию на ось.')}
          </p>
        </div>
      </div>

      <div className="penalty-grid">
        <div>
          <span>{tr(lang, 'Motor reflected inertia / arm inertia', 'Инерция мотора / инерция рычага')}</span>
          <strong>{formatNumber(inertiaRatio, 1)}x</strong>
        </div>
        <div>
          <span>{tr(lang, 'Muscle tip speed / motor tip speed', 'Скорость мышц / скорость мотора')}</span>
          <strong>{formatNumber(speedRatio, 1)}x</strong>
        </div>
        <div>
          <span>{tr(lang, 'Motor output speed cap', 'Предел скорости мотора')}</span>
          <strong>{formatNumber(result.motor.outputSpeedLimit, 1)} rad/s</strong>
        </div>
        <div>
          <span>{tr(lang, 'Muscle net torque', 'Чистый момент мышц')}</span>
          <strong>{formatNumber(result.mechanism.netTorque, 3)} Nm</strong>
        </div>
      </div>
    </section>
  )
}

function App() {
  const [lang, setLang] = useState<Lang>('en')
  const [params, setParams] = useState(initialParams)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const result = useMemo(() => simulateDesign(params), [params])
  const muscleMotionTime = result.mechanism.frames.at(-1)?.t ?? 0
  const motorMotionTime = result.motor.frames.at(-1)?.t ?? 0
  const muscleReleaseTime = getFirstReleasedFrame(result.mechanism.frames)?.t ?? 0
  const motorReleaseTime = getFirstReleasedFrame(result.motor.frames)?.t ?? 0
  const muscleFlightEndTime = muscleReleaseTime + result.flightTime
  const motorFlightEndTime = motorReleaseTime + result.motor.flightTime
  const simulationDuration = Math.max(0.45, Math.min(5, Math.max(muscleMotionTime, motorMotionTime, muscleFlightEndTime, motorFlightEndTime)))
  const simulationProgress = useSimulationProgress(simulationDuration, playbackSpeed)
  const simulationTime = simulationProgress * simulationDuration
  const muscleTrajectoryProgress = simulationProgress
  const comparisons = useMemo(
    () =>
      comparisonMasses.map((projectileMassG) => ({
        projectileMassG,
        result: simulateDesign({ ...params, projectileMassG }),
      })),
    [params],
  )

  const updateParam = <K extends keyof DesignParams>(key: K, value: DesignParams[K]) => {
    setParams((current) => ({ ...current, [key]: value }))
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">{tr(lang, 'Mechanism-first launch model', 'Модель конструкции и броска')}</p>
          <h1>{tr(lang, 'Impulse drive simulator', 'Симулятор импульсного привода')}</h1>
        </div>
        <div className="topbar-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <a
            href="./whitepaper.html"
            className="whitepaper-button"
          >
            {tr(lang, '📄 Whitepaper', '📄 Формулы')}
          </a>
          <div className="language-toggle" aria-label="Language">
            <button className={lang === 'en' ? 'active' : ''} type="button" onClick={() => setLang('en')}>EN</button>
            <button className={lang === 'ru' ? 'active' : ''} type="button" onClick={() => setLang('ru')}>RU</button>
          </div>
          <button className="reset-button" type="button" onClick={() => setParams(initialParams)}>
            {tr(lang, 'Reset', 'Сброс')}
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel controls-panel">
          <h2>{tr(lang, 'Payload', 'Снаряд')}</h2>
          <RangeControl label={tr(lang, 'Object mass', 'Масса объекта')} value={params.projectileMassG} min={5} max={60} step={1} unit="g" onChange={(value) => updateParam('projectileMassG', value)} />

          <h2>{tr(lang, 'Pendulum (hip + knee)', 'Маятник (бедро + колено)')}</h2>
          <RangeControl label={tr(lang, 'Hip start angle', 'Стартовый угол бедра')} value={params.baseAngleDeg} min={-90} max={90} step={5} unit="deg" onChange={(value) => updateParam('baseAngleDeg', value)} />
          <RangeControl label={tr(lang, 'Thigh length', 'Длина бедра')} value={params.upperLinkCm} min={8} max={40} step={0.5} unit="cm" onChange={(value) => updateParam('upperLinkCm', value)} />
          <RangeControl label={tr(lang, 'Thigh mass', 'Масса бедра')} value={params.upperLinkMassG} min={5} max={200} step={5} unit="g" onChange={(value) => updateParam('upperLinkMassG', value)} />
          <RangeControl label={tr(lang, 'Shank length', 'Длина голени')} value={params.armLengthCm} min={15} max={45} step={0.5} unit="cm" onChange={(value) => updateParam('armLengthCm', value)} />
          <RangeControl label={tr(lang, 'Shank mass', 'Масса голени')} value={params.armMassG} min={1} max={80} step={1} unit="g" onChange={(value) => updateParam('armMassG', value)} />
          <RangeControl label={tr(lang, 'Knee sweep', 'Ход колена')} value={params.sweepDeg} min={5} max={150} step={1} unit="deg" onChange={(value) => updateParam('sweepDeg', value)} />

          <h2>{tr(lang, 'Muscle pair (Festo DMSP-20)', 'Пара мышц (Festo DMSP-20)')}</h2>
          <div style={{ fontSize: '0.85em', color: '#888', marginBottom: '12px' }}>
            {tr(lang, 'Simulating fluidic muscle: Max 1500N at 6 bar, max stroke 25% of length.', 'Симуляция пневмомышцы: Пик 1500N при 6 бар, макс. ход 25% от длины.')}
          </div>
          <RangeControl label={tr(lang, 'Front muscle L', 'Длина передней мышцы')} value={params.frontMuscleLengthCm} min={10} max={60} step={0.5} unit="cm" onChange={(value) => updateParam('frontMuscleLengthCm', value)} />
          <RangeControl label={tr(lang, 'Rear muscle L', 'Длина задней мышцы')} value={params.rearMuscleLengthCm} min={10} max={60} step={0.5} unit="cm" onChange={(value) => updateParam('rearMuscleLengthCm', value)} />
          <RangeControl label={tr(lang, 'Attach point', 'Точка крепления')} value={params.muscleAttachCm} min={1} max={Math.min(params.armLengthCm, 12)} step={0.1} unit="cm" onChange={(value) => updateParam('muscleAttachCm', value)} />

          <h2>{tr(lang, 'Control signal', 'Управляющий сигнал')}</h2>
          <RangeControl label={tr(lang, 'Impulse length', 'Длина импульса')} value={params.controlSignalMs} min={50} max={2000} step={50} unit="ms" onChange={(value) => updateParam('controlSignalMs', value)} />
          <RangeControl label={tr(lang, 'Brake START', 'Начало торможения')} value={params.brakeStartMs} min={0} max={2000} step={25} unit="ms" onChange={(value) => updateParam('brakeStartMs', value)} />
          <RangeControl label={tr(lang, 'Brake END', 'Конец торможения')} value={params.brakeEndMs} min={0} max={3000} step={25} unit="ms" onChange={(value) => updateParam('brakeEndMs', value)} />

          <h2>{tr(lang, 'Motor reference', 'Сравнение с мотором')}</h2>
          <RangeControl label={tr(lang, 'Motor torque', 'Момент мотора')} value={params.motorTorqueNcm} min={1} max={100} step={1} unit="Ncm" onChange={(value) => updateParam('motorTorqueNcm', value)} />
          <RangeControl label={tr(lang, 'Gearbox ratio', 'Передаточное число')} value={params.gearboxRatio} min={1} max={150} step={1} unit=":1" onChange={(value) => updateParam('gearboxRatio', value)} />
        </aside>

        <section className="main-column">
          <div className="overview-grid">
            <div className="sim-column">
              <MechanismDiagram params={params} result={result} simulationTime={simulationTime} playbackSpeed={playbackSpeed} onPlaybackSpeedChange={setPlaybackSpeed} lang={lang} />
              <CombinedTrajectoryPlot
                title={tr(lang, 'Throw trajectory', 'Траектория броска')}
                musclePoints={result.points}
                motorPoints={result.motor.points}
                muscleRange={result.range}
                motorRange={result.motor.range}
                muscleMaxHeight={result.maxHeight}
                motorMaxHeight={result.motor.maxHeight}
                progress={muscleTrajectoryProgress}
                muscleLabel={tr(lang, 'muscle', 'мышца')}
                motorLabel={tr(lang, 'motor', 'мотор')}
              />
            </div>
            <div className="sim-column">
              <MotorDiagram params={params} result={result} simulationTime={simulationTime} playbackSpeed={playbackSpeed} onPlaybackSpeedChange={setPlaybackSpeed} lang={lang} />
              <EfficiencyPlot title={tr(lang, 'Launch efficiency', 'КПД броска')} params={params} result={result} lang={lang} />
            </div>
            <DiagramLegend lang={lang} />
          </div>

          <DriveTradeoff result={result} lang={lang} />

          <div className="metrics-grid">
            <div className="metric">
              <span>{tr(lang, 'Muscle work', 'Работа мышц')}</span>
              <strong>{formatNumber(result.mechanism.muscleWork, 3)} J</strong>
            </div>
            <div className="metric">
              <span>{tr(lang, 'Launch energy', 'Энергия броска')}</span>
              <strong>{formatNumber(result.mechanism.launchEnergy, 3)} J</strong>
            </div>
            <div className="metric">
              <span>{tr(lang, 'Net torque', 'Чистый момент')}</span>
              <strong>{formatNumber(result.mechanism.netTorque, 3)} Nm</strong>
            </div>
            <div className="metric">
              <span>{tr(lang, 'Inertia', 'Инерция')}</span>
              <strong>{formatNumber(result.mechanism.armInertia, 5)} kgm2</strong>
            </div>
            <div className="metric">
              <span>{tr(lang, 'Resisting work', 'Работа сопротивления')}</span>
              <strong>{formatNumber(result.mechanism.resistingWork, 3)} J</strong>
            </div>
            <div className="metric">
              <span>{tr(lang, 'Muscle travel', 'Ход мышцы')}</span>
              <strong>{formatNumber(result.mechanism.muscleTravelM * 1000, 0)} mm</strong>
            </div>
            <div className="metric">
              <span>{tr(lang, 'Tip speed', 'Скорость конца')}</span>
              <strong>{formatNumber(result.initialSpeed)} m/s</strong>
            </div>
            <div className="metric">
              <span>{tr(lang, 'Max height', 'Макс. высота')}</span>
              <strong>{formatNumber(result.maxHeight * 100, 1)} cm</strong>
            </div>
            <div className="metric">
              <span>{tr(lang, 'Range', 'Дальность')}</span>
              <strong>{formatNumber(result.range * 100, 1)} cm</strong>
            </div>
            <div className="metric">
              <span>{tr(lang, 'Flight time', 'Время полета')}</span>
              <strong>{formatNumber(result.flightTime, 3)} s</strong>
            </div>
          </div>

          <section className="panel comparison-panel">
            <h2>{tr(lang, 'Festo DMSP-20 vs Motor', 'Festo DMSP-20 против мотора')}</h2>
            <div className="comparison-cards">
              <div>
                <span>{tr(lang, 'Muscle pair advantage', 'Преимущество мышечной пары')}</span>
                <strong>{tr(lang, 'Remote force source, low pivot inertia, direct impulse storage in fibers', 'Источник силы вынесен, инерция оси ниже, импульс запасается в волокнах')}</strong>
              </div>
              <div>
                <span>{tr(lang, 'Motor weak point', 'Слабое место мотора')}</span>
                <strong>{tr(lang, 'Torque needs reduction, reduction lowers output speed and reflects rotor inertia', 'Момент требует редуктора, редуктор снижает скорость и добавляет инерцию ротора')}</strong>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tr(lang, 'Drive', 'Привод')}</th>
                    <th>{tr(lang, 'Torque', 'Момент')}</th>
                    <th>{tr(lang, 'Added inertia', 'Добавленная инерция')}</th>
                    <th>{tr(lang, 'Wasted energy', 'Потери (инерция)')}</th>
                    <th>{tr(lang, 'Energy used', 'Энергия')}</th>
                    <th>{tr(lang, 'Tip speed', 'Скорость конца')}</th>
                    <th>{tr(lang, 'Height', 'Высота')}</th>
                    <th>{tr(lang, 'Failure mode', 'Ограничение')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{tr(lang, 'Muscle pair', 'Мышечная пара')}</td>
                    <td>{formatNumber(result.mechanism.netTorque, 3)} Nm</td>
                    <td>{tr(lang, 'near pivot only', 'только у оси')}</td>
                    <td>{formatNumber(result.mechanism.wastedEnergy, 3)} J</td>
                    <td>{formatNumber(result.mechanism.launchEnergy, 3)} J</td>
                    <td>{formatNumber(result.mechanism.tipSpeed, 2)} m/s</td>
                    <td>{formatNumber(result.maxHeight * 100, 1)} cm</td>
                    <td>{tr(lang, 'preload and stroke losses', 'преднатяг и потери хода')}</td>
                  </tr>
                  <tr>
                    <td>{tr(lang, 'Motor', 'Мотор')}</td>
                    <td>{formatNumber(result.motor.outputTorque, 3)} Nm</td>
                    <td>{formatNumber(result.motor.reflectedInertia, 5)} kgm2</td>
                    <td>{formatNumber(result.motor.wastedEnergy, 3)} J</td>
                    <td>{formatNumber(result.motor.launchEnergy, 3)} J</td>
                    <td>{formatNumber(result.motor.tipSpeed, 2)} m/s</td>
                    <td>{formatNumber(result.motor.maxHeight * 100, 1)} cm</td>
                    <td>{result.motor.speedLimited ? tr(lang, 'gearbox speed limit', 'предел скорости редуктора') : tr(lang, 'energy/inertia limit', 'лимит энергии/инерции')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel comparison-panel">
            <h2>{tr(lang, 'Mass sensitivity', 'Чувствительность к массе')}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tr(lang, 'Mass', 'Масса')}</th>
                    <th>{tr(lang, 'Tip speed', 'Скорость конца')}</th>
                    <th>{tr(lang, 'Height', 'Высота')}</th>
                    <th>{tr(lang, 'Range', 'Дальность')}</th>
                    <th>{tr(lang, 'Launch energy', 'Энергия броска')}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((item) => (
                    <tr key={item.projectileMassG}>
                      <td>{item.projectileMassG} g</td>
                      <td>{formatNumber(item.result.initialSpeed)} m/s</td>
                      <td>{formatNumber(item.result.maxHeight * 100, 1)} cm</td>
                      <td>{formatNumber(item.result.range * 100, 1)} cm</td>
                      <td>{formatNumber(item.result.mechanism.launchEnergy, 3)} J</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </section>
    </main>
  )
}

export default App
