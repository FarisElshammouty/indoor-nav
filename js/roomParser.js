// ============================================================
// ROOM CODE PARSER
// ============================================================
// Parses room codes like:
//   PG22  → Building P (Poole House), Floor G (Ground), Room 22
//   F234  → Building F (Fusion), Floor 2, Room 34
//   P101  → Building P (Poole House), Floor 1, Room 01
//
// Format: <BuildingLetter><FloorChar><RoomNumber>
// ============================================================

class RoomParser {
  constructor(buildings) {
    this.buildings = buildings;
  }

  parse(code) {
    code = code.trim().toUpperCase();

    if (code.length < 3) {
      return { error: "Room code too short. Example: PG22, F234" };
    }

    const buildingCode = code[0];
    const building = this.buildings[buildingCode];

    if (!building) {
      const available = Object.keys(this.buildings)
        .map((k) => `${k} (${this.buildings[k].name})`)
        .join(", ");
      return { error: `Unknown building "${buildingCode}". Available: ${available}` };
    }

    // Floor character: G for ground, or a digit
    const floorChar = code[1];
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
      return {
        error: `Room "${code}" not found on ${floor.name} of ${building.name}. Available: ${available}`,
      };
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
