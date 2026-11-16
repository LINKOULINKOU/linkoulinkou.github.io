/**
 * 像素点缀的帧表与生成样式。唯一数据源在这里：改帧数/帧宽只需改 SPRITES。
 * 由 DecorStyles.astro 在 <head> 里注入一次，避免每个实例各塞一份 <style>。
 */

export type Kind = 'bird' | 'maple' | 'swallow'

interface Sprite {
  kind: Kind
  frames: number
  frameW: number
  height: number
  cycle: string
  delay: string
}

export const SPRITES: Sprite[] = [
  { kind: 'bird', frames: 6, frameW: 24, height: 18, cycle: 'calc(var(--ln-motion-frame-bird) * 6)', delay: '0s' },
  { kind: 'maple', frames: 5, frameW: 21, height: 26, cycle: 'calc(var(--ln-motion-frame-maple) * 5)', delay: '-0.55s' },
  { kind: 'swallow', frames: 6, frameW: 30, height: 21, cycle: 'calc(var(--ln-motion-frame-swallow) * 6)', delay: '-1.15s' }
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

/** 每件的尺寸、周期、相位与背景图集尺寸。 */
function variant({ kind, frames, frameW, height, cycle, delay }: Sprite): string {
  const margin = kind === 'maple' ? 'margin-right' : 'margin-left'
  return `.ln-accent--${kind}{--ln-anim:ln-${kind};--ln-cycle:${cycle};--ln-delay:${delay};width:${frameW}px;height:${height}px;background-size:${frameW * frames}px ${height}px;${margin}:var(--ln-space-2)}`
}

export const DECOR_CSS = [...SPRITES.map(keyframes), ...SPRITES.map(variant)].join('\n')
