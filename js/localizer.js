// ============================================================
// VISUAL LOCALIZER — Sends camera frames to the server for
// position estimation using 3D visual localization.
// ============================================================
// Replaces the OCR scanner. Instead of reading signs locally,
// this sends camera frames to a backend server that runs
// hloc (SuperPoint + SuperGlue + NetVLAD) against pre-built
// 3D models of each building floor.
//
// The server returns: building, floor, x, y, nearestWaypoint,
// confidence. This is then used by LocationManager.
// ============================================================

class VisualLocalizer {
  constructor(buildings, serverUrl) {
    this.buildings = buildings;
    this.serverUrl = serverUrl || this._detectServerUrl();
    this.isScanning = false;
    this._scanInterval = null;
    this._onResult = null;
    this._canvas = document.createElement("canvas");
    this._ctx = this._canvas.getContext("2d");
    this._isProcessing = false;

    // Scan interval in ms (server round-trip is ~1-3s, so 2.5s is reasonable)
    this.scanIntervalMs = 2500;

    // Last successful detection
    this.lastDetection = null;
    this.lastDetectionTime = 0;

    // Hints from GPS/previous position (helps server prioritize models)
    this.hintBuilding = null;
    this.hintFloor = null;

    // Server status
    this.serverOnline = false;
    this.modelsLoaded = 0;
  }

  _detectServerUrl() {
    // In development, server runs locally
    // In production, this should be the deployed server URL
    if (
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1"
    ) {
      return "http://localhost:8000";
    }
    // For GitHub Pages deployment, you'll set this to your actual server URL
    // e.g., https://bu-nav-server.onrender.com
    return "http://localhost:8000";
  }

  // Check if the localization server is reachable
  async checkServer() {
    try {
      const res = await fetch(`${this.serverUrl}/status`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        this.serverOnline = true;
        this.modelsLoaded = data.modelsLoaded || 0;
        return data;
      }
    } catch (e) {
      console.warn("Localization server not reachable:", e.message);
    }
    this.serverOnline = false;
    return null;
  }

  // Start continuous scanning from a video element
  startScanning(videoElement, onResult) {
    if (this.isScanning) return;

    this.isScanning = true;
    this._onResult = onResult;

    this._scanInterval = setInterval(async () => {
      if (!this.isScanning || this._isProcessing) return;
      await this._scanFrame(videoElement);
    }, this.scanIntervalMs);

    // Do an immediate first scan
    this._scanFrame(videoElement);
  }

  stopScanning() {
    this.isScanning = false;
    if (this._scanInterval) {
      clearInterval(this._scanInterval);
      this._scanInterval = null;
    }
    this._onResult = null;
  }

  // Set hints for the server (improves speed by prioritizing likely models)
  setHints(building, floor) {
    this.hintBuilding = building;
    this.hintFloor = floor;
  }

  async _scanFrame(video) {
    if (!video || video.readyState < 2) return;
    if (this._isProcessing) return;

    this._isProcessing = true;

    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) return;

      // Capture frame at reduced resolution for faster upload
      const maxDim = 640;
      const scale = Math.min(1, maxDim / Math.max(vw, vh));
      const w = Math.floor(vw * scale);
      const h = Math.floor(vh * scale);

      this._canvas.width = w;
      this._canvas.height = h;
      this._ctx.drawImage(video, 0, 0, w, h);

      // Convert to JPEG blob
      const blob = await new Promise((resolve) =>
        this._canvas.toBlob(resolve, "image/jpeg", 0.8)
      );

      if (!blob) return;

      // Build form data
      const formData = new FormData();
      formData.append("image", blob, "frame.jpg");
      if (this.hintBuilding) {
        formData.append("hint_building", this.hintBuilding);
      }
      if (this.hintFloor) {
        formData.append("hint_floor", this.hintFloor);
      }

      // Send to server
      const res = await fetch(`${this.serverUrl}/localize`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.warn("Localization request failed:", res.status);
        return;
      }

      const result = await res.json();

      if (result.success && this._onResult) {
        // Map server result to the format LocationManager expects
        const roomInfo = this._findNearestRoom(
          result.building,
          result.floor,
          result.x,
          result.y
        );

        this.lastDetection = {
          building: result.building,
          floor: result.floor,
          x: result.x,
          y: result.y,
          nearestWaypoint: result.nearestWaypoint || (roomInfo && roomInfo.waypointId),
          confidence: result.confidence,
        };
        this.lastDetectionTime = Date.now();

        if (roomInfo) {
          this._onResult({
            type: "room",
            code: roomInfo.code,
            building: result.building,
            floor: result.floor,
            room: roomInfo.room,
            waypointId: roomInfo.waypointId,
            confidence: result.confidence,
            x: result.x,
            y: result.y,
          });
        } else {
          // We have a position but can't map to a specific room
          this._onResult({
            type: "position",
            building: result.building,
            floor: result.floor,
            x: result.x,
            y: result.y,
            nearestWaypoint: result.nearestWaypoint,
            confidence: result.confidence,
          });
        }
      } else if (!result.success && this._onResult) {
        this._onResult({
          type: "no_match",
          message: result.message,
        });
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.debug("Localization frame error:", err);
      }
    } finally {
      this._isProcessing = false;
    }
  }

  // Find the nearest room to a position within a building/floor
  _findNearestRoom(buildingCode, floorKey, x, y) {
    const building = this.buildings[buildingCode];
    if (!building) return null;

    const floor = building.floors[floorKey];
    if (!floor) return null;

    // Find nearest waypoint first
    let nearestWP = null;
    let minWPDist = Infinity;

    for (const wp of floor.waypoints) {
      const dist = Math.sqrt((wp.x - x) ** 2 + (wp.y - y) ** 2);
      if (dist < minWPDist) {
        minWPDist = dist;
        nearestWP = wp;
      }
    }

    if (!nearestWP) return null;

    // Find nearest room to this waypoint
    let nearestRoom = null;
    let minRoomDist = Infinity;

    for (const room of floor.rooms) {
      // Rooms are assigned to waypoints — find closest one
      if (room.waypointId === nearestWP.id) {
        return {
          code: room.code,
          room: room,
          waypointId: room.waypointId,
        };
      }
    }

    // If no exact waypoint match, find closest room by distance
    for (const room of floor.rooms) {
      const roomWP = floor.waypoints.find((wp) => wp.id === room.waypointId);
      if (roomWP) {
        const dist = Math.sqrt((roomWP.x - x) ** 2 + (roomWP.y - y) ** 2);
        if (dist < minRoomDist) {
          minRoomDist = dist;
          nearestRoom = { code: room.code, room, waypointId: room.waypointId };
        }
      }
    }

    return nearestRoom;
  }
}
