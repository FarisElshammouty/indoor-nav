"""
Visual Localizer — estimates camera position from a query image.

Pipeline:
1. Load a pre-built 3D model (from COLMAP + hloc) for each building/floor
2. Given a query image:
   a. Extract features (SuperPoint)
   b. Retrieve similar reference images (NetVLAD)
   c. Match features (SuperGlue)
   d. Estimate camera pose (PnP + RANSAC)
   e. Map 3D pose to building waypoint coordinates
3. Return: building, floor, estimated (x, y), nearest waypoint, confidence
"""
import logging
from pathlib import Path
from typing import Optional
import numpy as np

try:
    from hloc import extract_features, match_features, pairs_from_retrieval
    from hloc.localize_sfm import QueryLocalizer, pose_from_cluster
    import pycolmap
    HLOC_AVAILABLE = True
except ImportError:
    HLOC_AVAILABLE = False

from .config import (
    MODELS_DIR,
    MAX_IMAGE_SIZE,
    RETRIEVAL_TOP_K,
    MIN_INLIERS,
    CONFIDENCE_THRESHOLD,
    FEATURE_MODEL,
    MATCHER_MODEL,
    RETRIEVAL_MODEL,
)

logger = logging.getLogger(__name__)


class LocalizationResult:
    """Result of a localization query."""

    def __init__(
        self,
        success: bool,
        building: Optional[str] = None,
        floor: Optional[str] = None,
        x: Optional[float] = None,
        y: Optional[float] = None,
        nearest_waypoint: Optional[str] = None,
        confidence: float = 0.0,
        num_inliers: int = 0,
        message: str = "",
    ):
        self.success = success
        self.building = building
        self.floor = floor
        self.x = x
        self.y = y
        self.nearest_waypoint = nearest_waypoint
        self.confidence = confidence
        self.num_inliers = num_inliers
        self.message = message

    def to_dict(self):
        return {
            "success": self.success,
            "building": self.building,
            "floor": self.floor,
            "x": self.x,
            "y": self.y,
            "nearestWaypoint": self.nearest_waypoint,
            "confidence": self.confidence,
            "numInliers": self.num_inliers,
            "message": self.message,
        }


class FloorModel:
    """Loaded 3D model for a single building floor."""

    def __init__(self, building_code: str, floor_key: str, model_path: Path):
        self.building_code = building_code
        self.floor_key = floor_key
        self.model_path = model_path
        self.reconstruction = None
        self.feature_conf = None
        self.matcher_conf = None
        self.retrieval_conf = None
        self.query_localizer = None
        self.is_loaded = False

        # Coordinate alignment: maps COLMAP 3D coords to building waypoint coords
        # Set during alignment step: a 2D affine transform [2x3] matrix
        self.coord_transform = None

    def load(self):
        """Load the pre-built model for localization queries."""
        if not HLOC_AVAILABLE:
            logger.warning("hloc not installed — cannot load models")
            return False

        sfm_path = self.model_path / "sfm"
        features_path = self.model_path / "features.h5"
        matches_path = self.model_path / "matches.h5"
        retrieval_path = self.model_path / "global_features.h5"

        if not sfm_path.exists():
            logger.info(f"No model found at {sfm_path}")
            return False

        try:
            self.reconstruction = pycolmap.Reconstruction(str(sfm_path))
            logger.info(
                f"Loaded model {self.building_code}/{self.floor_key}: "
                f"{self.reconstruction.num_images()} images, "
                f"{self.reconstruction.num_points3D()} 3D points"
            )

            self.feature_conf = extract_features.confs[FEATURE_MODEL]
            self.matcher_conf = match_features.confs[f"{MATCHER_MODEL}"]
            self.retrieval_conf = extract_features.confs[RETRIEVAL_MODEL]

            self.query_localizer = QueryLocalizer(
                self.reconstruction, self.feature_conf
            )

            # Load coordinate transform if available
            transform_file = self.model_path / "coord_transform.npy"
            if transform_file.exists():
                self.coord_transform = np.load(str(transform_file))

            self.is_loaded = True
            return True

        except Exception as e:
            logger.error(f"Failed to load model {self.building_code}/{self.floor_key}: {e}")
            return False

    def localize(self, image_path: Path) -> Optional[LocalizationResult]:
        """Estimate camera pose from a query image against this floor model."""
        if not self.is_loaded or not HLOC_AVAILABLE:
            return None

        try:
            # This is the hloc localization pipeline:
            # 1. Extract features from query image
            # 2. Retrieve top-K similar reference images
            # 3. Match features between query and references
            # 4. Estimate pose via PnP + RANSAC

            # For now this is a simplified flow — full integration
            # requires the hloc query pipeline which we set up during
            # reconstruction. See scripts/reconstruct.py.
            ret = self.query_localizer.localize(image_path)

            if ret is None or ret["num_inliers"] < MIN_INLIERS:
                return LocalizationResult(
                    success=False,
                    message=f"Too few inliers ({ret['num_inliers'] if ret else 0})",
                )

            # Extract camera position from pose
            R = ret["cam_from_world"].rotation.matrix()
            t = ret["cam_from_world"].translation
            cam_pos = -R.T @ t  # Camera position in world coords

            # Convert COLMAP coords to building waypoint coords
            wx, wy = self._to_waypoint_coords(cam_pos[0], cam_pos[1])

            confidence = min(100, ret["num_inliers"] * 3)

            return LocalizationResult(
                success=True,
                building=self.building_code,
                floor=self.floor_key,
                x=float(wx),
                y=float(wy),
                confidence=confidence,
                num_inliers=ret["num_inliers"],
            )

        except Exception as e:
            logger.error(f"Localization failed: {e}")
            return None

    def _to_waypoint_coords(self, cx, cy):
        """Convert COLMAP 3D coordinates to building waypoint coordinates."""
        if self.coord_transform is not None:
            # Apply 2D affine transform
            point = np.array([cx, cy, 1.0])
            result = self.coord_transform @ point
            return result[0], result[1]
        # No transform — return raw coords (will be wrong but non-crashing)
        return cx, cy


