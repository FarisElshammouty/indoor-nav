// ============================================================
// MAIN APP CONTROLLER — with Visual Positioning System
// ============================================================

class IndoorNavApp {
  constructor() {
    this.parser = new RoomParser(BUILDINGS);
    this.pathfinder = new Pathfinder(BUILDINGS);
    this.db = new FeatureDB();
    this.vps = null;
    this.compass = new Compass();
    this.currentStep = 0;
    this.steps = [];
    this.arStream = null;
    this.destination = null;
    this.isNavigating = false;
    this.userLocation = null;
    this.vpsReady = false;
    this.mapDataLoaded = false;

    this._init();
  }

  async _init() {
    // Init database
    await this.db.init();
    const count = await this.db.getCount();
    this.mapDataLoaded = count > 0;

    // Update UI with map status
    this._updateMapStatus(count);

    // Bind events
    this._bindEvents();
    this._populateAutocomplete();
  }

  _updateMapStatus(count) {
    const statusEl = document.getElementById("map-status");
    if (count > 0) {
      statusEl.innerHTML = `<span class="status-good">${count} reference images loaded — VPS ready</span>`;
    } else {
      statusEl.innerHTML = `
        <span class="status-warn">No map data yet</span>
        <a href="mapper.html" class="mapper-link">Open Mapper Tool to capture reference images</a>
      `;
    }
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

    // Navigation start button
    document.getElementById("start-nav-btn").addEventListener("click", () => this.startNavigation());

    // Manual fallback
    document.getElementById("manual-start-btn").addEventListener("click", () => {
      this._populateStartPoints();
      this.showScreen("startpoint-screen");
    });
    document.getElementById("start-btn").addEventListener("click", () => this.handleManualStart());

    // AR controls (only exit button now — navigation is fully automatic)
    document.getElementById("exit-nav-btn").addEventListener("click", () => this.exitNavigation());

    // Back buttons
    document.querySelectorAll(".back-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.showScreen("search-screen"));
    });

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

    if (screenId !== "ar-screen" && screenId !== "locating-screen") {
      this._stopCamera();
      this.compass.stop();
      if (this.vps) this.vps.stopContinuousMatching();
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

    // Show pre-navigation screen
    document.getElementById("dest-info").textContent = result.fullName;

    // Decide which options to show
    const hasMapData = this.mapDataLoaded;
    document.getElementById("vps-option").classList.toggle("hidden", !hasMapData);
    document.getElementById("no-vps-msg").classList.toggle("hidden", hasMapData);

    this.showScreen("prenav-screen");
  }

