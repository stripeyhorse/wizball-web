import Phaser from 'phaser';

/**
 * CRT post-processing pipeline — gives the game the look of a period display:
 * a Commodore 64 hooked to a CRT, or an Amiga 500 on an RGB monitor. Implements
 * scanlines, an RGB aperture/shadow mask, gentle screen curvature, a vignette
 * and brightness compensation, all driven by per-preset uniforms.
 *
 * Applied per-scene to `cameras.main` (see applyCRTToScene). On a Canvas
 * renderer (no WebGL) the pipeline simply isn't registered and the game renders
 * flat — graceful degradation.
 */

export type CRTMode = 'off' | 'c64' | 'amiga';

export interface CRTParams {
  scanline: number;   // 0..1 — darkness of the gaps between scanlines
  scanCount: number;  // number of scanlines down the screen
  curvature: number;  // barrel distortion amount (0 = flat)
  mask: number;       // 0..1 — strength of the RGB phosphor mask
  vignette: number;   // corner darkening exponent
  brightness: number; // post-effect brightness boost (effects darken the image)
  warm: number;       // 0..1 — warm colour cast (C64 tube vs crisp Amiga RGB)
}

// Native frequency reference so scanlines/mask stay "chunky" regardless of the
// window/output resolution (a real CRT's lines don't get finer when upscaled).
const NATIVE_W = 640;
const NATIVE_H = 416;

export const CRT_PRESETS: Record<Exclude<CRTMode, 'off'>, CRTParams> = {
  // Commodore 64 on a CRT TV: chunky lines, soft, warm, noticeable curve.
  c64: {
    scanline: 0.34,
    scanCount: 232,
    curvature: 0.13,
    mask: 0.22,
    vignette: 0.28,
    brightness: 1.42,
    warm: 0.5,
  },
  // Amiga 500 on an RGB monitor: finer, sharper, crisp colour, subtle curve.
  amiga: {
    scanline: 0.18,
    scanCount: 400,
    curvature: 0.06,
    mask: 0.14,
    vignette: 0.18,
    brightness: 1.2,
    warm: 0.12,
  },
};

const FRAG_SHADER = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2  uResolution;   // native reference size (for line/mask frequency)
uniform float uScanline;
uniform float uScanCount;
uniform float uCurvature;
uniform float uMask;
uniform float uVignette;
uniform float uBrightness;
uniform float uWarm;

varying vec2 outTexCoord;

const float PI = 3.14159265;

// Barrel-distort the UVs so the picture bulges like a tube.
vec2 curveUV(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  vec2 offset = abs(uv.yx) / vec2(6.0, 5.0) * uCurvature;
  uv = uv + uv * offset * offset;
  return uv * 0.5 + 0.5;
}

void main() {
  vec2 uv = curveUV(outTexCoord);

  // Anything bent off the edge of the tube reads as the black bezel.
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 col = texture2D(uMainSampler, uv).rgb;

  // --- Scanlines ---
  float s = sin(uv.y * uScanCount * PI) * 0.5 + 0.5;
  col *= 1.0 - uScanline * (1.0 - s);

  // --- RGB aperture mask (per-column phosphor triads) ---
  float m = mod(uv.x * uResolution.x, 3.0);
  vec3 triad = m < 1.0 ? vec3(1.0, 0.55, 0.55)
             : m < 2.0 ? vec3(0.55, 1.0, 0.55)
             :           vec3(0.55, 0.55, 1.0);
  col *= mix(vec3(1.0), triad, uMask);

  // --- Warm tube cast (C64) vs crisp RGB (Amiga) ---
  col = mix(col, col * vec3(1.06, 1.0, 0.92), uWarm);

  // --- Vignette ---
  vec2 v = uv * (1.0 - uv);
  col *= pow(v.x * v.y * 15.0, uVignette);

  // --- Brightness compensation (the above all darken the picture) ---
  col *= uBrightness;

  gl_FragColor = vec4(col, 1.0);
}
`;

export class CRTPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private params: CRTParams = CRT_PRESETS.amiga;

  constructor(game: Phaser.Game) {
    super({ game, name: 'CRT', fragShader: FRAG_SHADER });
  }

  setParams(params: CRTParams): void {
    this.params = params;
  }

  onPreRender(): void {
    this.set2f('uResolution', NATIVE_W, NATIVE_H);
    this.set1f('uScanline', this.params.scanline);
    this.set1f('uScanCount', this.params.scanCount);
    this.set1f('uCurvature', this.params.curvature);
    this.set1f('uMask', this.params.mask);
    this.set1f('uVignette', this.params.vignette);
    this.set1f('uBrightness', this.params.brightness);
    this.set1f('uWarm', this.params.warm);
  }
}

export const CRT_PIPELINE_KEY = 'CRT';

/**
 * Apply (or remove) the CRT pipeline on a scene's main camera according to the
 * current setting. Safe to call repeatedly and on Canvas (no-op without WebGL).
 */
export function applyCRTToScene(scene: Phaser.Scene, mode: CRTMode): void {
  const cam = scene.cameras?.main;
  if (!cam) return;

  // Only meaningful with the WebGL renderer / a registered pipeline.
  const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const hasPipeline = !!(renderer.pipelines && renderer.pipelines.getPostPipeline);
  if (!hasPipeline) return;

  if (mode === 'off') {
    cam.resetPostPipeline();
    return;
  }

  // Re-create cleanly so switching presets/scenes never stacks pipelines.
  cam.resetPostPipeline();
  cam.setPostPipeline(CRTPipeline);
  const pipeline = cam.getPostPipeline(CRTPipeline) as CRTPipeline | CRTPipeline[] | undefined;
  const instance = Array.isArray(pipeline) ? pipeline[0] : pipeline;
  instance?.setParams(CRT_PRESETS[mode]);
}
