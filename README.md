# Robot Launch Sim

Browser simulator for comparing two launch mechanisms:

- an antagonistic muscle-pair drive with the force source moved away from the pivot;
- a motor plus gearbox drive mounted at the elbow/pivot.

The app is built as a lightweight 2D model for quickly testing geometry,
impulse timing, braking, inertia, launch speed, and projectile trajectory.

## Run locally

```bash
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`.

## Build and checks

```bash
npm run build
npm run lint
```

## Current model

The model uses a fixed-duration control input for both drive types:

- default drive impulse: `350 ms`;
- default brake impulse: `150 ms`;
- the same timing is applied to the muscle and motor cases.

During the drive impulse, the simulator integrates:

```text
torque -> angular acceleration -> angular velocity -> arm angle
```

At release, the projectile separates from the arm. The projectile then follows
its own 2D trajectory while the arm mechanism continues moving under its
remaining inertia and braking model.

## Muscle-pair drive

The muscle drive uses:

- contracting muscle tension;
- elongating/return muscle tension;
- muscle attach point near the elbow;
- muscle stroke limit;
- arm and payload inertia before release;
- forearm inertia after release.

After the control signal ends, the muscle relaxes and no longer meaningfully
loads the mechanism, except during the configured brake impulse.

## Motor plus gearbox drive

The motor drive uses:

- motor torque;
- gearbox ratio and efficiency;
- motor no-load speed limit;
- rotor inertia reflected through the gearbox;
- a brake impulse applied through the drive after the command signal.

The visual motor is shown as one combined motor/gearbox unit at the elbow.

## Interface parameters

The left panel exposes the main working parameters:

- payload mass;
- arm length and arm mass;
- angular sweep;
- muscle tensions;
- muscle attach point and stroke;
- drive impulse length;
- brake impulse length;
- motor torque;
- gearbox ratio.

## GitHub Pages

The repository includes `.github/workflows/deploy.yml`. After pushing to
GitHub, enable Pages in the repository settings and select GitHub Actions as
the source.
