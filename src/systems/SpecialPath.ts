/**
 * Special Path system - evaluates parametric movement from C++ datatable data.
 *
 * Each datatable row defines a movement stage with:
 *   - Length (frames)
 *   - X/Y Magnitude (amplitude)
 *   - X/Y Behaviour (LINEAR=0 or ANGULAR=1)
 *   - X/Y Start Angle and Period (for angular mode)
 *
 * Angular mode uses sine waves where angle units are:
 *   0 = origin, 9000 = full positive, 18000 = origin, 27000 = full negative
 *   (effectively 1/4-degree units in a 36000 circle)
 *
 * The percentage counter goes from 0 to 1,000,000 across all stages.
 */

export const BEHAVIOUR_LINEAR = 0;
export const BEHAVIOUR_ANGULAR = 1;

export interface SpecialPathStage {
  flag: number;
  frameLength: number;
  xMagnitude: number;
  yMagnitude: number;
  xBehaviour: number;
  yBehaviour: number;
  xStartAngle: number;
  xPeriod: number;
  yStartAngle: number;
  yPeriod: number;
}

interface ProcessedStage {
  percentageStart: number;
  percentageLength: number;
  xMagnitude: number;
  yMagnitude: number;
  xBehaviour: number;
  yBehaviour: number;
  xStartAngle: number;
  xPeriod: number;
  yStartAngle: number;
  yPeriod: number;
  xStartOffset: number;
  yStartOffset: number;
  cumulativeXOffset: number;
  cumulativeYOffset: number;
}

const TOTAL_PERCENT = 1000000;
const ANGLE_SCALAR = 36000;

/**
 * Sine lookup matching the C++ engine's sin table.
 * Angle is in the engine's units where 36000 = 360 degrees.
 * Returns value scaled by 10000 (so sin(9000) = 10000).
 */
function sinTable(angle: number): number {
  // Normalize angle to 0..36000
  angle = ((angle % ANGLE_SCALAR) + ANGLE_SCALAR) % ANGLE_SCALAR;
  // Convert to radians and compute
  const radians = (angle / ANGLE_SCALAR) * Math.PI * 2;
  return Math.round(Math.sin(radians) * 10000);
}

function unlerp(a: number, b: number, v: number): number {
  if (a === b) return 0;
  return (v - a) / (b - a);
}

export class SpecialPath {
  private stages: ProcessedStage[] = [];
  private totalFrameLength: number = 0;
  private totalXOffset: number = 0;
  private totalYOffset: number = 0;

  constructor(rawStages: SpecialPathStage[]) {
    this.processStages(rawStages);
  }

  private processStages(rawStages: SpecialPathStage[]): void {
    this.totalFrameLength = 0;
    for (const stage of rawStages) {
      this.totalFrameLength += stage.frameLength;
    }

    if (this.totalFrameLength === 0) return;

    const multiplier = TOTAL_PERCENT / this.totalFrameLength;

    let cumulativeX = 0;
    let cumulativeY = 0;
    let frameStart = 0;

    for (const raw of rawStages) {
      const percentageStart = Math.round(frameStart * multiplier);
      const percentageLength = Math.round(raw.frameLength * multiplier);

      // Calculate start offsets for angular behaviours
      let xStartOffset = 0;
      let yStartOffset = 0;

      if (raw.xBehaviour === BEHAVIOUR_ANGULAR) {
        xStartOffset = (raw.xMagnitude * sinTable(raw.xStartAngle)) / 10000;
      }
      if (raw.yBehaviour === BEHAVIOUR_ANGULAR) {
        yStartOffset = (raw.yMagnitude * sinTable(raw.yStartAngle)) / 10000;
      }

      this.stages.push({
        percentageStart,
        percentageLength,
        xMagnitude: raw.xMagnitude,
        yMagnitude: raw.yMagnitude,
        xBehaviour: raw.xBehaviour,
        yBehaviour: raw.yBehaviour,
        xStartAngle: raw.xStartAngle,
        xPeriod: raw.xPeriod,
        yStartAngle: raw.yStartAngle,
        yPeriod: raw.yPeriod,
        xStartOffset,
        yStartOffset,
        cumulativeXOffset: cumulativeX,
        cumulativeYOffset: cumulativeY,
      });

      // Calculate net displacement for this stage
      let stageDisplacementX = 0;
      let stageDisplacementY = 0;

      if (raw.xBehaviour === BEHAVIOUR_LINEAR) {
        stageDisplacementX = raw.xMagnitude;
      } else {
        const endSinVal = (raw.xMagnitude * sinTable(raw.xStartAngle + raw.xPeriod)) / 10000;
        stageDisplacementX = endSinVal - xStartOffset;
      }

      if (raw.yBehaviour === BEHAVIOUR_LINEAR) {
        stageDisplacementY = raw.yMagnitude;
      } else {
        const endSinVal = (raw.yMagnitude * sinTable(raw.yStartAngle + raw.yPeriod)) / 10000;
        stageDisplacementY = endSinVal - yStartOffset;
      }

      cumulativeX += stageDisplacementX;
      cumulativeY += stageDisplacementY;

      frameStart += raw.frameLength;
    }

    this.totalXOffset = cumulativeX;
    this.totalYOffset = cumulativeY;
  }

