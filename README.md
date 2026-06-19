# AirRacer AI

An advanced, real-time computer vision high-speed racing game built in Python, Pygame, OpenCV, and MediaPipe. The player steers a performance vehicle along an infinite scrolling cyberpunk highway, swerving to avoid oncoming obstacle traffic and using real-world physical hand gestures captured by a webcam!

---

## Technical Architecture

The codebase is engineered with **multithreaded execution pipelines** to guarantee constant game loop tick rates. The system executes hand detection and heuristic posture classification in a background worker thread, ensuring the renderer ticks at flat **60 FPS** without frame rate degradation common in single-threaded AI prototypes.

```
       [Webcam Input] ---> [Capture/Preprocess cv2 Feed]
                                       |
                                       v
                     [MediaPipe Hands Inference (BG Thread)]
                                       |
                                       v
                      [Heuristic Pose Classification]
                      - Compare finger tips to pip joints
                      - Gauge palm vectors and hand tilt
                                       | (Lock Protected Sync)
                                       v
[Pygame main.py Loop] <--- [Receive Control States Queue]
        |
        +---> [Simulate Scrolling Highway]
        +---> [Move Player Car (Smooth Lerp Transitions)]
        +---> [Spawn Obstacle Rival Traffic]
        +---> [Draw Glowing Neon Vector UI & Visual HUD]
```

---

## Gesture Command Rules

The gesture classification logic determines finger extension by cross-referencing vertical and horizontal tip positions (like index fingertip) with corresponding interphalangeal (PIP) or metacarpophalangeal (MCP) joints:

1. **Point Left (Move 1 Lane Left)**: Index finger extended upwards (`tip.y < pip.y`); middle, ring, pinky folded (`tip.y > pip.y`); hand tilted left or index tip position pointing leftward (`tip.x < mcp.x - 0.045`).
2. **Point Right (Move 1 Lane Right)**: Index finger extended upwards; middle, ring, pinky folded; hand tilted right or index tip position pointing rightward (`tip.x > mcp.x + 0.045`).
3. **Open Palm (Accelerate & Boost Speed)**: All five fingers extended upwards.
4. **Fist (Engage High-Torque Brakes)**: All five fingers folded.
5. **Victory Sign (Activate Nitro Thrusters)**: Index and middle fingers extended cleanly; thumb, ring, and pinky folded. Speeds up road by +60% for **3 seconds** (requires a **10-second** cooldown recharge).

---

## Folder Structure

```
AirRacer-AI/
├── main.py                # Main launcher and library integrity verification checks.
├── game.py                # State machine manager (Menus, playing, pause, overlap collision).
├── gesture_controller.py  # Thread-scoped webcam capturer and MediaPipe tracker.
├── car.py                 # Mathematical representation of the interpolated player racer.
├── enemy.py               # Spawns randomized obstacle cars with independent colors/speeds.
├── road.py                # Handles scroll steps and draws glowing neon guardrail boundaries.
├── ui.py                  # Standard custom font blitters, glass widgets, and particle spawners.
├── config.py              # Central repository for visual styles, lane centers, and constants.
├── requirements.txt       # Dependencies manifest for pip packages.
└── README.md              # Installation guide and developer guide.
```

---

## Desktop Installation & Setup

Follow these steps to run the gesture racing game on your local laptop or desktop:

### 1. Prerequisites
Ensure you have **Python 3.10** or higher installed. Verify by running:
```bash
python --version
```

### 2. Environment Setup
Clone or extract this folder, navigating into the repository directory:
```bash
cd AirRacer-AI
```

Create a virtual environment to avoid conflicts (recommended):
```bash
# macOS/Linux
python3 -m venv venv
source venv/bin/activate

# Windows (Command Prompt)
python -m venv venv
venv\Scripts\activate
```

### 3. Install Package Dependencies
Install the required graphics, video capture, and numerical calculation libraries:
```bash
pip install -r requirements.txt
```

### 4. Play Game!
Launch the game entry script:
```bash
python main.py
```

---

## Controls Reference

### Web Camera (Webcam Control Default)
Place your hand in front of your camera, roughly 1.5 to 3 feet back:
* **Index Point Left**: Steer left.
* **Index Point Right**: Steer right.
* **Open Palm**: Dynamic speed acceleration.
* **Fist**: Instant brake down to crawl.
* **Victory Sign**: Ignite Nitro boost.

### Keyboard reserves (Fallback mode toggles with `[F]`)
If you lack a camera or wish to play on keyboard:
* **`A` / `D` (or Left / Right Arrows)**: Lane changes.
* **`W` / `S` (or Up / Down Arrows)**: Accelerate / Brake.
* **`N`**: Manual Nitro trigger.
* **`ESCAPE`**: Pause / Resume.
* **`F12`**: Saves a screenshot named `screenshot_YYYY-MM-DD_HH-MM-SS.png`.
