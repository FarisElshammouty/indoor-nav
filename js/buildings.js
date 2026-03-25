// ============================================================
// BUILDING DATA — BU TALBOT CAMPUS
// ============================================================
//
// >>> YOUR ACTION REQUIRED: <<<
// Walk each building and update this file with real data:
//   1. Measure corridor lengths (steps work — 1 step ≈ 0.75m)
//   2. Note every junction/turn/stairwell
//   3. Note room numbers and which waypoint they're nearest to
//   4. Measure northOffset with a compass app at each building
//
// ============================================================

const BUILDINGS = {
  // === POOLE HOUSE (P) ===
  P: {
    name: "Poole House",
    code: "P",
    lat: 50.7422,
    lng: -1.8945,
    northOffset: 0,
    floors: {
      G: {
        name: "Ground Floor",
        waypoints: [
          { id: "PG-ENTRANCE", x: 0, y: 0, label: "Main Entrance", isEntrance: true },
          { id: "PG-CORR1", x: 5, y: 0, label: "Corridor" },
          { id: "PG-JUNC1", x: 10, y: 0, label: "First Junction" },
          { id: "PG-CORR2", x: 10, y: 8, label: "North Corridor" },
          { id: "PG-CORR3", x: 15, y: 0, label: "East Corridor" },
          { id: "PG-STAIRS1", x: 15, y: 8, label: "Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "P1-STAIRS1" } },
          { id: "PG-CORR4", x: 10, y: -6, label: "South Corridor" },
        ],
        edges: [
          { from: "PG-ENTRANCE", to: "PG-CORR1", distance: 5 },
          { from: "PG-CORR1", to: "PG-JUNC1", distance: 5 },
          { from: "PG-JUNC1", to: "PG-CORR2", distance: 8 },
          { from: "PG-JUNC1", to: "PG-CORR3", distance: 5 },
          { from: "PG-CORR2", to: "PG-STAIRS1", distance: 5 },
          { from: "PG-CORR3", to: "PG-STAIRS1", distance: 8 },
          { from: "PG-JUNC1", to: "PG-CORR4", distance: 6 },
        ],
        rooms: [
          { code: "PG01", name: "Lecture Hall 1", waypointId: "PG-CORR1", direction: "left" },
          { code: "PG02", name: "Lecture Hall 2", waypointId: "PG-CORR1", direction: "right" },
          { code: "PG10", name: "Lab 10", waypointId: "PG-JUNC1", direction: "left" },
          { code: "PG11", name: "Lab 11", waypointId: "PG-JUNC1", direction: "right" },
          { code: "PG20", name: "Seminar Room 20", waypointId: "PG-CORR2", direction: "right" },
          { code: "PG22", name: "Seminar Room 22", waypointId: "PG-CORR2", direction: "left" },
          { code: "PG30", name: "Office 30", waypointId: "PG-CORR3", direction: "right" },
          { code: "PG40", name: "Workshop", waypointId: "PG-CORR4", direction: "left" },
        ],
      },
      1: {
        name: "First Floor",
        waypoints: [
          { id: "P1-STAIRS1", x: 15, y: 8, label: "Stairwell", isStairs: true, connectsTo: { floor: "G", waypointId: "PG-STAIRS1" } },
          { id: "P1-CORR1", x: 10, y: 8, label: "Corridor" },
          { id: "P1-JUNC1", x: 10, y: 0, label: "Junction" },
          { id: "P1-CORR2", x: 5, y: 0, label: "West Corridor" },
          { id: "P1-CORR3", x: 15, y: 0, label: "East Corridor" },
        ],
        edges: [
          { from: "P1-STAIRS1", to: "P1-CORR1", distance: 5 },
          { from: "P1-CORR1", to: "P1-JUNC1", distance: 8 },
          { from: "P1-JUNC1", to: "P1-CORR2", distance: 5 },
          { from: "P1-JUNC1", to: "P1-CORR3", distance: 5 },
        ],
        rooms: [
          { code: "P101", name: "Computer Lab", waypointId: "P1-CORR1", direction: "right" },
          { code: "P110", name: "Office 110", waypointId: "P1-JUNC1", direction: "left" },
          { code: "P120", name: "Meeting Room", waypointId: "P1-CORR2", direction: "left" },
          { code: "P130", name: "Server Room", waypointId: "P1-CORR3", direction: "right" },
        ],
      },
    },
  },

  // === FUSION BUILDING (F) ===
  F: {
    name: "Fusion Building",
    code: "F",
    lat: 50.7418,
    lng: -1.8920,
    northOffset: 0,
    floors: {
      G: {
        name: "Ground Floor",
        waypoints: [
          { id: "FG-ENTRANCE", x: 0, y: 0, label: "Main Entrance", isEntrance: true },
          { id: "FG-LOBBY", x: 5, y: 0, label: "Lobby" },
          { id: "FG-JUNC1", x: 10, y: 0, label: "Central Junction" },
          { id: "FG-CORR-N", x: 10, y: 8, label: "North Wing" },
          { id: "FG-CORR-S", x: 10, y: -8, label: "South Wing" },
          { id: "FG-STAIRS1", x: 15, y: 0, label: "Main Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "F1-STAIRS1" } },
        ],
        edges: [
          { from: "FG-ENTRANCE", to: "FG-LOBBY", distance: 5 },
          { from: "FG-LOBBY", to: "FG-JUNC1", distance: 5 },
          { from: "FG-JUNC1", to: "FG-CORR-N", distance: 8 },
          { from: "FG-JUNC1", to: "FG-CORR-S", distance: 8 },
          { from: "FG-JUNC1", to: "FG-STAIRS1", distance: 5 },
        ],
        rooms: [
          { code: "FG01", name: "Reception", waypointId: "FG-LOBBY", direction: "right" },
          { code: "FG10", name: "Cafe", waypointId: "FG-JUNC1", direction: "left" },
          { code: "FG20", name: "Lab A", waypointId: "FG-CORR-N", direction: "left" },
          { code: "FG21", name: "Lab B", waypointId: "FG-CORR-N", direction: "right" },
          { code: "FG30", name: "Lecture Theatre", waypointId: "FG-CORR-S", direction: "right" },
        ],
      },
      1: {
        name: "First Floor",
        waypoints: [
          { id: "F1-STAIRS1", x: 15, y: 0, label: "Main Stairwell", isStairs: true, connectsTo: { floor: "G", waypointId: "FG-STAIRS1" } },
          { id: "F1-CORR1", x: 10, y: 0, label: "Central Corridor" },
          { id: "F1-CORR-N", x: 10, y: 8, label: "North Wing" },
          { id: "F1-CORR-S", x: 10, y: -8, label: "South Wing" },
          { id: "F1-STAIRS2", x: 5, y: 0, label: "West Stairwell", isStairs: true, connectsTo: { floor: "2", waypointId: "F2-STAIRS2" } },
        ],
        edges: [
          { from: "F1-STAIRS1", to: "F1-CORR1", distance: 5 },
          { from: "F1-CORR1", to: "F1-CORR-N", distance: 8 },
          { from: "F1-CORR1", to: "F1-CORR-S", distance: 8 },
          { from: "F1-CORR1", to: "F1-STAIRS2", distance: 5 },
        ],
        rooms: [
          { code: "F101", name: "Study Room 1", waypointId: "F1-CORR1", direction: "left" },
          { code: "F110", name: "Library", waypointId: "F1-CORR-N", direction: "right" },
          { code: "F120", name: "Computer Lab", waypointId: "F1-CORR-S", direction: "left" },
        ],
      },
      2: {
        name: "Second Floor",
        waypoints: [
          { id: "F2-STAIRS2", x: 5, y: 0, label: "West Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "F1-STAIRS2" } },
          { id: "F2-CORR1", x: 10, y: 0, label: "Main Corridor" },
          { id: "F2-CORR2", x: 15, y: 0, label: "East Corridor" },
          { id: "F2-CORR-N", x: 10, y: 6, label: "North Side" },
        ],
        edges: [
          { from: "F2-STAIRS2", to: "F2-CORR1", distance: 5 },
          { from: "F2-CORR1", to: "F2-CORR2", distance: 5 },
          { from: "F2-CORR1", to: "F2-CORR-N", distance: 6 },
        ],
        rooms: [
          { code: "F201", name: "Seminar Room", waypointId: "F2-CORR1", direction: "right" },
          { code: "F234", name: "Design Studio", waypointId: "F2-CORR2", direction: "left" },
          { code: "F240", name: "Office 240", waypointId: "F2-CORR-N", direction: "right" },
        ],
      },
    },
  },

  // === KIMMERIDGE HOUSE (K) ===
  K: {
    name: "Kimmeridge House",
    code: "K",
    lat: 50.7432,
    lng: -1.8942,
    northOffset: 0,
    floors: {
      G: {
        name: "Ground Floor",
        waypoints: [
          { id: "KG-ENTRANCE", x: 0, y: 0, label: "Main Entrance", isEntrance: true },
          { id: "KG-CORR1", x: 8, y: 0, label: "Main Corridor" },
          { id: "KG-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "K1-STAIRS1" } },
        ],
        edges: [
          { from: "KG-ENTRANCE", to: "KG-CORR1", distance: 8 },
          { from: "KG-CORR1", to: "KG-STAIRS1", distance: 7 },
        ],
        rooms: [],
      },
      1: {
        name: "First Floor",
        waypoints: [
          { id: "K1-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "G", waypointId: "KG-STAIRS1" } },
          { id: "K1-CORR1", x: 8, y: 0, label: "Main Corridor" },
        ],
        edges: [
          { from: "K1-STAIRS1", to: "K1-CORR1", distance: 7 },
        ],
        rooms: [],
      },
    },
  },

  // === DORSET HOUSE (D) ===
  D: {
    name: "Dorset House",
    code: "D",
    lat: 50.7430,
    lng: -1.8928,
    northOffset: 0,
    floors: {
      G: {
        name: "Ground Floor",
        waypoints: [
          { id: "DG-ENTRANCE", x: 0, y: 0, label: "Main Entrance", isEntrance: true },
          { id: "DG-CORR1", x: 8, y: 0, label: "Main Corridor" },
          { id: "DG-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "D1-STAIRS1" } },
        ],
        edges: [
          { from: "DG-ENTRANCE", to: "DG-CORR1", distance: 8 },
          { from: "DG-CORR1", to: "DG-STAIRS1", distance: 7 },
        ],
        rooms: [],
      },
      1: {
        name: "First Floor",
        waypoints: [
          { id: "D1-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "G", waypointId: "DG-STAIRS1" } },
          { id: "D1-CORR1", x: 8, y: 0, label: "Main Corridor" },
        ],
        edges: [
          { from: "D1-STAIRS1", to: "D1-CORR1", distance: 7 },
        ],
        rooms: [],
      },
    },
  },

  // === CHRISTCHURCH HOUSE (C) ===
  C: {
    name: "Christchurch House",
    code: "C",
    lat: 50.7428,
    lng: -1.8908,
    northOffset: 0,
    floors: {
      G: {
        name: "Ground Floor",
        waypoints: [
          { id: "CG-ENTRANCE", x: 0, y: 0, label: "Main Entrance", isEntrance: true },
          { id: "CG-CORR1", x: 8, y: 0, label: "Main Corridor" },
          { id: "CG-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "C1-STAIRS1" } },
        ],
        edges: [
          { from: "CG-ENTRANCE", to: "CG-CORR1", distance: 8 },
          { from: "CG-CORR1", to: "CG-STAIRS1", distance: 7 },
        ],
        rooms: [],
      },
      1: {
        name: "First Floor",
        waypoints: [
          { id: "C1-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "G", waypointId: "CG-STAIRS1" } },
          { id: "C1-CORR1", x: 8, y: 0, label: "Main Corridor" },
        ],
        edges: [
          { from: "C1-STAIRS1", to: "C1-CORR1", distance: 7 },
        ],
        rooms: [],
      },
    },
  },

  // === WEYMOUTH HOUSE (W) ===
  W: {
    name: "Weymouth House",
    code: "W",
    lat: 50.7426,
    lng: -1.8922,
    northOffset: 0,
    floors: {
      G: {
        name: "Ground Floor",
        waypoints: [
          { id: "WG-ENTRANCE", x: 0, y: 0, label: "Main Entrance", isEntrance: true },
          { id: "WG-CORR1", x: 8, y: 0, label: "Main Corridor" },
          { id: "WG-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "W1-STAIRS1" } },
        ],
        edges: [
          { from: "WG-ENTRANCE", to: "WG-CORR1", distance: 8 },
          { from: "WG-CORR1", to: "WG-STAIRS1", distance: 7 },
        ],
        rooms: [],
      },
      1: {
        name: "First Floor",
        waypoints: [
          { id: "W1-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "G", waypointId: "WG-STAIRS1" } },
          { id: "W1-CORR1", x: 8, y: 0, label: "Main Corridor" },
        ],
        edges: [
          { from: "W1-STAIRS1", to: "W1-CORR1", distance: 7 },
        ],
        rooms: [],
      },
    },
  },

  // === JURASSIC HOUSE (J) ===
  J: {
    name: "Jurassic House",
    code: "J",
    lat: 50.7426,
    lng: -1.8890,
    northOffset: 0,
    floors: {
      G: {
        name: "Ground Floor",
        waypoints: [
          { id: "JG-ENTRANCE", x: 0, y: 0, label: "Main Entrance", isEntrance: true },
          { id: "JG-CORR1", x: 8, y: 0, label: "Main Corridor" },
          { id: "JG-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "J1-STAIRS1" } },
        ],
        edges: [
          { from: "JG-ENTRANCE", to: "JG-CORR1", distance: 8 },
          { from: "JG-CORR1", to: "JG-STAIRS1", distance: 7 },
        ],
        rooms: [],
      },
      1: {
        name: "First Floor",
        waypoints: [
          { id: "J1-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "G", waypointId: "JG-STAIRS1" } },
          { id: "J1-CORR1", x: 8, y: 0, label: "Main Corridor" },
        ],
        edges: [
          { from: "J1-STAIRS1", to: "J1-CORR1", distance: 7 },
        ],
        rooms: [],
      },
    },
  },

  // === STUDENT CENTRE (SC) ===
  SC: {
    name: "Student Centre",
    code: "SC",
    lat: 50.7420,
    lng: -1.8935,
    northOffset: 0,
    floors: {
      G: {
        name: "Ground Floor",
        waypoints: [
          { id: "SCG-ENTRANCE", x: 0, y: 0, label: "Main Entrance", isEntrance: true },
          { id: "SCG-CORR1", x: 8, y: 0, label: "Main Corridor" },
          { id: "SCG-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "SC1-STAIRS1" } },
        ],
        edges: [
          { from: "SCG-ENTRANCE", to: "SCG-CORR1", distance: 8 },
          { from: "SCG-CORR1", to: "SCG-STAIRS1", distance: 7 },
        ],
        rooms: [],
      },
      1: {
        name: "First Floor",
        waypoints: [
          { id: "SC1-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "G", waypointId: "SCG-STAIRS1" } },
          { id: "SC1-CORR1", x: 8, y: 0, label: "Main Corridor" },
        ],
        edges: [
          { from: "SC1-STAIRS1", to: "SC1-CORR1", distance: 7 },
        ],
        rooms: [],
      },
    },
  },

  // === SIR MICHAEL COBHAM LIBRARY (DL) ===
  DL: {
    name: "Sir Michael Cobham Library",
    code: "DL",
    lat: 50.7416,
    lng: -1.8932,
    northOffset: 0,
    floors: {
      G: {
        name: "Ground Floor",
        waypoints: [
          { id: "DLG-ENTRANCE", x: 0, y: 0, label: "Main Entrance", isEntrance: true },
          { id: "DLG-CORR1", x: 8, y: 0, label: "Main Corridor" },
          { id: "DLG-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "DL1-STAIRS1" } },
        ],
        edges: [
          { from: "DLG-ENTRANCE", to: "DLG-CORR1", distance: 8 },
          { from: "DLG-CORR1", to: "DLG-STAIRS1", distance: 7 },
        ],
        rooms: [],
      },
      1: {
        name: "First Floor",
        waypoints: [
          { id: "DL1-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "G", waypointId: "DLG-STAIRS1" } },
          { id: "DL1-CORR1", x: 8, y: 0, label: "Main Corridor" },
        ],
        edges: [
          { from: "DL1-STAIRS1", to: "DL1-CORR1", distance: 7 },
        ],
        rooms: [],
      },
    },
  },

  // === TOLPUDDLE ANNEX (TA) ===
  TA: {
    name: "Tolpuddle Annex",
    code: "TA",
    lat: 50.7414,
    lng: -1.8905,
    northOffset: 0,
    floors: {
      G: {
        name: "Ground Floor",
        waypoints: [
          { id: "TAG-ENTRANCE", x: 0, y: 0, label: "Main Entrance", isEntrance: true },
          { id: "TAG-CORR1", x: 8, y: 0, label: "Main Corridor" },
          { id: "TAG-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "TA1-STAIRS1" } },
        ],
        edges: [
          { from: "TAG-ENTRANCE", to: "TAG-CORR1", distance: 8 },
          { from: "TAG-CORR1", to: "TAG-STAIRS1", distance: 7 },
        ],
        rooms: [],
      },
      1: {
        name: "First Floor",
        waypoints: [
          { id: "TA1-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "G", waypointId: "TAG-STAIRS1" } },
          { id: "TA1-CORR1", x: 8, y: 0, label: "Main Corridor" },
        ],
        edges: [
          { from: "TA1-STAIRS1", to: "TA1-CORR1", distance: 7 },
        ],
        rooms: [],
      },
    },
  },

  // === POOLE GATEWAY BUILDING (PB) ===
  // Note: Map says "PG" but we use "PB" to avoid conflict with
  // Poole House room codes (PG22 = Poole House, Ground, Room 22).
  // Room codes: PBG01, PB101, etc.
  PB: {
    name: "Poole Gateway Building",
    code: "PB",
    lat: 50.7416,
    lng: -1.8880,
    northOffset: 0,
    floors: {
      G: {
        name: "Ground Floor",
        waypoints: [
          { id: "PBG-ENTRANCE", x: 0, y: 0, label: "Main Entrance", isEntrance: true },
          { id: "PBG-CORR1", x: 8, y: 0, label: "Main Corridor" },
          { id: "PBG-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "PB1-STAIRS1" } },
        ],
        edges: [
          { from: "PBG-ENTRANCE", to: "PBG-CORR1", distance: 8 },
          { from: "PBG-CORR1", to: "PBG-STAIRS1", distance: 7 },
        ],
        rooms: [],
      },
      1: {
        name: "First Floor",
        waypoints: [
          { id: "PB1-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "G", waypointId: "PBG-STAIRS1" } },
          { id: "PB1-CORR1", x: 8, y: 0, label: "Main Corridor" },
        ],
        edges: [
          { from: "PB1-STAIRS1", to: "PB1-CORR1", distance: 7 },
        ],
        rooms: [],
      },
    },
  },

  // === TALBOT HOUSE (T) ===
  T: {
    name: "Talbot House",
    code: "T",
    lat: 50.7404,
    lng: -1.8905,
    northOffset: 0,
    floors: {
      G: {
        name: "Ground Floor",
        waypoints: [
          { id: "TG-ENTRANCE", x: 0, y: 0, label: "Main Entrance", isEntrance: true },
          { id: "TG-CORR1", x: 8, y: 0, label: "Main Corridor" },
          { id: "TG-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "1", waypointId: "T1-STAIRS1" } },
        ],
        edges: [
          { from: "TG-ENTRANCE", to: "TG-CORR1", distance: 8 },
          { from: "TG-CORR1", to: "TG-STAIRS1", distance: 7 },
        ],
        rooms: [],
      },
      1: {
        name: "First Floor",
        waypoints: [
          { id: "T1-STAIRS1", x: 15, y: 0, label: "Stairwell", isStairs: true, connectsTo: { floor: "G", waypointId: "TG-STAIRS1" } },
          { id: "T1-CORR1", x: 8, y: 0, label: "Main Corridor" },
        ],
        edges: [
          { from: "T1-STAIRS1", to: "T1-CORR1", distance: 7 },
        ],
        rooms: [],
      },
    },
  },
};
