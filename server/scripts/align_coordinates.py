#!/usr/bin/env python3
"""
Align COLMAP 3D model coordinates to building waypoint coordinates.

After reconstruction, the 3D model has arbitrary coordinates.
This script computes a transform to map those coordinates to
the building's waypoint coordinate system (as defined in buildings.js).

Usage:
    python align_coordinates.py --building P --floor G

You'll be prompted to provide at least 3 reference points that
map known 3D positions to waypoint coordinates.

The transform is saved as coord_transform.npy in the model directory.
"""
import argparse
import sys
import json
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from localization.config import MODELS_DIR


def compute_affine_transform(src_points, dst_points):
    """
    Compute a 2D affine transform from source to destination points.

    Args:
        src_points: Nx2 array of source (COLMAP) coordinates
        dst_points: Nx2 array of destination (waypoint) coordinates

    Returns:
        2x3 affine transform matrix
    """
    n = len(src_points)
    assert n >= 3, "Need at least 3 reference points"

    # Build system: [x, y, 1] * T = [wx, wy]
    A = np.zeros((2 * n, 6))
    b = np.zeros(2 * n)

    for i in range(n):
        sx, sy = src_points[i]
        dx, dy = dst_points[i]
        A[2 * i] = [sx, sy, 1, 0, 0, 0]
        A[2 * i + 1] = [0, 0, 0, sx, sy, 1]
        b[2 * i] = dx
        b[2 * i + 1] = dy

    # Least squares solution
    result, _, _, _ = np.linalg.lstsq(A, b, rcond=None)
    transform = result.reshape(2, 3)
    return transform


def main():
    parser = argparse.ArgumentParser(description="Align 3D model to waypoint coordinates")
    parser.add_argument("--building", "-b", required=True)
    parser.add_argument("--floor", "-f", required=True)
    parser.add_argument("--points", "-p", help="JSON file with reference points")
    args = parser.parse_args()

    model_dir = MODELS_DIR / args.building.upper() / args.floor.upper()
    if not model_dir.exists():
        print(f"Error: Model directory not found: {model_dir}")
        sys.exit(1)

    if args.points:
        # Load from JSON file
        with open(args.points) as f:
            points = json.load(f)

        src = np.array([p["colmap"] for p in points])
        dst = np.array([p["waypoint"] for p in points])
    else:
        # Interactive mode
        print("Enter reference points (COLMAP x,y -> Waypoint x,y)")
        print("Enter at least 3 points. Type 'done' when finished.\n")

        src_points = []
        dst_points = []

        while True:
            line = input(f"Point {len(src_points)+1} (cx,cy -> wx,wy or 'done'): ").strip()
            if line.lower() == "done":
                break

            try:
                parts = line.replace("->", ",").split(",")
                cx, cy, wx, wy = [float(x.strip()) for x in parts]
                src_points.append([cx, cy])
                dst_points.append([wx, wy])
            except ValueError:
                print("  Format: cx,cy -> wx,wy  (e.g., 1.5,2.3 -> 10,20)")
                continue

        if len(src_points) < 3:
            print("Need at least 3 points")
            sys.exit(1)

        src = np.array(src_points)
        dst = np.array(dst_points)

    # Compute transform
    transform = compute_affine_transform(src, dst)

    # Save
    output_path = model_dir / "coord_transform.npy"
    np.save(str(output_path), transform)
    print(f"\nTransform saved to: {output_path}")

    # Test: print transformed source points
    print("\nVerification:")
    for i in range(len(src)):
        point = np.array([src[i][0], src[i][1], 1.0])
        result = transform @ point
        expected = dst[i]
        error = np.linalg.norm(result - expected)
        print(f"  COLMAP ({src[i][0]:.2f}, {src[i][1]:.2f}) -> "
              f"Waypoint ({result[0]:.2f}, {result[1]:.2f}) "
              f"[expected ({expected[0]:.2f}, {expected[1]:.2f}), error: {error:.3f}]")


if __name__ == "__main__":
    main()
