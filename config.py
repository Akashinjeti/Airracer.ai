"""
AirRacer AI - Game Configuration
Defines physical and gameplay constants for the Pygame loop and gesture thresholds.
"""

# Screen dimensions
WIDTH = 800
HEIGHT = 600
FPS = 60

# Road settings
ROAD_SPEED_START = 8
MAX_ROAD_SPEED = 24
LANE_COUNT = 4
LANE_WIDTH = 100
# Calculate lane centers (relative to center of screen)
ROAD_WIDTH = LANE_COUNT * LANE_WIDTH
ROAD_LEFT = (WIDTH - ROAD_WIDTH) // 2
ROAD_RIGHT = ROAD_LEFT + ROAD_WIDTH
LANES = [ROAD_LEFT + (i * LANE_WIDTH) + (LANE_WIDTH // 2) for i in range(LANE_COUNT)]

# Colors (RGB Tuple)
BACKGROUND_COLOR = (15, 15, 22)       # Dark sleek slate
ROAD_COLOR = (26, 26, 36)             # Deep gray highway
LANE_MARKER_COLOR = (255, 255, 255)   # Standard dashes
NEON_BLUE = (0, 245, 255)             # Visual accent 1
NEON_CRIMSON = (255, 0, 100)          # Enemy cars
NEON_GREEN = (50, 255, 50)            # Player neon & Nitro-boost
NEON_GOLD = (255, 215, 0)             # High score indicator
NEON_PURPLE = (180, 0, 255)           # Obstacles & Menu buttons
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GRAY = (120, 120, 130)

# Speed parameters
PLAYER_ACCELERATION = 0.5
PLAYER_DECELERATION = 0.3
LANE_TRANSITION_SPEED = 0.22          # Linear interpolation factor (0 to 1)

# Nitro System
NITRO_DURATION = 3.0                  # In seconds
NITRO_COOLDOWN = 10.0                 # In seconds
NITRO_BONUS_MULTIPLIER = 1.6

# Spawning & Game rules
ENEMY_SPAWN_BASE_COOLDOWN = 1500     # In milliseconds
DIFFICULTY_SCORE_INTERVAL = 500       # Points before speed/spawn rate increase
HIGH_SCORE_FILE = "high_score.txt"
