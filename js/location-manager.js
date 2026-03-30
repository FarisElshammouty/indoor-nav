// ============================================================
// LOCATION MANAGER — Fuses GPS, Visual Localization, and Steps
// ============================================================
// Manages the user's position using three sources:
//   - GPS: outdoor positioning between buildings
//   - Visual Localizer: indoor positioning via server-side
//     3D model matching (COLMAP + hloc)
//   - StepCounter: dead reckoning between visual fixes
//
// Modes:
//   - "outdoor":       GPS active, guiding toward building
//   - "transitioning": Near building entrance, switching to indoor
//   - "indoor":        Visual localization + step counting active
// ============================================================

class LocationManager {
  constructor(buildings) {
    this.buildings = buildings;
    this.gps = new GPSNavigator(buildings);
    this.localizer = new VisualLocalizer(buildings);
    this.stepCounter = new StepCounter();

    // Current state
    this.mode = "initializing"; // outdoor | transitioning | indoor | initializing
    this.currentBuilding = null; // { code, building } — which building user is in/near
    this.currentFloor = null; // floor key (e.g., "G", "1", "2")
    this.currentWaypoint = null; // nearest waypoint ID
    this.lastLocCode = null; // last room code from visual localization
    this.confidence = 0; // 0-100 confidence in current position

    // Callbacks
    this._onLocationUpdate = null;
    this._onModeChange = null;

    // Thresholds
    this.buildingProximity = 30; // meters — when to consider user "near" a building
    this.indoorGPSAccuracy = 25; // meters — GPS accuracy drops indoors
    this.outdoorTransitionDist = 50; // meters — distance from building to switch back to outdoor
    this.locTimeoutMs = 30000; // ms — if no visual match in this time, show help

    // State tracking
    this._lastLocTime = 0;
    this._locFailTimer = null;
    this._isActive = false;
  }

  // Start tracking location
  async start(onLocationUpdate, onModeChange) {
    this._onLocationUpdate = onLocationUpdate;
    this._onModeChange = onModeChange;
    this._isActive = true;

    // Start GPS immediately
    this.gps.start((gpsData) => this._handleGPS(gpsData));

    // Check if localization server is available
    const serverStatus = await this.localizer.checkServer();
    if (serverStatus) {
      this._emitUpdate({
        type: "status",
        status: `Server connected — ${serverStatus.modelsLoaded} models loaded`,
      });
    } else {
      this._emitUpdate({
        type: "status",
        status: "Localization server not available — using GPS only",
      });
    }

    // Start step counter
    this.stepCounter.start((stepData) => this._handleStep(stepData));

    // Set initial mode
    this._setMode("outdoor");
  }

  // Stop all tracking
  stop() {
    this._isActive = false;
    this.gps.stop();
    this.localizer.stopScanning();
    this.stepCounter.stop();
    if (this._locFailTimer) {
      clearTimeout(this._locFailTimer);
      this._locFailTimer = null;
    }
  }

  // Start camera-based visual localization (called when camera is available)
  startVisualLocalization(videoElement) {
    this.localizer.startScanning(videoElement, (result) =>
      this._handleLocalization(result)
    );

    // Set a timeout for localization failure
    this._resetLocTimeout();
  }

  stopVisualLocalization() {
    this.localizer.stopScanning();
  }

  // Set the target building (for outdoor navigation)
  setTargetBuilding(buildingCode) {
    this._targetBuilding = this.buildings[buildingCode] || null;
    this._targetBuildingCode = buildingCode;

    // Give localizer a hint
    this.localizer.setHints(buildingCode, null);
  }

  // ---- GPS HANDLING ----

  _handleGPS(gpsData) {
    if (!this._isActive) return;

    if (gpsData.error) {
      if (this.mode === "outdoor") {
        this._emitUpdate({
          type: "status",
          status: "GPS signal weak — move to open area",
        });
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

        // Update localizer hints
        this.localizer.setHints(nearest.code, null);

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
          pos.lat,
          pos.lng,
          target.lat,
          target.lng
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

  // ---- VISUAL LOCALIZATION HANDLING ----

  _handleLocalization(result) {
    if (!this._isActive) return;

    this._lastLocTime = Date.now();
    this._resetLocTimeout();

    if (result.type === "room") {
      // Exact room position detected — high confidence
      this.currentBuilding = {
        code: result.building,
        building: this.buildings[result.building],
      };
      this.currentFloor = result.floor;
      this.currentWaypoint = result.waypointId;
      this.lastLocCode = result.code;
      this.confidence = Math.min(95, result.confidence);

      // Reset step counter on new fix
      this.stepCounter.resetDistance();

      // Update localizer hints
      this.localizer.setHints(result.building, result.floor);

      // Switch to indoor mode
      if (this.mode !== "indoor") {
        this._setMode("indoor");
      }

      this._emitUpdate({
        type: "visual_room",
        code: result.code,
        building: result.building,
        floor: result.floor,
        waypointId: result.waypointId,
        confidence: this.confidence,
      });
    } else if (result.type === "position") {
      // Position known but no specific room match
      this.currentBuilding = {
        code: result.building,
        building: this.buildings[result.building],
      };
      this.currentFloor = result.floor;
      if (result.nearestWaypoint) {
        this.currentWaypoint = result.nearestWaypoint;
      }
      this.confidence = Math.min(80, result.confidence);

      this.stepCounter.resetDistance();
      this.localizer.setHints(result.building, result.floor);

      if (this.mode !== "indoor") {
        this._setMode("indoor");
      }

      this._emitUpdate({
        type: "visual_position",
        building: result.building,
        floor: result.floor,
        x: result.x,
        y: result.y,
        nearestWaypoint: result.nearestWaypoint,
        confidence: this.confidence,
      });
    } else if (result.type === "no_match") {
      // Server couldn't determine position from this frame
      // This is normal — not every frame will match
      // Confidence degrades slowly
      this.confidence = Math.max(5, this.confidence - 2);
    }
  }

  // ---- STEP COUNTING ----

  _handleStep(stepData) {
    if (!this._isActive || this.mode !== "indoor") return;

    // Degrade confidence as user walks further from last visual fix
    const degradation = stepData.distanceSinceLastFix * 2;
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

  _resetLocTimeout() {
    if (this._locFailTimer) {
      clearTimeout(this._locFailTimer);
    }
    this._locFailTimer = setTimeout(() => {
      if (this.mode === "indoor" || this.mode === "transitioning") {
        this._emitUpdate({
          type: "loc_timeout",
          message:
            "No visual match. Try moving slowly and pointing camera at distinctive features.",
        });
      }
    }, this.locTimeoutMs);
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
