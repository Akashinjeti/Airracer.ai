"""
AirRacer AI - Core Pygame System
Coordinates the game states (Menu, Playing, Paused, GameOver), spawns enemies, updates lanes,
calculates collision intersections, runs the nitro cooldown system, and renders details.
"""
import pygame
import random
import sys
import os
import time
from config import (
    WIDTH, HEIGHT, FPS, LANES, ENEMY_SPAWN_BASE_COOLDOWN,
    ROAD_SPEED_START, MAX_ROAD_SPEED, DIFFICULTY_SCORE_INTERVAL,
    NEON_BLUE, NEON_GREEN, NEON_CRIMSON, NEON_GOLD, WHITE, GRAY, HIGHER_SPEED_COLOR := (255,160,0), HIGH_SCORE_FILE
)
from road import Road
from car import PlayerCar
from enemy import EnemyCar
from ui import draw_text, Button, ParticleSystem
# Defensive check for camera modules
try:
    from gesture_controller import GestureController
    CAMERA_MODULE_OK = True
except ImportError:
    CAMERA_MODULE_OK = False

class Game:
    def __init__(self):
        pygame.init()
        # Initialize mixer for sound effects if audio engine is available
        try:
            pygame.mixer.init()
            self._has_sound = True
        except:
            self._has_sound = False
            
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("AirRacer AI - Gesture Controlled Highspeed Racing")
        self.clock = pygame.time.Clock()
        
        # Core mechanics
        self.road = Road()
        self.player = PlayerCar()
        self.enemies = []
        self.particles = ParticleSystem()
        
        # State machine
        # Possible: "MENU", "PLAYING", "PAUSED", "GAMEOVER"
        self.state = "MENU"
        
        # Scoring & Records
        self.score = 0
        self.distance = 0.0
        self.high_score = self.load_high_score()
        self.difficulty_level = 1
        
        # Cooldown management indices
        self.nitro_active = False
        self.nitro_timer = 0.0
        self.nitro_cooldown = 0.0
        self.nitro_ready_notified = True

        # Last gesture cache
        self.active_gesture = "No Hand"
        self.camera_fps = 0.0
        self.camera_feed_surf = None
        
        # Spawn timers
        self.last_spawn_time = 0
        self.spawn_cooldown = ENEMY_SPAWN_BASE_COOLDOWN
        
        # Camera Controller Integration
        self.gesture_controller = None
        self.use_gesture_control = True  # Toggle flags
        
        # Initialize camera thread
        if CAMERA_MODULE_OK:
            try:
                # 0 is the typical integrated webcam
                self.gesture_controller = GestureController(camera_idx=0)
                self.gesture_controller.start()
            except Exception as e:
                print(f"Webcam initialization error: {e}. Defaulting to keyboard model overrides.")
                self.use_gesture_control = False

        # Menu buttons
        self.start_btn = Button("START GAME", 240, 50, WIDTH // 2, HEIGHT // 2 - 30, NEON_GREEN)
        self.controls_btn = Button("TOGGLE CONTROL: WEBCAM", 300, 50, WIDTH // 2, HEIGHT // 2 + 40, NEON_BLUE)
        self.quit_btn = Button("QUIT GAME", 240, 50, WIDTH // 2, HEIGHT // 2 + 110, NEON_CRIMSON)
        self.restart_btn = Button("PLAY AGAIN", 240, 50, WIDTH // 2, HEIGHT // 2 + 20, NEON_GREEN)
        self.menu_btn = Button("MAIN MENU", 240, 50, WIDTH // 2, HEIGHT // 2 + 90, NEON_BLUE)

        # Spark textures
        self.last_trail_time = 0

    def load_high_score(self):
        """Retrieves user's lifetime best score from high_score.txt."""
        if os.path.exists(HIGH_SCORE_FILE):
            try:
                with open(HIGH_SCORE_FILE, "r") as f:
                    return int(f.read().strip())
            except:
                return 0
        return 0

    def save_high_score(self):
        """Overwrites high score text if currently outpaced."""
        if self.score > self.high_score:
            self.high_score = self.score
            try:
                with open(HIGH_SCORE_FILE, "w") as f:
                    f.write(str(self.high_score))
            except Exception as e:
                print(f"Failed to record high score to disk: {e}")

    def trigger_crash_explosion(self):
        """Spawns an expansive ring of smoke and neon sparks upon vehicle collision."""
        px, py = self.player.x, self.player.y
        self.particles.spawn(px, py, (-6, 6), (-6, 6), (4, 12), NEON_CRIMSON, count=60)
        self.particles.spawn(px, py, (-3, 3), (-3, 3), (3, 8), NEON_GOLD, count=30)
        
        # Audio cue
        self.play_sound("crash")

    def play_sound(self, sound_type):
        """Plays custom synthetic chime or crash alerts if audio channels are open."""
        # Visual/structural cues: avoids crashing systems if Pygame audio can't initialize
        pass

    def check_collisions(self):
        """Passes through objects using bounding box intersection checks."""
        p_rect = self.player.get_rect()
        for enemy in self.enemies:
            e_rect = enemy.get_rect()
            if p_rect.colliderect(e_rect):
                self.trigger_crash_explosion()
                self.save_high_score()
                self.state = "GAMEOVER"
                break

    def spawn_enemy_car(self):
        """Randomly pushes a speed obstacle down lanes, avoiding immediate overlap."""
        # Select random lane from 0 to 3
        candidate_lanes = [0, 1, 2, 3]
        # Keep safe spawning by ensuring no double stacks in adjacent rows right on top of each other
        if self.enemies:
            # Check recently spawned vehicles coordinates
            recent = [e for e in self.enemies if e.y < 120]
            for r in recent:
                if r.lane_index in candidate_lanes:
                    candidate_lanes.remove(r.lane_index)
                    
        if candidate_lanes:
            lane = random.choice(candidate_lanes)
            new_enemy = EnemyCar(lane, self.player.speed)
            self.enemies.append(new_enemy)

    def update_difficulty(self):
        """Gradually speeds up obstacle velocities and scales spawning rates as score ascends."""
        # Calculate steps of 500
        new_diff = 1 + (self.score // DIFFICULTY_SCORE_INTERVAL)
        if new_diff != self.difficulty_level:
            self.difficulty_level = new_diff
            # Scale spawn cooling rates
            self.spawn_cooldown = max(600, ENEMY_SPAWN_BASE_COOLDOWN - (self.difficulty_level * 120))
            # Boost score particles as a visual prompt
            self.particles.spawn(WIDTH // 4, HEIGHT // 3, (-4, 4), (-4, 4), (5, 9), NEON_GREEN, count=25)

    def reset_game(self):
        """Re-initializes structures for a fresh race session."""
        self.enemies.clear()
        self.particles.particles.clear()
        self.player = PlayerCar()
        self.score = 0
        self.distance = 0.0
        self.difficulty_level = 1
        self.nitro_active = False
        self.nitro_timer = 0.0
        self.nitro_cooldown = 0.0
        self.spawn_cooldown = ENEMY_SPAWN_BASE_COOLDOWN
        self.state = "PLAYING"

    def handle_keyboard_fallback(self, keys):
        """Translates basic WASD/Arrows to lane movements, acceleration, and manual Nitro boosts."""
        # Lane swapping limits rapid switches
        # Using KEYDOWN event in main loop keeps lane moves to one press, but checking here works if throttled
        pass

    def run_main_loop(self):
        """Core Pygame dispatch loop running at config-targeted FPS rate."""
        running = True
        
        while running:
            dt = self.clock.tick(FPS) / 1000.0  # Time step in seconds
            
            # 1. Event Polling
            mouse_pos = pygame.mouse.get_pos()
            for event in pygame.event.get_down_queue_standard := pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                    
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        if self.state == "PLAYING":
                            self.state = "PAUSED"
                        elif self.state == "PAUSED":
                            self.state = "PLAYING"
                            
                    elif event.key == pygame.K_f:  # Toggle Control Flow
                        self.use_gesture_control = not self.use_gesture_control
                        
                    elif event.key == pygame.K_f12:  # Screenshot capture key
                        self.save_screenshot()
                        
                    # Standard manual controller bypasses
                    if self.state == "PLAYING" and not self.use_gesture_control:
                        if event.key in (pygame.K_LEFT, pygame.K_a):
                            self.player.move_left()
                        elif event.key in (pygame.K_RIGHT, pygame.K_d):
                            self.player.move_right()
                        elif event.key == pygame.K_n:  # Manual Nitro Trigger
                            self.activate_nitro()

                # Mouse interaction
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if self.state == "MENU":
                        if self.start_btn.check_hover(mouse_pos):
                            self.reset_game()
                        elif self.controls_btn.check_hover(mouse_pos):
                            self.use_gesture_control = not self.use_gesture_control
                        elif self.quit_btn.check_hover(mouse_pos):
                            running = False
                            
                    elif self.state == "GAMEOVER":
                        if self.restart_btn.check_hover(mouse_pos):
                            self.reset_game()
                        elif self.menu_btn.check_hover(mouse_pos):
                            self.state = "MENU"

            # 2. Camera Processing Sync
            if self.gesture_controller and self.gesture_controller.is_running:
                camera_state = self.gesture_controller.get_state()
                self.active_gesture = camera_state["gesture"]
                self.camera_fps = camera_state["fps"]
                
                # Convert raw numpy camera matrix to native Pygame Surface if available
                if camera_state["display"] is not None:
                    # OpenCV is BGR, Pygame expects RGB: transposing dimensions cleanly
                    rgb_cv = cv2_rgb := cv2.cvtColor(camera_state["display"], cv2.COLOR_BGR2RGB)
                    # Rotate the raw array as Pygame has transposed matrix dimensions
                    transposed_frame = np.rot90(rgb_cv)
                    self.camera_feed_surf = pygame.surfarray.make_surface(transposed_frame)
            else:
                self.active_gesture = "Camera Offline"
                self.camera_fps = 0.0

            # 3. Apply Controls based on selected modes
            if self.state == "PLAYING":
                if self.use_gesture_control and self.active_gesture not in ("No Hand", "Camera Offline"):
                    self.apply_gesture_commands()
                else:
                    # Keyboard holds checking
                    keys = pygame.key.get_pressed()
                    if keys[pygame.K_UP] or keys[pygame.K_w]:
                        self.player.target_speed = min(self.player.max_normal_speed * 1.3, self.player.speed + 0.4)
                    elif keys[pygame.K_DOWN] or keys[pygame.K_s]:
                        self.player.target_speed = max(3.0, self.player.speed - 0.5)
                    else:
                        self.player.target_speed = 10.0  # Cruise velocity

                # 4. State Updates
                self.update_simulation(dt)

            # 5. Drawing Renders
            self.draw_game_elements()
            
            pygame.display.flip()

        # Clean thread loops upon game exit
        if self.gesture_controller:
            self.gesture_controller.stop()
        pygame.quit()
        sys.exit()

    def apply_gesture_commands(self):
        """Translates current classified gestures to player mechanics coordinates."""
        # To avoid hyper-active trigger loops, lane-changing is usually throttled.
        # We handle this by verifying the gesture shifts lanes upon state change,
        # but standard check:
        now_ticks = pygame.time.get_ticks()
        
        # Debounce lane swaps:
        if not hasattr(self, "_last_gesture_action_time"):
            self._last_gesture_action_time = 0
            
        if now_ticks - self._last_gesture_action_time > 450:  # 450ms movement cooloff
            if self.active_gesture == "Point Left":
                self.player.move_left()
                self._last_gesture_action_time = now_ticks
            elif self.active_gesture == "Point Right":
                self.player.move_right()
                self._last_gesture_action_time = now_ticks
                
        # Accel & Brake (analogous continuous rates)
        if self.active_gesture == "Open Palm":
            # Speed boosts
            self.player.target_speed = min(self.player.max_normal_speed * 1.4, self.player.speed + 0.4)
        elif self.active_gesture == "Fist":
            # Strong Engine Braking
            self.player.target_speed = max(2.5, self.player.speed - 0.75)
        else:
            # Steady cruising velocity if not giving active speed signals
            if not self.nitro_active:
                self.player.target_speed = 10.0

        # Victory Sign triggers Nitro Booster
        if self.active_gesture == "Victory Sign":
            self.activate_nitro()

    def activate_nitro(self):
        """Charges nitro injectors, temporarily spiking road velocity."""
        if not self.nitro_active and self.nitro_cooldown <= 0:
            self.nitro_active = True
            self.nitro_timer = 0.0
            self.nitro_cooldown = 0.0
            self.player.target_speed = self.player.max_normal_speed * 1.6
            self.nitro_ready_notified = False
            
            # Emit glowing thrust trails
            px, py = self.player.x, self.player.y + self.player.height // 2
            self.particles.spawn(px, py, (-4, 4), (4, 10), (3, 8), NEON_GREEN, count=35)

    def update_simulation(self, dt):
        """Moves road separators, updates coordinates, computes timers, and checks collision passes."""
        # 1. Timers
        if self.nitro_active:
            self.nitro_timer += dt
            if self.nitro_timer >= 3.0:
                self.nitro_active = False
                self.nitro_cooldown = 10.0
                self.player.target_speed = 10.0
        elif self.nitro_cooldown > 0:
            self.nitro_cooldown = max(0.0, self.nitro_cooldown - dt)
            if self.nitro_cooldown <= 0 and not self.nitro_ready_notified:
                self.nitro_ready_notified = True

        # 2. Road scrolling
        self.road.update(self.player.speed)

        # 3. Player Updates
        self.player.update(dt)

        # 4. Spitting out exhaust flames
        now_ticks = pygame.time.get_ticks()
        if now_ticks - self.last_trail_time > 80:
            self.last_trail_time = now_ticks
            px, py = self.player.x, self.player.y + self.player.height
            trail_color = NEON_GREEN if self.nitro_active else NEON_BLUE
            self.particles.spawn(px, py, (-1.5, 1.5), (3, 6), (2.1, 4.5), trail_color, count=2)

        # 5. Spawn mechanics
        curr_time = pygame.time.get_ticks()
        if curr_time - self.last_spawn_time > self.spawn_cooldown:
            self.spawn_enemy_car()
            self.last_spawn_time = curr_time

        # 6. Enemies advance relative to player speeds
        remaining_enemies = []
        for enemy in self.enemies:
            enemy.update(self.player.speed, dt)
            if not enemy.is_offscreen():
                remaining_enemies.append(enemy)
            else:
                # Earn score points once obstacles safely drop behind
                self.score += 100
                self.distance += 0.2
                self.update_difficulty()
        self.enemies = remaining_enemies

        # 7. Collision checks
        self.check_collisions()

        # 8. Particles system TICK
        self.particles.update()

    def draw_game_elements(self):
        """Decides active scene view (menus/gameplay) and flushes draw orders to Pygame window buffer."""
        # Always redraw background layers
        self.road.draw(self.screen, self.nitro_active)

        if self.state == "MENU":
            self.draw_menu()
            
        elif self.state == "PLAYING":
            # 1. Render all game assets on top of road
            for enemy in self.enemies:
                enemy.draw(self.screen)
            self.player.draw(self.screen, self.nitro_active)
            self.particles.draw(self.screen)
            
            # 2. Render HUD metrics panel
            self.draw_hud()

        elif self.state == "PAUSED":
            # Overlay dim transparency background
            dim = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            dim.fill((0, 0, 0, 160))
            self.screen.blit(dim, (0, 0))
            
            draw_text(self.screen, "RACE PAUSED", 60, NEON_BLUE, WIDTH // 2, HEIGHT // 2 - 80)
            draw_text(self.screen, "Press ESCAPE or HOLD GESTURE [FIST] to resume", 24, WHITE, WIDTH // 2, HEIGHT // 2 - 20)
            draw_text(self.screen, "Use [Point Left/Right] to practice transitions", 18, GRAY, WIDTH // 2, HEIGHT // 2 + 20)

        elif self.state == "GAMEOVER":
            # Dim the playfield
            dim = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            dim.fill((15, 0, 10, 190))
            self.screen.blit(dim, (0, 0))
            
            draw_text(self.screen, "CRITICAL CRASH", 64, NEON_CRIMSON, WIDTH // 2, HEIGHT // 2 - 130)
            draw_text(self.screen, f"FINAL SCORE: {self.score}", 30, WHITE, WIDTH // 2, HEIGHT // 2 - 60)
            draw_text(self.screen, f"DISTANCE CONQUERED: {self.distance:.1f} KM", 20, GRAY, WIDTH // 2, HEIGHT // 2 - 20)
            
            # High score glow checks
            if self.score >= self.high_score:
                draw_text(self.screen, "★ NEW PERSONAL HIGH SCORE ★", 24, NEON_GOLD, WIDTH // 2, HEIGHT // 2 - 100)

            # Draw action buttons
            mouse_pos = pygame.mouse.get_pos()
            self.restart_btn.check_hover(mouse_pos)
            self.menu_btn.check_hover(mouse_pos)
            
            self.restart_btn.draw(self.screen)
            self.menu_btn.draw(self.screen)

    def draw_menu(self):
        """Immersive retro cyber-dash startup display."""
        # Large dim shadow overlay
        dim = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        dim.fill((5, 5, 12, 100))
        self.screen.blit(dim, (0,0))

        # Main glowing logo titles
        draw_text(self.screen, "AIRRACER AI", 74, NEON_GREEN, WIDTH // 2, HEIGHT // 4 - 30)
        draw_text(self.screen, "GESTURE-CONTROLLED COGNITIVE SPEEDWAY", 20, NEON_BLUE, WIDTH // 2, HEIGHT // 4 + 25)
        
        # High score banner
        draw_text(self.screen, f"RECORD HIGH: {self.high_score} PTS", 22, NEON_GOLD, WIDTH // 2, HEIGHT // 4 + 65)

        # Mouse responsive boxes
        mouse_pos = pygame.mouse.get_pos()
        self.start_btn.check_hover(mouse_pos)
        self.controls_btn.text = f"CONTROL: {'WEBCAM GESTURE' if self.use_gesture_control else 'KEYBOARD MODES'}"
        self.controls_btn.check_hover(mouse_pos)
        self.quit_btn.check_hover(mouse_pos)

        self.start_btn.draw(self.screen)
        self.controls_btn.draw(self.screen)
        self.quit_btn.draw(self.screen)

        # Setup Instructions list at base
        instr_y = HEIGHT - 110
        draw_text(self.screen, "POSTURE COMMAND CODES:", 18, WHITE, WIDTH // 2, instr_y, align="center")
        draw_text(self.screen, "[OPEN PALM] Accelerate  |  [FIST] Strong Brake  |  [INDEX GESTURE] Point Left/Right to change lanes", 15, GRAY, WIDTH // 2, instr_y + 24)
        draw_text(self.screen, "[VICTORY SIGN] Activate Instant Green Nitro Booster (Lasts 3s, Cooldown 10s)", 15, NEON_GREEN, WIDTH // 2, instr_y + 44)

    def draw_hud(self):
        """Renders heads-up metrics overlay: scores, gear speed, nitro bars, and webcam box."""
        # Top Header Bar background
        hud_bg = pygame.Surface((WIDTH, 80), pygame.SRCALPHA)
        hud_bg.fill((10, 10, 15, 210))
        self.screen.blit(hud_bg, (0,0))
        pygame.draw.line(self.screen, NEON_BLUE, (0, 80), (WIDTH, 80), 2)

        # Stats placements
        draw_text(self.screen, "SCORE", 13, GRAY, 35, 18, align="left")
        draw_text(self.screen, f"{self.score}", 24, WHITE, 35, 34, align="left")

        draw_text(self.screen, "DISTANCE", 13, GRAY, 180, 18, align="left")
        draw_text(self.screen, f"{self.distance:.1f} KM", 24, WHITE, 180, 34, align="left")

        # Digital Speedometer
        speed_kmh = int(self.player.speed * 18)  # Relative scale conversion
        draw_text(self.screen, "SPEED", 13, GRAY, 320, 18, align="left")
        draw_text(self.screen, f"{speed_kmh} KM/H", 24, HIGHER_SPEED_COLOR if self.nitro_active else NEON_BLUE, 320, 34, align="left")

        # Nitro visual charge gauge bar
        bar_x, bar_y = 480, 42
        bar_w, bar_h = 140, 12
        pygame.draw.rect(self.screen, (30, 30, 40), (bar_x, bar_y, bar_w, bar_h))
        
        if self.nitro_active:
            # Draw depleted countdown portion in lime green
            ratio = max(0.0, 1.0 - (self.nitro_timer / 3.0))
            fill_w = int(ratio * bar_w)
            pygame.draw.rect(self.screen, NEON_GREEN, (bar_x, bar_y, fill_w, bar_h))
            draw_text(self.screen, "NITRO BOOST: ACTIVE", 12, NEON_GREEN, bar_x, bar_y - 20, align="left")
        elif self.nitro_cooldown > 0:
            # Show cooling progress
            ratio = 1.0 - (self.nitro_cooldown / 10.0)
            fill_w = int(ratio * bar_w)
            pygame.draw.rect(self.screen, (200, 100, 0), (bar_x, bar_y, fill_w, bar_h))
            draw_text(self.screen, f"RECHARGING... {self.nitro_cooldown:.1f}s", 12, (220, 130, 0), bar_x, bar_y - 20, align="left")
        else:
            # Full ready bar
            pygame.draw.rect(self.screen, NEON_GREEN, (bar_x, bar_y, bar_w, bar_h))
            draw_text(self.screen, "NITRO SYSTEMS: STANDBY", 12, NEON_GREEN, bar_x, bar_y - 20, align="left")

        # Render active camera feedback viewport on bottom corner
        if self.camera_feed_surf and self.use_gesture_control:
            cam_x = WIDTH - 235
            cam_y = HEIGHT - 180
            # Frame border neon contour
            pygame.draw.rect(self.screen, (20, 20, 30), (cam_x - 4, cam_y - 4, 228, 173))
            pygame.draw.rect(self.screen, NEON_BLUE, (cam_x - 2, cam_y - 2, 224, 169), 2)
            self.screen.blit(self.camera_feed_surf, (cam_x, cam_y))
            
            # Small overlays inside camera outline
            cam_label = f"HAND: {self.active_gesture.upper()}"
            draw_text(self.screen, cam_label, 14, NEON_GREEN if self.active_gesture != "No Hand" else WHITE, cam_x + 8, cam_y + 148, align="left")
        elif self.use_gesture_control:
            # Visual backup alerts
            cam_x = WIDTH - 235
            cam_y = HEIGHT - 180
            pygame.draw.rect(self.screen, (20, 20, 28), (cam_x - 2, cam_y - 2, 224, 169))
            pygame.draw.rect(self.screen, NEON_CRIMSON, (cam_x - 2, cam_y - 2, 224, 169), 2)
            draw_text(self.screen, "CAMERA IS OFFLINE", 14, NEON_CRIMSON, cam_x + 112, cam_y + 60, align="center")
            draw_text(self.screen, "No feeds detected. Check", 12, WHITE, cam_x + 112, cam_y + 85, align="center")
            draw_text(self.screen, "webcam permissions", 12, WHITE, cam_x + 112, cam_y + 102, align="center")

        # Basic instructions banner
        draw_text(self.screen, "[F] Toggle control feed  |  [ESC] Pause Game  |  [F12] Take Screenshot", 13, GRAY, 35, 62, align="left")

    def save_screenshot(self):
        """Saves current Pygame frame buffer as a high-quality .png snapshot file."""
        import datetime
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        filename = f"screenshot_{timestamp}.png"
        try:
            pygame.image.save(self.screen, filename)
            # Create a small flash confirmation trail
            self.particles.spawn(WIDTH // 2, HEIGHT // 2, (-5, 5), (-5, 5), (6, 12), WHITE, count=30)
            print(f"Captured screen saved successfully at: {filename}")
        except Exception as e:
            print(f"Failed to capture screen: {e}")