  /**
   * Get the position offset at the given percentage.
   * Returns { offsetX, offsetY }.
   */
  getPosition(percentage: number, currentSection: number): { offsetX: number; offsetY: number; section: number } {
    if (this.stages.length === 0) return { offsetX: 0, offsetY: 0, section: -1 };

    const loopCount = Math.floor(percentage / TOTAL_PERCENT);
    let wrappedPercent = percentage % TOTAL_PERCENT;
    if (wrappedPercent < 0) wrappedPercent = 0;

    // Find the correct stage
    const section = this.findStage(wrappedPercent, currentSection);
    const stage = this.stages[section];

    // Calculate sub-percentage within this stage (0.0 to 1.0)
    const subPercent = Phaser.Math.Clamp(
      unlerp(stage.percentageStart, stage.percentageStart + stage.percentageLength, wrappedPercent),
      0, 1
    );

    // Calculate X offset
    let xOffset: number;
    if (stage.xBehaviour === BEHAVIOUR_LINEAR) {
      xOffset = stage.xMagnitude * subPercent;
    } else {
      // Angular: sweep angle from startAngle to startAngle + period
      const angle = stage.xStartAngle + stage.xPeriod * subPercent;
      xOffset = ((stage.xMagnitude * sinTable(angle)) / 10000) - stage.xStartOffset;
    }

    // Calculate Y offset
    let yOffset: number;
    if (stage.yBehaviour === BEHAVIOUR_LINEAR) {
      yOffset = stage.yMagnitude * subPercent;
    } else {
      const angle = stage.yStartAngle + stage.yPeriod * subPercent;
      yOffset = ((stage.yMagnitude * sinTable(angle)) / 10000) - stage.yStartOffset;
    }

    // Add cumulative offsets from previous stages
    xOffset += stage.cumulativeXOffset;
    yOffset += stage.cumulativeYOffset;

    // Add loop offsets
    xOffset += this.totalXOffset * loopCount;
    yOffset += this.totalYOffset * loopCount;

    return { offsetX: xOffset, offsetY: yOffset, section };
  }

  private findStage(percentage: number, hint: number): number {
    if (hint >= 0 && hint < this.stages.length) {
      const stage = this.stages[hint];
      if (percentage >= stage.percentageStart &&
          percentage < stage.percentageStart + stage.percentageLength) {
        return hint;
      }
      // Check adjacent stages
      if (hint + 1 < this.stages.length) {
        const next = this.stages[hint + 1];
        if (percentage >= next.percentageStart &&
            percentage < next.percentageStart + next.percentageLength) {
          return hint + 1;
        }
      }
      if (hint - 1 >= 0) {
        const prev = this.stages[hint - 1];
        if (percentage >= prev.percentageStart &&
            percentage < prev.percentageStart + prev.percentageLength) {
          return hint - 1;
        }
      }
    }

    // Linear scan
    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      if (percentage >= stage.percentageStart &&
          percentage < stage.percentageStart + stage.percentageLength) {
        return i;
      }
    }

    // Default to last stage
    return this.stages.length - 1;
  }

  get totalOffsetX(): number {
    return this.totalXOffset;
  }

  get totalOffsetY(): number {
    return this.totalYOffset;
  }
}

// Need Phaser import for Phaser.Math.Clamp
import * as Phaser from 'phaser';