  _showError(msg) {
    const el = document.getElementById("search-error");
    el.textContent = msg;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 5000);
  }

  // ---- VPS NAVIGATION ----

  async startNavigation() {
    this.showScreen("locating-screen");
    document.getElementById("locate-status").textContent = "Starting camera...";

    // Start camera
    await this._startCamera();

    // Init VPS if not already
    if (!this.vps) {
      document.getElementById("locate-status").textContent = "Loading AI model (~14MB first time)...";
      this.vps = new VPS(this.db);
      await this.vps.init((msg) => {
        document.getElementById("locate-status").textContent = msg;
      });
    } else {
      // Refresh features
      this.vps.referenceFeatures = await this.db.getAllFeatures();
    }

    document.getElementById("locate-status").textContent = "Looking around... Point camera at your surroundings";

    // Start matching — use the locating screen's video
    const video = document.getElementById("camera-feed");
    let matchCount = 0;
    let bestMatch = null;

    this.vps.startContinuousMatching(video, (match) => {
      matchCount++;
      document.getElementById("locate-confidence").textContent =
        `Confidence: ${(match.score * 100).toFixed(0)}% | Matches: ${matchCount}`;

      if (!bestMatch || match.score > bestMatch.score) {
        bestMatch = match;
      }

      // After 3 good matches, or 1 very confident match, proceed
      if (match.score > 0.85 || matchCount >= 3) {
        this.vps.stopContinuousMatching();
        this._onLocationFound(bestMatch);
      }
    });

    // Timeout — if no match after 15 seconds, offer manual option
    setTimeout(() => {
      if (this.isNavigating) return;
      document.getElementById("locate-fallback").classList.remove("hidden");
    }, 15000);
  }

  _onLocationFound(match) {
    this.userLocation = match;
    this.isNavigating = true;

    // Calculate path
    const startWaypointId = match.waypointId;
    const endWaypointId = this.destination.room.waypointId;

    const path = this.pathfinder.findPath(startWaypointId, endWaypointId);

    if (!path) {
      alert("Could not find a route. Please try manual mode.");
      this.showScreen("search-screen");
      return;
    }

    this.steps = this.pathfinder.getDirections(path, this.destination.room);
    this.currentStep = 0;

    this._showARView();
  }

  async _showARView() {
    this.showScreen("ar-screen");
    await this._startCamera("ar-camera-feed");
    this._renderStep();

    // Start compass for real-world arrow direction
    await this.compass.start((heading) => {
      this._updateArrowRotation(heading);
    });

    // Continue VPS matching in background to track position
    const video = document.getElementById("ar-camera-feed");
    this.vps.startContinuousMatching(video, (match) => {
      this._onContinuousMatch(match);
    });

    // Start step counter
    if (window.DeviceMotionEvent) {
      this._motionHandler = (e) => this.vps.handleAccelerometer(e);
      window.addEventListener("devicemotion", this._motionHandler);
    }
  }

  _updateArrowRotation(heading) {
    const step = this.steps[this.currentStep];
    if (!step || step.targetBearing === null || step.targetBearing === undefined) return;

    const rotation = Compass.getArrowRotation(step.targetBearing, heading);
    const arrowEl = document.getElementById("ar-arrow");
    if (arrowEl) {
      arrowEl.style.transform = `rotate(${rotation}deg)`;
    }
  }

  _onContinuousMatch(match) {
    // Update VPS confidence badge
    const confEl = document.getElementById("vps-confidence");
    if (confEl) {
      confEl.textContent = `${(match.score * 100).toFixed(0)}%`;
      confEl.className = `vps-badge ${match.score > 0.75 ? "good" : match.score > 0.6 ? "ok" : "low"}`;
    }

    // Auto-advance: check if user has reached the next waypoint
    if (match.score > 0.7 && this.currentStep < this.steps.length - 1) {
      // Check if the match corresponds to ANY future step (user might skip waypoints)
      for (let i = this.currentStep + 1; i < this.steps.length; i++) {
        if (match.waypointId === this.steps[i].waypointId) {
          this.currentStep = i;
          this._renderStep();
          this._pulseAdvance();
          break;
        }
      }
    }
  }

  _pulseAdvance() {
    const overlay = document.getElementById("ar-overlay");
    overlay.classList.add("step-advance");
    setTimeout(() => overlay.classList.remove("step-advance"), 500);
  }

  // ---- MANUAL FALLBACK ----

  _populateStartPoints() {
    if (!this.destination) return;

    const building = this.destination.building;
    document.getElementById("dest-display").textContent = this.destination.fullName;

    const startPoints = [];

    // Collect entrances
    for (const fKey of Object.keys(building.floors)) {
      const floor = building.floors[fKey];
      for (const wp of floor.waypoints) {
        if (wp.isEntrance) {
          startPoints.push({ id: wp.id, label: `${wp.label} (${floor.name})`, isPrimary: true });
        }
      }
    }

    // Collect rooms as "I'm near..." options
    for (const fKey of Object.keys(building.floors)) {
      const floor = building.floors[fKey];
      for (const room of floor.rooms) {
        startPoints.push({
          id: room.waypointId,
          label: `Near ${room.code} — ${room.name} (${floor.name})`,
          isPrimary: false,
        });
      }
    }

    const container = document.getElementById("start-points");
    container.innerHTML = "";

    const entrances = startPoints.filter((s) => s.isPrimary);
    const others = startPoints.filter((s) => !s.isPrimary);

    for (const sp of entrances) {
      container.innerHTML += `
        <label class="start-option primary">
          <input type="radio" name="start-point" value="${sp.id}" checked>
          <span class="option-icon">&#128682;</span>
          <span>${sp.label}</span>
        </label>`;
    }

    if (others.length > 0) {
      container.innerHTML += `<div class="divider">Or I'm near a room:</div>`;
      for (const sp of others) {
        container.innerHTML += `
          <label class="start-option">
            <input type="radio" name="start-point" value="${sp.id}">
            <span class="option-icon">&#128205;</span>
            <span>${sp.label}</span>
          </label>`;
      }
    }
  }

  handleManualStart() {
    const selected = document.querySelector('input[name="start-point"]:checked');
    if (!selected) return;

    const startWaypointId = selected.value;
    const endWaypointId = this.destination.room.waypointId;

    const path = this.pathfinder.findPath(startWaypointId, endWaypointId);

    if (!path) {
      alert("Sorry, couldn't find a route.");
      return;
    }

    this.steps = this.pathfinder.getDirections(path, this.destination.room);
    this.currentStep = 0;
    this.isNavigating = true;
    this._showARView();
  }

  // ---- AR RENDERING ----

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
      document.getElementById("ar-overlay").classList.add("arrived");
      // Auto-exit after 5 seconds
      setTimeout(() => {
        if (this.isNavigating && this.currentStep === this.steps.length - 1) {
          this.exitNavigation();
        }
      }, 5000);
    } else {
      document.getElementById("ar-overlay").classList.remove("arrived");
    }
  }

  _renderArrow(icon) {
    const arrowEl = document.getElementById("ar-arrow");
    const step = this.steps[this.currentStep];

    // Special icons that don't use compass rotation
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

    // For start, stairs, and arrive — use static icons with animations
    if (specialSvgs[icon]) {
      arrowEl.className = `ar-arrow-compact ${specialAnimClass[icon]}`;
      arrowEl.innerHTML = specialSvgs[icon];
      arrowEl.style.transform = "";
      return;
    }

    // For navigation steps — use a single upward arrow that rotates via compass
    const navArrow = `<svg viewBox="0 0 100 120" class="arrow-svg"><path d="M50 10 L80 50 L62 50 L62 110 L38 110 L38 50 L20 50 Z" fill="white"/></svg>`;
    arrowEl.className = "ar-arrow-compact compass-arrow";
    arrowEl.innerHTML = navArrow;

    // Apply initial rotation if compass heading is available
    if (step && step.targetBearing !== null && step.targetBearing !== undefined && this.compass.heading !== null) {
      const rotation = Compass.getArrowRotation(step.targetBearing, this.compass.heading);
      arrowEl.style.transform = `rotate(${rotation}deg)`;
    } else {
      arrowEl.style.transform = "";
    }
  }

  exitNavigation() {
    this._stopCamera();
    this.compass.stop();
    if (this.vps) this.vps.stopContinuousMatching();
    if (this._motionHandler) {
      window.removeEventListener("devicemotion", this._motionHandler);
    }
    this.isNavigating = false;
    this.showScreen("search-screen");
  }

  // ---- CAMERA ----

  _getActiveVideo() {
    // Return the video element for whichever screen is active
    const locatingScreen = document.getElementById("locating-screen");
    if (locatingScreen.classList.contains("active")) {
      return document.getElementById("camera-feed");
    }
    return document.getElementById("ar-camera-feed");
  }

  async _startCamera(targetVideoId) {
    try {
      // Stop existing stream first
      this._stopCamera();

      const videoId = targetVideoId || (
        document.getElementById("locating-screen").classList.contains("active")
          ? "camera-feed"
          : "ar-camera-feed"
      );
      const video = document.getElementById(videoId);

      this.arStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      video.srcObject = this.arStream;
      this._activeVideoId = videoId;
      await video.play();
    } catch (err) {
      console.warn("Camera not available:", err);
    }
  }

  _stopCamera() {
    if (this.arStream) {
      this.arStream.getTracks().forEach((t) => t.stop());
      this.arStream = null;
    }
    // Clear both video elements
    for (const id of ["camera-feed", "ar-camera-feed"]) {
      const video = document.getElementById(id);
      if (video) video.srcObject = null;
    }
    this._activeVideoId = null;
  }
}

// ---- BOOT ----
document.addEventListener("DOMContentLoaded", () => {
  window.app = new IndoorNavApp();
});
