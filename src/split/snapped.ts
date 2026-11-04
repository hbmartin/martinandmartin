import { PIXEL, plateOffsets, teaserOffsets, type Offsets, type Strategy, } from '../plates'
export const snapped: Strategy = {
  draw(ctx) {
    const cell = ctx.wordSize * PIXEL
    const offsets = plateOffsets(ctx).map(([x, y]) =>
      [Math.round(x / cell) * cell, Math.round(y / cell) * cell]) as unknown as Offsets
    ctx.drawOffsets(teaserOffsets(ctx, offsets))
  },
}
