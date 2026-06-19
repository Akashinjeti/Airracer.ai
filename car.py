"""
AirRacer AI - Player Car
Manages state, positioning, smooth lane transitions, and particle emission for the player car.
"""
import pygame
import math
from config import (
    LANES, HEIGHT, LANE_TRANSITION_SPEED, NEON_GREEN, NEON_BLUE, WHITE, BLACK
)

class PlayerCar:
    def __init__(self):
        # Start in lane 1 (second lane from left, zero-indexed)
        self.lane_index = 1
        self.target_x = LANES[self.lane_index]
        self.x = self.target_x
        
        # Fixed vertical position (near bottom of display)
        self.y = HEIGHT - 130
        self.width = 54
        self.height = 98
        
        self.speed = 10.0
        self.max_normal_speed = 16.0
        self.target_speed = self.speed
        
        # Visual rotation for banking during lane shifts
        self.angle = 0.0

    def move_left(self):
        """Decrease lane index smoothly."""
        if self.lane_index > 0:
            self.lane_index -= 1
            self.target_x = LANES[self.lane_index]

    def move_right(self):
        """Increase lane index smoothly."""
        if self.lane_index < len(LANES) - 1:
            self.lane_index += 1
            self.target_x = LANES[self.lane_index]

    def update(self, dt):
        """Handles horizontal moving interpolation and speed updates."""
        # Calculate speed step
        diff_x = self.target_x - self.x
        
        # Determine roll angle depending on transition direction
        self.angle = diff_x * 0.15  # Tilts vehicle into turn
        
        # Move x coordinates closer to target center (linear interpolation)
        self.x += diff_x * LANE_TRANSITION_SPEED
        
        # Gradually transition speed to target speed
        speed_diff = self.target_speed - self.speed
        self.speed += speed_diff * 0.1

    def get_rect(self):
        """Returnspygame.Rect bounding-box for clean collision testing."""
        return pygame.Rect(
            int(self.x - self.width // 2),
            int(self.y),
            self.width,
            self.height
        )

    def draw(self, surface, nitro_active=False):
        """Draws a detailed futuristic cyber-car with procedural glowing elements."""
        glow_color = NEON_GREEN if nitro_active else NEON_BLUE
        
        # Build self-contained vector shape coordinates offset from current center
        car_rect = self.get_rect()
        cx, cy = self.x, self.y + self.height / 2
        
        # Let's draw a rotated polygon for realistic banking
        rad = math.radians(-self.angle)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)
        
        # Local point relative to center -> global screen point with rotation
        def get_rotated_pt(lx, ly):
            gx = cx + (lx * cos_a - ly * sin_a)
            gy = cy + (lx * sin_a + ly * cos_a)
            return (int(gx), int(gy))

        # Main Chassis Points (Local coordinates where center is 0,0)
        h_w = self.width // 2
        h_h = self.height // 2
        
        # Sleek race car geometry
        chassis_pts = [
            get_rotated_pt(-h_w + 5, -h_h),       # Top Left
            get_rotated_pt(h_w - 5, -h_h),        # Top Right
            get_rotated_pt(h_w, -h_h + 30),       # Mid Cabin Right
            get_rotated_pt(h_w + 3, h_h - 20),    # Rear Fender Right
            get_rotated_pt(h_w - 4, h_h),         # Bottom Right
            get_rotated_pt(-h_w + 4, h_h),        # Bottom Left
            get_rotated_pt(-h_w - 3, h_h - 20),   # Rear Fender Left
            get_rotated_pt(-h_w, -h_h + 30),      # Mid Cabin Left
        ]
        
        # 1. Base shadow / glow effect
        for padding in [10, 6, 2]:
            glow_poly = [
                get_rotated_pt(-h_w - padding, -h_h - padding),
                get_rotated_pt(h_w + padding, -h_h - padding),
                get_rotated_pt(h_w + padding + 6, h_h + padding),
                get_rotated_pt(-h_w - padding - 6, h_h + padding),
            ]
            alpha_col = tuple(int(c * 0.25) for c in glow_color)
            pygame.draw.polygon(surface, alpha_col, glow_poly, padding)

        # 2. Draw solid body base
        pygame.draw.polygon(surface, BLACK, chassis_pts)
        pygame.draw.polygon(surface, glow_color, chassis_pts, 3)

        # 3. Windshield/Cockpit
        cabin_pts = [
            get_rotated_pt(-14, -15),
            get_rotated_pt(14, -15),
            get_rotated_pt(18, 15),
            get_rotated_pt(-18, 15),
        ]
        pygame.draw.polygon(surface, (20, 30, 40), cabin_pts)
        pygame.draw.polygon(surface, glow_color, cabin_pts, 2)

        # 4. Rear Spoiler Wing
        spoiler_pts = [
            get_rotated_pt(-h_w - 4, h_h - 5),
            get_rotated_pt(h_w + 4, h_h - 5),
            get_rotated_pt(h_w + 4, h_h),
            get_rotated_pt(-h_w - 4, h_h),
        ]
        pygame.draw.polygon(surface, glow_color, spoiler_pts)

        # 5. Glowing Headlights at top-wheels
        pygame.draw.circle(surface, WHITE, get_rotated_pt(-h_w + 8, -h_h + 5), 4)
        pygame.draw.circle(surface, WHITE, get_rotated_pt(h_w - 8, -h_h + 5), 4)
        
        # 6. Taillights (Glowing Red/Teal)
        tail_color = (255, 0, 0) if not nitro_active else NEON_GREEN
        pygame.draw.rect(surface, tail_color, pygame.Rect(get_rotated_pt(-h_w + 8, h_h - 6), (10, 4)))
        pygame.draw.rect(surface, tail_color, pygame.Rect(get_rotated_pt(h_w - 18, h_h - 6), (10, 4)))
