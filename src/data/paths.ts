/**
 * Path data extracted from C++ source files.
 *
 * Bezier paths from: paths/solid_diamond_path.txt, paths/fuzz_path_a.txt, paths/fuzz_path_b.txt
 * Special path datatables from: datatables/solid_diamond.txt, datatables/fuzz_type_a.txt, datatables/fuzz_type_b.txt
 */

import { BezierPathData, PathNode } from '../systems/BezierPath';
import { SpecialPathStage } from '../systems/SpecialPath';

// --- Bezier Path Data ---

export const SOLID_DIAMOND_BEZIER: BezierPathData = {
  loopingType: 2, // LOOP_ON_END
  initialX: 1728,
  initialY: 256,
  nodes: [
    { x: 0, y: 0, preX: -25, preY: 1, aftX: 0, aftY: -40, speed: 1, speedInCurve: 2, speedOutCurve: 2, segments: 13 },
    { x: 0, y: -80, preX: 0, preY: 40, aftX: 0, aftY: -32, speed: 20, speedInCurve: 0, speedOutCurve: 0, segments: 13 },
    { x: 0, y: -160, preX: 0, preY: 46, aftX: 0, aftY: 46, speed: 1, speedInCurve: 2, speedOutCurve: 2, segments: 13 },
    { x: 0, y: -64, preX: -1, preY: -23, aftX: 0, aftY: 59, speed: 15, speedInCurve: 0, speedOutCurve: 0, segments: 13 },
    { x: -96, y: 32, preX: 49, preY: -1, aftX: -50, aftY: 0, speed: 20, speedInCurve: 0, speedOutCurve: 0, segments: 13 },
    { x: -184, y: -64, preX: 20, preY: 24, aftX: -16, aftY: -31, speed: 20, speedInCurve: 1, speedOutCurve: 1, segments: 13 },
    { x: -224, y: -160, preX: -16, preY: -16, aftX: 16, aftY: 16, speed: 1, speedInCurve: 2, speedOutCurve: 2, segments: 13 },
    { x: -176, y: -64, preX: -24, preY: -45, aftX: 17, aftY: 32, speed: 20, speedInCurve: 1, speedOutCurve: 1, segments: 13 },
    { x: -96, y: 32, preX: -29, preY: -2, aftX: 33, aftY: 0, speed: 20, speedInCurve: 0, speedOutCurve: 0, segments: 13 },
    { x: 0, y: 32, preX: -30, preY: 0, aftX: 32, aftY: 1, speed: 1, speedInCurve: 2, speedOutCurve: 2, segments: 13 },
  ],
  totalOffsetX: 0,
  totalOffsetY: 0,
};

