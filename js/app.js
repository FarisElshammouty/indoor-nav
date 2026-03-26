// ============================================================
// MAIN APP CONTROLLER — GPS + OCR + Step Counting Navigation
// ============================================================

class IndoorNavApp {
  constructor() {
    this.parser = new RoomParser(BUILDINGS);
    this.pathfinder = new Pathfinder(BUILDINGS);
    this.compass = new Compass();
    this.locationManager = new LocationManager(BUILDINGS);

    this.currentStep = 0;
    this.steps = [];
    this.arStream = null;
    this.destination = null;
    this.isNavigating = false;

    this._init();
  }

  async _init() {
    this._bindEvents();
    this._populateAutocomplete();
    this._populateBuildingsGrid();
  }

  // ---- UI BINDING ----

  _bindEvents() {
    // Search
    const searchInput = document.getElementById("room-input");
    const searchBtn = document.getElementById("search-btn");
    searchBtn.addEventListener("click", () => this.handleSearch());
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleSearch();
    });
    searchInput.addEventListener("input", () => this._filterAutocomplete());

    // AR controls
    document.getElementById("exit-nav-btn").addEventListener("click", () => this.exitNavigation());

    // Autocomplete selection
    document.getElementById("autocomplete-list").addEventListener("click", (e) => {
      if (e.target.classList.contains("autocomplete-item")) {
        searchInput.value = e.target.dataset.code;
        document.getElementById("autocomplete-list").classList.add("hidden");
        this.handleSearch();
      }
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-box")) {
        document.getElementById("autocomplete-list").classList.add("hidden");
      }
    });
  }

  _populateAutocomplete() {
    this.allRooms = this.parser.getAllRoomCodes();
  }

  _populateBuildingsGrid() {
    const grid = document.getElementById("buildings-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (const [code, building] of Object.entries(BUILDINGS)) {
      const floorCount = Object.keys(building.floors).length;
      const floorLabel = floorCount === 1 ? "1 floor" : `${floorCount} floors`;
      const card = document.createElement("div");
      card.className = "building-card";
      card.innerHTML = `
        <div class="building-icon">${code}</div>
        <div class="building-info">
          <div class="name">${building.name}</div>
          <div class="floors">${floorLabel}</div>
        </div>
      `;
      grid.appendChild(card);
    }
  }

  _filterAutocomplete() {
    const input = document.getElementById("room-input").value.toUpperCase();
    const list = document.getElementById("autocomplete-list");

    if (input.length < 1) {
      list.classList.add("hidden");
      return;
    }

    const matches = this.allRooms
      .filter((r) => r.code.includes(input) || r.label.toUpperCase().includes(input))
      .slice(0, 8);

    if (matches.length === 0) {
      list.classList.add("hidden");
      return;
    }

    list.innerHTML = matches
      .map((r) => `<div class="autocomplete-item" data-code="${r.code}">${r.label}</div>`)
      .join("");
    list.classList.remove("hidden");
  }

  // ---- SCREENS ----

  showScreen(screenId) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(screenId).classList.add("active");

    if (screenId !== "ar-screen") {
      this._stopCamera();
      this.compass.stop();
      this.locationManager.stopOCR();
    }
  }

  // ---- SEARCH ----

  handleSearch() {
    const code = document.getElementById("room-input").value.trim();
    if (!code) return;

    document.getElementById("autocomplete-list").classList.add("hidden");

    const result = this.parser.parse(code);

    if (result.error) {
      this._showError(result.error);
      return;
    }

    this.destination = result;

    // Go straight to navigation — no intermediate screens
    this.startNavigation();
  }

  _showError(msg) {
    const el = document.getElementById("search-error");
    el.textContent = msg;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 5000);
  }

  // ---- NAVIGATION START ----

  async startNavigation() {
    this.isNavigating = true;
    this.currentStep = 0;
    this.steps = [];

    // Show AR screen immediately
    this.showScreen("ar-screen");

    // Set destination labels
    document.getElementById("ar-dest-label").textContent =
      `${this.destination.room.code} — ${this.destination.room.name}`;
    document.getElementById("current-location").textContent = "Locating...";
    document.getElementById("instruction-text").textContent = "Starting navigation...";
    document.getElementById("distance-display").textContent = "";

    // Start camera
    await this._startCamera();

    // Tell location manager which building we're headed to
    this.locationManager.setTargetBuilding(this.destination.buildingCode);

    // Start location tracking
    await this.locationManager.start(
      (update) => this._onLocationUpdate(update),
      (newMode, oldMode) => this._onModeChange(newMode, oldMode)
    );

    // Start compass for arrow direction
    await this.compass.start((heading) => {
      this._updateArrowRotation(heading);
    });

    // Start OCR scanning with the camera feed
    const video = document.getElementById("ar-camera-feed");
    this.locationManager.startOCR(video);

    // Show initial status
    document.getElementById("instruction-text").textContent = "Looking for your location...";
    this._showOCRStatus("Point camera at room signs or walk outside");
  }

  // ---- LOCATION UPDATES ----

  _onLocationUpdate(update) {
    if (!this.isNavigating) return;

    switch (update.type) {
      case "outdoor":
        this._handleOutdoorUpdate(update);
        break;

      case "near_building":
        this._handleNearBuilding(update);
        break;

      case "ocr_room":
        this._handleOCRRoom(update);
        break;

      case "ocr_floor":
        this._handleOCRFloor(update);
        break;

      case "ocr_building":
        this._handleOCRBuilding(update);
        break;

      case "step":
        this._handleStepUpdate(update);
        break;

      case "ocr_timeout":
        this._showOCRStatus(update.message);
        break;

      case "status":
        if (update.status) {
          document.getElementById("instruction-text").textContent = update.status;
        }
        break;
    }

    // Update confidence badge
    this._updateConfidenceBadge(update.confidence);
  }

  _handleOutdoorUpdate(update) {
    // Show outdoor navigation info
    document.getElementById("outdoor-info").classList.remove("hidden");
    document.getElementById("ocr-status").classList.add("hidden");

    document.getElementById("outdoor-building-name").textContent = update.targetBuildingName;
    document.getElementById("outdoor-distance").textContent = `${update.distance}m away`;

    document.getElementById("instruction-text").textContent =
      `Walk toward ${update.targetBuildingName}`;
    document.getElementById("distance-display").textContent = `${update.distance}m`;
    document.getElementById("current-location").textContent = "Outdoors";

    // Arrow points toward the building using GPS bearing
    if (update.bearing !== null && this.compass.heading !== null) {
      const rotation = Compass.getArrowRotation(update.bearing, this.compass.heading);
      const arrowEl = document.getElementById("ar-arrow");
      const navArrow = `<svg viewBox="0 0 100 120" class="arrow-svg"><path d="M50 10 L80 50 L62 50 L62 110 L38 110 L38 50 L20 50 Z" fill="white"/></svg>`;
      arrowEl.className = "ar-arrow-compact compass-arrow";
      arrowEl.innerHTML = navArrow;
      arrowEl.style.transform = `rotate(${rotation}deg)`;
    }
  }

  _handleNearBuilding(update) {
    document.getElementById("outdoor-info").classList.add("hidden");
    document.getElementById("ocr-status").classList.remove("hidden");

    document.getElementById("instruction-text").textContent =
      `Entering ${update.buildingName}`;
    document.getElementById("distance-display").textContent = `${Math.round(update.distance)}m`;
    document.getElementById("current-location").textContent = update.buildingName;

    this._showOCRStatus("Point camera at room number signs");
  }

  _handleOCRRoom(update) {
    // Room detected! Calculate path and start turn-by-turn
    document.getElementById("outdoor-info").classList.add("hidden");
    document.getElementById("ocr-status").classList.remove("hidden");
    this._showOCRStatus(`Detected: ${update.code}`);

    // Find path from detected room's waypoint to destination
    const startWaypointId = update.waypointId;
    const endWaypointId = this.destination.room.waypointId;

    // If we detected the destination room itself
    if (update.code === this.destination.room.code) {
      this._showArrived();
      return;
    }

    const path = this.pathfinder.findPath(startWaypointId, endWaypointId);

    if (!path) {
      document.getElementById("instruction-text").textContent =
        "Looking for a route...";
      return;
    }

    this.steps = this.pathfinder.getDirections(path, this.destination.room);
    this.currentStep = 0;

    // Update current location display
    const building = BUILDINGS[update.building];
    const floor = building.floors[update.floor];
    document.getElementById("current-location").textContent =
      `${building.name} — ${floor.name}`;

    this._renderStep();
  }

  _handleOCRFloor(update) {
    // Floor sign detected — update display
    if (this.locationManager.currentBuilding) {
      const building = this.locationManager.currentBuilding.building;
      const floor = building.floors[update.floorKey];
      if (floor) {
        document.getElementById("current-location").textContent =
          `${building.name} — ${floor.name}`;
      }
    }
    this._showOCRStatus(`Floor ${update.floorKey} detected — keep scanning for room signs`);
  }

  _handleOCRBuilding(update) {
    document.getElementById("current-location").textContent = update.buildingName;
    this._showOCRStatus(`${update.buildingName} — scan room number signs`);
  }

  _handleStepUpdate(update) {
    // Auto-advance if user has walked past a waypoint's expected distance
    if (this.steps.length > 0 && this.currentStep < this.steps.length - 1) {
      const currentStepData = this.steps[this.currentStep];
      if (currentStepData.distance > 0 &&
          update.distanceSinceLastFix >= currentStepData.distance * 0.8) {
        // User has walked approximately the right distance — advance
        this.currentStep++;
        this.locationManager.stepCounter.resetDistance();
        this._renderStep();
        this._pulseAdvance();
      }
    }
  }

  _onModeChange(newMode, oldMode) {
    // Update mode badge
    const badge = document.getElementById("mode-badge");
    const label = document.getElementById("mode-label");
    const icon = document.getElementById("mode-icon");

    badge.className = `mode-badge ${newMode}`;

    switch (newMode) {
      case "outdoor":
        label.textContent = "Outdoor";
        icon.textContent = "";
        break;
      case "transitioning":
        label.textContent = "Entering Building";
        icon.textContent = "";
        break;
      case "indoor":
        label.textContent = "Indoor";
        icon.textContent = "";
        break;
      default:
        label.textContent = "Starting";
        icon.textContent = "";
    }
  }

  // ---- AR RENDERING ----

  _updateArrowRotation(heading) {
    // If we have navigation steps, use step bearing
    const step = this.steps[this.currentStep];
    if (step && step.targetBearing !== null && step.targetBearing !== undefined) {
      const rotation = Compass.getArrowRotation(step.targetBearing, heading);
      const arrowEl = document.getElementById("ar-arrow");
      if (arrowEl && arrowEl.classList.contains("compass-arrow")) {
        arrowEl.style.transform = `rotate(${rotation}deg)`;
      }
    }
    // If outdoor, location update handler handles the arrow
  }

  _renderStep() {
    const step = this.steps[this.currentStep];
    if (!step) return;

    // Instruction text
    document.getElementById("instruction-text").textContent = step.instruction;

    // Distance
    document.getElementById("distance-display").textContent =
      step.distance > 0 ? `~${Math.round(step.distance)}m` : "";

    // Arrow
    this._renderArrow(step.icon);

    // Destination label
    document.getElementById("ar-dest-label").textContent =
      `${this.destination.room.code} — ${this.destination.room.name}`;
    document.getElementById("current-location").textContent =
      `${step.building} — ${step.floor}`;

    // Progress bar
    const progress = ((this.currentStep + 1) / this.steps.length) * 100;
    document.getElementById("progress-fill").style.width = `${progress}%`;

    // Arrived state
    if (step.isLast) {
      this._showArrived();
    } else {
      document.getElementById("ar-overlay").classList.remove("arrived");
    }
  }

  _renderArrow(icon) {
    const arrowEl = document.getElementById("ar-arrow");
    const step = this.steps[this.currentStep];

    const specialSvgs = {
      start: `<svg viewBox="0 0 100 100" class="arrow-svg"><circle cx="50" cy="50" r="24" fill="#818cf8"/><circle cx="50" cy="50" r="10" fill="white"/></svg>`,
      up: `<svg viewBox="0 0 100 100" class="arrow-svg"><path d="M50 8 L82 45 L62 45 L62 72 L38 72 L38 45 L18 45 Z" fill="#22c55e"/><rect x="32" y="78" width="36" height="5" rx="2.5" fill="rgba(34,197,94,0.5)"/><rect x="37" y="87" width="26" height="5" rx="2.5" fill="rgba(34,197,94,0.3)"/></svg>`,
      down: `<svg viewBox="0 0 100 100" class="arrow-svg"><rect x="37" y="8" width="26" height="5" rx="2.5" fill="rgba(245,158,11,0.3)"/><rect x="32" y="17" width="36" height="5" rx="2.5" fill="rgba(245,158,11,0.5)"/><path d="M50 92 L82 55 L62 55 L62 28 L38 28 L38 55 L18 55 Z" fill="#f59e0b"/></svg>`,
      arrive: `<svg viewBox="0 0 100 100" class="arrow-svg"><circle cx="50" cy="50" r="38" fill="none" stroke="#22c55e" stroke-width="5"/><path d="M30 50 L44 64 L70 38" fill="none" stroke="#22c55e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    };

    const specialAnimClass = {
      start: "animate-pulse",
      up: "animate-up",
      down: "animate-down",
      arrive: "animate-arrive",
    };

    if (specialSvgs[icon]) {
      arrowEl.className = `ar-arrow-compact ${specialAnimClass[icon]}`;
      arrowEl.innerHTML = specialSvgs[icon];
      arrowEl.style.transform = "";
      return;
    }

    // Navigation arrow that rotates via compass
    const navArrow = `<svg viewBox="0 0 100 120" class="arrow-svg"><path d="M50 10 L80 50 L62 50 L62 110 L38 110 L38 50 L20 50 Z" fill="white"/></svg>`;
    arrowEl.className = "ar-arrow-compact compass-arrow";
    arrowEl.innerHTML = navArrow;

    if (step && step.targetBearing !== null && step.targetBearing !== undefined && this.compass.heading !== null) {
      const rotation = Compass.getArrowRotation(step.targetBearing, this.compass.heading);
      arrowEl.style.transform = `rotate(${rotation}deg)`;
    } else {
      arrowEl.style.transform = "";
    }
  }

  _showArrived() {
    document.getElementById("ar-overlay").classList.add("arrived");
    document.getElementById("instruction-text").textContent = "You've arrived!";
    document.getElementById("distance-display").textContent = "";
    document.getElementById("progress-fill").style.width = "100%";

    // Show arrive icon
    const arrowEl = document.getElementById("ar-arrow");
    arrowEl.className = "ar-arrow-compact animate-arrive";
    arrowEl.innerHTML = `<svg viewBox="0 0 100 100" class="arrow-svg"><circle cx="50" cy="50" r="38" fill="none" stroke="#22c55e" stroke-width="5"/><path d="M30 50 L44 64 L70 38" fill="none" stroke="#22c55e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    arrowEl.style.transform = "";

    // Auto-exit after 8 seconds
    setTimeout(() => {
      if (this.isNavigating) {
        this.exitNavigation();
      }
    }, 8000);
  }

  _pulseAdvance() {
    const overlay = document.getElementById("ar-overlay");
    overlay.classList.add("step-advance");
    setTimeout(() => overlay.classList.remove("step-advance"), 500);
  }

  _updateConfidenceBadge(confidence) {
    const el = document.getElementById("loc-confidence");
    if (!el || confidence === undefined) return;

    const pct = Math.round(confidence);
    el.textContent = `${pct}%`;

    if (pct > 70) {
      el.className = "confidence-badge good";
    } else if (pct > 40) {
      el.className = "confidence-badge ok";
    } else {
      el.className = "confidence-badge low";
    }
  }

  _showOCRStatus(text) {
    const el = document.getElementById("ocr-status");
    const textEl = document.getElementById("ocr-status-text");
    if (el) el.classList.remove("hidden");
    if (textEl) textEl.textContent = text;
  }

  // ---- EXIT ----

  exitNavigation() {
    this._stopCamera();
    this.compass.stop();
    this.locationManager.stop();
    this.isNavigating = false;
    this.steps = [];
    this.currentStep = 0;
    document.getElementById("ar-overlay").classList.remove("arrived");
    this.showScreen("search-screen");
  }

  // ---- CAMERA ----

  async _startCamera() {
    try {
      this._stopCamera();
      const video = document.getElementById("ar-camera-feed");

      this.arStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      video.srcObject = this.arStream;
      await video.play();
    } catch (err) {
      console.warn("Camera not available:", err);
      document.getElementById("instruction-text").textContent =
        "Camera access needed — please allow camera permission";
    }
  }

  _stopCamera() {
    if (this.arStream) {
      this.arStream.getTracks().forEach((t) => t.stop());
      this.arStream = null;
    }
    const video = document.getElementById("ar-camera-feed");
    if (video) video.srcObject = null;
  }
}

// ---- BOOT ----
document.addEventListener("DOMContentLoaded", () => {
  window.app = new IndoorNavApp();
});
