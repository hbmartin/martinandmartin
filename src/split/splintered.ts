import { PIXEL, plateOffsets, teaserOffsets, type Group, type Strategy } from '../plates'
import { texture, type GL } from '../gl'
import { clamp } from '../settings'

const vertex = `#version 300 es
layout(location=0) in vec4 aCell;
uniform vec2 uSize, uOffset;
uniform float uVariation;
out vec2 vSource;
flat out vec2 vMin;
flat out float vCell;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vCell = aCell.w;
  vSource = aCell.xy + corner * vCell;
  vMin = aCell.xy;
  vec2 p = (vSource + uOffset * (1. + aCell.z * uVariation)) / uSize;
  gl_Position = vec4(2. * p.x - 1., 1. - 2. * p.y, 0., 1.);
}`
const fragment = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform vec2 uSize;
uniform float uDensity;
uniform vec3 uPlate;
in vec2 vSource;
flat in vec2 vMin;
flat in float vCell;
out vec4 outColor;
void main() {
  float inset = min(.5/uDensity, vCell*.45);
  vec2 uv = clamp(vSource, vMin+inset, vMin+vCell-inset) / uSize;
  outColor = vec4(uPlate * texture(uMask, uv).a, 1.);
}`

function cells(gl: GL, group: Group, density: number) {
  if (group.instance) return group.instance
  const { canvas, block, box } = group
  const rgba = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data
  const data: number[] = []
  for (const [index, line] of block.lines.entries()) {
    const step = PIXEL * line.size
    const x0 = line.x - line.advance / 2 - box.x
    const y0 = line.y - box.y
    for (let iy = Math.floor(-line.ascent / step); iy < Math.ceil(line.descent / step); iy++) {
      for (let ix = Math.floor((line.advance / 2 - line.left) / step); ix < Math.ceil((line.advance / 2 + line.right) / step); ix++) {
        const x = x0 + ix * step, y = y0 + iy * step
        const fromX = clamp(Math.floor((x + step * .12) * density), 0, canvas.width - 1)
        const fromY = clamp(Math.floor((y + step * .12) * density), 0, canvas.height - 1)
        const toX = clamp(Math.ceil((x + step * .88) * density), 0, canvas.width)
        const toY = clamp(Math.ceil((y + step * .88) * density), 0, canvas.height)
        let ink = false
        for (let sy = fromY; sy < toY && !ink; sy++) {
          for (let sx = fromX; sx < toX && !ink; sx++) ink = rgba[(sy * canvas.width + sx) * 4 + 3] > 80
        }
        if (!ink) continue
        let hash = Math.imul(ix + 997, 73856093) ^ Math.imul(iy + 997, 19349663) ^ Math.imul(index + 1, 83492791)
        hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
        data.push(x, y, ((hash ^ (hash >>> 16)) >>> 0) / 2147483648 - 1, step)
      }
    }
  }
  const vao = gl.createVertexArray()!
  const buffer = gl.createBuffer()!
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0)
  gl.vertexAttribDivisor(0, 1)
  gl.bindVertexArray(null)
  return group.instance = { vao, buffer, count: data.length / 4 }
}

const colors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const

export const splintered: Strategy = {
  draw(ctx) {
    const { gl, group, density, pointer } = ctx
    const variation = ctx.settings.variation * Math.hypot(...pointer) / 100
    const offsets = teaserOffsets(ctx, plateOffsets(ctx), variation)
    if (variation === 0) return ctx.drawOffsets(offsets)
    const program = ctx.program('cells', vertex, fragment)
    const instance = cells(gl, group, density)
    gl.clear(gl.COLOR_BUFFER_BIT)
    program.use()
    texture(gl, 0, group.mask)
    program.i('uMask', 0)
    program.v2('uSize', group.canvas.width / density, group.canvas.height / density)
    program.f('uDensity', density)
    program.f('uVariation', variation)
    gl.bindVertexArray(instance.vao)
    gl.enable(gl.BLEND)
    gl.blendEquation(gl.MAX)
    offsets.forEach((offset, i) => {
      program.v2('uOffset', ...offset)
      const [r, g, b] = colors[i]
      program.v3('uPlate', r, g, b)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instance.count)
    })
    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  },
}
