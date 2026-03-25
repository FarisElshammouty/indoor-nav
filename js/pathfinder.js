// ============================================================
// A* PATHFINDER
// ============================================================
// Finds the shortest path between waypoints, including across
// floors (via stairwells).
// ============================================================

class Pathfinder {
  constructor(buildings) {
    this.buildings = buildings;
    this.graph = this._buildGraph();
  }

  // Build a unified graph across all buildings and floors
  _buildGraph() {
    const graph = {}; // nodeId -> { edges: [{ to, distance, instruction }], waypoint, building, floor }

    for (const bKey of Object.keys(this.buildings)) {
      const building = this.buildings[bKey];
      for (const fKey of Object.keys(building.floors)) {
        const floor = building.floors[fKey];

        // Add all waypoints as nodes
        for (const wp of floor.waypoints) {
          graph[wp.id] = {
            edges: [],
            waypoint: wp,
            buildingCode: bKey,
            floorKey: fKey,
            building: building,
            floor: floor,
          };
        }

        // Add edges (bidirectional)
        for (const edge of floor.edges) {
          if (!graph[edge.from] || !graph[edge.to]) continue;
          graph[edge.from].edges.push({ to: edge.to, distance: edge.distance });
          graph[edge.to].edges.push({ to: edge.from, distance: edge.distance });
        }

        // Add stair connections (cross-floor edges)
        for (const wp of floor.waypoints) {
          if (wp.isStairs && wp.connectsTo) {
            const targetId = wp.connectsTo.waypointId;
            // We'll add this edge; the target node may not exist yet,
            // so we do a second pass below
            if (!graph[wp.id]._pendingStairs) {
              graph[wp.id]._pendingStairs = [];
            }
            graph[wp.id]._pendingStairs.push({
              to: targetId,
              distance: 10, // penalty for stairs
            });
          }
        }
      }
    }

    // Second pass: connect stairwells
    for (const nodeId of Object.keys(graph)) {
      if (graph[nodeId]._pendingStairs) {
        for (const edge of graph[nodeId]._pendingStairs) {
          if (graph[edge.to]) {
            graph[nodeId].edges.push(edge);
            // Add reverse if not already added
            const reverseExists = graph[edge.to].edges.some((e) => e.to === nodeId);
            if (!reverseExists) {
              graph[edge.to].edges.push({ to: nodeId, distance: edge.distance });
            }
          }
        }
        delete graph[nodeId]._pendingStairs;
      }
    }

    return graph;
  }

