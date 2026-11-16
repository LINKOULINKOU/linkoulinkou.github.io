/** 统一日期口径：站点按 Asia/Shanghai 显示为 YYYY-MM-DD。 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}
