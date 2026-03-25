// ============================================================
// ROOM CODE PARSER
// ============================================================
// Parses room codes like:
//   PG22   → Building P (Poole House), Floor G (Ground), Room 22
//   F234   → Building F (Fusion), Floor 2, Room 34
//   P101   → Building P (Poole House), Floor 1, Room 01
//   SCG05  → Building SC (Student Centre), Floor G, Room 05
//   DL101  → Building DL (Library), Floor 1, Room 01
//   TAG12  → Building TA (Tolpuddle Annex), Floor G, Room 12
//
// Format: <BuildingCode><FloorChar><RoomNumber>
// BuildingCode can be 1 or 2 letters (longest match wins)
// ============================================================

class RoomParser {
  constructor(buildings) {
    this.buildings = buildings;
    // Sort building codes longest-first for greedy matching
    this._sortedCodes = Object.keys(buildings).sort((a, b) => b.length - a.length);
  }

  parse(code) {
    code = code.trim().toUpperCase();

    if (code.length < 3) {
      return { error: "Room code too short. Example: PG22, F234, SCG05" };
    }

    // Try to match building code (longest first)
    let buildingCode = null;
    let building = null;
    let remainder = null;

    for (const bCode of this._sortedCodes) {
      if (code.startsWith(bCode)) {
        buildingCode = bCode;
        building = this.buildings[bCode];
        remainder = code.slice(bCode.length);
        break;
      }
    }

    if (!building) {
      const available = this._sortedCodes
        .map((k) => `${k} (${this.buildings[k].name})`)
        .join(", ");
      return { error: `Unknown building. Available: ${available}` };
    }

    if (remainder.length < 2) {
      return { error: `Room code too short after building "${buildingCode}". Need floor + room number.` };
    }

    // Floor character: G for ground, or a digit
    const floorChar = remainder[0];
    let floorKey;

    if (floorChar === "G") {
      floorKey = "G";
    } else if (/\d/.test(floorChar)) {
      floorKey = floorChar;
    } else {
      return { error: `Unknown floor "${floorChar}". Use G for ground or a number.` };
    }

    const floor = building.floors[floorKey];
    if (!floor) {
      const available = Object.keys(building.floors).join(", ");
      return { error: `Floor "${floorKey}" not found in ${building.name}. Available: ${available}` };
    }

    // The full code should match a room
    const room = floor.rooms.find((r) => r.code === code);
    if (!room) {
      const available = floor.rooms.map((r) => r.code).join(", ");
      if (available) {
        return {
          error: `Room "${code}" not found on ${floor.name} of ${building.name}. Available: ${available}`,
        };
      } else {
        return {
          error: `No rooms mapped yet on ${floor.name} of ${building.name}. Walk the building and add rooms to buildings.js first.`,
        };
      }
    }

    return {
      building,
      floorKey,
      floor,
      room,
      fullName: `${room.name} (${code}) — ${building.name}, ${floor.name}`,
    };
  }

  // Get all room codes for autocomplete
  getAllRoomCodes() {
    const codes = [];
    for (const bKey of Object.keys(this.buildings)) {
      const building = this.buildings[bKey];
      for (const fKey of Object.keys(building.floors)) {
        const floor = building.floors[fKey];
        for (const room of floor.rooms) {
          codes.push({
            code: room.code,
            label: `${room.code} — ${room.name} (${building.name}, ${floor.name})`,
          });
        }
      }
    }
    return codes.sort((a, b) => a.code.localeCompare(b.code));
  }
}
