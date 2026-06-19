"""
AirRacer AI - VFX & Visual UI components
Provides text render facilities, glass menu buttons, and particle engines for trails and impacts.
"""
import pygame
import random
from config import WHITE, BLACK, NEON_BLUE

def draw_text(surface, text, size, color, x, y, font_name="sans-serif", align="center"):
    """Text-drawing helper that tries system fonts or falls back to system Default."""
    try:
        font = pygame.font.SysFont(font_name, size, bold=True)
    except:
        font = pygame.font.Font(None, size)
    
    text_surf = font.render(text, True, color)
    text_rect = text_surf.get_rect()
    if align == "center":
        text_rect.center = (x, y)
    elif align == "left":
        text_rect.topleft = (x, y)
    elif align == "right":
        text_rect.topright = (x, y)
    surface.blit(text_surf, text_rect)


class Button:
    def __init__(self, text, width, height, x, y, active_color, base_color=(40, 40, 50)):
        self.text = text
        self.width = width
        self.height = height
        self.x = x
        self.y = y
        self.rect = pygame.Rect(x - width // 2, y - height // 2, width, height)
        self.active_color = active_color
        self.base_color = base_color
        self.hovered = False

    def check_hover(self, mouse_pos):
        self.hovered = self.rect.collidepoint(mouse_pos)
        return self.hovered

    def draw(self, surface):
        """Draws a semi-transparent glass panel with glowing modern neon borders."""
        border_col = self.active_color if self.hovered else self.base_color
        fill_col = (15, 15, 23) if not self.hovered else (border_col[0] // 5, border_col[1] // 5, border_col[2] // 5)
        
        # Transparent overlay backplate
        pygame.draw.rect(surface, fill_col, self.rect)
        
        # Outer glow layering
        border_thickness = 3 if self.hovered else 2
        pygame.draw.rect(surface, border_col, self.rect, border_thickness)
        
        # Center title
        draw_text(surface, self.text, 24, WHITE, self.x, self.y)


class ParticleSystem:
    def __init__(self):
        self.particles = []

    def spawn(self, x, y, dx_range, dy_range, size_range, color, count=1, gravity=0.0):
        """Spawns particles with random initial speeds, sizes, and decay rates."""
        for _ in range(count):
            self.particles.append({
                "x": x,
                "y": y,
                "vx": random.uniform(*dx_range),
                "vy": random.uniform(*dy_range),
                "radius": random.uniform(*size_range),
                "color": color,
                "alpha": 255,
                "decay": random.uniform(3, 8),
                "gravity": gravity
            })

    def update(self):
        """Advances and prunes aged particles."""
        remaining = []
        for p in self.particles:
            p["x"] += p["vx"]
            p["y"] += p["vy"] + p["gravity"]
            p["alpha"] = max(0, p["alpha"] - p["decay"])
            p["radius"] = max(0.1, p["radius"] - 0.05)
            if p["alpha"] > 0 and p["radius"] > 0.5:
                remaining.append(p)
        self.particles = remaining

    def draw(self, surface):
        """Draws transparent circles based on relative alphas."""
        for p in self.particles:
            color = p["color"]
            # Mimic transparency by drawing matching surfaces or blending
            p_surf = pygame.Surface((int(p["radius"] * 2), int(p["radius"] * 2)), pygame.SRCALPHA)
            pygame.draw.circle(p_surf, (color[0], color[1], color[2], int(p["alpha"])), (int(p["radius"]), int(p["radius"])), int(p["radius"]))
            surface.blit(p_surf, (int(p["x"] - p["radius"]), int(p["y"] - p["radius"])))
