// ============================================================
// BUILDING DATA — THIS IS WHAT YOU NEED TO CUSTOMIZE
// ============================================================
//
// >>> YOUR ACTION REQUIRED: <<<
// Walk each building and update this file with real data:
//   1. Measure corridor lengths (steps work — 1 step ≈ 0.75m)
//   2. Note every junction/turn/stairwell
//   3. Note room numbers and which waypoint they're nearest to
//   4. Get GPS coordinates of each building entrance (Google Maps)
//
// ============================================================

const BUILDINGS = {
  P: {
    name: "Poole House",
    code: "P",
    lat: 50.7422,
    lng: -1.8945,
    // northOffset: degrees clockwise from building +Y axis to true north.
    // >>> MEASURE: stand at entrance facing "up" on your floor plan,
    //     read heading from a compass app. That's your northOffset. <<<
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

  F: {
    name: "Fusion Building",
    code: "F",
    lat: 50.7418,
    lng: -1.8950,
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
          { code: "FG10", name: "Café", waypointId: "FG-JUNC1", direction: "left" },
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
};
