// ============================================================
// STEP COUNTER — Dead reckoning via accelerometer
// ============================================================
// Uses the DeviceMotion API to detect steps by analyzing
// acceleration magnitude peaks. Tracks distance walked
// since the last known position (OCR or GPS fix).
// ============================================================

class StepCounter {
  constructor() {
    this.steps = 0;
    this.distanceSinceLastFix = 0;   // meters since last OCR/GPS fix
    this.totalDistance = 0;           // total meters walked
    this.stepLength = 0.75;          // average step length in meters
    this.isActive = false;
    this._handler = null;
    this._onStep = null;

    // Peak detection state
    this._magnitudeBuffer = [];
    this._bufferSize = 10;
    this._lastPeakTime = 0;
    this._minPeakInterval = 300;     // ms — minimum time between steps
    this._peakThreshold = 11.5;      // m/s² — acceleration magnitude threshold
    this._valleyThreshold = 9.0;     // m/s² — must drop below this between peaks
    this._lastWasAbove = false;
    this._lastMagnitude = 0;
  }

  // Start counting steps
  start(onStep) {
    if (this.isActive) return;
    this._onStep = onStep;

    if (!window.DeviceMotionEvent) {
      console.warn("DeviceMotion not supported");
      return false;
    }

    // iOS 13+ permission
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      DeviceMotionEvent.requestPermission()
        .then((permission) => {
          if (permission === "granted") {
            this._attachListener();
          }
        })
        .catch(console.warn);
    } else {
      this._attachListener();
    }

    return true;
  }

  _attachListener() {
    this._handler = (e) => this._handleMotion(e);
    window.addEventListener("devicemotion", this._handler);
    this.isActive = true;
  }

  stop() {
    if (this._handler) {
      window.removeEventListener("devicemotion", this._handler);
      this._handler = null;
    }
    this.isActive = false;
    this._onStep = null;
  }

  // Reset distance counter (called when a new position fix is obtained)
  resetDistance() {
    this.distanceSinceLastFix = 0;
  }

  // Reset everything
  reset() {
    this.steps = 0;
    this.distanceSinceLastFix = 0;
    this.totalDistance = 0;
    this._magnitudeBuffer = [];
    this._lastPeakTime = 0;
    this._lastWasAbove = false;
  }

  _handleMotion(event) {
    const acc = event.accelerationIncludingGravity;
    if (!acc || acc.x === null) return;

    // Compute acceleration magnitude
    const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);

    // Buffer for smoothing
    this._magnitudeBuffer.push(magnitude);
    if (this._magnitudeBuffer.length > this._bufferSize) {
      this._magnitudeBuffer.shift();
    }

    // Use smoothed magnitude
    const smoothed = this._magnitudeBuffer.reduce((a, b) => a + b, 0) / this._magnitudeBuffer.length;

    // Peak detection: magnitude rises above threshold, then falls
    const now = Date.now();
    const timeSinceLast = now - this._lastPeakTime;

    if (smoothed > this._peakThreshold && !this._lastWasAbove && timeSinceLast > this._minPeakInterval) {
      // Detected a step (rising edge above threshold)
      this._lastWasAbove = true;
      this._lastPeakTime = now;
      this.steps++;
      this.distanceSinceLastFix += this.stepLength;
      this.totalDistance += this.stepLength;

      if (this._onStep) {
        this._onStep({
          steps: this.steps,
          distanceSinceLastFix: this.distanceSinceLastFix,
          totalDistance: this.totalDistance,
        });
      }
    }

    if (smoothed < this._valleyThreshold) {
      this._lastWasAbove = false;
    }

    this._lastMagnitude = smoothed;
  }
}
