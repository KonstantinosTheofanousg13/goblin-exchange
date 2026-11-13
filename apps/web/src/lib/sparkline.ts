/**
 * Turns a price series into an SVG polyline `points` string that fills a
 * width × height box (y is flipped: SVG's origin is the top-left corner).
 * A flat series is drawn through the middle instead of dividing by zero.
 */
export function sparklinePoints(values: number[], width: number, height: number, padding = 2): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const innerHeight = height - padding * 2
  const step = width / (values.length - 1)

  return values
    .map((value, i) => {
      const x = i * step
      const y = range === 0 ? height / 2 : padding + innerHeight - ((value - min) / range) * innerHeight
      return `${round(x)},${round(y)}`
    })
    .join(' ')
}

const round = (n: number) => Math.round(n * 10) / 10