export const FUZZ_PATH_A_BEZIER: BezierPathData = {
  loopingType: 1, // LOOP_TO_START
  initialX: 808,
  initialY: -480,
  nodes: [
    { x: 0, y: 0, preX: -7, preY: -45, aftX: -38, aftY: 0, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 1 },
    { x: -96, y: 0, preX: 34, preY: 0, aftX: -32, aftY: 0, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
    { x: -160, y: -64, preX: 0, preY: 40, aftX: 0, aftY: -42, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
    { x: -96, y: -128, preX: -42, preY: 0, aftX: 45, aftY: 0, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
    { x: -32, y: -64, preX: 0, preY: -41, aftX: 1, aftY: 40, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
    { x: -96, y: 0, preX: 34, preY: 0, aftX: -35, aftY: 0, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
    { x: -160, y: 64, preX: 0, preY: -40, aftX: 0, aftY: 40, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
    { x: -96, y: 128, preX: -32, preY: 0, aftX: -32, aftY: 0, speed: 25, speedInCurve: 1, speedOutCurve: 1, segments: 1 },
    { x: -160, y: 128, preX: 32, preY: 0, aftX: -81, aftY: 0, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 6 },
    { x: -288, y: 0, preX: -1, preY: 73, aftX: 1, aftY: -76, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 6 },
    { x: -160, y: -128, preX: -82, preY: -1, aftX: -88, aftY: -1, speed: 25, speedInCurve: 1, speedOutCurve: 1, segments: 1 },
    { x: -272, y: -128, preX: 78, preY: -1, aftX: -63, aftY: 0, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 1 },
    { x: -432, y: -128, preX: 72, preY: 0, aftX: -73, aftY: 14, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
  ],
  totalOffsetX: 0,
  totalOffsetY: 0,
};

export const FUZZ_PATH_B_BEZIER: BezierPathData = {
  loopingType: 1, // LOOP_TO_START
  initialX: 1248,
  initialY: 184,
  nodes: [
    { x: 0, y: 0, preX: -7, preY: -45, aftX: -38, aftY: 0, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 1 },
    { x: -96, y: 0, preX: 34, preY: 0, aftX: -32, aftY: 0, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
    { x: -160, y: 64, preX: 0, preY: -40, aftX: 0, aftY: 40, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
    { x: -96, y: 128, preX: -42, preY: -1, aftX: 45, aftY: 0, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
    { x: -32, y: 64, preX: 0, preY: 40, aftX: 0, aftY: -40, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
    { x: -96, y: 0, preX: 34, preY: 0, aftX: -35, aftY: 0, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
    { x: -160, y: -64, preX: 0, preY: 49, aftX: 0, aftY: -47, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
    { x: -96, y: -128, preX: -32, preY: 0, aftX: -32, aftY: 0, speed: 25, speedInCurve: 1, speedOutCurve: 1, segments: 1 },
    { x: -160, y: -128, preX: 32, preY: 0, aftX: -81, aftY: 0, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 6 },
    { x: -288, y: 0, preX: 0, preY: -79, aftX: 0, aftY: 72, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 6 },
    { x: -160, y: 128, preX: -72, preY: 0, aftX: 64, aftY: 0, speed: 25, speedInCurve: 1, speedOutCurve: 1, segments: 6 },
    { x: -288, y: -128, preX: 78, preY: -1, aftX: -66, aftY: 0, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 1 },
    { x: -432, y: -128, preX: 72, preY: 0, aftX: -73, aftY: 14, speed: 100, speedInCurve: 1, speedOutCurve: 1, segments: 4 },
  ],
  totalOffsetX: 0,
  totalOffsetY: 0,
};

// --- Special Path Datatable Data ---
// Format: Flag, Length, X_Magnitude, Y_Magnitude, X_Behaviour, Y_Behaviour, X_Start_Angle, X_Period, Y_Start_Angle, Y_Period

export const SOLID_DIAMOND_SPECIAL_PATH: SpecialPathStage[] = [
  { flag: 0, frameLength: 40, xMagnitude: 0, yMagnitude: -80, xBehaviour: 0, yBehaviour: 1, xStartAngle: 0, xPeriod: 0, yStartAngle: -9000, yPeriod: 18000 },
  { flag: 0, frameLength: 20, xMagnitude: 0, yMagnitude: 100, xBehaviour: 0, yBehaviour: 1, xStartAngle: 0, xPeriod: 0, yStartAngle: -9000, yPeriod: 9000 },
  { flag: 0, frameLength: 20, xMagnitude: 75, yMagnitude: 100, xBehaviour: 1, yBehaviour: 1, xStartAngle: -9000, xPeriod: 9000, yStartAngle: 0, yPeriod: 9000 },
  { flag: 0, frameLength: 40, xMagnitude: 150, yMagnitude: -100, xBehaviour: 1, yBehaviour: 1, xStartAngle: 0, xPeriod: 9000, yStartAngle: -9000, yPeriod: 19000 },
  { flag: 0, frameLength: 40, xMagnitude: -150, yMagnitude: 115, xBehaviour: 1, yBehaviour: 1, xStartAngle: -9000, xPeriod: 9000, yStartAngle: -8000, yPeriod: 17000 },
  { flag: 0, frameLength: 20, xMagnitude: -75, yMagnitude: 0, xBehaviour: 1, yBehaviour: 0, xStartAngle: 0, xPeriod: 9000, yStartAngle: 0, yPeriod: 0 },
  { flag: 0, frameLength: 20, xMagnitude: 0, yMagnitude: 0, xBehaviour: 0, yBehaviour: 0, xStartAngle: 0, xPeriod: 0, yStartAngle: 0, yPeriod: 0 },
];

export const FUZZ_TYPE_A_SPECIAL_PATH: SpecialPathStage[] = [
  { flag: 0, frameLength: 8, xMagnitude: 128, yMagnitude: 0, xBehaviour: 0, yBehaviour: 0, xStartAngle: 0, xPeriod: 0, yStartAngle: 0, yPeriod: 0 },
  { flag: 0, frameLength: 32, xMagnitude: 80, yMagnitude: -80, xBehaviour: 1, yBehaviour: 1, xStartAngle: 0, xPeriod: 36000, yStartAngle: -9000, yPeriod: 36000 },
  { flag: 0, frameLength: 8, xMagnitude: 80, yMagnitude: 80, xBehaviour: 1, yBehaviour: 1, xStartAngle: 0, xPeriod: 9000, yStartAngle: -9000, yPeriod: 9000 },
  { flag: 0, frameLength: 8, xMagnitude: 40, yMagnitude: 80, xBehaviour: 1, yBehaviour: 1, xStartAngle: 9000, xPeriod: 18000, yStartAngle: 0, yPeriod: 9000 },
  { flag: 0, frameLength: 4, xMagnitude: 48, yMagnitude: 0, xBehaviour: 1, yBehaviour: 0, xStartAngle: -9000, xPeriod: 9000, yStartAngle: 0, yPeriod: 0 },
  { flag: 0, frameLength: 4, xMagnitude: 64, yMagnitude: 0, xBehaviour: 0, yBehaviour: 0, xStartAngle: 0, xPeriod: 0, yStartAngle: 0, yPeriod: 0 },
  { flag: 0, frameLength: 12, xMagnitude: 160, yMagnitude: -160, xBehaviour: 1, yBehaviour: 1, xStartAngle: 0, xPeriod: 9000, yStartAngle: -9000, yPeriod: 9000 },
  { flag: 0, frameLength: 12, xMagnitude: 80, yMagnitude: -160, xBehaviour: 1, yBehaviour: 1, xStartAngle: 9000, xPeriod: 18000, yStartAngle: 0, yPeriod: 9000 },
  { flag: 0, frameLength: 8, xMagnitude: 128, yMagnitude: 0, xBehaviour: 1, yBehaviour: 0, xStartAngle: -9000, xPeriod: 9000, yStartAngle: 0, yPeriod: 0 },
  { flag: 0, frameLength: 96, xMagnitude: 2048, yMagnitude: 0, xBehaviour: 0, yBehaviour: 0, xStartAngle: 0, xPeriod: 0, yStartAngle: 0, yPeriod: 0 },
];

export const FUZZ_TYPE_B_SPECIAL_PATH: SpecialPathStage[] = [
  { flag: 0, frameLength: 8, xMagnitude: 128, yMagnitude: 0, xBehaviour: 0, yBehaviour: 0, xStartAngle: 0, xPeriod: 0, yStartAngle: 0, yPeriod: 0 },
  { flag: 0, frameLength: 32, xMagnitude: 80, yMagnitude: 80, xBehaviour: 1, yBehaviour: 1, xStartAngle: 0, xPeriod: 36000, yStartAngle: -9000, yPeriod: 36000 },
  { flag: 0, frameLength: 8, xMagnitude: 80, yMagnitude: -80, xBehaviour: 1, yBehaviour: 1, xStartAngle: 0, xPeriod: 9000, yStartAngle: -9000, yPeriod: 9000 },
  { flag: 0, frameLength: 8, xMagnitude: 40, yMagnitude: -80, xBehaviour: 1, yBehaviour: 1, xStartAngle: 9000, xPeriod: 18000, yStartAngle: 0, yPeriod: 9000 },
  { flag: 0, frameLength: 4, xMagnitude: 48, yMagnitude: 0, xBehaviour: 1, yBehaviour: 0, xStartAngle: -9000, xPeriod: 9000, yStartAngle: 0, yPeriod: 0 },
  { flag: 0, frameLength: 4, xMagnitude: 64, yMagnitude: 0, xBehaviour: 0, yBehaviour: 0, xStartAngle: 0, xPeriod: 0, yStartAngle: 0, yPeriod: 0 },
  { flag: 0, frameLength: 12, xMagnitude: 160, yMagnitude: 160, xBehaviour: 1, yBehaviour: 1, xStartAngle: 0, xPeriod: 9000, yStartAngle: -9000, yPeriod: 9000 },
  { flag: 0, frameLength: 12, xMagnitude: 80, yMagnitude: 160, xBehaviour: 1, yBehaviour: 1, xStartAngle: 9000, xPeriod: 18000, yStartAngle: 0, yPeriod: 10000 },
  { flag: 0, frameLength: 24, xMagnitude: 384, yMagnitude: 160, xBehaviour: 1, yBehaviour: 1, xStartAngle: -9000, xPeriod: 9000, yStartAngle: 10000, yPeriod: 18000 },
  { flag: 0, frameLength: 80, xMagnitude: 1706, yMagnitude: 0, xBehaviour: 0, yBehaviour: 0, xStartAngle: 0, xPeriod: 0, yStartAngle: 0, yPeriod: 0 },
];
