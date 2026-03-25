// ============================================================
// VISUAL POSITIONING SYSTEM (VPS)
// ============================================================
// Uses MobileNet (via TensorFlow.js) to create visual
// fingerprints of locations and match live camera frames
// against the stored reference database.
//
// How it works:
// 1. MobileNet extracts a 1024-dim feature vector from an image
// 2. We store vectors for reference photos (mapping phase)
// 3. At runtime, we extract features from live frames and
//    find the closest match using cosine similarity
// ============================================================

class VPS {
  constructor(featureDB) {
    this.featureDB = featureDB;
    this.model = null;
    this.isReady = false;
    this.referenceFeatures = [];
    this.matchInterval = null;
    this.onLocationUpdate = null; // callback
    this.lastMatch = null;
    this.confidence = 0;
    this.isMatching = false;

    // Settings
    this.MATCH_INTERVAL_MS = 2000; // Match every 2 seconds
    this.CONFIDENCE_THRESHOLD = 0.65; // Minimum cosine similarity to accept
    this.TOP_K = 3; // Check top K matches for consistency

    // Dead reckoning (between visual matches)
    this.stepCounter = {
      lastAccel: 0,
      stepCount: 0,
      isStep: false,
      threshold: 12,
    };
  }

  // Load TensorFlow.js and MobileNet model
  async init(progressCallback) {
    if (progressCallback) progressCallback("Loading TensorFlow.js...");

    // Wait for TF.js to be ready
    await tf.ready();

    if (progressCallback) progressCallback("Loading MobileNet model (~14MB)...");

    // Load MobileNet v2 — we'll use the second-to-last layer as our feature extractor
    const mobilenet = await tf.loadGraphModel(
      "https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v2_100_224/feature_vector/3/default/1",
      { fromTFHub: true }
    );

    this.model = mobilenet;
    this.isReady = true;

    // Pre-load reference features
    this.referenceFeatures = await this.featureDB.getAllFeatures();

    if (progressCallback) {
      progressCallback(`Ready! ${this.referenceFeatures.length} reference images loaded.`);
    }

    return this;
  }

  // Extract feature vector from an image/video frame
  async extractFeatures(imageElement) {
    if (!this.model) throw new Error("Model not loaded");

    return tf.tidy(() => {
      // Convert image to tensor
      let tensor = tf.browser.fromPixels(imageElement);

      // Resize to 224x224 (MobileNet input size)
      tensor = tf.image.resizeBilinear(tensor, [224, 224]);

      // Normalize to [0, 1]
      tensor = tensor.div(255.0);

      // Add batch dimension
      tensor = tensor.expandDims(0);

      // Run through model
      const features = this.model.predict(tensor);

      // Return as 1D vector
      return features.squeeze();
    });
  }

  // Extract and return as Float32Array (for storage)
  async extractFeaturesAsArray(imageElement) {
    const tensor = await this.extractFeatures(imageElement);
    const array = await tensor.data();
    tensor.dispose();
    return new Float32Array(array);
  }

