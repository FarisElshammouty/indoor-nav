// ============================================================
// STEP COUNTER — Dead reckoning via accelerometer
// ============================================================
// Uses the DeviceMotion API to detect steps by analyzing
// acceleration magnitude peaks. Tracks distance walked
// since the last known position fix.
//
// Supports calibration: user walks a known distance (e.g. 10m)
// and the app calculates their personal step length.
// Calibration is saved to localStorage for persistence.
// ============================================================

class StepCounter {
  constructor() {
    this.steps = 0;
    this.distanceSinceLastFix = 0;   // meters since last position fix
    this.totalDistance = 0;           // total meters walked
    this.isActive = false;
    this._handler = null;
    this._onStep = null;

    // Step length — load from localStorage or use default
    this.stepLength = this._loadStepLength();

    // Calibration state
    this.isCalibrating = false;
    this._calibrationSteps = 0;
    this._calibrationCallback = null;

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

  _loadStepLength() {
    try {
      const saved = localStorage.getItem("indoor-nav-step-length");
      if (saved) {
        const val = parseFloat(saved);
        if (val > 0.3 && val < 1.5) return val; // sanity check
      }
    } catch (e) { /* localStorage not available */ }
    return 0.75; // default average step length
  }

  _saveStepLength() {
    try {
      localStorage.setItem("indoor-nav-step-length", String(this.stepLength));
    } catch (e) { /* localStorage not available */ }
  }

  // Get the current step length (for display)
  getStepLength() {
    return this.stepLength;
  }

  // Manually set step length
  setStepLength(meters) {
    if (meters > 0.3 && meters < 1.5) {
      this.stepLength = meters;
      this._saveStepLength();
      return true;
    }
    return false;
  }

  // Start calibration mode
  // User walks a known distance, then calls finishCalibration(distanceMeters)
  startCalibration(onStep) {
    this.isCalibrating = true;
    this._calibrationSteps = 0;
    this._calibrationCallback = onStep;

    if (!this.isActive) {
      this.start(() => {});
    }
  }

  // Finish calibration — calculate step length from known distance
  finishCalibration(actualDistanceMeters) {
    if (!this.isCalibrating || this._calibrationSteps < 5) {
      return { success: false, message: "Not enough steps detected. Walk at least 5 steps." };
    }

    const newStepLength = actualDistanceMeters / this._calibrationSteps;

    // Sanity check
    if (newStepLength < 0.3 || newStepLength > 1.5) {
      return {
        success: false,
        message: `Calculated step length (${newStepLength.toFixed(2)}m) seems wrong. Try again.`,
      };
    }

    this.stepLength = Math.round(newStepLength * 100) / 100; // round to 2 decimal places
    this._saveStepLength();
    this.isCalibrating = false;
    this._calibrationSteps = 0;
    this._calibrationCallback = null;

    return {
      success: true,
      stepLength: this.stepLength,
      steps: this._calibrationSteps,
      message: `Step length set to ${this.stepLength}m`,
    };
  }

  cancelCalibration() {
    this.isCalibrating = false;
    this._calibrationSteps = 0;
    this._calibrationCallback = null;
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
    this.cancelCalibration();
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

      // Calibration mode
      if (this.isCalibrating) {
        this._calibrationSteps++;
        if (this._calibrationCallback) {
          this._calibrationCallback({ calibrationSteps: this._calibrationSteps });
        }
      }

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
