"""
AirRacer AI - Infinite Scrolling Highway
Simulates the rolling highway with dashed lines and glowing retro-neon guardrails.
"""
import pygame
import math
from config import (
    ROAD_LEFT, ROAD_RIGHT, LANE_WIDTH, HEIGHT, ROAD_COLOR,
    LANE_MARKER_COLOR, NEON_BLUE, NEON_GREEN, BACKGROUND_COLOR
)

class Road:
    def __init__(self):
        self.scroll_y = 0
        self.stripe_length = 40
        self.stripe_gap = 30
        self.total_stripe_period = self.stripe_length + self.stripe_gap

    def update(self, player_speed):
        """Scrolls road lines downward relative to player speed."""
        self.scroll_y = (self.scroll_y + player_speed) % self.total_stripe_period

    def draw(self, surface, nitro_active=False):
        """Renders the dark highway road bed, dashed separators, and electric guardrails."""
        # Draw background and main asphalt surface
        surf_w, surf_h = surface.get_size()
        surface.fill(BACKGROUND_COLOR)
        
        # Asphalt body
        road_rect = pygame.Rect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, surf_h)
        pygame.draw.rect(surface, ROAD_COLOR, road_rect)

        # Draw scrolling road markers (dashed white lane lines)
        for lane_idx in range(1, 4):  # 3 lines separating 4 lanes
            x_pos = ROAD_LEFT + (lane_idx * LANE_WIDTH)
            
            # Start y-coordinate shifted by scroll amount
            start_y = -self.total_stripe_period + self.scroll_y
            while start_y < surf_h:
                segment_end = min(start_y + self.stripe_length, surf_h)
                if segment_end > 0:
                    pygame.draw.line(
                        surface, 
                        LANE_MARKER_COLOR, 
                        (x_pos, max(0, start_y)), 
                        (x_pos, segment_end), 
                        3
                    )
                start_y += self.total_stripe_period

        # Draw neon guardrails to convey high-speed motion
        guardrail_color = NEON_GREEN if nitro_active else NEON_BLUE
        glow_alpha = int(90 + 30 * math.sin(pygame.time.get_ticks() / 150.0))  # Pulsing edge glows
        
        # Draw multi-layered outer border for a bloom effect
        for weight, alpha_offset in [(8, 4), (4, 2), (2, 1)]:
            pygame.draw.line(surface, [c // alpha_offset for c in guardrail_color], (ROAD_LEFT, 0), (ROAD_LEFT, surf_h), weight)
            pygame.draw.line(surface, [c // alpha_offset for c in guardrail_color], (ROAD_RIGHT, 0), (ROAD_RIGHT, surf_h), weight)
            
        # Hard edge lines
        pygame.draw.line(surface, NEON_MARKER_COLOR_FLAT := WHITE, (ROAD_LEFT, 0), (ROAD_LEFT, surf_h), 2)
        pygame.draw.line(surface, NEON_MARKER_COLOR_FLAT, (ROAD_RIGHT, 0), (ROAD_RIGHT, surf_h), 2)
