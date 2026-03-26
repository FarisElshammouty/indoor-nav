// ============================================================
// OCR SCANNER — Reads room signs via camera using Tesseract.js
// ============================================================
// Periodically grabs frames from the camera feed, runs OCR,
// and matches detected text against known room codes.
// Also detects floor-level signs (e.g., "Floor 3", "Level G").
// ============================================================

class OCRScanner {
  constructor(buildings) {
    this.buildings = buildings;
    this.worker = null;
    this.isReady = false;
    this.isScanning = false;
    this._scanInterval = null;
    this._onResult = null;
    this._canvas = document.createElement("canvas");
    this._ctx = this._canvas.getContext("2d");

    // Build set of all known room codes for matching
    this._knownCodes = new Set();
    this._buildKnownCodes();

    // Scan interval in ms
    this.scanIntervalMs = 2500;

    // Last successful detection
    this.lastDetection = null;
    this.lastDetectionTime = 0;
  }

  _buildKnownCodes() {
    for (const [bCode, building] of Object.entries(this.buildings)) {
      for (const [fKey, floor] of Object.entries(building.floors)) {
        for (const room of floor.rooms) {
          this._knownCodes.add(room.code.toUpperCase());
        }
      }
    }
  }

  // Initialize Tesseract worker
  async init(onProgress) {
    if (this.isReady) return;

    try {
      if (onProgress) onProgress("Loading OCR engine...");

      // Tesseract.js v5 API
      this.worker = await Tesseract.createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text" && onProgress) {
            onProgress(`OCR: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      // Optimize for speed: single column, no paragraph detection
      await this.worker.setParameters({
        tessedit_pageseg_mode: "6", // Assume uniform block of text
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -.",
      });

      this.isReady = true;
      if (onProgress) onProgress("OCR ready");
    } catch (err) {
      console.error("OCR init failed:", err);
      if (onProgress) onProgress("OCR failed to load");
    }
  }

  // Start continuous scanning from a video element
  startScanning(videoElement, onResult) {
    if (!this.isReady || this.isScanning) return;

    this.isScanning = true;
    this._onResult = onResult;

    this._scanInterval = setInterval(async () => {
      if (!this.isScanning) return;
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

  async terminate() {
    this.stopScanning();
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }
  }

  async _scanFrame(video) {
    if (!video || video.readyState < 2 || !this.worker) return;

    try {
      // Center-crop the frame (signs are usually in the middle)
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) return;

      // Crop center 60% of the frame for better focus on signs
      const cropW = Math.floor(vw * 0.6);
      const cropH = Math.floor(vh * 0.6);
      const cropX = Math.floor((vw - cropW) / 2);
      const cropY = Math.floor((vh - cropH) / 2);

      this._canvas.width = cropW;
      this._canvas.height = cropH;
      this._ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      // Run OCR
      const { data } = await this.worker.recognize(this._canvas);
      const text = data.text.toUpperCase().trim();

      if (!text) return;

      // Try to match room codes
      const roomMatch = this._matchRoomCode(text);
      if (roomMatch) {
        this.lastDetection = roomMatch;
        this.lastDetectionTime = Date.now();
        if (this._onResult) {
          this._onResult({
            type: "room",
            code: roomMatch.code,
            building: roomMatch.building,
            floor: roomMatch.floor,
            room: roomMatch.room,
            waypointId: roomMatch.waypointId,
            rawText: text,
            confidence: data.confidence,
          });
        }
        return;
      }

      // Try to match floor signs (e.g., "Floor 3", "Level G")
      const floorMatch = this._matchFloorSign(text);
      if (floorMatch) {
        if (this._onResult) {
          this._onResult({
            type: "floor",
            floorKey: floorMatch.floorKey,
            rawText: text,
            confidence: data.confidence,
          });
        }
        return;
      }

      // Try matching directional signs or building names
      const buildingMatch = this._matchBuildingSign(text);
      if (buildingMatch) {
        if (this._onResult) {
          this._onResult({
            type: "building",
            buildingCode: buildingMatch.code,
            buildingName: buildingMatch.name,
            rawText: text,
            confidence: data.confidence,
          });
        }
      }
    } catch (err) {
      // OCR can fail on some frames — that's fine
      console.debug("OCR frame error:", err);
    }
  }

  // Match OCR text against known room codes
  _matchRoomCode(text) {
    // Pattern: 1-2 letters followed by G or digit, then 1-2 digits
    // Examples: P402, PG22, F234, SC101, DL305
    const pattern = /\b([A-Z]{1,2}[G0-9]\d{1,2})\b/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const code = match[1];
      if (this._knownCodes.has(code)) {
        // Find the full room info
        return this._lookupRoom(code);
      }
    }

    // Also try fuzzy matching — OCR might misread some characters
    // Common OCR errors: 0↔O, 1↔I/L, 5↔S, 8↔B
    const fuzzyPattern = /\b([A-Z0-9]{2,5})\b/g;
    while ((match = fuzzyPattern.exec(text)) !== null) {
      const candidate = match[1];
      const corrected = this._fuzzyCorrect(candidate);
      if (corrected && this._knownCodes.has(corrected)) {
        return this._lookupRoom(corrected);
      }
    }

    return null;
  }

  _fuzzyCorrect(text) {
    // Common OCR substitutions
    const subs = {
      "O": "0", "I": "1", "L": "1", "S": "5", "B": "8",
      "Z": "2", "Q": "0",
    };

    // Try replacing digits that should be letters and vice versa
    // Only correct the numeric portion (after the building code)
    const letterPart = text.match(/^[A-Z]+/);
    if (!letterPart) return null;

    const rest = text.slice(letterPart[0].length);
    let correctedRest = "";
    for (const ch of rest) {
      correctedRest += subs[ch] || ch;
    }

    const corrected = letterPart[0] + correctedRest;
    return corrected.length >= 3 ? corrected : null;
  }

  _lookupRoom(code) {
    for (const [bCode, building] of Object.entries(this.buildings)) {
      for (const [fKey, floor] of Object.entries(building.floors)) {
        for (const room of floor.rooms) {
          if (room.code.toUpperCase() === code) {
            return {
              code: room.code,
              building: bCode,
              buildingName: building.name,
              floor: fKey,
              floorName: floor.name,
              room: room,
              waypointId: room.waypointId,
            };
          }
        }
      }
    }
    return null;
  }

  // Match floor-level signs
  _matchFloorSign(text) {
    const patterns = [
      /(?:FLOOR|LEVEL|FL\.?)\s*([0-6G])\b/gi,
      /\b(GROUND)\s*(?:FLOOR|FL\.?)?\b/gi,
      /\bLEVEL\s*([0-6G])\b/gi,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) {
        let floorKey = match[1].toUpperCase();
        if (floorKey === "GROUND" || floorKey === "0") floorKey = "G";
        return { floorKey };
      }
    }
    return null;
  }

  // Match building name signs
  _matchBuildingSign(text) {
    for (const [code, building] of Object.entries(this.buildings)) {
      const name = building.name.toUpperCase();
      if (text.includes(name) || text.includes(code)) {
        return { code, name: building.name };
      }
    }
    return null;
  }
}
