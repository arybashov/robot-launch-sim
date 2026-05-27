# Robot Launch Sim - Physics Whitepaper

This document details the physical models, kinematics, and dynamic calculations used in the Robot Launch Simulator. The simulator was built to provide a fair, energy-matched comparison between a traditional electromechanical motor drive and a biomechanical antagonistic fluidic muscle pair.

## 1. Core Mechanics & Inertia

The simulator models a 1-Degree-of-Freedom (1-DOF) robotic arm acting as a catapult. The total load on the pivot point consists of three components:

1. **Forearm Rod Inertia:** Modeled as a thin rod rotating about one end.
   $$I_{rod} = \frac{1}{3} \cdot m_{arm} \cdot L^2$$
2. **Basket/Holder Inertia:** Modeled as a point mass at the end of the arm (default 10g).
   $$I_{basket} = m_{basket} \cdot L^2$$
3. **Projectile Inertia (Pre-release):** Modeled as a point mass at the end of the arm.
   $$I_{projectile} = m_{projectile} \cdot L^2$$

**Total Loaded Inertia:**
$$I_{total} = I_{rod} + I_{basket} + I_{projectile}$$

---

## 2. Artificial Muscle Model (Festo DMSP-20)

The simulator uses characteristics derived from the **Festo DMSP-20** fluidic muscle operating at ~2 bar pressure (scaled down to 400N max force for stability on a lightweight prototype).

### 2.1 Kinematics (Vector Geometry)
The muscle is not modeled as a simple pulley. Instead, we use vector geometry to calculate the true distance between the shoulder anchor and the attachment point on the lever.

* **Shoulder Anchor ($P_s$):** Fixed position relative to the base.
* **Attachment Point ($P_a$):** Moves in an arc: $P_a(\theta) = [r \cdot \cos(\theta), r \cdot \sin(\theta)]$
* **Current Muscle Length ($L_c$):** $||P_s - P_a||$
* **Stroke ($S$):** $L_{nominal} - L_c$

### 2.2 Force-Length Relationship
Fluidic muscles exhibit a non-linear (virtually linear) force decay. Maximum force is available at 0% contraction, dropping to 0N at maximum contraction (25% of nominal length).

$$F_{static} = F_{max} \cdot \left(1 - \frac{S}{S_{max}}\right)$$

### 2.3 Force-Velocity Relationship (Hill's Curve Approximation)
Muscles cannot contract infinitely fast. As contraction velocity ($\omega$) approaches the pneumatic limit ($v_{max} \approx 60$ rad/s), force drops to zero.

$$v_{factor} = \max\left(0, 1 - \frac{|\omega|}{v_{max}}\right)$$
$$F_{dynamic} = F_{static} \cdot v_{factor} \cdot \eta_{transfer}$$

### 2.4 Active Co-Contraction (Braking)
To prevent the arm from over-extending and spinning uncontrollably, the simulator uses **co-contraction**. During the braking phase, both muscles activate:
* **Front Muscle:** 40% activation (maintains stiffness).
* **Rear Muscle:** 80% activation (provides net stopping torque).
This stiffens the joint and absorbs kinetic energy efficiently.

---

## 3. Fair Energy Comparison (Muscle vs. Motor)

To answer the question *"Which is better?"*, the simulator forces a **fair fight based on equal energy input**.

1. **Muscle Energy Budget:** The simulator calculates the total mechanical work ($W$) performed by the front muscle during the launch phase by integrating force over distance.
2. **Motor Scaling:** Instead of letting the user arbitrarily pick a massive motor, the simulator calculates the required motor torque to deliver that **exact same energy budget ($W$)** over the same sweep angle ($\theta_{sweep}$).
   $$\tau_{motor} = \frac{W}{\theta_{sweep}}$$

### 3.1 The Reflected Inertia Penalty
Why does the motor lose? Because of **Reflected Inertia**. To get high torque, motors need gearboxes. A gearbox multiplies torque by ratio $N$, but it multiplies the rotor's inertia by $N^2$.

$$I_{reflected} = I_{rotor} \cdot N^2$$

**The Result:** The motor wastes a massive portion of its energy budget just spinning up its own internal rotor, leaving less energy for the projectile. The muscle, being direct-drive, transfers almost 100% of its work into the arm.

---

## 4. Environmental Physics

To ensure stability and realism, the simulator includes:
* **Gravity:** $T_g = -m \cdot g \cdot r_{cm} \cdot \cos(\theta_{world})$
* **Quadratic Aerodynamic Drag:** $T_{drag} = C_d \cdot \omega \cdot |\omega|$
* **Viscous Joint Damping:** $T_{viscous} = c \cdot \omega$
* **Semi-Implicit Euler Integration:** For stable energy conservation over time.

## 5. Ballistics (Projectile Motion)

Upon reaching the release angle (defined by the base tilt), the projectile is freed.
* **Launch Velocity:** $v_0 = \omega_{release} \cdot L_{arm}$
* **Trajectory:** Calculated using standard projectile motion equations, accounting for the dynamic base angle orientation and optional aerodynamic drag on the ball.
