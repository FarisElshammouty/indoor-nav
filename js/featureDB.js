// ============================================================
// FEATURE DATABASE — IndexedDB storage for visual fingerprints
// ============================================================
// Stores MobileNet feature vectors for each reference photo,
// tagged with building/floor/waypoint position data.
// ============================================================

class FeatureDB {
  constructor(dbName = "IndoorNavVPS") {
    this.dbName = dbName;
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Store for reference image features
        if (!db.objectStoreNames.contains("features")) {
          const store = db.createObjectStore("features", { keyPath: "id", autoIncrement: true });
          store.createIndex("waypointId", "waypointId", { unique: false });
          store.createIndex("buildingCode", "buildingCode", { unique: false });
          store.createIndex("floorKey", "floorKey", { unique: false });
        }

        // Store for mapping metadata
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  // Store a feature vector with location data
  async addFeature(entry) {
    // entry: { waypointId, buildingCode, floorKey, vector, heading, timestamp, thumbnail }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("features", "readwrite");
      const store = tx.objectStore("features");
      const request = store.add({
        ...entry,
        timestamp: Date.now(),
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get all features (for matching)
  async getAllFeatures() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("features", "readonly");
      const store = tx.objectStore("features");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get features for a specific building
  async getFeaturesForBuilding(buildingCode) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("features", "readonly");
      const store = tx.objectStore("features");
      const index = store.index("buildingCode");
      const request = index.getAll(buildingCode);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get feature count
  async getCount() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("features", "readonly");
      const store = tx.objectStore("features");
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Delete all features for a building
  async clearBuilding(buildingCode) {
    const features = await this.getFeaturesForBuilding(buildingCode);
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("features", "readwrite");
      const store = tx.objectStore("features");
      let deleted = 0;
      for (const f of features) {
        const req = store.delete(f.id);
        req.onsuccess = () => {
          deleted++;
          if (deleted === features.length) resolve(deleted);
        };
        req.onerror = () => reject(req.error);
      }
      if (features.length === 0) resolve(0);
    });
  }

  // Clear entire database
  async clearAll() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("features", "readwrite");
      const store = tx.objectStore("features");
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Save/load metadata
  async setMeta(key, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("meta", "readwrite");
      const store = tx.objectStore("meta");
      store.put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getMeta(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("meta", "readonly");
      const store = tx.objectStore("meta");
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  }

  // Export database as JSON (for backup/sharing)
  async exportAll() {
    const features = await this.getAllFeatures();
    // Convert Float32Arrays to regular arrays for JSON
    return features.map((f) => ({
      ...f,
      vector: Array.from(f.vector),
    }));
  }

  // Import from JSON
  async importAll(data) {
    const tx = this.db.transaction("features", "readwrite");
    const store = tx.objectStore("features");

    for (const entry of data) {
      store.add({
        ...entry,
        vector: new Float32Array(entry.vector),
      });
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(data.length);
      tx.onerror = () => reject(tx.error);
    });
  }
}
