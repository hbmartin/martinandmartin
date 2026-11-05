import { Program, fullVertex, texture, type GL } from './gl'
import type { TextBlock, Rect } from './layout'
import { ZERO, type Settings, type Vec } from './settings'

export type Offsets = readonly [Vec, Vec, Vec]
export const aligned: Offsets = [ZERO, ZERO, ZERO]
export const PIXEL = .038
export interface Group {
  block: TextBlock
  box: Rect
  canvas: HTMLCanvasElement
  mask: WebGLTexture
  coverage: WebGLTexture
  framebuffer: WebGLFramebuffer
  instance?: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; count: number }
}
export interface PlateContext {
  gl: GL
  group: Group
  density: number
  teaser: boolean
  lineHeight: number
  wordSize: number
  pointer: Vec
  settings: Readonly<Settings>
  drawOffsets: (offsets: Offsets, sourceLine?: number) => void
  program: (key: string, vertex: string, fragment: string) => Program
}
export interface Strategy { draw(ctx: PlateContext): void }

export function plateOffsets(ctx: PlateContext): Offsets {
  const { settings, pointer: [x, y], lineHeight } = ctx
  const angle = settings.fan * Math.PI / 360
  const length = lineHeight * settings.split / 100
  function offset(turn: number, depth: number): Vec {
    return [(x * Math.cos(turn) - y * Math.sin(turn)) * length * depth,
      (x * Math.sin(turn) + y * Math.cos(turn)) * length * depth]
  }
  return [offset(-angle, settings.cyan), offset(0, settings.magenta), offset(angle, settings.yellow)]
}

// Keep the span between teaser plates below half a Circle dot's width.
export function teaserOffsets(ctx: PlateContext, offsets: Offsets, variation = 0): Offsets {
  if (!ctx.teaser) return offsets
  const radius = Math.max(...offsets.map(([x, y]) => Math.hypot(x, y)))
  const scale = radius > 0 ? Math.min(.4, (PIXEL * ctx.group.block.size * .5) / (2 * radius * (1 + variation))) : 0
  return offsets.map(([x, y]) => [x * scale, y * scale]) as unknown as Offsets
}

const offsetFragment = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform vec2 uSize;
uniform float uDensity;
uniform vec2 uC, uM, uY;
uniform vec2 uSourceY;
out vec4 outColor;
float at(vec2 p) {
  if (p.y < uSourceY.x || p.y >= uSourceY.y) return 0.;
  vec2 uv = p / (uSize / uDensity);
  if (any(lessThan(uv, vec2(0.))) || any(greaterThan(uv, vec2(1.)))) return 0.;
  return texture(uMask, uv).a;
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y-gl_FragCoord.y) / uDensity;
  outColor = vec4(at(p-uC), at(p-uM), at(p-uY), 1.);
}`

export function drawOffsets(gl: GL, program: Program, group: Group, density: number, offsets: Offsets,
  sourceLine?: number) {
  program.use()
  texture(gl, 0, group.mask)
  program.i('uMask', 0)
  program.v2('uSize', group.canvas.width, group.canvas.height)
  program.f('uDensity', density)
  program.v2('uC', ...offsets[0])
  program.v2('uM', ...offsets[1])
  program.v2('uY', ...offsets[2])
  const { lines } = group.block
  // Split the shared mask in the empty space between neighboring lines.
  // The shader clips source coordinates so displaced lines cannot duplicate ink.
  const edge = (index: number) => (lines[index - 1].y + lines[index - 1].descent
    + lines[index].y - lines[index].ascent) / 2 - group.box.y
  program.v2('uSourceY', sourceLine === undefined || sourceLine === 0 ? 0 : edge(sourceLine),
    sourceLine === undefined || sourceLine === lines.length - 1 ? group.canvas.height / density : edge(sourceLine + 1))
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export const makeOffsetProgram = (gl: GL) => new Program(gl, fullVertex, offsetFragment)
