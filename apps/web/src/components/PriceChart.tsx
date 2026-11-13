import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import type { Candle, CandleInterval } from '../lib/api'
import { copperToGold, formatGold, formatQuantity } from '../lib/money'

const COLORS = {
  text: '#9aa4b2',
  grid: '#1f2630',
  up: '#3fb950',
  down: '#f85149',
  line: '#e3b341',
  volume: 'rgba(227, 179, 65, 0.35)',
}

/**
 * Market price (in gold) with average listed quantity underneath as a volume-like
 * histogram. Daily data is drawn as candles; hourly data as a line, because
 * Blizzard publishes about one snapshot per hour, so an hourly "candle" would be
 * a single price (open = high = low = close).
 * Uses TradingView Lightweight Charts; its attribution logo stays on, as its licence asks.
 */
export function PriceChart({ candles, interval }: { candles: Candle[]; interval: CandleInterval }) {
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const priceSeries = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lineSeries = useRef<ISeriesApi<'Line'> | null>(null)
  const quantitySeries = useRef<ISeriesApi<'Histogram'> | null>(null)

  // Create the chart once; React only feeds it data afterwards.
  useEffect(() => {
    if (!container.current) return
    const c = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: COLORS.text,
        fontFamily: 'inherit',
      },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: COLORS.grid },
      rightPriceScale: { borderColor: COLORS.grid },
      // No chart-wide localization.priceFormatter: it would override each series'
      // own format and label the quantity pane in gold.
    })
    priceSeries.current = c.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      borderVisible: false,
      priceFormat: { type: 'custom', formatter: formatGold, minMove: 0.0001 },
    })
    lineSeries.current = c.addSeries(LineSeries, {
      color: COLORS.line,
      lineWidth: 2,
      priceFormat: { type: 'custom', formatter: formatGold, minMove: 0.0001 },
    })
    // Second pane (index 1) below the candles.
    quantitySeries.current = c.addSeries(
      HistogramSeries,
      {
        color: COLORS.volume,
        priceFormat: { type: 'custom', formatter: (q: number) => formatQuantity(Math.round(q)), minMove: 1 },
      },
      1,
    )
    c.panes()[1]?.setHeight(90)
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    const time = (iso: string) => (Date.parse(iso) / 1000) as UTCTimestamp
    const asCandles = interval === 'day'
    priceSeries.current?.setData(
      asCandles
        ? candles.map((c) => ({
            time: time(c.time),
            open: copperToGold(c.open),
            high: copperToGold(c.high),
            low: copperToGold(c.low),
            close: copperToGold(c.close),
          }))
        : [],
    )
    lineSeries.current?.setData(
      asCandles ? [] : candles.map((c) => ({ time: time(c.time), value: copperToGold(c.close) })),
    )
    quantitySeries.current?.setData(candles.map((c) => ({ time: time(c.time), value: c.avgQuantity })))
    chart.current?.timeScale().fitContent()
  }, [candles, interval])

  return <div className="chart" ref={container} />
}
