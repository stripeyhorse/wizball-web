// Render draw-order ("z") constants, transcribed from the C++ original's
// `wizball/wizball/constant.txt` *_DRAW_ORDER values. Keeping these faithful is
// what makes foreground terrain occlude the ball, the Catellite float above the
// scene, etc. — matching the original's layering exactly.
//
// World entities live in [−10, 98]; the HUD/status-bar lives above (>=100) so it
// always draws on top.
export const Depth = {
  PARALLAX_BG: -10,        // sky/planet parallax art (behind the BG tilemap)
  BG_TILEMAP: 10,          // tilemap layer 0  (BG_TILEMAP_DRAW_ORDER)
  ENEMY: 20,               // NORMAL_ENEMY_DRAW_ORDER (wave goes 20→38)
  PAINT_BUBBLE: 40,        // PAINT_BUBBLE_DRAW_ORDER
  WIZBALL_BULLET: 70,      // WIZBALL_BULLET_DRAW_ORDER
  WIZBALL: 71,             // WIZBALL_DRAW_ORDER (the player ball)
  WIZBALL_SHIELD: 72,      // WIZBALL_SHIELD_DRAW_ORDER
  ENEMY_BULLET: 75,        // ENEMY_BULLET_DRAW_ORDER
  FG_TILEMAP: 80,          // tilemap layer 1  (FG_TILEMAP_DRAW_ORDER) — occludes ball
  SFG_TILEMAP: 85,         // tilemap layer 2  (SFG_TILEMAP_DRAW_ORDER)
  SPECIAL_ENEMY: 90,       // SPECIAL_NORMAL_ENEMY_DRAW_ORDER (free-floating, e.g. fuzz)
  PEARL: 92,               // bonus pearls / special-paintball pickups
  PAINT: 93,               // PAINT_STAIN_DRAW_ORDER (falling paint drops)
  CATELLITE_SHIELD: 96,    // bubble shield around the Catellite
  CATELLITE: 97,           // CATELLITE_DRAW_ORDER
} as const;

// Tilemap layer index (0/1/2) -> draw order.
export const TILEMAP_LAYER_DEPTH = [Depth.BG_TILEMAP, Depth.FG_TILEMAP, Depth.SFG_TILEMAP];
