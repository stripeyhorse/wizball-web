/**
 * Path data extracted from C++ source files.
 *
 * Special path datatables from: datatables/solid_diamond.txt, datatables/fuzz_type_a.txt, datatables/fuzz_type_b.txt
 * (The enemies use these datatable paths via SpecialPath — the old Bezier path
 * variant was never wired up and has been removed.)
 */

import { SpecialPathStage } from '../systems/SpecialPath';

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
