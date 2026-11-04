import { Program, fullVertex, newTexture, texture, type GL } from './gl'
import { textStyle, type Layout, type TextBlock } from './layout'
import { aligned, drawOffsets, makeOffsetProgram, type Group, type Strategy } from './plates'
import type { Settings, Shape, Vec } from './settings'

export const MAX_RINGS = 16
export interface Ring { x: number; y: number; born: number }

const water = `#version 300 es
precision highp float;
uniform sampler2D uWord, uTeaser;
uniform vec4 uWordBox, uTeaserBox;
uniform vec3 uBackground;
uniform vec2 uSize, uReveal;
uniform float uDensity, uShort, uBend, uShimmer, uHighlight, uTeaserStrength;
uniform int uRingCount;
uniform vec4 uRings[${MAX_RINGS}];
out vec4 outColor;

vec3 coverage(sampler2D plates, vec4 box, vec2 p, vec2 bend, bool warped) {
  vec2 uv = (p-box.xy)/box.zw;
  uv.y = 1.-uv.y;
  if (any(lessThan(uv,vec2(0.))) || any(greaterThan(uv,vec2(1.)))) return vec3(0.);
  if (!warped) return texture(plates, uv).rgb;
  vec2 shift = vec2(bend.x,-bend.y)/box.zw;
  return vec3(texture(plates, uv+shift*(1.+uShimmer)).r,
              texture(plates, uv+shift).g,
              texture(plates, uv+shift*(1.-uShimmer)).b);
}
vec3 screenCMY(vec3 c) {
  return 1. - (1.-c.yzx)*(1.-c.zxy);
}
void main() {
  vec2 p = vec2(gl_FragCoord.x,uSize.y-gl_FragCoord.y)/uDensity;
  vec2 bend = vec2(0.);
  float light = 0.;
  float halfBand = max(2.,uShort*.018);
  for (int i=0; i<${MAX_RINGS}; i++) {
    if (i>=uRingCount) break;
    vec4 ring = uRings[i];
    vec2 d = p-ring.xy;
    float radius = ring.z * uShort * .29;
    if (max(abs(d.x),abs(d.y)) > radius+halfBand*2.) continue;
    float distance = length(d);
    float f = (distance-radius)/halfBand;
    if (abs(f)>2.) continue;
    float fade = smoothstep(0.,.10,ring.z) * (1.-smoothstep(.15,1.,ring.w));
    float envelope = 1.-smoothstep(.65,2.,abs(f));
    float slope = cos(f*2.9)*envelope*fade;
    bend += d/max(distance,1.) * slope;
    light = max(light,exp(-f*f*7.)*fade);
  }
  bool warped = any(notEqual(bend,vec2(0.)));
  float magnitude = length(bend);
  bend *= uBend / max(1.,magnitude);
  vec3 word = screenCMY(coverage(uWord, uWordBox, p, bend, warped)) * uReveal.x;
  vec3 teaser = screenCMY(coverage(uTeaser, uTeaserBox, p, bend*uTeaserStrength, warped)) * uReveal.y;
  vec3 color = 1.-(1.-uBackground)*(1.-word)*(1.-teaser)*(1.-light*uHighlight);
  outColor = vec4(color, 1.);
}`

export function getGL(canvas: HTMLCanvasElement) {
  return canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'low-power', preserveDrawingBuffer: false })
}

export class Renderer {
  private offset: Program
  private water: Program
  private programs = new Map<string, Program>()
  private groups: Group[] = []
  private layout!: Layout
  private density = 1
  private lastX = NaN
  private lastY = NaN
  private rings = new Float32Array(MAX_RINGS * 4)
  private textureLimit: number

