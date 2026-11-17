/**
 * 像素点缀的帧表与生成样式。唯一数据源在这里：改帧数/帧宽只需改 SPRITES。
 * 由 DecorStyles.astro 在 <head> 里注入一次，避免每个实例各塞一份 <style>。
 *
 * 分工（不得互相替换，改动只动用户点名的位置）：
 * - 主页三个栏目标题：黄鸟 bird / 眼睛枫叶 maple / 蓝燕子 swallow（逐帧循环）。
 * - 页面标题（追踪/文章/项目/关于/归档/标签/友链/搜索）：青柠神仙鱼 fish。
 */

export type Kind = 'bird' | 'maple' | 'swallow' | 'fish'

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
  { kind: 'swallow', frames: 6, frameW: 30, height: 21, cycle: 'calc(var(--ln-motion-frame-swallow) * 6)', delay: '-1.15s' },
  { kind: 'fish', frames: 10, frameW: 26, height: 26, cycle: 'calc(var(--ln-motion-frame-fish) * 10)', delay: '0s' }
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
  // 与主页三件一致：默认在左侧留 8px，枫叶在右侧留 8px
  const margin = kind === 'maple' ? ';margin-right:var(--ln-space-2)' : ';margin-left:var(--ln-space-2)'
  return `.ln-accent--${kind}{--ln-anim:ln-${kind};--ln-cycle:${cycle};--ln-delay:${delay};width:${frameW}px;height:${height}px;background-size:${frameW * frames}px ${height}px${margin}}`
}

export const DECOR_CSS = [...SPRITES.map(keyframes), ...SPRITES.map(variant)].join('\n')
