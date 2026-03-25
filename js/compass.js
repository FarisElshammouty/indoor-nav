// ============================================================
// COMPASS — Device orientation for real directional arrows
// ============================================================
// Uses the Device Orientation API to get the user's compass
// heading. The arrow then rotates to point toward the next
// waypoint in the real world.
//
// How it works:
//   1. Each building has a `northOffset` angle — the clockwise
//      rotation from the building's +Y axis to true north.
//   2. We compute the bearing from the current waypoint to the
//      next waypoint in building coordinates, then convert to
//      a true compass bearing using northOffset.
//   3. The arrow rotation = targetBearing - userHeading.
//      If the result is 0°, the arrow points up (straight ahead).
//      If 90°, the arrow points right, etc.
// ============================================================

class Compass {
  constructor() {
    this.heading = null;       // User's compass heading (0-360, 0=north)
    this.accuracy = null;
    this.isSupported = false;
    this.isPermissionGranted = false;
    this._handler = null;
    this._onUpdate = null;     // Callback: (heading) => {}
    this._smoothedHeading = null;
    this._alpha = 0.3;         // Smoothing factor (lower = smoother, slower)
  }

  // Request permission (required on iOS 13+) and start listening
  async start(onUpdate) {
    this._onUpdate = onUpdate;

    // iOS 13+ requires explicit permission
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== "granted") {
          console.warn("Compass permission denied");
          return false;
        }
      } catch (err) {
        console.warn("Compass permission error:", err);
        return false;
      }
    }

    // Try absolute orientation first (gives true north on Android)
    this._handler = (e) => this._handleOrientation(e);

    if ("ondeviceorientationabsolute" in window) {
      window.addEventListener("deviceorientationabsolute", this._handler);
      this.isSupported = true;
    } else if ("ondeviceorientation" in window) {
      window.addEventListener("deviceorientation", this._handler);
      this.isSupported = true;
    } else {
      console.warn("Device orientation not supported");
      return false;
    }

    this.isPermissionGranted = true;
    return true;
  }

  stop() {
    if (this._handler) {
      window.removeEventListener("deviceorientationabsolute", this._handler);
      window.removeEventListener("deviceorientation", this._handler);
      this._handler = null;
    }
    this._onUpdate = null;
  }

  _handleOrientation(event) {
    let heading = null;

    // iOS: webkitCompassHeading gives heading relative to true north
    if (event.webkitCompassHeading !== undefined) {
      heading = event.webkitCompassHeading;
    }
    // Android/absolute: alpha is the compass heading
    // For absolute events, heading = 360 - alpha
    else if (event.absolute && event.alpha !== null) {
      heading = (360 - event.alpha) % 360;
    }
    // Non-absolute fallback (less reliable)
    else if (event.alpha !== null) {
      heading = (360 - event.alpha) % 360;
    }

    if (heading === null) return;

    this.accuracy = event.webkitCompassAccuracy || null;

    // Smooth the heading to avoid jitter
    if (this._smoothedHeading === null) {
      this._smoothedHeading = heading;
    } else {
      this._smoothedHeading = this._smoothAngle(this._smoothedHeading, heading, this._alpha);
    }

    this.heading = this._smoothedHeading;

    if (this._onUpdate) {
      this._onUpdate(this.heading);
    }
  }

  // Smooth between two angles (handles 359° → 1° wraparound)
  _smoothAngle(current, target, alpha) {
    let diff = target - current;
    // Normalize to [-180, 180]
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    let result = current + alpha * diff;
    // Normalize to [0, 360)
    return ((result % 360) + 360) % 360;
  }

  // ---- BEARING CALCULATIONS ----

  // Compute the compass bearing from one waypoint to another.
  // Uses building coordinates + northOffset to get true bearing.
  //
  // northOffset: degrees clockwise from building +Y to true north
  //   Example: if building's "up" on the floor plan points east,
  //   northOffset = 270 (north is 270° from +Y clockwise)
  static bearingBetweenWaypoints(fromWP, toWP, northOffset = 0) {
    const dx = toWP.x - fromWP.x;
    const dy = toWP.y - fromWP.y;

    // atan2 gives angle from +X axis, but we want angle from +Y axis (building "north")
    // Building bearing: 0° = +Y, 90° = +X (clockwise)
    let buildingBearing = (Math.atan2(dx, dy) * 180 / Math.PI);
    buildingBearing = ((buildingBearing % 360) + 360) % 360;

    // Convert to true compass bearing
    let trueBearing = (buildingBearing + northOffset) % 360;
    return trueBearing;
  }

  // Calculate arrow rotation for the UI.
  // Returns degrees to rotate the arrow SVG (0 = pointing up = go straight ahead).
  //
  // targetBearing: compass bearing toward the next waypoint
  // userHeading: user's current compass heading
  static getArrowRotation(targetBearing, userHeading) {
    let rotation = targetBearing - userHeading;
    // Normalize to [-180, 180]
    while (rotation > 180) rotation -= 360;
    while (rotation < -180) rotation += 360;
    return rotation;
  }
}
