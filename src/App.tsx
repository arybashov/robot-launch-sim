import { useEffect, useMemo, useState } from 'react'
import {
  comparisonMasses,
  initialParams,
  type DesignParams,
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

function useSimulationProgress(durationSeconds: number) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frameId = 0
    const startedAt = performance.now()

    const tick = (now: number) => {
      const holdSeconds = 0.5
      const cycleSeconds = durationSeconds + holdSeconds
      const phase = ((now - startedAt) / 1000) % cycleSeconds
      setProgress(clamp01(phase / durationSeconds))
      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [durationSeconds])

  return progress
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
}: {
  params: DesignParams
  result: SimulationResult
  simulationTime: number
}) {
  const width = 640
  const height = 400
  const pivotX = 250
  const pivotY = 250
  const pointFromPivot = (angleRad: number, distance: number) => ({
    x: pivotX + Math.cos(angleRad) * distance,
    y: pivotY - Math.sin(angleRad) * distance,
  })
  
  const baseRotationRad = (-params.baseAngleDeg * Math.PI) / 180
  const shoulderRad = Math.PI + baseRotationRad
  const shoulder = pointFromPivot(shoulderRad, 170)
  const shoulderNormalRad = shoulderRad + Math.PI / 2
  const leftAnchor = {
    x: shoulder.x + Math.cos(shoulderNormalRad) * 7,
    y: shoulder.y - Math.sin(shoulderNormalRad) * 7,
  }
  const rightAnchor = {
    x: shoulder.x - Math.cos(shoulderNormalRad) * 7,
    y: shoulder.y + Math.sin(shoulderNormalRad) * 7,
  }
  const armScale = 5.15
  const armLength = params.armLengthCm * armScale
  const releaseRad = Math.PI / 2 + baseRotationRad
  const motionFrame = getFrameAtTime(result.mechanism.frames, simulationTime)
  const releaseFrame = getFirstReleasedFrame(result.mechanism.frames)
  const projectileReleased = simulationTime >= releaseFrame.t
  const currentRad = releaseRad + motionFrame.angleRad
  const armEndX = pivotX + Math.cos(currentRad) * armLength
  const armEndY = pivotY - Math.sin(currentRad) * armLength
  const releaseEndX = pivotX + Math.cos(releaseRad) * armLength
  const releaseEndY = pivotY - Math.sin(releaseRad) * armLength
  const attachDistance = Math.min(params.muscleAttachCm, params.armLengthCm) * armScale
  const attachX = pivotX + Math.cos(currentRad) * attachDistance
  const attachY = pivotY - Math.sin(currentRad) * attachDistance
  const rearAttachX = pivotX - Math.cos(currentRad) * attachDistance
  const rearAttachY = pivotY + Math.sin(currentRad) * attachDistance
  const contractingLengthCm = Math.hypot(rightAnchor.x - attachX, rightAnchor.y - attachY) / armScale
  const elongatingLengthCm = Math.hypot(rearAttachX - leftAnchor.x, rearAttachY - leftAnchor.y) / armScale
  const projectileScale = armScale * 100
  const releaseHeightM = Math.max(0.01, params.pivotHeightCm / 100 + Math.sin(releaseRad) * (params.armLengthCm / 100))
  const projectilePoint = getPointAtTime(result.points, Math.max(0, simulationTime - releaseFrame.t))
  const projectileX = projectileReleased ? releaseEndX + projectilePoint.x * projectileScale : armEndX
  const projectileY = projectileReleased
    ? releaseEndY - (projectilePoint.y - releaseHeightM) * projectileScale
    : armEndY

  const contractingActive = (simulationTime <= params.controlSignalMs / 1000 && motionFrame.travelM < (params.frontMuscleLengthCm * 0.25) / 100) || (simulationTime >= params.brakeStartMs / 1000 && simulationTime <= params.brakeEndMs / 1000)
  const elongatingActive = simulationTime >= params.brakeStartMs / 1000 && simulationTime <= params.brakeEndMs / 1000

  return (
    <div className="diagram-shell">
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
        <line className="upper-arm-line" x1={shoulder.x} y1={shoulder.y} x2={pivotX} y2={pivotY} />
        <circle className="shoulder-joint" cx={shoulder.x} cy={shoulder.y} r="11" />
        <circle className="elbow-joint" cx={pivotX} cy={pivotY} r="22" />
        <line 
          className="muscle-line" 
          x1={leftAnchor.x} y1={leftAnchor.y} x2={rearAttachX} y2={rearAttachY} 
          style={{ stroke: elongatingActive ? '#ff8c00' : '#4a9eff', strokeWidth: elongatingActive ? 8 : 4, transition: 'stroke 0.1s' }}
        />
        <line 
          className="muscle-line" 
          x1={rightAnchor.x} y1={rightAnchor.y} x2={attachX} y2={attachY} 
          style={{ stroke: contractingActive ? '#ff8c00' : '#4a9eff', strokeWidth: contractingActive ? 8 : 4, transition: 'stroke 0.1s' }}
        />
        <line className="attach-link" x1={pivotX} y1={pivotY} x2={attachX} y2={attachY} />
        <line className="attach-link rear-attach-link" x1={pivotX} y1={pivotY} x2={rearAttachX} y2={rearAttachY} />
        <line className="forearm-extension" x1={pivotX} y1={pivotY} x2={rearAttachX} y2={rearAttachY} />
        <line className="forearm-shell" x1={pivotX} y1={pivotY} x2={armEndX} y2={armEndY} />
        <line className="arm-line" x1={pivotX} y1={pivotY} x2={armEndX} y2={armEndY} />
        <circle className="pivot" cx={pivotX} cy={pivotY} r="10" />
        <circle className="pulley" cx={pivotX} cy={pivotY} r={Math.max(8, params.pulleyRadiusCm * 4)} />
        <circle className="attach-dot" cx={attachX} cy={attachY} r="7" />
        <circle className="attach-dot rear-attach-dot" cx={rearAttachX} cy={rearAttachY} r="7" />
        <circle className="mount-dot" cx={leftAnchor.x} cy={leftAnchor.y} r="5" />
        <circle className="mount-dot contracting-mount" cx={rightAnchor.x} cy={rightAnchor.y} r="5" />
        {projectileReleased && <circle className="wrist-dot" cx={armEndX} cy={armEndY} r="6" />}
        <circle className={projectileReleased ? 'payload-dot released-payload' : 'payload-dot'} cx={projectileX} cy={projectileY} r="13" />
        <line className="leader-line" x1={pivotX + 12} y1={pivotY + 8} x2="330" y2="330" />
        <text className="diagram-label" x="336" y="334">pivot</text>

        <line className="leader-line" x1={armEndX + 12} y1={armEndY} x2="430" y2="112" />
        <text className="diagram-label" x="438" y="116">payload m</text>

        <line className="leader-line" x1={leftAnchor.x} y1={leftAnchor.y} x2="118" y2="252" />
        <text className="diagram-label" x="124" y="256">elongating muscle</text>

        <line className="leader-line" x1={rightAnchor.x} y1={rightAnchor.y} x2="514" y2="252" />
        <text className="diagram-label" x="438" y="256">contracting muscle</text>

        <line className="leader-line" x1={attachX + 8} y1={attachY} x2="350" y2="168" />
        <text className="diagram-label" x="356" y="172">lever L</text>

        <g className="diagram-stats">
          <rect x="500" y="82" width="184" height="132" rx="8" />
          <text x="516" y="112" style={{ fontWeight: 'bold', fill: '#ff8c00' }}>Festo DMSP-20</text>
          <text x="516" y="140">T current: {formatNumber(motionFrame.torque / Math.max(0.01, params.muscleAttachCm/100), 1)} N</text>
          <text x="516" y="168">net torque: {formatNumber(result.mechanism.netTorque, 3)} Nm</text>
          <text x="516" y="196">travel: {formatNumber(result.mechanism.muscleTravelM * 1000, 0)} mm</text>
        </g>

        <text className="dimension-label" x="78" y="372">
          elongating length: {formatNumber(elongatingLengthCm, 1)} cm
        </text>
        <text className="dimension-label" x="442" y="372">
          contracting length: {formatNumber(contractingLengthCm, 1)} cm
        </text>
      </svg>
    </div>
  )
}