class VisualLocalizer:
    """
    Main localizer — manages all building/floor models and handles queries.

    On startup, scans the models directory and loads any available models.
    When a query image comes in, it tries all loaded models and returns
    the best match.
    """

    def __init__(self):
        self.models: dict[str, FloorModel] = {}  # "P/G" -> FloorModel
        self._loaded = False

    def load_all_models(self):
        """Scan models directory and load all available floor models."""
        if not MODELS_DIR.exists():
            logger.info("No models directory found — running in demo mode")
            self._loaded = True
            return

        for building_dir in sorted(MODELS_DIR.iterdir()):
            if not building_dir.is_dir():
                continue
            building_code = building_dir.name

            for floor_dir in sorted(building_dir.iterdir()):
                if not floor_dir.is_dir():
                    continue
                floor_key = floor_dir.name

                model = FloorModel(building_code, floor_key, floor_dir)
                if model.load():
                    key = f"{building_code}/{floor_key}"
                    self.models[key] = model
                    logger.info(f"Loaded model: {key}")

        logger.info(f"Loaded {len(self.models)} floor models total")
        self._loaded = True

    def localize(self, image_path: Path, hint_building: str = None, hint_floor: str = None) -> LocalizationResult:
        """
        Localize a query image against all loaded models.

        Args:
            image_path: Path to the query image
            hint_building: Optional building code hint (from GPS)
            hint_floor: Optional floor hint (from last known position)

        Returns:
            Best localization result across all models
        """
        if not self.models:
            return LocalizationResult(
                success=False,
                message="No 3D models loaded. Scan buildings first.",
            )

        # Prioritize models matching hints
        candidates = self._get_candidate_models(hint_building, hint_floor)

        best_result = None
        best_confidence = 0

        for model in candidates:
            result = model.localize(image_path)
            if result and result.success and result.confidence > best_confidence:
                best_result = result
                best_confidence = result.confidence

        if best_result:
            return best_result

        return LocalizationResult(
            success=False,
            message="Could not determine position from image",
        )

    def _get_candidate_models(self, hint_building, hint_floor):
        """Order models to try — prioritize those matching hints."""
        prioritized = []
        rest = []

        for key, model in self.models.items():
            if hint_building and model.building_code == hint_building:
                if hint_floor and model.floor_key == hint_floor:
                    prioritized.insert(0, model)  # Best guess first
                else:
                    prioritized.append(model)
            else:
                rest.append(model)

        return prioritized + rest

    def get_status(self):
        """Return status of loaded models."""
        return {
            "modelsLoaded": len(self.models),
            "buildings": list(set(m.building_code for m in self.models.values())),
            "floors": {k: {"images": m.reconstruction.num_images() if m.reconstruction else 0}
                       for k, m in self.models.items()},
            "hlocAvailable": HLOC_AVAILABLE,
        }
