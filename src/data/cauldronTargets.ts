// Per-level cauldron completion targets, transcribed verbatim from the C++
// datatable `wizball/wizball/datatables/level_completion_colours.txt`.
//
// Each level has THREE stages (level_progress 0,1,2). A stage is matched when
// EVERY primary cauldron (Red, Green, Blue) is filled to >= its target for that
// stage (C++ main_game_controller.txt: match_count == 3). When all three stages
// are matched the level is complete (level_progress reaches 3).
//
// Cauldron capacity constants (global_parameter_list.txt):
//   MAX=20, THREE_QUARTER=15, HALF=10, QUARTER=5
//
// Columns are [Red, Green, Blue]; rows are the 3 stages in order.

export type CauldronTarget = readonly [number, number, number];

export const MAX_CAULDRON_CAPACITY = 20;
export const THREE_QUARTER_CAULDRON_CAPACITY = 15;
export const HALF_CAULDRON_CAPACITY = 10;
export const QUARTER_CAULDRON_CAPACITY = 5;

// Indexed [level-1][stage] -> [R,G,B] target.
export const LEVEL_COMPLETION_COLOURS: readonly (readonly CauldronTarget[])[] = [
  // Level 1
  [[20, 0, 0], [10, 0, 10], [0, 10, 10]],
  // Level 2
  [[5, 10, 5], [15, 5, 0], [10, 10, 0]],
  // Level 3
  [[0, 0, 20], [10, 0, 10], [0, 10, 10]],
  // Level 4
  [[5, 10, 5], [0, 20, 0], [10, 10, 0]],
  // Level 5
  [[10, 0, 0], [15, 5, 0], [0, 10, 10]],
  // Level 6
  [[0, 0, 20], [10, 0, 10], [10, 10, 0]],
  // Level 7
  [[20, 0, 0], [10, 0, 10], [10, 10, 0]],
  // Level 8
  [[5, 10, 5], [10, 5, 5], [0, 10, 10]],
];

export const STAGES_PER_LEVEL = 3;

/** Target [R,G,B] for a given 1-based level and 0-based stage. */
export function getCauldronTarget(level: number, stage: number): CauldronTarget {
  const lvl = LEVEL_COMPLETION_COLOURS[Math.max(0, Math.min(level - 1, LEVEL_COMPLETION_COLOURS.length - 1))];
  return lvl[Math.max(0, Math.min(stage, STAGES_PER_LEVEL - 1))];
}
