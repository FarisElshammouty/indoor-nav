#!/usr/bin/env python3
"""
Process a video scan into a 3D model for a specific building floor.

Usage:
    python process_video.py --building P --floor G --video path/to/scan.mp4
    python process_video.py --building P --floor 4 --images path/to/frames/
    python process_video.py --building P --floor G --video scan.mp4 --interval 0.3

This script:
1. Extracts frames from the video (or uses existing images)
2. Runs COLMAP SfM via hloc to build a 3D reconstruction
3. Extracts SuperPoint features + NetVLAD global descriptors
4. Saves everything ready for the localization server
"""
import argparse
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from localization.mapper import ReconstructionMapper


def main():
    parser = argparse.ArgumentParser(description="Process video/images into a 3D model")
    parser.add_argument("--building", "-b", required=True, help="Building code (e.g., P, F, SC)")
    parser.add_argument("--floor", "-f", required=True, help="Floor key (e.g., G, 1, 2)")
    parser.add_argument("--video", "-v", help="Path to video file")
    parser.add_argument("--images", "-i", help="Path to directory of images")
    parser.add_argument("--interval", type=float, default=0.5,
                        help="Seconds between extracted frames (default: 0.5)")
    args = parser.parse_args()

    if not args.video and not args.images:
        parser.error("Provide either --video or --images")

    mapper = ReconstructionMapper(args.building.upper(), args.floor.upper())

    print(f"\n{'='*60}")
    print(f"  Building: {args.building.upper()}")
    print(f"  Floor:    {args.floor}")
    print(f"  Source:   {args.video or args.images}")
    print(f"{'='*60}\n")

    if args.video:
        mapper.process_video(args.video, frame_interval=args.interval)
    else:
        mapper.process_images(args.images)

    print(f"\nDone! Model saved to: {mapper.model_dir}")
    print(f"\nStatus: {mapper.get_status()}")
    print(f"\nNext steps:")
    print(f"  1. Start the server:  cd server && python app.py")
    print(f"  2. Test localization: curl -X POST http://localhost:8000/localize -F image=@test.jpg")


if __name__ == "__main__":
    main()
