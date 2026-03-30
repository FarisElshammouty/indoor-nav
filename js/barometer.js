// ============================================================
// BAROMETER — Floor detection via barometric pressure
// ============================================================
// Most modern phones have a barometer sensor. By tracking
// relative pressure changes, we can detect floor transitions.
//
// How it works:
//   - 1 floor ≈ 3m height ≈ 0.36 hPa pressure change
//   - We record a baseline pressure when entering a building
//   - Relative changes from baseline tell us the floor offset
//   - Combined with a known starting floor, we track which
//     floor the user is on
//
// Fallback: if the barometer isn't available, we rely on
// visual localization or stairwell detection from pathfinding.
// ============================================================

class Barometer {
  constructor() {
    this.isSupported = false;
    this.isActive = false;
    this.sensor = null;
    this._onFloorChange = null;

    // Pressure readings
    this.currentPressure = null;    // current hPa
    this.baselinePressure = null;   // pressure at known floor
    this.baselineFloor = 0;         // floor number at baseline (0 = ground)

    // Floor estimation
    this.estimatedFloor = 0;        // current estimated floor number
    this.estimatedFloorKey = "G";   // floor key for buildings.js ("G", "1", "2", etc.)

    // Smoothing
    this._pressureBuffer = [];
    this._bufferSize = 10;

    // Constants
    this.hPaPerFloor = 0.36;       // pressure change per floor (~3m height)
    this.floorThreshold = 0.5;      // floor units — must change by at least half a floor to register
  }

  // Check if barometer is available
  static isAvailable() {
    return "PressureObserver" in window || "Barometer" in window || "AbsoluteOrientationSensor" in window;
  }

  // Start reading barometric pressure
  async start(onFloorChange) {
    this._onFloorChange = onFloorChange;

    // Try Generic Sensor API (Barometer)
    if ("Barometer" in window) {
      try {
        // Check permission
        const permission = await navigator.permissions.query({ name: "ambient-pressure" }).catch(() => null);
        if (permission && permission.state === "denied") {
          console.warn("Barometer permission denied");
          return false;
        }

        this.sensor = new Barometer({ frequency: 1 }); // 1 Hz
        this.sensor.addEventListener("reading", () => this._handleReading(this.sensor.pressure));
        this.sensor.addEventListener("error", (e) => console.warn("Barometer error:", e.error));
        this.sensor.start();
        this.isSupported = true;
        this.isActive = true;
        return true;
      } catch (e) {
        console.warn("Barometer sensor failed:", e);
      }
    }

    // Try PressureObserver API (newer, Chrome 125+)
    if ("PressureObserver" in window) {
      try {
        this._pressureObserver = new PressureObserver((records) => {
          for (const record of records) {
            if (record.source === "barometer") {
              this._handleReading(record.pressure);
            }
          }
        });
        await this._pressureObserver.observe("barometer");
        this.isSupported = true;
        this.isActive = true;
        return true;
      } catch (e) {
        console.warn("PressureObserver failed:", e);
      }
    }

    // Fallback: try reading from DeviceMotion events (some Samsung devices expose pressure)
    // This is a last resort and rarely works
    console.info("Barometer not available on this device");
    return false;
  }

  stop() {
    if (this.sensor) {
      this.sensor.stop();
      this.sensor = null;
    }
    if (this._pressureObserver) {
      this._pressureObserver.disconnect();
      this._pressureObserver = null;
    }
    this.isActive = false;
    this._onFloorChange = null;
  }

  // Set the baseline: "I know I'm on this floor right now"
  // Call this when visual localization confirms a floor.
  setBaseline(floorNumber) {
    if (this.currentPressure === null) return;
    this.baselinePressure = this.currentPressure;
    this.baselineFloor = floorNumber;
    this.estimatedFloor = floorNumber;
    this.estimatedFloorKey = this._floorNumberToKey(floorNumber);
  }

  // Get current floor estimate
  getFloor() {
    return {
      floorNumber: this.estimatedFloor,
      floorKey: this.estimatedFloorKey,
      confidence: this.baselinePressure !== null ? 70 : 0,
      hasBarometer: this.isSupported,
    };
  }

  _handleReading(pressure) {
    if (pressure === null || pressure === undefined) return;

    // Buffer for smoothing
    this._pressureBuffer.push(pressure);
    if (this._pressureBuffer.length > this._bufferSize) {
      this._pressureBuffer.shift();
    }

    // Smoothed pressure
    this.currentPressure =
      this._pressureBuffer.reduce((a, b) => a + b, 0) / this._pressureBuffer.length;

    // If we have a baseline, estimate floor
    if (this.baselinePressure !== null) {
      const pressureDiff = this.baselinePressure - this.currentPressure;
      // Positive diff = higher altitude = higher floor
      const floorOffset = pressureDiff / this.hPaPerFloor;
      const newFloor = Math.round(this.baselineFloor + floorOffset);

      // Only update if the change is significant
      const floorDiff = Math.abs(floorOffset - (this.estimatedFloor - this.baselineFloor));
      if (floorDiff >= this.floorThreshold && newFloor !== this.estimatedFloor) {
        const oldFloor = this.estimatedFloor;
        this.estimatedFloor = Math.max(0, newFloor); // No negative floors
        this.estimatedFloorKey = this._floorNumberToKey(this.estimatedFloor);

        if (this._onFloorChange) {
          this._onFloorChange({
            oldFloor: oldFloor,
            newFloor: this.estimatedFloor,
            oldFloorKey: this._floorNumberToKey(oldFloor),
            newFloorKey: this.estimatedFloorKey,
            pressure: this.currentPressure,
            confidence: 70,
          });
        }
      }
    }
  }

  // Convert floor number (0, 1, 2...) to floor key ("G", "1", "2"...)
  _floorNumberToKey(num) {
    return num === 0 ? "G" : String(num);
  }

  // Convert floor key to number
  static floorKeyToNumber(key) {
    return key === "G" ? 0 : parseInt(key, 10);
  }
}
