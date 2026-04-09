/**
 * Bezier path system - evaluates C++ Bezier spline path data.
 *
 * The C++ engine uses percentage-based path traversal (0 to 1,000,000).
 * Each path has nodes with PRE/AFT control points (Bezier handles).
 *
 * Loop types:
 *   LOOP_ON_END  (2) - path total offset accumulates each loop (continuous scrolling)
 *   LOOP_TO_START (1) - wraps back to start position on each loop
 */

export interface PathNode {
  x: number;
  y: number;
  preX: number;
  preY: number;
  aftX: number;
  aftY: number;
  speed: number;
  speedInCurve: number;
  speedOutCurve: number;
  segments: number;
}

export interface BezierPathData {
  loopingType: number; // 0=NONE, 1=LOOP_TO_START, 2=LOOP_ON_END, 3=PING_PONG
  initialX: number;
  initialY: number;
  nodes: PathNode[];
  totalOffsetX: number;
  totalOffsetY: number;
}

export const LOOP_NONE = 0;
export const LOOP_TO_START = 1;
export const LOOP_ON_END = 2;
export const LOOP_PING_PONG = 3;

const TOTAL_PERCENT = 1000000;

interface PathPoint {
  x: number;
  y: number;
}

/**
 * Evaluate a cubic Bezier curve at parameter t
 */
function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return mt3 * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3 * p3;
}

export class BezierPath {
  private data: BezierPathData;
  private lookupPoints: PathPoint[] = [];

  constructor(data: BezierPathData) {
    this.data = data;
    this.buildLookupTable();
  }

  private buildLookupTable(): void {
    const nodes = this.data.nodes;
    if (nodes.length < 2) {
      if (nodes.length === 1) {
        this.lookupPoints = [{ x: nodes[0].x, y: nodes[0].y }];
      }
      return;
    }

    this.lookupPoints = [];

    for (let i = 0; i < nodes.length - 1; i++) {
      const nodeA = nodes[i];
      const nodeB = nodes[i + 1];
      const segs = Math.max(1, nodeA.segments);

      // Bezier control points:
      // P0 = nodeA position
      // P1 = nodeA position + nodeA.aft (after handle)
      // P2 = nodeB position + nodeB.pre (before handle)
      // P3 = nodeB position
      const p0x = nodeA.x, p0y = nodeA.y;
      const p1x = nodeA.x + nodeA.aftX, p1y = nodeA.y + nodeA.aftY;
      const p2x = nodeB.x + nodeB.preX, p2y = nodeB.y + nodeB.preY;
      const p3x = nodeB.x, p3y = nodeB.y;

      for (let s = 0; s < segs; s++) {
        const t = s / segs;
        this.lookupPoints.push({
          x: cubicBezier(p0x, p1x, p2x, p3x, t),
          y: cubicBezier(p0y, p1y, p2y, p3y, t),
        });
      }
    }

    // Add final point at the last node
    const lastNode = nodes[nodes.length - 1];
    this.lookupPoints.push({ x: lastNode.x, y: lastNode.y });

    // Calculate total offset (end position relative to start)
    const start = this.lookupPoints[0];
    const end = this.lookupPoints[this.lookupPoints.length - 1];
    this.data.totalOffsetX = end.x - start.x;
    this.data.totalOffsetY = end.y - start.y;
  }

  /**
   * Get the position offset at the given percentage.
   * Returns { offsetX, offsetY } relative to the path start.
   */
  getPosition(percentage: number): { offsetX: number; offsetY: number } {
    const loopCount = Math.floor(percentage / TOTAL_PERCENT);
    let wrappedPercent = percentage % TOTAL_PERCENT;
    if (wrappedPercent < 0) wrappedPercent = 0;

    const totalPoints = this.lookupPoints.length;
    if (totalPoints === 0) return { offsetX: 0, offsetY: 0 };

    const floatIndex = (wrappedPercent / TOTAL_PERCENT) * (totalPoints - 1);
    const idx = Math.floor(floatIndex);
    const frac = floatIndex - idx;

    const i0 = Math.min(idx, totalPoints - 1);
    const i1 = Math.min(idx + 1, totalPoints - 1);

    const p0 = this.lookupPoints[i0];
    const p1 = this.lookupPoints[i1];

    let offsetX = p0.x + (p1.x - p0.x) * frac;
    let offsetY = p0.y + (p1.y - p0.y) * frac;

    // Apply loop offset for LOOP_ON_END
    if (this.data.loopingType === LOOP_ON_END) {
      offsetX += this.data.totalOffsetX * loopCount;
      offsetY += this.data.totalOffsetY * loopCount;
    }

    return { offsetX, offsetY };
  }

  get loopingType(): number {
    return this.data.loopingType;
  }

  get totalOffsetX(): number {
    return this.data.totalOffsetX;
  }

  get totalOffsetY(): number {
    return this.data.totalOffsetY;
  }
}
