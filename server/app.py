"""
BU Indoor Navigation — Visual Localization Server

Endpoints:
  POST /localize    — Accept a camera frame, return estimated position
  GET  /status      — Health check + model status
  POST /reconstruct — Trigger reconstruction for a building/floor (admin)
"""
import io
import logging
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image

from localization.config import CORS_ORIGINS, MAX_UPLOAD_SIZE, MAX_IMAGE_SIZE
from localization.localizer import VisualLocalizer, LocalizationResult
from localization.mapper import ReconstructionMapper

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="BU Indoor Nav — Localization Server")

# CORS — allow the PWA (GitHub Pages) to call this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global localizer instance
localizer = VisualLocalizer()


@app.on_event("startup")
async def startup():
    """Load all available 3D models on server start."""
    logger.info("Loading 3D models...")
    localizer.load_all_models()
    logger.info("Server ready")


@app.get("/")
async def root():
    return {"service": "BU Indoor Nav Localization", "version": "1.0.0"}


@app.get("/status")
async def status():
    """Return server status and loaded models info."""
    return {
        "status": "ok",
        **localizer.get_status(),
    }


@app.post("/localize")
async def localize(
    image: UploadFile = File(...),
    hint_building: str = Form(default=None),
    hint_floor: str = Form(default=None),
):
    """
    Localize a camera frame.

    Accepts a JPEG/PNG image from the phone's camera and returns
    the estimated position within a building.

    Args:
        image: Camera frame (JPEG or PNG)
        hint_building: Optional building code hint (e.g., "P" for Poole House)
        hint_floor: Optional floor hint (e.g., "G", "1", "2")

    Returns:
        {
            "success": true/false,
            "building": "P",
            "floor": "4",
            "x": 12.5,
            "y": 8.3,
            "nearestWaypoint": "P4-MAIN-C",
            "confidence": 78.5,
            "message": ""
        }
    """
    # Validate upload
    if image.size and image.size > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Image too large (max 5MB)")

    content_type = image.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload must be an image")

    try:
        # Read and resize image
        data = await image.read()
        img = Image.open(io.BytesIO(data))

        # Resize if too large (save processing time)
        max_dim = max(img.size)
        if max_dim > MAX_IMAGE_SIZE:
            scale = MAX_IMAGE_SIZE / max_dim
            new_size = (int(img.size[0] * scale), int(img.size[1] * scale))
            img = img.resize(new_size, Image.LANCZOS)

        # Save to temp file for hloc
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            img.save(tmp, format="JPEG", quality=85)
            tmp_path = Path(tmp.name)

        # Run localization
        result = localizer.localize(tmp_path, hint_building, hint_floor)

        # Clean up temp file
        tmp_path.unlink(missing_ok=True)

        return result.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Localization error: {e}")
        return LocalizationResult(
            success=False, message=f"Server error: {str(e)}"
        ).to_dict()


@app.post("/reconstruct")
async def reconstruct(
    building: str = Form(...),
    floor: str = Form(...),
    video_url: str = Form(default=None),
):
    """
    Trigger 3D reconstruction for a building/floor.

    This is an admin endpoint — in production, protect with auth.
    Reconstruction runs synchronously (can take minutes to hours).

    Args:
        building: Building code (e.g., "P")
        floor: Floor key (e.g., "G", "1", "2")
        video_url: Optional URL to download video from
    """
    mapper = ReconstructionMapper(building, floor)

    # Check if images already exist
    status = mapper.get_status()

    if not status["hasImages"]:
        return JSONResponse(
            status_code=400,
            content={
                "error": "No images found. Upload video/images first.",
                "instructions": [
                    f"Place video in: server/data/scans/{building}/{floor}/",
                    f"Or place images in: server/data/models/{building}/{floor}/images/",
                    "Then call this endpoint again.",
                ],
            },
        )

    try:
        mapper._run_reconstruction()
        return {
            "status": "complete",
            "building": building,
            "floor": floor,
            **mapper.get_status(),
        }
    except Exception as e:
        logger.error(f"Reconstruction failed: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Reconstruction failed: {str(e)}"},
        )


@app.get("/models")
async def list_models():
    """List all available models and their status."""
    from localization.config import MODELS_DIR

    models = []
    if MODELS_DIR.exists():
        for building_dir in sorted(MODELS_DIR.iterdir()):
            if not building_dir.is_dir():
                continue
            for floor_dir in sorted(building_dir.iterdir()):
                if not floor_dir.is_dir():
                    continue
                mapper = ReconstructionMapper(building_dir.name, floor_dir.name)
                models.append(mapper.get_status())

    return {"models": models}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
