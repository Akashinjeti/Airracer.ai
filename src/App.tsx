import React, { useState, useEffect, useRef } from "react";
import { 
  Play, RotateCcw, Volume2, Video, Keyboard, 
  Flame, ShieldAlert, Award, CheckCircle2, 
  HelpCircle, Zap, Pause, Terminal, MonitorPlay
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Declare globals for the external CDN MediaPipe scripts
declare global {
  interface Window {
    Hands: any;
    Camera: any;
  }
}

// Global audio synthesiser for retro sound effects
const playSynthSound = (type: 'beep' | 'nitro' | 'crash' | 'score' | 'levelUp') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'beep') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'nitro') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(750, ctx.currentTime + 0.45);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'crash') {
      // Procedural noise sound
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(12, ctx.currentTime + 0.75);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } else if (type === 'score') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, ctx.currentTime);
      osc.frequency.setValueAtTime(900, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    } else if (type === 'levelUp') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.setValueAtTime(650, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(780, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (err) {
    // Audio constraints pre-gesture
  }
};

// UI Colors & Types
type GameState = "MENU" | "PLAYING" | "PAUSED" | "GAMEOVER";

interface Enemy {
  id: number;
  lane: number;
  x: number;
  y: number;
  speed: number;
  color: string;
  width: number;
  height: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
}

export default function App() {
  // Control modes
  const [useGestureControl, setUseGestureControl] = useState<boolean>(false);
  const [scriptsLoaded, setScriptsLoaded] = useState<boolean>(false);
  const [scriptsLoading, setScriptsLoading] = useState<boolean>(false);
  const [mpError, setMpError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [detectedGesture, setDetectedGesture] = useState<string>("No Hand");

  // Camera node hooks
  const videoRef = useRef<HTMLVideoElement>(null);
  const webcamCanvasRef = useRef<HTMLCanvasElement>(null);
  const cameraInstanceRef = useRef<any>(null);
  const handsInstanceRef = useRef<any>(null);

  // Canvas Game Engine state keys
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>("MENU");
  const [score, setScore] = useState<number>(0);
  const [distance, setDistance] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem("airracer_highscore") || "0", 10);
    } catch {
      return 0;
    }
  });
  const [playerSpeedKmh, setPlayerSpeedKmh] = useState<number>(180);
  const [nitroCooldown, setNitroCooldown] = useState<number>(0);
  const [nitroActive, setNitroActive] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(60);

  // Mutable Game Simulation References to keep 60fps running without state lagging
  const simRef = useRef({
    gameState: "MENU" as GameState,
    score: 0,
    distance: 0,
    playerLane: 1, // Start on second lane
    playerX: 220,  // Interpolated visual position
    playerSpeed: 10, // Units per frame
    targetSpeed: 10,
    maxNormalSpeed: 15,
    nitroActive: false,
    nitroTimer: 0,
    nitroCooldown: 0,
    lastSpawnTime: 0,
    enemies: [] as Enemy[],
    particles: [] as Particle[],
    roadScrollY: 0,
    difficulty: 1,
    lastTime: 0,
    lastScoreTime: 0,
    lastTrailTime: 0
  });

  const laneCenters = [100, 180, 260, 340]; // 4 LANES centers on a 440px wide track

  // Trigger Local High Score Writes
  const updateHighScoreIfNeeded = (finalScore: number) => {
    if (finalScore > highScore) {
      setHighScore(finalScore);
      try {
        localStorage.setItem("airracer_highscore", finalScore.toString());
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Keyboard controls listener definitions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape pauses
      if (e.key === "Escape") {
        if (simRef.current.gameState === "PLAYING") {
          simRef.current.gameState = "PAUSED";
          setGameState("PAUSED");
          playSynthSound("beep");
        } else if (simRef.current.gameState === "PAUSED") {
          simRef.current.gameState = "PLAYING";
          setGameState("PLAYING");
          playSynthSound("beep");
        }
      }

      // Keyboard lane steering (only when Keyboard mode is prioritized or webcam is offline)
      if (simRef.current.gameState === "PLAYING" && (!useGestureControl || detectedGesture === "No Hand")) {
        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
          movePlayerLane("left");
        } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
          movePlayerLane("right");
        } else if (e.key === "n" || e.key === "N" || e.key === " ") {
          triggerNitroBoost();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [useGestureControl, detectedGesture]);

  // Handle continuous keyboard throttling and brakes
  useEffect(() => {
    let intervalId: any;
    if (gameState === "PLAYING" && (!useGestureControl || detectedGesture === "No Hand")) {
      const keysPressed: Record<string, boolean> = {};

      const d_down = (e: KeyboardEvent) => { keysPressed[e.key.toLowerCase()] = true; };
      const d_up = (e: KeyboardEvent) => { keysPressed[e.key.toLowerCase()] = false; };

      window.addEventListener("keydown", d_down);
      window.addEventListener("keyup", d_up);

      intervalId = setInterval(() => {
        if (keysPressed["w"] || keysPressed["arrowup"]) {
          // Accelerate
          simRef.current.targetSpeed = Math.min(simRef.current.maxNormalSpeed * 1.3, simRef.current.playerSpeed + 0.35);
        } else if (keysPressed["s"] || keysPressed["arrowdown"]) {
          // Brake
          simRef.current.targetSpeed = Math.max(3.0, simRef.current.playerSpeed - 0.55);
        } else {
          // Normal cruising
          if (!simRef.current.nitroActive) {
            simRef.current.targetSpeed = 10.0;
          }
        }
      }, 30);

      return () => {
        window.removeEventListener("keydown", d_down);
        window.removeEventListener("keyup", d_up);
        clearInterval(intervalId);
      };
    }
  }, [gameState, useGestureControl, detectedGesture]);

  // Mount/Dismount MediaPipe CDN script tags conditionally
  useEffect(() => {
    if (useGestureControl && !scriptsLoaded && !scriptsLoading) {
      setScriptsLoading(true);
      
      const loadScript = (src: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
          }
          const s = document.createElement("script");
          s.src = src;
          s.async = true;
          s.onload = () => resolve();
          s.onerror = (e) => reject(e);
          document.head.appendChild(s);
        });
      };

      Promise.all([
        loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"),
        loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js")
      ])
      .then(() => {
        setScriptsLoaded(true);
        setScriptsLoading(false);
      })
      .catch((err) => {
        console.error("MediaPipe failed as loading source: ", err);
        setMpError("Webcam tracking services are currently unreachable. Falling back directly to Keyboard Override.");
        setScriptsLoading(false);
      });
    }
  }, [useGestureControl, scriptsLoaded]);

  // Hook camera and tracker streams to video elements
  useEffect(() => {
    if (!scriptsLoaded || !useGestureControl || !videoRef.current) return;

    let isClosed = false;

    const HandsClass = (window as any).Hands;
    const CameraClass = (window as any).Camera;
    if (!HandsClass || !CameraClass) {
      setMpError("Camera runtime constructor is preparing. Please hold...");
      return;
    }

    const handsInstance = new HandsClass({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsInstance.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    handsInstance.onResults((results: any) => {
      if (isClosed) return;
      const canvas = webcamCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      // Mirror feed horizontally
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Mirror landmarks on display
        const drawPt = (pt: any) => {
          // x is reversed because video is mirrored
          const lx = (1 - pt.x) * canvas.width;
          const ly = pt.y * canvas.height;
          ctx.beginPath();
          ctx.arc(lx, ly, 4, 0, 2 * Math.PI);
          ctx.fill();
        };

        const drawSegment = (ptAIndex: number, ptBIndex: number) => {
          const a = landmarks[ptAIndex];
          const b = landmarks[ptBIndex];
          ctx.beginPath();
          ctx.moveTo((1 - a.x) * canvas.width, a.y * canvas.height);
          ctx.lineTo((1 - b.x) * canvas.width, b.y * canvas.height);
          ctx.stroke();
        };

        // Draw green skeletons
        ctx.strokeStyle = "#00f5ff";
        ctx.fillStyle = "#32ff32";
        ctx.lineWidth = 2.5;

        // Visual connectors
        drawSegment(0, 1); drawSegment(1, 2); drawSegment(2, 3); drawSegment(3, 4); // Thumb
        drawSegment(0, 5); drawSegment(5, 6); drawSegment(6, 7); drawSegment(7, 8); // Index
        drawSegment(5, 9); drawSegment(9, 13); drawSegment(13, 17); drawSegment(0, 17); // Base
        drawSegment(9, 10); drawSegment(10, 11); drawSegment(11, 12); // Middle
        drawSegment(13, 14); drawSegment(14, 15); drawSegment(15, 16); // Ring
        drawSegment(17, 18); drawSegment(18, 19); drawSegment(19, 20); // Pinky

        for (const pt of landmarks) {
          drawPt(pt);
        }

        // Compute posture
        const gesture = classifyBrowserGesture(landmarks);
        setDetectedGesture(gesture);
      } else {
        setDetectedGesture("No Hand");
      }
    });

    const cameraInstance = new CameraClass(videoRef.current, {
      onFrame: async () => {
        if (isClosed) return;
        if (videoRef.current) {
          try {
            await handsInstance.send({ image: videoRef.current });
          } catch (err) {
            console.warn("Hands send failed (expected during shutdown):", err);
          }
        }
      },
      width: 260,
      height: 195
    });

    cameraInstance.start()
      .then(() => {
        if (isClosed) return;
        setCameraActive(true);
        setMpError(null);
      })
      .catch((err: any) => {
        if (isClosed) return;
        console.warn("Camera failed: ", err);
        setMpError("Failed to open camera. Grant system camera permissions to drive with hands.");
        setCameraActive(false);
      });

    cameraInstanceRef.current = cameraInstance;
    handsInstanceRef.current = handsInstance;

    return () => {
      isClosed = true;
      if (cameraInstanceRef.current) {
        try {
          cameraInstanceRef.current.stop();
        } catch (e) {
          console.warn("Error stopping camera:", e);
        }
      }
      if (handsInstanceRef.current) {
        try {
          handsInstanceRef.current.close();
        } catch (e) {
          console.warn("Error closing handsInstance:", e);
        }
        handsInstanceRef.current = null;
      }
      setCameraActive(false);
      setDetectedGesture("No Hand");
    };
  }, [scriptsLoaded, useGestureControl]);

  // Hook hand-gesture states to game execution blocks in real-time
  useEffect(() => {
    if (!useGestureControl || detectedGesture === "No Hand" || detectedGesture === "Unknown Pose") return;

    if (simRef.current.gameState === "PLAYING") {
      // Debounce lane shifts
      if (detectedGesture === "Point Left") {
        movePlayerLane("left");
      } else if (detectedGesture === "Point Right") {
        movePlayerLane("right");
      }

      // Continuous velocities
      if (detectedGesture === "Open Palm") {
        simRef.current.targetSpeed = Math.min(simRef.current.maxNormalSpeed * 1.35, simRef.current.playerSpeed + 0.35);
      } else if (detectedGesture === "Fist") {
        simRef.current.targetSpeed = Math.max(2.0, simRef.current.playerSpeed - 0.65);
      } else {
        if (!simRef.current.nitroActive) {
          simRef.current.targetSpeed = 10.0;
        }
      }

      // Nitro booster
      if (detectedGesture === "Victory Sign") {
        triggerNitroBoost();
      }
    }
  }, [detectedGesture, useGestureControl]);

  // Sub-method to classify hand posture exactly like OpenCV/MediaPipe
  const classifyBrowserGesture = (landmarks: any[]) => {
    const thumb_tip = landmarks[4];
    const index_tip = landmarks[8];
    const middle_tip = landmarks[12];
    const ring_tip = landmarks[16];
    const pinky_tip = landmarks[20];

    const index_pip = landmarks[6];
    const middle_pip = landmarks[10];
    const ring_pip = landmarks[14];
    const pinky_pip = landmarks[18];

    const index_mcp = landmarks[5];

    // Standard vertical thresholds
    const index_extended = index_tip.y < index_pip.y;
    const middle_extended = middle_tip.y < middle_pip.y;
    const ring_extended = ring_tip.y < ring_pip.y;
    const pinky_extended = pinky_tip.y < pinky_pip.y;

    // Open Palm check
    if (index_extended && middle_extended && ring_extended && pinky_extended) {
      return "Open Palm";
    }

    // Fist check
    if (!index_extended && !middle_extended && !ring_extended && !pinky_extended) {
      return "Fist";
    }

    // Victory sign
    if (index_extended && middle_extended && !ring_extended && !pinky_extended) {
      return "Victory Sign";
    }

    // Point Left or Right (Evaluating delta x between tip and knuckle base)
    if (index_extended && !middle_extended && !ring_extended && !pinky_extended) {
      const delta_x = index_tip.x - index_mcp.x;
      // Since video is flipped on canvas, positive points left or right
      if (delta_x < -0.04) {
        return "Point Right"; // Left/Right flipped logically
      } else if (delta_x > 0.04) {
        return "Point Left";
      }
      return index_tip.x < index_mcp.x ? "Point Right" : "Point Left";
    }

    return "Unknown Pose";
  };

  // Steer player car (Linear lane selection throttle logic)
  const lastLaneChangeRef = useRef<number>(0);
  const movePlayerLane = (direction: "left" | "right") => {
    const now = Date.now();
    if (now - lastLaneChangeRef.current < 380) return; // Debounce 380ms

    const currentLane = simRef.current.playerLane;
    if (direction === "left" && currentLane > 0) {
      simRef.current.playerLane = currentLane - 1;
      lastLaneChangeRef.current = now;
      playSynthSound("beep");
    } else if (direction === "right" && currentLane < 3) {
      simRef.current.playerLane = currentLane + 1;
      lastLaneChangeRef.current = now;
      playSynthSound("beep");
    }
  };

  // Engage Nitro Booster speed rockets
  const triggerNitroBoost = () => {
    if (!simRef.current.nitroActive && simRef.current.nitroCooldown <= 0) {
      simRef.current.nitroActive = true;
      simRef.current.nitroTimer = 0.0;
      simRef.current.nitroCooldown = 10.0;
      simRef.current.playerSpeed = simRef.current.maxNormalSpeed * 1.5;
      simRef.current.targetSpeed = simRef.current.maxNormalSpeed * 1.55;
      setNitroActive(true);
      playSynthSound("nitro");

      // Spawn large boost cloud
      const px = simRef.current.playerX;
      spawnParticles(px, 450, 0, 0, 25, "#32ff32");
    }
  };

  // Helper code to spawn particle arrays
  const spawnParticles = (x: number, y: number, dx: number, dy: number, count: number, color: string) => {
    for (let i = 0; i < count; i++) {
      simRef.current.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() * 6) + 4,
        radius: Math.random() * 5 + 3,
        color,
        alpha: 255,
        decay: Math.random() * 4 + 3
      });
    }
  };

  // Reset the Canvas Game systems
  const resetSimulator = () => {
    simRef.current = {
      gameState: "PLAYING",
      score: 0,
      distance: 0,
      playerLane: 1,
      playerX: laneCenters[1],
      playerSpeed: 8,
      targetSpeed: 8,
      maxNormalSpeed: 14,
      nitroActive: false,
      nitroTimer: 0,
      nitroCooldown: 0,
      lastSpawnTime: 0,
      enemies: [],
      particles: [],
      roadScrollY: 0,
      difficulty: 1,
      lastTime: performance.now(),
      lastScoreTime: Date.now(),
      lastTrailTime: Date.now()
    };
    setScore(0);
    setDistance(0);
    setGameState("PLAYING");
    setNitroActive(false);
    setNitroCooldown(0);
    playSynthSound("beep");
  };

  // Core Canvas Rendering & Game loop
  useEffect(() => {
    const canvas = gameCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId: number;

    const gameLoop = (timestamp: number) => {
      const sim = simRef.current;
      const dt = sim.lastTime ? (timestamp - sim.lastTime) / 1000 : 0.016;
      sim.lastTime = timestamp;

      // Update calculations
      if (sim.gameState === "PLAYING") {
        updatePhysics(dt);
      }

      // Drawing Renders
      drawRoad(ctx, canvas);
      if (sim.gameState === "PLAYING") {
        drawEnemies(ctx);
        drawPlayerCar(ctx, canvas);
        drawParticles(ctx);
      } else if (sim.gameState === "MENU") {
        drawMenuOverlay(ctx, canvas);
      } else if (sim.gameState === "PAUSED") {
        drawEnemies(ctx);
        drawPlayerCar(ctx, canvas);
        drawParticles(ctx);
        drawPauseOverlay(ctx, canvas);
      } else if (sim.gameState === "GAMEOVER") {
        drawEnemies(ctx);
        drawParticles(ctx);
        drawGameOverOverlay(ctx, canvas);
      }

      frameId = requestAnimationFrame(gameLoop);
    };

    // Subroutine: Simulation Update
    const updatePhysics = (dt: number) => {
      const sim = simRef.current;

      // 1. Timers & Nitro Cooldowns
      if (sim.nitroActive) {
        sim.nitroTimer += dt;
        if (sim.nitroTimer >= 3.0) {
          sim.nitroActive = false;
          sim.playerSpeed = 10.0;
          sim.targetSpeed = 10.0;
          setNitroActive(false);
        }
      }
      if (sim.nitroCooldown > 0) {
        sim.nitroCooldown = Math.max(0, sim.nitroCooldown - dt);
        setNitroCooldown(Math.round(sim.nitroCooldown * 10) / 10);
      }

      // 2. Adjust target speed step-wise
      const speedDiff = sim.targetSpeed - sim.playerSpeed;
      sim.playerSpeed += speedDiff * 0.08;
      setPlayerSpeedKmh(Math.round(sim.playerSpeed * 18)); // Scale representation

      // 3. Scroll road coordinate markers
      sim.roadScrollY = (sim.roadScrollY + sim.playerSpeed) % 60;

      // 4. Steer player sports-car smoothly (Lerp interpolation coords)
      const targetX = laneCenters[sim.playerLane];
      sim.playerX += (targetX - sim.playerX) * 0.16;

      // Spawns tire smoke trails
      const now = Date.now();
      if (now - sim.lastTrailTime > 80) {
        sim.lastTrailTime = now;
        sim.particles.push({
          x: sim.playerX,
          y: 470,
          vx: (Math.random() - 0.5) * 2,
          vy: Math.random() * 4 + 2,
          radius: Math.random() * 3 + 1.5,
          color: sim.nitroActive ? "#32ff32" : "#00f5ff",
          alpha: 220,
          decay: Math.random() * 4 + 4
        });
      }

      // 5. Score accruals and distances
      if (now - sim.lastScoreTime > 100) {
        sim.lastScoreTime = now;
        sim.score += 5;
        sim.distance += 1;
        setScore(sim.score);
        setDistance(Math.round(sim.distance / 10));

        // Periodically adjust difficulty on score steps
        if (sim.score > 0 && sim.score % 400 === 0) {
          sim.difficulty += 1;
          sim.maxNormalSpeed = Math.min(22, sim.maxNormalSpeed + 1);
          playSynthSound("levelUp");
        }
      }

      // 6. Obstacles Spawn system
      const spawnCooldown = Math.max(800, 2000 - sim.difficulty * 250);
      if (now - sim.lastSpawnTime > spawnCooldown) {
        sim.lastSpawnTime = now;
        
        // Spawn competitor car in a randomized lane
        const lane = Math.floor(Math.random() * 4);
        const obstacleColors = ["#ef4444", "#a855f7", "#eab308", "#10b981", "#ff7800", "#00d5ff"];
        sim.enemies.push({
          id: now + Math.random(),
          lane,
          x: laneCenters[lane],
          y: -100,
          speed: Math.random() * 4 + 3,
          color: obstacleColors[Math.floor(Math.random() * obstacleColors.length)],
          width: 44,
          height: 80
        });
      }

      // 7. Enemy positions scroll relative to road
      sim.enemies.forEach((enemy) => {
        // Obscale moves down by scroll velocity - obstacle speed
        const relSpeed = sim.playerSpeed - enemy.speed;
        enemy.y += relSpeed;
      });

      // Filter offscreen obstacles
      sim.enemies = sim.enemies.filter((e) => e.y < 650);

      // 8. Bounding-Box Crash Overlap Check
      const playerBox = {
        left: sim.playerX - 22,
        top: 380,
        right: sim.playerX + 22,
        bottom: 380 + 80
      };

      for (const e of sim.enemies) {
        const enemyBox = {
          left: e.x - 22,
          top: e.y,
          right: e.x + 22,
          bottom: e.y + 80
        };

        if (
          playerBox.left < enemyBox.right &&
          playerBox.right > enemyBox.left &&
          playerBox.top < enemyBox.bottom &&
          playerBox.bottom > enemyBox.top
        ) {
          // Crash explosion! Trigger explosion particles
          playSynthSound("crash");
          spawnParticles(sim.playerX, 420, 0, 0, 50, "#ff2050");
          spawnParticles(sim.playerX, 420, 0, 0, 30, "#eab308");
          
          sim.gameState = "GAMEOVER";
          setGameState("GAMEOVER");
          updateHighScoreIfNeeded(sim.score);
          break;
        }
      }

      // 9. Prune decaying particles
      sim.particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        p.radius = Math.max(0.1, p.radius - 0.04);
      });
      sim.particles = sim.particles.filter((p) => p.alpha > 0 && p.radius > 0.5);
    };

    // Subroutine: Drawing Methods
    const drawRoad = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      const sim = simRef.current;
      ctx.fillStyle = "#0f0f16"; // Dark space backdrop
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Asphalt track bed
      ctx.fillStyle = "#161622";
      ctx.fillRect(50, 0, 340, canvas.height);

      // Dashed separator lines
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([35, 25]);
      ctx.lineDashOffset = -sim.roadScrollY;

      // 3 Lane lines
      for (let i = 1; i < 4; i++) {
        const lx = 50 + i * 85;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, canvas.height);
        ctx.stroke();
      }
      ctx.setLineDash([]); // Reset dash

      // Golden and Blue Electric Outer Guardrails
      const railColor = sim.nitroActive ? "#32ff32" : "#00f5ff";
      
      // Outer glow line effect
      ctx.shadowColor = railColor;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = railColor;
      ctx.lineWidth = 4;
      
      ctx.beginPath();
      ctx.moveTo(50, 0); ctx.lineTo(50, canvas.height);
      ctx.moveTo(390, 0); ctx.lineTo(390, canvas.height);
      ctx.stroke();

      // Inner crisp white rail
      ctx.shadowBlur = 0; // Clear shadow
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(50, 0); ctx.lineTo(50, canvas.height);
      ctx.moveTo(390, 0); ctx.lineTo(390, canvas.height);
      ctx.stroke();
    };

    const drawPlayerCar = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      const sim = simRef.current;
      const px = sim.playerX;
      const py = 380;
      const glow = sim.nitroActive ? "#32ff32" : "#00f5ff";

      ctx.save();
      
      // Mild banking rotation based on lateral lane transition velocity delta
      const driftDelta = (laneCenters[sim.playerLane] - px) * -0.04;
      ctx.translate(px, py + 40);
      ctx.rotate((driftDelta * Math.PI) / 180);

      // 1. Outer Neon Underglow
      ctx.shadowColor = glow;
      ctx.shadowBlur = 15;
      ctx.fillStyle = glow + "22"; // Transparent padding
      ctx.beginPath();
      ctx.roundRect(-24, -44, 48, 88, 10);
      ctx.fill();
      ctx.shadowBlur = 0;

      // 2. Chassis body
      ctx.fillStyle = "#0c0d12";
      ctx.strokeStyle = glow;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-22, -40, 44, 80, 8);
      ctx.fill();
      ctx.stroke();

      // 3. Cabin glass windshield
      ctx.fillStyle = "#1e293b";
      ctx.strokeStyle = glow;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-14, -15, 28, 30, 4);
      ctx.fill();
      ctx.stroke();

      // 4. Rear spoiler
      ctx.fillStyle = glow;
      ctx.fillRect(-24, 34, 48, 6);

      // 5. White LED Headlights
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(-14, -36, 4, 0, 2 * Math.PI);
      ctx.arc(14, -36, 4, 0, 2 * Math.PI);
      ctx.fill();

      // 6. Taillights indicators
      ctx.fillStyle = sim.nitroActive ? "#32ff32" : "#ef4444";
      ctx.fillRect(-18, 38, 8, 3);
      ctx.fillRect(10, 38, 8, 3);

      ctx.restore();
    };

    const drawEnemies = (ctx: CanvasRenderingContext2D) => {
      const sim = simRef.current;
      sim.enemies.forEach((e) => {
        ctx.save();
        ctx.translate(e.x, e.y + 40);

        // Underglow
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#050608";
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2.5;

        // Draw chassis rect
        ctx.beginPath();
        ctx.roundRect(-22, -40, 44, 80, 8);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Front glass Shield
        ctx.fillStyle = "#252b36";
        ctx.fillRect(-14, -15, 28, 18);
        ctx.strokeStyle = e.color;
        ctx.strokeRect(-14, -15, 28, 18);

        // LED Headlights
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(-13, -35, 3.5, 0, 2 * Math.PI);
        ctx.arc(13, -35, 3.5, 0, 2 * Math.PI);
        ctx.fill();

        // Warning taillight dots
        ctx.fillStyle = "#ff1212";
        ctx.fillRect(-16, 37, 7, 3);
        ctx.fillRect(9, 37, 7, 3);

        ctx.restore();
      });
    };

    const drawParticles = (ctx: CanvasRenderingContext2D) => {
      const sim = simRef.current;
      sim.particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.alpha / 255;
        ctx.fillStyle = p.color;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      });
    };

    const drawMenuOverlay = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      ctx.fillStyle = "rgba(10, 10, 16, 0.75)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Large game logo
      ctx.font = "bold 38px 'Inter', sans-serif";
      ctx.fillStyle = "#32ff32";
      ctx.textAlign = "center";
      ctx.fillText("AIRRACER AI", canvas.width / 2, 160);

      ctx.font = "500 13px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#00f5ff";
      ctx.fillText("NEON GESTURE COGNITIVE MOTORWAY", canvas.width / 2, 195);

      // Small graphic bounds
      ctx.strokeStyle = "#00f5ff55";
      ctx.strokeRect(80, 240, 280, 150);

      ctx.fillStyle = "#ffffff99";
      ctx.font = "14px 'Inter', sans-serif";
      ctx.fillText("Ready pilots must press", canvas.width / 2, 280);
      
      ctx.fillStyle = "#32ff32";
      ctx.font = "bold 15px 'Inter', sans-serif";
      ctx.fillText("START SIMULATION", canvas.width / 2, 310);
      ctx.fillStyle = "#ffffff99";
      ctx.font = "12px 'Inter', sans-serif";
      ctx.fillText("to engage speed injectors.", canvas.width / 2, 340);
    };

    const drawPauseOverlay = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = "bold 32px 'Inter', sans-serif";
      ctx.fillStyle = "#00f5ff";
      ctx.textAlign = "center";
      ctx.fillText("RACE PAUSED", canvas.width / 2, 220);

      ctx.font = "14px 'Inter', sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("Press [ESCAPE] to resume driving", canvas.width / 2, 260);

      ctx.font = "12px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#888899";
      ctx.fillText("Practice lane navigation gestures offline", canvas.width / 2, 300);
    };

    const drawGameOverOverlay = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      ctx.fillStyle = "rgba(22, 5, 10, 0.85)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = "bold 36px 'Inter', sans-serif";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.fillText("CRITICAL CRASH", canvas.width / 2, 180);

      ctx.font = "500 15px 'Inter', sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`SESSION SCORE: ${simRef.current.score}`, canvas.width / 2, 230);

      ctx.font = "13px 'Inter', sans-serif";
      ctx.fillStyle = "#888899";
      ctx.fillText(`DISTANCE COVERED: ${Math.round(simRef.current.distance / 10)} KM`, canvas.width / 2, 260);

      if (simRef.current.score >= highScore && simRef.current.score > 0) {
        ctx.fillStyle = "#eab308";
        ctx.font = "bold 14px 'Inter', sans-serif";
        ctx.fillText("★ NEW PERSONAL HIGH RECORD ★", canvas.width / 2, 300);
      }

      ctx.font = "14px 'Inter', sans-serif";
      ctx.fillStyle = "#32ff32";
      ctx.fillText("CLICK 'PLAY AGAIN' TO START", canvas.width / 2, 360);
    };

    // Fire frame
    frameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(frameId);
  }, [gameState]);

  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0] font-sans selection:bg-cyan-500 selection:text-black flex flex-col relative overflow-x-hidden">
      
      {/* Background Ambient Glows */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-cyan-500/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-fuchsia-500/10 rounded-full blur-[140px]" />
      </div>

      {/* 1. Header Toolbar */}
      <header className="h-16 flex items-center justify-between px-6 md:px-8 bg-black/40 border-b border-white/10 z-20 relative backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          <h1 className="text-xl font-black tracking-tighter italic text-white flex items-center gap-2 font-display">
            AIRRACER <span className="text-cyan-400 font-normal not-italic">AI</span>
          </h1>
        </div>
        
        {/* Global Stats Block */}
        <div className="flex items-center gap-6 md:gap-10 text-[10px] font-mono tracking-widest uppercase opacity-75">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-white/40 text-[9px]">ENGINE STATUS</span>
            <span className="text-green-400 font-bold">STABLE.v1.0.4</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-white/40 text-[9px]">HIGH SCORE</span>
            <span className="text-[#eab308] font-bold">{highScore} PTS</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-white/40 text-[9px]">FRAME TIMING</span>
            <span className="text-cyan-400 font-bold">{fps} FPS</span>
          </div>
        </div>
      </header>

      {/* 2. Main Interactive Dashboard Grid */}
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20 relative z-10 flex-1">
        
        {/* LEFT COLUMN: GESTURE COCKPIT & WEBCAM FEED */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          
          {/* A. SYSTEM HARDWARE CONTROL CENTER */}
          <div className="bg-black/60 border border-white/10 rounded-xl overflow-hidden p-5 shadow-xl flex flex-col">
            <h2 className="text-[10px] font-bold tracking-widest font-mono text-white/40 uppercase flex items-center gap-2 mb-4">
              <Terminal className="h-4 w-4 text-cyan-400" />
              <span>DRIVER SELECTION MODULE</span>
            </h2>

            {/* Toggle Button layout */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                id="control_key_mode"
                onClick={() => setUseGestureControl(false)}
                className={`py-3 px-3 rounded-lg border text-[10px] font-black uppercase tracking-widest font-mono flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer ${
                  !useGestureControl 
                    ? "bg-cyan-500/10 border-cyan-400 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                    : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Keyboard className="h-4 w-4" />
                <span>KEYBOARD</span>
              </button>

              <button
                id="control_cam_mode"
                onClick={() => setUseGestureControl(true)}
                className={`py-3 px-3 rounded-lg border text-[10px] font-black uppercase tracking-widest font-mono flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer ${
                  useGestureControl 
                    ? "bg-[#32ff32]/10 border-[#32ff32] text-[#32ff32] shadow-[0_0_12px_rgba(50,255,50,0.15)]"
                    : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Video className="h-4 w-4" />
                <span>WEBCAM</span>
              </button>
            </div>

            {/* Active Control Mode instructions card */}
            <div className="rounded-lg bg-black/40 border border-white/5 p-4 flex-1">
              {!useGestureControl ? (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                    <span className="text-[10px] font-mono font-black tracking-wider text-cyan-400 uppercase">STANDARD MANUAL ACTIVE</span>
                  </div>
                  <ul className="text-[11px] space-y-2 text-white/40 font-mono">
                    <li className="flex items-center space-x-2">
                      <span className="text-cyan-400">✦</span>
                      <span><b className="text-[#e2e2e2]">A / D</b> or Left/Right Arrows for swapping lanes</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="text-cyan-400">✦</span>
                      <span>Hold <b className="text-[#e2e2e2]">W</b> to accelerate relative velocity</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="text-cyan-400">✦</span>
                      <span>Hold <b className="text-[#e2e2e2]">S</b> to engage hydraulic brakes</span>
                    </li>
                    <li className="flex items-center space-x-2 text-[#32ff32]">
                      <span className="text-[#32ff32]">✦</span>
                      <span>Press <b className="text-[#32ff32]">SPACE</b> or <b className="text-[#32ff32]">N</b> for Nitro Booster</span>
                    </li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#32ff32] animate-ping" />
                    <span className="text-[10px] font-mono font-black tracking-wider text-[#32ff32] uppercase">COMPUTER VISION WEBCAM ACTIVE</span>
                  </div>
                  <p className="text-[11px] text-white/40 font-mono leading-relaxed uppercase tracking-wide">
                    Show a single hand inside the camera capture block below to pilot your sports car. Keep hand well lit.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* B. WEBCAM INTERFACE & GESTURE STATUS CARD */}
          <AnimatePresence mode="wait">
            {useGestureControl && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="bg-black/60 border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-xl"
              >
                <div className="p-3 bg-white/5 border-b border-white/10 flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#e0e0e0] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    WEBCAM TELEMETRY STREAM
                  </span>
                  <span className="text-[10px] bg-red-500/20 text-red-400 px-2 rounded-full font-mono font-black">REC</span>
                </div>

                {/* Webcam box framing */}
                <div className="relative aspect-[4/3] bg-[#050505] overflow-hidden flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover hidden"
                  />
                  
                  {/* Canvas overlay for drawing tracking bone structures */}
                  <canvas
                    ref={webcamCanvasRef}
                    width={320}
                    height={240}
                    className="absolute inset-0 w-full h-full object-cover"
                  />

                  {/* Absolute positioning loaders and alerts */}
                  {scriptsLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-4 text-center space-y-3">
                      <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-[#32ff32] animate-spin" />
                      <p className="text-[10px] font-mono uppercase tracking-widest text-white/50">Loading Computer Vision Models...</p>
                    </div>
                  )}

                  {!scriptsLoading && !cameraActive && !mpError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-black/90 space-y-3">
                      <Video className="h-8 w-8 text-white/20 animate-pulse" />
                      <p className="text-[10px] font-mono uppercase tracking-widest text-white/50">Waiting for Camera Init...</p>
                    </div>
                  )}

                  {mpError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/90 p-6 text-center space-y-3 text-red-400">
                      <ShieldAlert className="h-8 w-8 text-[#ef4444]" />
                      <p className="text-[10px] font-mono uppercase tracking-widest">{mpError}</p>
                      <button
                        onClick={() => setUseGestureControl(false)}
                        className="px-3 py-1.5 text-[9px] rounded bg-white/5 hover:bg-white/10 border border-white/10 font-mono tracking-wider uppercase cursor-pointer"
                      >
                        SWITCH TO KEYBOARD
                      </button>
                    </div>
                  )}
                </div>

                {/* Captured gesture indicator card */}
                <div className="p-4 bg-white/5 border-t border-white/10 flex flex-col items-center text-center">
                  <span className="text-white/40 font-mono text-[9px] uppercase tracking-wider">Detected Hand Posture</span>
                  
                  {/* Neon flashing indicator */}
                  <div className="mt-2 flex items-center space-x-3">
                    <span className="text-4xl">
                      {detectedGesture === "Open Palm" && "🖐️"}
                      {detectedGesture === "Fist" && "✊"}
                      {detectedGesture === "Victory Sign" && "✌️"}
                      {detectedGesture === "Point Left" && "👈"}
                      {detectedGesture === "Point Right" && "👉"}
                      {detectedGesture === "No Hand" && "❌"}
                      {detectedGesture === "Unknown Pose" && "🤔"}
                    </span>
                    <span className={`text-lg font-black font-mono uppercase tracking-widest ${
                      detectedGesture === "No Hand" ? "text-white/20" : "text-[#32ff32]"
                    }`}>
                      {detectedGesture}
                    </span>
                  </div>

                  <div className="mt-3 text-[10px] font-mono text-white/50 tracking-wide uppercase leading-relaxed">
                    {detectedGesture === "Open Palm" && "Mapped: ACCELERATING THRUSTS (+35% Speed)"}
                    {detectedGesture === "Fist" && "Mapped: HYDRAULIC PRESSURE BRAKES (-60% Speed)"}
                    {detectedGesture === "Victory Sign" && "Mapped: IGNITING LIME NITRO BOOSTERS (Lasts 3s)"}
                    {detectedGesture === "Point Left" && "Mapped: STEERING TRANSITION ONE LANE LEFT"}
                    {detectedGesture === "Point Right" && "Mapped: STEERING TRANSITION ONE LANE RIGHT"}
                    {detectedGesture === "No Hand" && "Position your fingers facing clearly towards video stream"}
                    {detectedGesture === "Unknown Pose" && "Unknown finger geometry - See posturing map instructions"}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* C. VISUAL CHEATSHEET & DOCUMENT LINKS */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-5 font-mono text-xs text-white/50 space-y-4">
            <h4 className="text-white font-bold tracking-wider text-[10px] mb-2 uppercase text-center border-b border-white/10 pb-2">
              POSTURE DIRECTORY & MAPPINGS
            </h4>
            <div className="grid grid-cols-2 gap-3 text-[10px]">
              <div className="p-2.5 rounded bg-black/60 border border-white/5 flex flex-col items-center">
                <span className="text-xl">🖐️</span>
                <span className="text-white font-bold mt-1 text-[9px] uppercase tracking-wider">OPEN PALM</span>
                <span className="text-cyan-400 text-[9px] font-semibold mt-0.5">ACCELERATE</span>
              </div>
              <div className="p-2.5 rounded bg-black/60 border border-white/5 flex flex-col items-center">
                <span className="text-xl">✊</span>
                <span className="text-white font-bold mt-1 text-[9px] uppercase tracking-wider">FIST</span>
                <span className="text-cyan-400 text-[9px] font-semibold mt-0.5">BRAKE/SLOW</span>
              </div>
              <div className="p-2.5 rounded bg-black/60 border border-white/5 flex flex-col items-center col-span-2">
                <span className="text-xl">👈  👉</span>
                <span className="text-white font-bold mt-1 text-[9px] uppercase tracking-wider">POINT LEFT / RIGHT</span>
                <span className="text-cyan-400 text-[9px] font-semibold mt-0.5">SHIFT TRANSITION LANES</span>
              </div>
              <div className="p-2.5 rounded bg-fuchsia-500/10 border border-fuchsia-500/30 flex flex-col items-center col-span-2">
                <span className="text-xl">✌️</span>
                <span className="text-fuchsia-400 font-bold mt-1 text-[9px] uppercase tracking-wider">VICTORY HAND</span>
                <span className="text-fuchsia-300/80 text-[9px] font-semibold mt-0.5">FIRE NITRO BOOSTER</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: INTERACTIVE RACE STAGE */}
        <div className="lg:col-span-8 flex flex-col space-y-6">
          
          {/* THE HIGH-FIDELITY WEB-CANVAS SIMULATOR */}
          <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] overflow-hidden flex flex-col shadow-2xl relative">
              
              {/* Virtual HUD Dashboard */}
              <div className="bg-black/40 px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
                
                {/* Score digits */}
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono tracking-widest text-white/40 uppercase">SPEEDWAY SCORE</span>
                  <span className="text-2xl font-black text-white italic font-display">
                    {score.toString().padStart(6, "0")}
                  </span>
                </div>

                {/* Distance metrics */}
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono tracking-widest text-white/40 uppercase">RUN DISTANCE</span>
                  <span className="text-xl font-bold font-mono text-[#e0e0e0]">
                    {distance.toFixed(1)} KM
                  </span>
                </div>

                {/* Digital Speedometer Gauge */}
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-mono tracking-widest text-white/40 uppercase">VELOCITY MODULE</span>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-black italic font-display ${
                      nitroActive ? "text-fuchsia-400 drop-shadow-[0_0_8px_rgba(217,70,239,0.5)]" : "text-cyan-400"
                    }`}>
                      {playerSpeedKmh}
                    </span>
                    <span className="text-[10px] font-bold text-white/60">KM/H</span>
                  </div>
                </div>

                {/* Nitro booster readiness meter */}
                <div className="flex flex-col min-w-[120px]">
                  <span className="text-[10px] font-mono tracking-widest text-white/40 uppercase mb-1">NITRO INJECTORS</span>
                  {nitroActive ? (
                    <div className="px-2 py-1.5 rounded bg-fuchsia-500/20 border border-fuchsia-500/40 text-center shadow-[0_0_12px_rgba(217,70,239,0.3)]">
                      <span className="text-[9px] font-mono font-bold text-fuchsia-400 animate-pulse uppercase">ACTIVE FLAMES</span>
                    </div>
                  ) : nitroCooldown > 0 ? (
                    <div className="w-full bg-black/60 rounded overflow-hidden h-6.5 relative flex items-center justify-center border border-white/10">
                      <div 
                        className="bg-amber-500/20 h-full absolute left-0 top-0 transition-all"
                        style={{ width: `${(10 - nitroCooldown) * 10}%` }}
                      />
                      <span className="text-[10px] font-mono text-amber-400 font-semibold relative z-10 uppercase text-[9px] tracking-wide">RECHARGING {nitroCooldown}s</span>
                    </div>
                  ) : (
                    <button
                      id="action_nitro_trigger"
                      onClick={() => triggerNitroBoost()}
                      disabled={gameState !== "PLAYING"}
                      className="px-2 py-1.5 rounded bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-mono font-bold text-[9px] tracking-wider text-center cursor-pointer uppercase transition-all disabled:opacity-40 shadow-[0_0_12px_rgba(217,70,239,0.3)]"
                    >
                      BOOST [✌️]
                    </button>
                  )}
                </div>
              </div>

              {/* Physical HTML5 Canvas container */}
              <div className="relative w-full flex justify-center bg-[#07070a]/90 py-5 border-b border-white/10">
                <canvas
                  id="airracer_game_canvas"
                  ref={gameCanvasRef}
                  width={440}
                  height={500}
                  className="rounded-lg shadow-[0_0_40px_rgba(0,0,0,0.8)] border border-white/5 cursor-crosshair max-w-full relative z-10"
                />

                {/* Action Floating Buttons depending on internal state */}
                {gameState === "MENU" && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/70 backdrop-blur-sm z-20">
                    <div className="pointer-events-auto bg-black/90 border border-white/10 rounded-2xl p-8 max-w-sm text-center shadow-2xl flex flex-col space-y-6">
                      <div className="flex justify-center flex-col items-center gap-2">
                        <Flame className="h-10 w-10 text-cyan-400 animate-pulse drop-shadow-[0_0_10px_rgba(6,182,212,0.4)]" />
                        <span className="text-[10px] font-mono tracking-widest text-[#32ff32] font-black uppercase">SIMULATOR READY</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-white tracking-widest font-display uppercase italic">AIRRACER AI COCKPIT</h3>
                        <p className="text-xs text-white/50 mt-2 font-mono">
                          Webcam Hand Postures and physics simulation wrapper.
                        </p>
                      </div>
                      <button
                        onClick={() => resetSimulator()}
                        className="py-3 px-6 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-black uppercase transition-all duration-200 tracking-widest flex items-center justify-center space-x-2 shadow-[0_0_15px_rgba(6,182,212,0.4)] cursor-pointer"
                      >
                        <Play className="h-4 w-4 fill-black text-black border-none" />
                        <span>START SIMULATION</span>
                      </button>
                    </div>
                  </div>
                )}

                {gameState === "PAUSED" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20">
                    <button
                      onClick={() => {
                        simRef.current.gameState = "PLAYING";
                        setGameState("PLAYING");
                        playSynthSound("beep");
                      }}
                      className="py-3.5 px-6 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-black tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] cursor-pointer"
                    >
                      RESUME RUN
                    </button>
                  </div>
                )}

                {gameState === "GAMEOVER" && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/75 backdrop-blur-sm z-20">
                    <div className="pointer-events-auto bg-black/90 border border-red-500/30 rounded-2xl p-8 max-w-sm text-center shadow-2xl flex flex-col space-y-5">
                      <div className="h-12 w-12 rounded-full bg-red-500/10 border border-red-500/30 mx-auto flex items-center justify-center">
                        <ShieldAlert className="h-6 w-6 text-red-500 animate-pulse" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-red-500 tracking-widest font-display uppercase italic">CRITICAL COLLISION</h3>
                        <p className="text-xs text-white/50 font-mono mt-1">
                          The pilot pod sustained fatal system impacts. High scores updated.
                        </p>
                      </div>
                      <button
                        onClick={() => resetSimulator()}
                        className="py-3 px-6 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-black uppercase transition-all flex items-center justify-center space-x-2 shadow-[0_0_15px_rgba(6,182,212,0.4)] cursor-pointer"
                      >
                        <RotateCcw className="h-4 w-4" />
                        <span>REVIVE PILOT & RESTART</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* D. HYBRID MOBILE AND SCREEN TOUCH SHORTCUTS */}
              <div className="p-5 bg-black/40 flex flex-col space-y-3 border-t border-white/10">
                <span className="text-[9px] font-mono tracking-widest text-white/40 uppercase text-center block">
                  ON-SCREEN COCKPIT SHORTCUTS (PILOT CONSOLE OVERRIDES)
                </span>
                
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    onClick={() => {
                      if (gameState === "PLAYING") movePlayerLane("left");
                    }}
                    disabled={gameState !== "PLAYING"}
                    className="py-2.5 px-4 rounded bg-[#ffffff]/5 hover:bg-[#ffffff]/10 border border-[#ffffff]/10 font-mono text-xs text-white font-bold tracking-widest transition-all hover:scale-105 disabled:opacity-30 cursor-pointer"
                  >
                    ◀ STEER LEFT [A]
                  </button>

                  <button
                    onClick={() => {
                      if (gameState === "PLAYING") {
                        simRef.current.targetSpeed = Math.min(simRef.current.maxNormalSpeed * 1.3, simRef.current.playerSpeed + 1.2);
                        playSynthSound("beep");
                      }
                    }}
                    disabled={gameState !== "PLAYING"}
                    className="py-2.5 px-4 rounded bg-[#32ff32]/15 hover:bg-[#32ff32]/25 border border-[#32ff32]/35 font-mono text-xs text-[#32ff32] font-bold tracking-widest transition-all hover:scale-105 disabled:opacity-30 cursor-pointer"
                  >
                    ▲ ACCELERATE [W]
                  </button>

                  <button
                    onClick={() => {
                      if (gameState === "PLAYING") {
                        simRef.current.targetSpeed = Math.max(3.0, simRef.current.playerSpeed - 1.5);
                        playSynthSound("beep");
                      }
                    }}
                    disabled={gameState !== "PLAYING"}
                    className="py-2.5 px-4 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 font-mono text-xs text-red-400 font-bold tracking-widest transition-all hover:scale-105 disabled:opacity-30 cursor-pointer"
                  >
                    ▼ HYDRAULIC BRAKE [S]
                  </button>

                  <button
                    onClick={() => {
                      if (gameState === "PLAYING") movePlayerLane("right");
                    }}
                    disabled={gameState !== "PLAYING"}
                    className="py-2.5 px-4 rounded bg-[#ffffff]/5 hover:bg-[#ffffff]/10 border border-[#ffffff]/10 font-mono text-xs text-white font-bold tracking-widest transition-all hover:scale-105 disabled:opacity-30 cursor-pointer"
                  >
                    STEER RIGHT ▶ [D]
                  </button>
                </div>
              </div>

              {/* Pause Trigger Button for non-keyboard users */}
              <div className="px-6 py-4 bg-black/60 border-t border-white/10 flex items-center justify-between">
                <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">
                  {gameState === "PLAYING" ? "● RACE IN PROGRESS..." : "○ ENGINE IDLE STANDBY"}
                </span>
                {gameState === "PLAYING" && (
                  <button
                    onClick={() => {
                      simRef.current.gameState = "PAUSED";
                      setGameState("PAUSED");
                      playSynthSound("beep");
                    }}
                    className="text-[10px] font-mono font-bold tracking-wider uppercase py-2 px-4 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white flex items-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    <span>PAUSE SIMULATION</span>
                  </button>
                )}
              </div>
            </div>

        </div>
      </div>
      
      {/* 3. Footer Copyright */}
      <footer className="border-t border-white/10 bg-black/60 relative py-8 text-center text-[10px] text-white/40 font-mono uppercase tracking-widest mt-auto z-10">
        <p>© 2026 AIRRACER AI. ALL RIGHTS RESERVED.</p>
        <p className="mt-1 text-white/20">POWERED BY AKASH</p>
      </footer>
    </div>
  );
}
