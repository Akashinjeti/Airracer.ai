"""
AirRacer AI - Enemy Obstacles
Defines dynamic enemy vehicles that spawn randomly on active lanes, with diverse speeds, shapes, and color configurations.
"""
import pygame
import random
from config import HEIGHT, LANES, NEON_CRIMSON, NEON_PURPLE, NEON_GOLD, BLACK, WHITE

class EnemyCar:
    COLORS = [NEON_CRIMSON, NEON_PURPLE, NEON_GOLD, (120, 255, 0), (255, 120, 0), (0, 220, 255)]

    def __init__(self, start_lane, player_speed):
        self.lane_index = start_lane
        self.x = LANES[self.lane_index]
        self.width = 52
        self.height = 96
        self.y = -self.height - 20
        
        # Velocity relative to absolute world road coordinates
        # Slow obstacles crawl, fast ones speed
        base_vel = random.uniform(2.0, 7.0)
        self.vel_y = base_vel

    def update(self, player_speed, dt):
        """Advances vertical position, moving relative to the player's downward progress."""
        # Visual movement is relative: enemy moves down by self.vel_y, road crawls by player_speed
        relative_movement = player_speed - self.vel_y
        self.y += relative_movement

    def is_offscreen(self):
        """Returns bounds flag if vehicle completely finishes scrolling past bottom."""
        return self.y > HEIGHT + 100

    def get_rect(self):
        """Standard axis-aligned box for py-game intersection passes."""
        return pygame.Rect(
            int(self.x - self.width // 2),
            int(self.y),
            self.width,
            self.height
        )

    def draw(self, surface):
        """Draws a procedurally designed rival vehicle with custom tinted canopies and tail blocks."""
        rect = self.get_rect()
        body_color = self.COLORS[hash(self.lane_index) % len(self.COLORS)]

        # Main boxy runner cabin
        pygame.draw.rect(surface, BLACK, rect)
        pygame.draw.rect(surface, body_color, rect, 3)

        # Wheels indicators
        w_w, w_h = 8, 16
        pygame.draw.rect(surface, (50, 50, 50), (rect.left - w_w + 3, rect.top + 10, w_w, w_h))
        pygame.draw.rect(surface, (50, 50, 50), (rect.right - 3, rect.top + 10, w_w, w_h))
        pygame.draw.rect(surface, (50, 50, 50), (rect.left - w_w + 3, rect.bottom - 26, w_w, w_h))
        pygame.draw.rect(surface, (50, 50, 50), (rect.right - 3, rect.bottom - 26, w_w, w_h))

        # Dashboard Glass Windshield
        glass_rect = pygame.Rect(rect.left + 8, rect.top + 28, rect.width - 16, 22)
        pygame.draw.rect(surface, (30, 40, 50), glass_rect)
        pygame.draw.rect(surface, body_color, glass_rect, 1)

        # Headlights indicators
        pygame.draw.rect(surface, WHITE, (rect.left + 8, rect.top + 4, 10, 4))
        pygame.draw.rect(surface, WHITE, (rect.right - 18, rect.top + 4, 10, 4))

        # Taillights (Red glow on rear of enemy cars)
        pygame.draw.rect(surface, (250, 10, 10), (rect.left + 8, rect.bottom - 6, 8, 3))
        pygame.draw.rect(surface, (250, 10, 10), (rect.right - 16, rect.bottom - 6, 8, 3))
