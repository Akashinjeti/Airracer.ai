"""
AirRacer AI - Real-time Hand Gesture Controller
Using OpenCV and MediaPipe to capture webcam input, detect a single hand, draw skeletal landmarks, 
calculate webcam FPS, and run heuristic-based gesture classification thread-safely.
"""
import cv2
import mediapipe as mp
import threading
import time
import numpy as np

class GestureController:
    def __init__(self, camera_idx=0):
        self.camera_idx = camera_idx
        self.cap = None
        self.is_running = False
        self.lock = threading.Lock()
        
        # Thread share-states
        self.raw_frame = None       # OpenCV numpy matrix
        self.display_frame = None   # OpenCV overlay frame
        self.current_gesture = "No Hand"
        self.fps = 0.0
        
        # MediaPipe Hands
        self.mp_hands = mp.solutions.hands
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        self.hands_detector = None
        
        # Internal Threading
        self.thread = None

    def start(self):
        """Spawns the background capture and processing worker loop."""
        self.is_running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def stop(self):
        """Requests active camera threads to cleanly terminate."""
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=1.5)
        if self.cap:
            self.cap.release()

    def _run(self):
        """Main camera acquisition loop running on the dedicated background thread."""
        # Warm up MediaPipe
        self.hands_detector = self.mp_hands.Hands(
            max_num_hands=1,
            model_complexity=1,
            min_detection_confidence=0.55,
            min_tracking_confidence=0.55
        )

        self.cap = cv2.VideoCapture(self.camera_idx, cv2.CAP_DSHOW if cv2.getBuildInformation().find("DSHOW") != -1 else cv2.CAP_ANY)
        # Attempt standard low latency / framerate settings
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, 30)

        prev_time = time.time()
        
        while self.is_running:
            ret, frame = self.cap.read()
            if not ret or frame is None:
                # Small wait to prevent thread starvation if camera is busy or preparing
                time.sleep(0.01)
                continue

            # Mirror the image horizontally for natural visual coordination
            frame = cv2.flip(frame, 1)
            h, w, c = frame.shape

            # Convert standard BGR OpenCV format to RGB for MediaPipe inference
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.hands_detector.process(rgb_frame)

            detected_gesture = "No Hand"

            if results.multi_hand_landmarks:
                for hand_landmarks in results.multi_hand_landmarks:
                    # Renders skeletons directly on our raw matrix
                    self.mp_drawing.draw_landmarks(
                        frame,
                        hand_landmarks,
                        self.mp_hands.HAND_CONNECTIONS,
                        self.mp_drawing_styles.get_default_hand_landmarks_style(),
                        self.mp_drawing_styles.get_default_hand_connections_style()
                    )
                    
                    # Compute gestures
                    detected_gesture = self._classify_gesture(hand_landmarks)

            # Draw system details on the webcam frame overlay
            now = time.time()
            dt = now - prev_time
            prev_time = now
            current_fps = 1.0 / dt if dt > 0 else 30.0

            # Draw visual feedback box directly inside the camera preview
            overlay_txt = f"Gesture: {detected_gesture} | CV FPS: {current_fps:.1f}"
            cv2.putText(frame, overlay_txt, (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 245, 255), 2)

            with self.lock:
                self.fps = current_fps
                self.raw_frame = frame
                # Web apps or game loops can consume display frame directly
                self.display_frame = cv2.resize(frame, (220, 165))
                self.current_gesture = detected_gesture

            # Brief release to let other routines execute
            time.sleep(0.01)

        # Cleanup
        if self.hands_detector:
            self.hands_detector.close()
        if self.cap:
            self.cap.release()

    def _classify_gesture(self, landmarks):
        """
        Determines active controller posture based on finger tip coordinate states.
        Calculates extension status by comparing tip coordinates to PIP joint thresholds.
        """
        pts = landmarks.landmark
        
        # Landmark indices definition:
        # Hand wrist = 0
        # Thumb: MCP = 2, IP = 3, Tip = 4
        # Index: MCP = 5, PIP = 6, Tip = 8
        # Middle: MCP = 9, PIP = 10, Tip = 12
        # Ring: MCP = 13, PIP = 14, Tip = 16
        # Pinky: MCP = 17, PIP = 18, Tip = 20

        # Extract specific coordinates
        wrist = pts[0]
        
        # Tips
        thumb_tip = pts[4]
        index_tip = pts[8]
        middle_tip = pts[12]
        ring_tip = pts[16]
        pinky_tip = pts[20]

        # Intermediaries joints
        thumb_ip = pts[3]
        index_pip = pts[6]
        middle_pip = pts[10]
        ring_pip = pts[14]
        pinky_pip = pts[18]
        
        # MCP joints
        index_mcp = pts[5]
        middle_mcp = pts[9]

        # Detections of fingers extension flags
        # Default y-axis goes downwards on screen (0 at top, 1 at bottom).
        # Thus, tip.y < pip.y implies finger is extended upwards.
        index_extended = index_tip.y < index_pip.y
        middle_extended = middle_tip.y < middle_pip.y
        ring_extended = ring_tip.y < ring_pip.y
        pinky_extended = pinky_tip.y < pinky_pip.y
        
        # Thumb check is horizontal-based relative to its IP joint
        # For general hands (independent of left/right handedness), compare distance to pinky/wrist
        thumb_extended = abs(thumb_tip.x - index_mcp.x) > 0.12

        # 1. OPEN PALM (Open Palm acceleration)
        if index_extended and middle_extended and ring_extended and pinky_extended:
            return "Open Palm"

        # 2. FIST (Fist brake)
        if not index_extended and not middle_extended and not ring_extended and not pinky_extended:
            return "Fist"

        # 3. VICTORY SIGN (Index + Middle extended: Nitro boost)
        if index_extended and middle_extended and not ring_extended and not pinky_extended:
            return "Victory Sign"

        # 4. POINT LEFT and POINT RIGHT
        # Only Index extended
        if index_extended and not middle_extended and not ring_extended and not pinky_extended:
            # Differentiate based on tilt. If index tip moves left of its base (MCP) x-coord significantly
            # Or evaluate the delta x: index_tip.x - index_mcp.x
            delta_x = index_tip.x - index_mcp.x
            
            # Since hand is mirrored:
            # negative delta_x -> further left. positive delta_x -> further right.
            # Compare with wrist/knuckles tilt parameters:
            if delta_x < -0.045:
                return "Point Left"
            elif delta_x > 0.045:
                return "Point Right"
            
            # Fallback to checking index tip's overall posture compared to Middle knuckle
            if index_tip.x < index_mcp.x:
                return "Point Left"
            else:
                return "Point Right"

        return "Unknown"

    def get_state(self):
        """Thread-safe accessor for the current controller state."""
        with self.lock:
            return {
                "gesture": self.current_gesture,
                "fps": self.fps,
                "display": self.display_frame
            }
