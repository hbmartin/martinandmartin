import { plateOffsets, teaserOffsets, type Strategy } from '../plates'
export const smooth: Strategy = {
  draw(ctx) { ctx.drawOffsets(teaserOffsets(ctx, plateOffsets(ctx))) },
}