  // Compute cosine similarity between two vectors
  cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
  }

  // Find the best matching reference image for a camera frame
  async matchFrame(videoElement) {
    if (!this.isReady || this.referenceFeatures.length === 0) return null;
    if (this.isMatching) return null; // Skip if already matching

    this.isMatching = true;

    try {
      const queryVector = await this.extractFeaturesAsArray(videoElement);

      // Compare against all reference features
      const scores = this.referenceFeatures.map((ref) => ({
        ...ref,
        score: this.cosineSimilarity(queryVector, ref.vector),
      }));

      // Sort by similarity (highest first)
      scores.sort((a, b) => b.score - a.score);

      const topMatch = scores[0];

      if (!topMatch || topMatch.score < this.CONFIDENCE_THRESHOLD) {
        this.confidence = topMatch ? topMatch.score : 0;
        this.isMatching = false;
        return null;
      }

      // Consistency check: do the top K matches agree on the same waypoint?
      const topK = scores.slice(0, this.TOP_K);
      const waypointVotes = {};
      for (const match of topK) {
        if (match.score >= this.CONFIDENCE_THRESHOLD * 0.8) {
          waypointVotes[match.waypointId] = (waypointVotes[match.waypointId] || 0) + 1;
        }
      }

      // Find waypoint with most votes
      let bestWaypoint = topMatch.waypointId;
      let bestVotes = 0;
      for (const [wp, votes] of Object.entries(waypointVotes)) {
        if (votes > bestVotes) {
          bestVotes = votes;
          bestWaypoint = wp;
        }
      }

      // Use the top match for the winning waypoint
      const bestMatch = scores.find((s) => s.waypointId === bestWaypoint);

      this.lastMatch = {
        waypointId: bestMatch.waypointId,
        buildingCode: bestMatch.buildingCode,
        floorKey: bestMatch.floorKey,
        heading: bestMatch.heading,
        score: bestMatch.score,
        votes: bestVotes,
        totalTopK: topK.length,
      };

      this.confidence = bestMatch.score;
      this.isMatching = false;
      return this.lastMatch;
    } catch (err) {
      console.error("VPS match error:", err);
      this.isMatching = false;
      return null;
    }
  }

  // Start continuous matching from a video element
  startContinuousMatching(videoElement, callback) {
    this.onLocationUpdate = callback;

    this.matchInterval = setInterval(async () => {
      if (videoElement.readyState < 2) return; // Video not ready

      const match = await this.matchFrame(videoElement);

      if (match && this.onLocationUpdate) {
        this.onLocationUpdate(match);
      }
    }, this.MATCH_INTERVAL_MS);
  }

  stopContinuousMatching() {
    if (this.matchInterval) {
      clearInterval(this.matchInterval);
      this.matchInterval = null;
    }
  }

  // ---- MAPPING HELPERS ----

  // Capture a reference image at a known position
  async captureReference(videoElement, waypointId, buildingCode, floorKey, heading) {
    const vector = await this.extractFeaturesAsArray(videoElement);

    // Create thumbnail for visual confirmation
    const thumbnail = this._createThumbnail(videoElement);

    const entry = {
      waypointId,
      buildingCode,
      floorKey,
      vector,
      heading: heading || 0,
      thumbnail,
    };

    const id = await this.featureDB.addFeature(entry);

    // Update in-memory cache
    this.referenceFeatures = await this.featureDB.getAllFeatures();

    return id;
  }

  _createThumbnail(videoElement, size = 80) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    // Center crop
    const vw = videoElement.videoWidth || videoElement.width;
    const vh = videoElement.videoHeight || videoElement.height;
    const cropSize = Math.min(vw, vh);
    const sx = (vw - cropSize) / 2;
    const sy = (vh - cropSize) / 2;

    ctx.drawImage(videoElement, sx, sy, cropSize, cropSize, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.6);
  }

  // ---- STEP DETECTION (dead reckoning aid) ----

  handleAccelerometer(event) {
    const accel = Math.sqrt(
      event.acceleration.x ** 2 +
      event.acceleration.y ** 2 +
      event.acceleration.z ** 2
    );

    if (accel > this.stepCounter.threshold && !this.stepCounter.isStep) {
      this.stepCounter.isStep = true;
      this.stepCounter.stepCount++;
    } else if (accel < this.stepCounter.threshold * 0.6) {
      this.stepCounter.isStep = false;
    }

    this.stepCounter.lastAccel = accel;
  }

  getStepCount() {
    return this.stepCounter.stepCount;
  }

  resetStepCount() {
    this.stepCounter.stepCount = 0;
  }

  // ---- STATS ----

  getStats() {
    return {
      referenceCount: this.referenceFeatures.length,
      isReady: this.isReady,
      lastMatch: this.lastMatch,
      confidence: this.confidence,
      stepCount: this.stepCounter.stepCount,
    };
  }
}
