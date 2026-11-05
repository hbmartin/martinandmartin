import { PIXEL, plateOffsets, teaserOffsets, type Offsets, type Strategy, } from '../plates'
export const snapped: Strategy = {
  draw(ctx) {
    const offsets = plateOffsets(ctx)
    const snap = (size: number) => {
      const cell = size * PIXEL
      return offsets.map(([x, y]) =>
        [Math.round(x / cell) * cell, Math.round(y / cell) * cell]) as unknown as Offsets
    }
    if (ctx.teaser) return ctx.drawOffsets(teaserOffsets(ctx, snap(ctx.wordSize)))
    const { gl } = ctx
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendEquation(gl.MAX)
    try {
      ctx.group.block.lines.forEach((line, i) => ctx.drawOffsets(snap(line.size), i))
    } finally { gl.disable(gl.BLEND) }
  },
}