function MotorDiagram({
  params,
  result,
  simulationTime,
}: {
  params: DesignParams
  result: SimulationResult
  simulationTime: number
}) {
  const width = 640
  const height = 400
  const pivotX = 250
  const pivotY = 250
  const pointFromPivot = (angleRad: number, distance: number) => ({
    x: pivotX + Math.cos(angleRad) * distance,
    y: pivotY - Math.sin(angleRad) * distance,
  })
  
  const baseRotationRad = (-params.baseAngleDeg * Math.PI) / 180
  const shoulderRad = Math.PI + baseRotationRad
  const shoulder = pointFromPivot(shoulderRad, 170)
  const armScale = 5.15
  const armLength = params.armLengthCm * armScale
  const releaseRad = Math.PI / 2 + baseRotationRad
  const motionFrame = getFrameAtTime(result.motor.frames, simulationTime)
  const releaseFrame = getFirstReleasedFrame(result.motor.frames)
  const projectileReleased = simulationTime >= releaseFrame.t
  const currentRad = releaseRad + motionFrame.angleRad
  const armEndX = pivotX + Math.cos(currentRad) * armLength
  const armEndY = pivotY - Math.sin(currentRad) * armLength
  const releaseEndX = pivotX + Math.cos(releaseRad) * armLength
  const releaseEndY = pivotY - Math.sin(releaseRad) * armLength
  const motorGearRadius = 44
  const projectileScale = armScale * 100
  const releaseHeightM = Math.max(0.01, params.pivotHeightCm / 100 + Math.sin(releaseRad) * (params.armLengthCm / 100))
  const projectilePoint = getPointAtTime(result.motor.points, Math.max(0, simulationTime - releaseFrame.t))
  const projectileX = projectileReleased ? releaseEndX + projectilePoint.x * projectileScale : armEndX
  const projectileY = projectileReleased
    ? releaseEndY - (projectilePoint.y - releaseHeightM) * projectileScale
    : armEndY

  return (
    <div className="diagram-shell">
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

        <text className="diagram-title" x="28" y="34">Motor at pivot</text>
        <text className="diagram-note" x="28" y="58">
          Torque is generated through a gearbox mounted directly on the pivot.
        </text>
        <line className="upper-arm-line" x1={shoulder.x} y1={shoulder.y} x2={pivotX} y2={pivotY} />
        <circle className="shoulder-joint" cx={shoulder.x} cy={shoulder.y} r="11" />
        <circle className="motor-gear-unit" cx={pivotX} cy={pivotY} r={motorGearRadius} />
        <circle className="elbow-joint motor-elbow-joint" cx={pivotX} cy={pivotY} r="18" />
        <line className="forearm-shell" x1={pivotX} y1={pivotY} x2={armEndX} y2={armEndY} />
        <line className="arm-line" x1={pivotX} y1={pivotY} x2={armEndX} y2={armEndY} />
        {projectileReleased && <circle className="wrist-dot" cx={armEndX} cy={armEndY} r="6" />}
        <circle className={projectileReleased ? 'payload-dot released-payload' : 'payload-dot'} cx={projectileX} cy={projectileY} r="13" />
        <text className="diagram-label" x={pivotX - 122} y={pivotY + 48}>motor</text>
        <text className="diagram-label" x={pivotX + 48} y={pivotY + 50}>gearbox</text>
        <text className="diagram-label" x="390" y="112">payload m</text>

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
  const result = useMemo(() => simulateDesign(params), [params])
  const muscleMotionTime = result.mechanism.frames.at(-1)?.t ?? 0
  const motorMotionTime = result.motor.frames.at(-1)?.t ?? 0
  const muscleReleaseTime = getFirstReleasedFrame(result.mechanism.frames)?.t ?? 0
  const motorReleaseTime = getFirstReleasedFrame(result.motor.frames)?.t ?? 0
  const muscleFlightEndTime = muscleReleaseTime + result.flightTime
  const motorFlightEndTime = motorReleaseTime + result.motor.flightTime
  const simulationDuration = Math.max(0.45, Math.min(5, Math.max(muscleMotionTime, motorMotionTime, muscleFlightEndTime, motorFlightEndTime)))
  const simulationProgress = useSimulationProgress(simulationDuration)
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
        <div className="topbar-actions">
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

          <h2>{tr(lang, 'Lever', 'Рычаг')}</h2>
          <RangeControl label={tr(lang, 'Base Angle', 'Наклон установки')} value={params.baseAngleDeg} min={0} max={180} step={5} unit="deg" onChange={(value) => updateParam('baseAngleDeg', value)} />
          <RangeControl label={tr(lang, 'Arm length', 'Длина рычага')} value={params.armLengthCm} min={15} max={45} step={0.5} unit="cm" onChange={(value) => updateParam('armLengthCm', value)} />
          <RangeControl label={tr(lang, 'Arm mass', 'Масса рычага')} value={params.armMassG} min={1} max={80} step={1} unit="g" onChange={(value) => updateParam('armMassG', value)} />
          <RangeControl label={tr(lang, 'Angular sweep', 'Угловой ход')} value={params.sweepDeg} min={5} max={110} step={1} unit="deg" onChange={(value) => updateParam('sweepDeg', value)} />

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
              <MechanismDiagram params={params} result={result} simulationTime={simulationTime} />
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
              <MotorDiagram params={params} result={result} simulationTime={simulationTime} />
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
