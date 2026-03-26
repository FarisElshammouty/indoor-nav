// ============================================================
// GPS NAVIGATOR — Outdoor positioning & building detection
// ============================================================
// Uses navigator.geolocation to track the user outdoors,
// detect which building they're near, and compute bearing
// toward the target building.
// ============================================================

class GPSNavigator {
  constructor(buildings) {
    this.buildings = buildings;
    this.position = null;       // { lat, lng, accuracy }
    this.watchId = null;
    this._onUpdate = null;
    this.isActive = false;
  }

  // Start watching GPS position
  start(onUpdate) {
    this._onUpdate = onUpdate;

    if (!navigator.geolocation) {
      console.warn("Geolocation not supported");
      return false;
    }

    this.isActive = true;

    // Get an initial position quickly
    navigator.geolocation.getCurrentPosition(
      (pos) => this._handlePosition(pos),
      (err) => console.warn("GPS initial error:", err),
      { enableHighAccuracy: true, timeout: 10000 }
    );

    // Then watch continuously
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._handlePosition(pos),
      (err) => {
        console.warn("GPS watch error:", err);
        if (this._onUpdate) {
          this._onUpdate({ error: err, position: this.position });
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );

    return true;
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isActive = false;
    this._onUpdate = null;
  }

  _handlePosition(pos) {
    this.position = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: pos.timestamp,
    };

    if (this._onUpdate) {
      this._onUpdate({
        position: this.position,
        nearestBuilding: this.findNearestBuilding(),
        error: null,
      });
    }
  }

  // Find the nearest building to current GPS position
  findNearestBuilding() {
    if (!this.position) return null;

    let nearest = null;
    let minDist = Infinity;

    for (const [code, building] of Object.entries(this.buildings)) {
      const dist = this.haversineDistance(
        this.position.lat, this.position.lng,
        building.lat, building.lng
      );
      if (dist < minDist) {
        minDist = dist;
        nearest = { code, building, distance: dist };
      }
    }

    return nearest;
  }

  // Check if user is within threshold meters of any building
  isNearBuilding(thresholdMeters = 30) {
    const nearest = this.findNearestBuilding();
    if (!nearest) return null;
    if (nearest.distance <= thresholdMeters) return nearest;
    return null;
  }

  // Compute bearing from current position to a target lat/lng
  bearingTo(targetLat, targetLng) {
    if (!this.position) return null;
    return this.computeBearing(
      this.position.lat, this.position.lng,
      targetLat, targetLng
    );
  }

  // ---- MATH UTILITIES ----

  // Haversine distance in meters between two lat/lng points
  haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth radius in meters
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Compute bearing (0-360, 0=north) from point A to point B
  computeBearing(lat1, lng1, lat2, lng2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const dLng = toRad(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
    return ((toDeg(Math.atan2(y, x)) % 360) + 360) % 360;
  }
}