  constructor(private canvas: HTMLCanvasElement, private gl: GL) {
    this.offset = makeOffsetProgram(gl)
    this.water = new Program(gl, fullVertex, water)
    this.textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.DITHER)
    gl.clearColor(0, 0, 0, 1)
  }

  private releaseGroups() {
    const gl = this.gl
    for (const group of this.groups) {
      gl.deleteTexture(group.mask)
      gl.deleteTexture(group.coverage)
      gl.deleteFramebuffer(group.framebuffer)
      if (group.instance) {
        gl.deleteVertexArray(group.instance.vao)
        gl.deleteBuffer(group.instance.buffer)
      }
    }
    this.groups = []
  }

  private makeGroup(block: TextBlock, padding: number): Group {
    const gl = this.gl
    const density = this.density
    const { ink } = block
    const x = Math.floor(ink.x - padding), y = Math.floor(ink.y - padding)
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil((ink.width + padding * 2 + 2) * density)
    canvas.height = Math.ceil((ink.height + padding * 2 + 2) * density)
    const box = { x, y, width: canvas.width / density, height: canvas.height / density }
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.setTransform(density, 0, 0, density, 0, 0)
    ctx.fillStyle = 'white'
    textStyle(ctx, block.font, block.size)
    for (const line of block.lines) ctx.fillText(line.text, line.x - box.x, line.y - box.y)
    const mask = newTexture(gl)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
    const coverage = newTexture(gl)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const framebuffer = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, coverage, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Plate buffer unavailable')
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { block, box, canvas, mask, coverage, framebuffer }
  }

  resize(layout: Layout, scale: number) {
    this.layout = layout
    const short = Math.min(layout.width, layout.height)
    // Covers the tuning maxima for split, cell variation, snap, and refraction.
    const pad = layout.lineHeight * .48 + short * .08 + 4
    this.density = Math.min(devicePixelRatio || 1, 2, this.textureLimit / (
      Math.max(layout.width, layout.height, layout.word.ink.width, layout.word.ink.height) + 2 * pad + 3
    )) * scale
    this.canvas.width = Math.max(1, Math.round(layout.width * this.density))
    this.canvas.height = Math.max(1, Math.round(layout.height * this.density))
    this.releaseGroups()
    this.groups = [this.makeGroup(layout.word, pad), this.makeGroup(layout.teaser, short * .08 + 4)]
    this.invalidate()
  }

  invalidate() { this.lastX = this.lastY = NaN }

  dispose() {
    this.releaseGroups()
    this.gl.deleteProgram(this.offset.value)
    this.gl.deleteProgram(this.water.value)
    for (const program of this.programs.values()) this.gl.deleteProgram(program.value)
    this.programs.clear()
  }

  private program = (key: string, vertex: string, fragment: string) => {
    let program = this.programs.get(key)
    if (!program) {
      program = new Program(this.gl, vertex, fragment)
      this.programs.set(key, program)
    }
    return program
  }

  draw(pointer: Vec, settings: Readonly<Settings>, shape: Shape, strategy: Strategy,
    wordOpacity: number, teaserOpacity: number, now: number, drops: readonly Ring[]) {
    const gl = this.gl
    const { layout, density, canvas } = this
    if (pointer[0] !== this.lastX || pointer[1] !== this.lastY) {
      this.groups.forEach((group, i) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, group.framebuffer)
        gl.viewport(0, 0, group.canvas.width, group.canvas.height)
        const draw = (offsets: Parameters<typeof drawOffsets>[4]) => drawOffsets(gl, this.offset, group, density, offsets)
        if (settings.split === 0 || (pointer[0] === 0 && pointer[1] === 0)) draw(aligned)
        else strategy.draw({ gl, group, density, teaser: i === 1, pointer, settings, shape,
          lineHeight: layout.lineHeight, wordSize: layout.word.size, drawOffsets: draw, program: this.program })
      })
      this.lastX = pointer[0]
      this.lastY = pointer[1]
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    const program = this.water
    program.use()
    for (const [i, group] of this.groups.entries()) {
      texture(gl, i, group.coverage)
      const prefix = i === 0 ? 'uWord' : 'uTeaser'
      program.i(prefix, i)
      const { x, y, width, height } = group.box
      program.v4(prefix + 'Box', x, y, width, height)
    }
    const rgb = Number.parseInt(settings.background.slice(1), 16)
    const short = Math.min(layout.width, layout.height)
    program.v3('uBackground', (rgb >> 16) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255)
    program.v2('uSize', canvas.width, canvas.height)
    program.v2('uReveal', wordOpacity, teaserOpacity)
    program.f('uDensity', density)
    program.f('uShort', short)
    program.f('uBend', short * settings.bend / 100)
    program.f('uShimmer', settings.shimmer / 100)
    program.f('uHighlight', settings.highlight / 100)
    program.f('uTeaserStrength', settings.teaserRipple / 100)
    drops.forEach(({ x, y, born }, i) => {
      const age = Math.max(0, (now - born) / 1000)
      this.rings.set([x, y, age, age / settings.lifetime], i * 4)
    })
    program.i('uRingCount', drops.length)
    if (drops.length) gl.uniform4fv(program.uniform('uRings[0]'), this.rings, 0, drops.length * 4)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}
