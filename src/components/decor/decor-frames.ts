/**
 * 像素点缀的帧表与生成样式。唯一数据源在这里：改帧数/帧宽只需改 SPRITES。
 * 由 DecorStyles.astro 在 <head> 里注入一次，避免每个实例各塞一份 <style>。
 */

export type Kind = 'relic'

interface Sprite {
  kind: Kind
  frames: number
  frameW: number
  height: number
  cycle: string
  delay: string
}

export const SPRITES: Sprite[] = [
  { kind: 'relic', frames: 10, frameW: 26, height: 32, cycle: 'calc(var(--ln-motion-frame-relic) * 10)', delay: '0s' }
]

/** 逐帧 keyframes：末帧回到第 0 帧，形成无缝循环。 */
function keyframes({ kind, frames, frameW }: Sprite): string {
  const stops = Array.from({ length: frames + 1 }, (_, i) => {
    const frame = i % frames
    const pct = ((i / frames) * 100).toFixed(4).replace(/\.?0+$/, '')
    return `${pct}%{background-position:${-frame * frameW}px 0}`
  }).join('')
  return `@keyframes ln-${kind}{${stops}}`
}

/** 尺寸、周期、相位与背景图集尺寸。 */
function variant({ kind, frames, frameW, height, cycle, delay }: Sprite): string {
  return `.ln-accent--${kind}{--ln-anim:ln-${kind};--ln-cycle:${cycle};--ln-delay:${delay};width:${frameW}px;height:${height}px;background-size:${frameW * frames}px ${height}px}`
}

export const DECOR_CSS = [...SPRITES.map(keyframes), ...SPRITES.map(variant)].join('\n')
