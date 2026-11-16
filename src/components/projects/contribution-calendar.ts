/** 在 SSR 日历链接上增强键盘与提示；不改变链接及无 JS 行为。 */
export function initContributionCalendar(calendar: HTMLElement, tip: HTMLElement) {
  const cells = Array.from(calendar.querySelectorAll<HTMLAnchorElement>('a[data-date]'))
  const wrap = calendar.closest<HTMLElement>('.gh__wrap')
  if (!cells.length || !wrap) return

  document.body.append(tip)
  const inset = parseFloat(getComputedStyle(calendar).getPropertyValue('--ln-space-2'))
  let active = cells.length - 1
  cells.forEach((cell, index) => {
    cell.tabIndex = index === active ? 0 : -1
  })

  const hide = () => {
    tip.style.opacity = '0'
  }
  const show = (cell: HTMLElement) => {
    const count = Number(cell.dataset.count ?? '0')
    tip.textContent = `${count > 0 ? `${count} 次贡献` : '无贡献'} · ${cell.dataset.date}`
    const rect = cell.getBoundingClientRect()
    tip.style.left = `${Math.max(inset, Math.min(rect.left + rect.width / 2 - tip.offsetWidth / 2, innerWidth - tip.offsetWidth - inset))}px`
    tip.style.top = `${Math.max(inset, rect.top - tip.offsetHeight - inset)}px`
    tip.style.opacity = '1'
  }
  const cellFrom = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLAnchorElement>('a[data-date]') : null

  const showTarget = (event: Event) => {
    const cell = cellFrom(event.target)
    if (cell) show(cell)
  }
  calendar.addEventListener('pointerover', showTarget)
  calendar.addEventListener('pointerleave', hide)
  calendar.addEventListener('focusin', (event) => {
    const cell = cellFrom(event.target)
    if (!cell) return
    cells[active].tabIndex = -1
    active = cells.indexOf(cell)
    cell.tabIndex = 0
    show(cell)
  })
  calendar.addEventListener('focusout', hide)
  calendar.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hide()
      return
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const cell = cellFrom(event.target)
    if (!cell) return
    const index = cells.indexOf(cell)
    const targets: Record<string, number> = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 7,
      ArrowRight: index + 7,
      Home: 0,
      End: cells.length - 1
    }
    if (!(event.key in targets)) return
    event.preventDefault()
    const next = cells[Math.max(0, Math.min(cells.length - 1, targets[event.key]))]
    next.focus({ preventScroll: true })
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    show(next)
  })
  wrap.addEventListener('scroll', hide, { passive: true })
  window.addEventListener('scroll', hide, { passive: true })
  window.addEventListener('resize', hide)
  requestAnimationFrame(() => {
    wrap.scrollLeft = wrap.scrollWidth
  })
}
