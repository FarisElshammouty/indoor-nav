"""
Configuration for the visual localization server.
"""
from pathlib import Path

# Paths
SERVER_ROOT = Path(__file__).parent.parent
DATA_DIR = SERVER_ROOT / "data"
MODELS_DIR = DATA_DIR / "models"
SCANS_DIR = DATA_DIR / "scans"

# Each building/floor combo gets its own model directory:
#   data/models/P/G/  — Poole House, Ground Floor
#   data/models/P/1/  — Poole House, Floor 1
#   etc.

# Localization settings
MAX_IMAGE_SIZE = 1024          # Resize query images to this max dimension
RETRIEVAL_TOP_K = 20           # Number of reference images to retrieve for matching
MIN_INLIERS = 12               # Minimum PnP inliers to accept a pose
CONFIDENCE_THRESHOLD = 0.5     # Minimum confidence to return a result

# Feature extraction
FEATURE_MODEL = "superpoint"   # Options: superpoint, disk
MATCHER_MODEL = "superglue"    # Options: superglue, lightglue
RETRIEVAL_MODEL = "netvlad"    # Options: netvlad, cosplace, eigenplaces

# Server settings
CORS_ORIGINS = ["*"]           # Allow all origins (the PWA is on GitHub Pages)
MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5MB max image upload

# Building coordinate mapping
# After COLMAP reconstruction, we need to align the 3D model coordinates
# to the building's waypoint coordinate system. This is done per-model
# using a set of reference points (at least 3) that map 3D positions to
# building waypoint coordinates.
#
# Format: { "model_path": [ { "3d": [x,y,z], "waypoint": [wx, wy] }, ... ] }
# These are populated during the alignment step after reconstruction.
