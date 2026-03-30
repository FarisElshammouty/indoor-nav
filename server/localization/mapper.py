"""
3D Reconstruction Mapper — processes video scans into localization-ready models.

Pipeline:
1. Extract frames from video at regular intervals
2. Run COLMAP Structure-from-Motion to build sparse 3D reconstruction
3. Extract SuperPoint features for all images
4. Build NetVLAD retrieval database
5. Save everything in the model directory for the localizer

Usage:
    mapper = ReconstructionMapper("P", "G")  # Poole House, Ground Floor
    mapper.process_video("path/to/scan_video.mp4")
    # or
    mapper.process_images("path/to/frames/")
"""
import logging
import subprocess
import shutil
from pathlib import Path
from typing import Optional

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

try:
    from hloc import (
        extract_features,
        match_features,
        pairs_from_exhaustive,
        pairs_from_retrieval,
        reconstruction as hloc_reconstruction,
    )
    HLOC_AVAILABLE = True
except ImportError:
    HLOC_AVAILABLE = False

from .config import (
    MODELS_DIR,
    SCANS_DIR,
    FEATURE_MODEL,
    MATCHER_MODEL,
    RETRIEVAL_MODEL,
)

logger = logging.getLogger(__name__)


class ReconstructionMapper:
    """Processes video/image scans into 3D models for visual localization."""

    def __init__(self, building_code: str, floor_key: str):
        self.building_code = building_code
        self.floor_key = floor_key

        # Directory structure for this floor
        self.model_dir = MODELS_DIR / building_code / floor_key
        self.images_dir = self.model_dir / "images"
        self.sfm_dir = self.model_dir / "sfm"
        self.features_path = self.model_dir / "features.h5"
        self.matches_path = self.model_dir / "matches.h5"
        self.retrieval_path = self.model_dir / "global_features.h5"
        self.pairs_path = self.model_dir / "pairs.txt"

    def process_video(self, video_path: str, frame_interval: float = 0.5):
        """
        Extract frames from a video and run the full reconstruction pipeline.

        Args:
            video_path: Path to the video file
            frame_interval: Seconds between extracted frames (default 0.5s = 2 FPS)
        """
        if not CV2_AVAILABLE:
            raise RuntimeError("OpenCV not installed. Run: pip install opencv-python-headless")

        video_path = Path(video_path)
        if not video_path.exists():
            raise FileNotFoundError(f"Video not found: {video_path}")

        logger.info(f"Processing video: {video_path}")

        # Create directories
        self.images_dir.mkdir(parents=True, exist_ok=True)

        # Extract frames
        num_frames = self._extract_frames(video_path, frame_interval)
        logger.info(f"Extracted {num_frames} frames")

        if num_frames < 10:
            raise ValueError(f"Only {num_frames} frames extracted. Need at least 10. "
                           "Try a longer video or shorter frame interval.")

        # Run reconstruction
        self._run_reconstruction()

    def process_images(self, images_path: str):
        """
        Run reconstruction from a directory of pre-extracted images.

        Args:
            images_path: Directory containing images (jpg/png)
        """
        images_path = Path(images_path)
        if not images_path.exists():
            raise FileNotFoundError(f"Images directory not found: {images_path}")

        # Copy images to model directory
        self.images_dir.mkdir(parents=True, exist_ok=True)
        for img in sorted(images_path.glob("*.jpg")) + sorted(images_path.glob("*.png")):
            shutil.copy2(img, self.images_dir / img.name)

        num_images = len(list(self.images_dir.glob("*")))
        logger.info(f"Found {num_images} images")

        if num_images < 10:
            raise ValueError(f"Only {num_images} images found. Need at least 10.")

        self._run_reconstruction()

    def _extract_frames(self, video_path: Path, interval: float) -> int:
        """Extract frames from video at regular intervals."""
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_skip = max(1, int(fps * interval))
        count = 0
        frame_num = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_num % frame_skip == 0:
                filename = self.images_dir / f"frame_{count:05d}.jpg"
                cv2.imwrite(str(filename), frame)
                count += 1

            frame_num += 1

        cap.release()
        return count

    def _run_reconstruction(self):
        """Run the full hloc reconstruction pipeline."""
        if not HLOC_AVAILABLE:
            raise RuntimeError(
                "hloc not installed. Install with:\n"
                "pip install git+https://github.com/cvg/Hierarchical-Localization.git"
            )

        logger.info("Starting reconstruction pipeline...")
        images_ref = self.images_dir

        # Step 1: Extract local features (SuperPoint)
        logger.info("Extracting features (SuperPoint)...")
        feature_conf = extract_features.confs[FEATURE_MODEL]
        extract_features.main(
            feature_conf, self.images_dir, feature_path=self.features_path
        )

        # Step 2: Extract global features for retrieval (NetVLAD)
        logger.info("Extracting global features (NetVLAD)...")
        retrieval_conf = extract_features.confs[RETRIEVAL_MODEL]
        extract_features.main(
            retrieval_conf, self.images_dir, feature_path=self.retrieval_path
        )

        # Step 3: Find image pairs via retrieval
        logger.info("Finding image pairs...")
        pairs_from_retrieval.main(
            self.retrieval_path, self.pairs_path, num_matched=20
        )

        # Step 4: Match features between pairs (SuperGlue)
        logger.info("Matching features (SuperGlue)...")
        matcher_conf = match_features.confs[MATCHER_MODEL]
        match_features.main(
            matcher_conf, self.pairs_path,
            features=self.features_path,
            matches=self.matches_path,
        )

        # Step 5: Run incremental SfM reconstruction
        logger.info("Running Structure-from-Motion (COLMAP)...")
        self.sfm_dir.mkdir(parents=True, exist_ok=True)
        hloc_reconstruction.main(
            self.sfm_dir,
            self.images_dir,
            self.pairs_path,
            self.features_path,
            self.matches_path,
        )

        logger.info(f"Reconstruction complete! Model saved to {self.sfm_dir}")

        # Print stats
        try:
            import pycolmap
            rec = pycolmap.Reconstruction(str(self.sfm_dir))
            logger.info(
                f"Result: {rec.num_images()} registered images, "
                f"{rec.num_points3D()} 3D points"
            )
        except Exception:
            pass

    def get_status(self) -> dict:
        """Check the status of this floor's model."""
        status = {
            "building": self.building_code,
            "floor": self.floor_key,
            "hasImages": self.images_dir.exists() and any(self.images_dir.iterdir()) if self.images_dir.exists() else False,
            "hasModel": self.sfm_dir.exists(),
            "hasFeatures": self.features_path.exists(),
            "hasRetrieval": self.retrieval_path.exists(),
            "imageCount": len(list(self.images_dir.glob("*"))) if self.images_dir.exists() else 0,
        }
        return status
