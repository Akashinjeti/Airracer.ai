"""
AirRacer AI - Python Web Camera Gesture-Controlled Racing Game
Main Entrypoint script for local compilation.
"""
import sys

def check_requirements():
    """Validates presence of core game libraries before executing start blocks."""
    missing = []
    try:
        import pygame
    except ImportError:
        missing.append("pygame")
    try:
        import cv2
    except ImportError:
        missing.append("opencv-python")
    try:
        import mediapipe
    except ImportError:
        missing.append("mediapipe")
    try:
        import numpy
    except ImportError:
        missing.append("numpy")

    if missing:
        print("=" * 60)
        print("MISSING LIBRARIES DETECTED!")
        print("Please run the following command to install the required libraries:")
        print("pip install -r requirements.txt")
        print("\nOr install them manually as follow:")
        print(f"pip install {' '.join(missing)}")
        print("=" * 60)
        sys.exit(1)

if __name__ == "__main__":
    print("[Starting AirRacer AI] - Initiating hardware check...")
    
    # 1. Verify standard modules
    check_requirements()
    
    # 2. Fire up Game
    from game import Game
    try:
        air_racer_game = Game()
        print("-" * 60)
        print("Controls Checklist:")
        print(" - GESTURES CONTROLS: Show your hand to your webcam.")
        print("   * [OPEN PALM] Accelerate")
        print("   * [FIST] Brake")
        print("   * [INDEX POINT LEFT/RIGHT] Change lanes smoothly")
        print("   * [VICTORY SIGN] Nitro booster speed burst (10s recharge)")
        print("\n - KEYBOARD RESERVES:")
        print("   * [A/D] or [Left/Right Arrows] Change Lanes")
        print("   * [W/S] or [Up/Down Arrows] Continuous throttle and brakes")
        print("   * [N] Manually activate nitro rockets")
        print("   * [ESC] Pause options")
        print("   * [F12] Take a screenshot")
        print("-" * 60)
        
        air_racer_game.run_main_loop()
        
    except Exception as e:
        import traceback
        print("\nAn unexpected runtime crash occurred while starting AirRacer AI:")
        traceback.print_exc()
        sys.exit(1)
