// ============================================================
// LOCATION MANAGER — Fuses GPS, OCR, and Step Counting
// ============================================================
// Manages the user's position using three sources:
//   - GPS: outdoor positioning between buildings
//   - OCR: indoor positioning by reading room/floor signs
//   - StepCounter: dead reckoning between OCR fixes
//
// Modes:
//   - "outdoor":       GPS active, guiding toward building
//   - "transitioning": Near building entrance, switching to indoor
//   - "indoor":        OCR + step counting active
// ============================================================

class LocationManager {
  constructor(buildings) {
    this.buildings = buildings;
    this.gps = new GPSNavigator(buildings);
    this.ocr = new OCRScanner(buildings);
    this.stepCounter = new StepCounter();

    // Current state
    this.mode = "initializing";  // outdoor | transitioning | indoor | initializing
    this.currentBuilding = null; // { code, building } — which building user is in/near
    this.currentFloor = null;    // floor key (e.g., "G", "1", "2")
    this.currentWaypoint = null; // nearest waypoint ID
    this.lastOCRCode = null;     // last room code seen by OCR
    this.confidence = 0;         // 0-100 confidence in current position

    // Callbacks
    this._onLocationUpdate = null;
    this._onModeChange = null;

    // Thresholds
    this.buildingProximity = 30;     // meters — when to consider user "near" a building
    this.indoorGPSAccuracy = 25;     // meters — GPS accuracy drops indoors
    this.outdoorTransitionDist = 50; // meters — distance from building to switch back to outdoor
    this.ocrTimeoutMs = 30000;       // ms — if no OCR match in this time, show help

    // State tracking
    this._lastOCRTime = 0;
    this._ocrFailTimer = null;
    this._isActive = false;
  }

  // Start tracking location
  async start(onLocationUpdate, onModeChange) {
    this._onLocationUpdate = onLocationUpdate;
    this._onModeChange = onModeChange;
    this._isActive = true;

    // Start GPS immediately
    this.gps.start((gpsData) => this._handleGPS(gpsData));

    // Initialize OCR engine in the background
    await this.ocr.init((msg) => {
      this._emitUpdate({ status: msg });
    });

    // Start step counter
    this.stepCounter.start((stepData) => this._handleStep(stepData));

    // Set initial mode
    this._setMode("outdoor");
  }

  // Stop all tracking
  stop() {
    this._isActive = false;
    this.gps.stop();
    this.ocr.stopScanning();
    this.ocr.terminate();
    this.stepCounter.stop();
    if (this._ocrFailTimer) {
      clearTimeout(this._ocrFailTimer);
      this._ocrFailTimer = null;
    }
  }

  // Start camera-based OCR scanning (called when camera is available)
  startOCR(videoElement) {
    this.ocr.startScanning(videoElement, (result) => this._handleOCR(result));

    // Set a timeout for OCR failure
    this._resetOCRTimeout();
  }

  stopOCR() {
    this.ocr.stopScanning();
  }

  // Set the target building (for outdoor navigation)
  setTargetBuilding(buildingCode) {
    this._targetBuilding = this.buildings[buildingCode] || null;
    this._targetBuildingCode = buildingCode;
  }

  // ---- GPS HANDLING ----

  _handleGPS(gpsData) {
    if (!this._isActive) return;

    if (gpsData.error) {
      // GPS errors are common indoors — not a problem if we're already indoor
      if (this.mode === "outdoor") {
        this._emitUpdate({ status: "GPS signal weak — move to open area" });
      }
      return;
    }

    const pos = gpsData.position;
    const nearest = gpsData.nearestBuilding;

    if (this.mode === "outdoor" || this.mode === "initializing") {
      // Check if user is near a building
      if (nearest && nearest.distance < this.buildingProximity) {
        this.currentBuilding = {
          code: nearest.code,
          building: nearest.building,
        };
        this._setMode("transitioning");
        this._emitUpdate({
          type: "near_building",
          building: nearest.code,
          buildingName: nearest.building.name,
          distance: nearest.distance,
        });
      } else if (nearest) {
        // Outdoor — show distance and bearing to nearest/target building
        const target = this._targetBuilding || nearest.building;
        const targetCode = this._targetBuildingCode || nearest.code;
        const dist = this.gps.haversineDistance(
          pos.lat, pos.lng, target.lat, target.lng
        );
        const bearing = this.gps.bearingTo(target.lat, target.lng);

        this._emitUpdate({
          type: "outdoor",
          targetBuilding: targetCode,
          targetBuildingName: target.name,
          distance: Math.round(dist),
          bearing: bearing,
          gpsAccuracy: pos.accuracy,
        });
      }
    }

    // If we're indoor but GPS suddenly becomes very accurate and we're far from building,
    // switch back to outdoor
    if (this.mode === "indoor" && pos.accuracy < 15 && nearest) {
      if (nearest.distance > this.outdoorTransitionDist) {
        this._setMode("outdoor");
        this.currentBuilding = null;
        this.currentFloor = null;
        this.currentWaypoint = null;
      }
    }
  }

