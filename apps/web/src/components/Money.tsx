import { splitCopper } from '../lib/money'

/** A price in gold/silver/copper with coin colours, like the in-game UI. */
export function Money({ copper }: { copper: string }) {
  const { gold, silver, copper: c } = splitCopper(copper)
  const pad = (n: bigint) => n.toString().padStart(2, '0')
  return (
    <span className="money" title={`${BigInt(copper).toLocaleString('en-US')} copper`}>
      {gold > 0n && <span className="coin gold">{gold.toLocaleString('en-US')}g</span>}
      {(gold > 0n || silver > 0n) && (
        <span className="coin silver">{gold > 0n ? pad(silver) : silver.toString()}s</span>
      )}
      <span className="coin copper">{gold > 0n || silver > 0n ? pad(c) : c.toString()}c</span>
    </span>
  )
}
