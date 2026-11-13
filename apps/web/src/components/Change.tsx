import { formatChange } from '../lib/money'

/** A percent change, green when up, red when down. */
export function Change({ percent }: { percent: number | null }) {
  const tone = percent === null || percent === 0 ? 'flat' : percent > 0 ? 'up' : 'down'
  return <span className={`change ${tone}`}>{formatChange(percent)}</span>
}