  // ---- OCR HANDLING ----

  _handleOCR(result) {
    if (!this._isActive) return;

    this._lastOCRTime = Date.now();
    this._resetOCRTimeout();

    if (result.type === "room") {
      // Exact room detected! High confidence position
      this.currentBuilding = {
        code: result.building,
        building: this.buildings[result.building],
      };
      this.currentFloor = result.floor;
      this.currentWaypoint = result.waypointId;
      this.lastOCRCode = result.code;
      this.confidence = Math.min(95, result.confidence);

      // Reset step counter on new fix
      this.stepCounter.resetDistance();

      // Switch to indoor mode
      if (this.mode !== "indoor") {
        this._setMode("indoor");
      }

      this._emitUpdate({
        type: "ocr_room",
        code: result.code,
        building: result.building,
        floor: result.floor,
        waypointId: result.waypointId,
        confidence: this.confidence,
      });

    } else if (result.type === "floor") {
      // Floor sign detected — update floor but keep other position info
      this.currentFloor = result.floorKey;
      this.confidence = Math.max(this.confidence, 50);

      if (this.mode !== "indoor") {
        this._setMode("indoor");
      }

      this._emitUpdate({
        type: "ocr_floor",
        floorKey: result.floorKey,
        confidence: this.confidence,
      });

    } else if (result.type === "building") {
      // Building name detected
      this.currentBuilding = {
        code: result.buildingCode,
        building: this.buildings[result.buildingCode],
      };

      if (this.mode === "outdoor" || this.mode === "transitioning") {
        this._setMode("transitioning");
      }

      this._emitUpdate({
        type: "ocr_building",
        buildingCode: result.buildingCode,
        buildingName: result.buildingName,
        confidence: Math.min(60, result.confidence),
      });
    }
  }

  // ---- STEP COUNTING ----

  _handleStep(stepData) {
    if (!this._isActive || this.mode !== "indoor") return;

    // Degrade confidence as user walks further from last OCR fix
    // Each meter walked without an OCR fix reduces confidence
    const degradation = stepData.distanceSinceLastFix * 2; // 2% per meter
    this.confidence = Math.max(10, this.confidence - degradation / 50);

    this._emitUpdate({
      type: "step",
      steps: stepData.steps,
      distanceSinceLastFix: stepData.distanceSinceLastFix,
      confidence: this.confidence,
    });
  }

  // ---- MODE MANAGEMENT ----

  _setMode(newMode) {
    if (this.mode === newMode) return;
    const oldMode = this.mode;
    this.mode = newMode;

    if (this._onModeChange) {
      this._onModeChange(newMode, oldMode);
    }
  }

  _resetOCRTimeout() {
    if (this._ocrFailTimer) {
      clearTimeout(this._ocrFailTimer);
    }
    this._ocrFailTimer = setTimeout(() => {
      if (this.mode === "indoor" || this.mode === "transitioning") {
        this._emitUpdate({
          type: "ocr_timeout",
          message: "No signs detected. Try pointing camera at room number signs.",
        });
      }
    }, this.ocrTimeoutMs);
  }

  // ---- EMIT UPDATE ----

  _emitUpdate(data) {
    if (this._onLocationUpdate) {
      this._onLocationUpdate({
        ...data,
        mode: this.mode,
        currentBuilding: this.currentBuilding,
        currentFloor: this.currentFloor,
        currentWaypoint: this.currentWaypoint,
        confidence: this.confidence,
      });
    }
  }
}