  // Heuristic: Euclidean distance (for same floor) or 0 (cross-floor)
  _heuristic(nodeA, nodeB) {
    const a = this.graph[nodeA]?.waypoint;
    const b = this.graph[nodeB]?.waypoint;
    if (!a || !b) return 0;
    if (this.graph[nodeA].floorKey !== this.graph[nodeB].floorKey) return 0;
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  // A* search
  findPath(startWaypointId, endWaypointId) {
    if (!this.graph[startWaypointId] || !this.graph[endWaypointId]) {
      return null;
    }

    const openSet = new Set([startWaypointId]);
    const cameFrom = {};
    const gScore = {};
    const fScore = {};

    for (const id of Object.keys(this.graph)) {
      gScore[id] = Infinity;
      fScore[id] = Infinity;
    }
    gScore[startWaypointId] = 0;
    fScore[startWaypointId] = this._heuristic(startWaypointId, endWaypointId);

    while (openSet.size > 0) {
      // Get node with lowest fScore
      let current = null;
      let lowestF = Infinity;
      for (const id of openSet) {
        if (fScore[id] < lowestF) {
          lowestF = fScore[id];
          current = id;
        }
      }

      if (current === endWaypointId) {
        return this._reconstructPath(cameFrom, current);
      }

      openSet.delete(current);

      for (const edge of this.graph[current].edges) {
        const tentativeG = gScore[current] + edge.distance;
        if (tentativeG < gScore[edge.to]) {
          cameFrom[edge.to] = current;
          gScore[edge.to] = tentativeG;
          fScore[edge.to] = tentativeG + this._heuristic(edge.to, endWaypointId);
          openSet.add(edge.to);
        }
      }
    }

    return null; // No path found
  }

  _reconstructPath(cameFrom, current) {
    const path = [current];
    while (cameFrom[current]) {
      current = cameFrom[current];
      path.unshift(current);
    }
    return path;
  }

  // Convert a path (list of waypoint IDs) into human-readable steps
  // with direction arrows for the AR view
  getDirections(path, destinationRoom) {
    if (!path || path.length === 0) return [];

    const steps = [];

    for (let i = 0; i < path.length; i++) {
      const node = this.graph[path[i]];
      const wp = node.waypoint;
      const prevNode = i > 0 ? this.graph[path[i - 1]] : null;
      const nextNode = i < path.length - 1 ? this.graph[path[i + 1]] : null;

      let instruction = "";
      let icon = "straight"; // straight, left, right, up, down, arrive

      // Check for floor change
      if (prevNode && prevNode.floorKey !== node.floorKey) {
        const prevFloor = parseInt(prevNode.floorKey === "G" ? "0" : prevNode.floorKey);
        const currFloor = parseInt(node.floorKey === "G" ? "0" : node.floorKey);
        if (currFloor > prevFloor) {
          instruction = `Go up stairs to ${node.floor.name}`;
          icon = "up";
        } else {
          instruction = `Go down stairs to ${node.floor.name}`;
          icon = "down";
        }
      } else if (i === 0) {
        instruction = `Start at ${wp.label}`;
        icon = "start";
      } else if (nextNode) {
        // Calculate turn direction based on coordinates
        const direction = this._getDirection(prevNode.waypoint, wp, nextNode.waypoint);
        instruction = `At ${wp.label}, ${direction.text}`;
        icon = direction.icon;
      }

      // Last waypoint = destination
      if (i === path.length - 1) {
        instruction = `${destinationRoom.name} is on your ${destinationRoom.direction}`;
        icon = "arrive";
      }

      const distance = nextNode
        ? this._getEdgeDistance(path[i], path[i + 1])
        : 0;

      // Compute compass bearing toward the next waypoint
      let targetBearing = null;
      if (nextNode && node.floorKey === nextNode.floorKey) {
        const northOffset = node.building.northOffset || 0;
        targetBearing = Compass.bearingBetweenWaypoints(wp, nextNode.waypoint, northOffset);
      }

      steps.push({
        waypointId: path[i],
        waypoint: wp,
        building: node.building.name,
        floor: node.floor.name,
        instruction,
        icon,
        distance,
        targetBearing,
        isLast: i === path.length - 1,
      });
    }

    return steps;
  }

  _getEdgeDistance(fromId, toId) {
    const node = this.graph[fromId];
    const edge = node.edges.find((e) => e.to === toId);
    return edge ? edge.distance : 0;
  }

  _getDirection(prev, current, next) {
    // Calculate vectors
    const v1x = current.x - prev.x;
    const v1y = current.y - prev.y;
    const v2x = next.x - current.x;
    const v2y = next.y - current.y;

    // Cross product to determine turn direction
    const cross = v1x * v2y - v1y * v2x;

    // Dot product to check if straight
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
    const cosAngle = mag1 && mag2 ? dot / (mag1 * mag2) : 1;

    if (cosAngle > 0.7) {
      return { text: "continue straight ahead", icon: "straight" };
    } else if (cross > 0) {
      return { text: "turn left", icon: "left" };
    } else {
      return { text: "turn right", icon: "right" };
    }
  }

  // Find the nearest waypoint to a QR code position
  findNearestWaypoint(buildingCode, floorKey, x, y) {
    const building = this.buildings[buildingCode];
    if (!building || !building.floors[floorKey]) return null;

    const floor = building.floors[floorKey];
    let nearest = null;
    let minDist = Infinity;

    for (const wp of floor.waypoints) {
      const dist = Math.sqrt((wp.x - x) ** 2 + (wp.y - y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        nearest = wp;
      }
    }

    return nearest;
  }
}
