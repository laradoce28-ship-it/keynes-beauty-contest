import { useState, useEffect, useMemo } from 'react'
import { fmt1, winnersOf } from '../lib/gameCalc'

// Lista completa de predicciones de una ronda cerrada.
// - Orden por cercanía al objetivo (por defecto) o por valor (los extremos quedan arriba).
// - Opción discreta "simular sin…": el botón ⋯ de cada fila (visible al pasar el cursor)
//   o Alt+clic marca la fila; aparece una nota con el resultado hipotético.
//   Solo es un cálculo local: nunca cambia el resultado oficial.

export default function AllResponses({ round, variant = 'panel' }) {
  const [sort, setSort] = useState('diff')
  const [off, setOff] = useState(() => new Set())
  const roundNumber = round?.number
  useEffect(() => { setOff(new Set()) }, [roundNumber])

  const { rows, winners } = useMemo(() => {
    if (!round) return { rows: [], winners: [] }
    const ws = winnersOf(round.guesses, round.target)
    const winKeys = new Set(ws.map(w => w.pid ?? w.name))
    const withDiff = round.guesses.map(g => ({ ...g, key: g.pid ?? g.name, diff: Math.abs(g.value - round.target) }))
    // Puesto por cercanía (empates comparten puesto)
    const byDiff = [...withDiff].sort((a, b) => a.diff - b.diff)
    let rank = 0, prev = null
    byDiff.forEach((r, i) => {
      if (prev === null || Math.abs(r.diff - prev) > 1e-9) rank = i + 1
      r.rank = rank
      prev = r.diff
    })
    const sorted = sort === 'diff' ? byDiff : [...withDiff].sort((a, b) => b.value - a.value || a.diff - b.diff)
    return { rows: sorted.map(r => ({ ...r, win: winKeys.has(r.key) })), winners: ws }
  }, [round, sort])

  const sim = useMemo(() => {
    if (!off.size || !round) return null
    const kept = round.guesses.filter(g => !off.has(g.pid ?? g.name))
    if (!kept.length) return { empty: true }
    const avg = kept.reduce((s, g) => s + g.value, 0) / kept.length
    const tgt = (avg * 2) / 3
    const ws = winnersOf(kept, tgt)
    return { n: off.size, avg, tgt, names: ws.map(w => w.name) }
  }, [off, round])

  if (!round) return null

  const toggle = key =>
    setOff(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const isProj = variant === 'proj'
  // En el proyector: 1, 2 o 3 columnas según cuántos haya; la letra se ajusta a las filas (ver .proj-list)
  const cols = !isProj ? 1 : rows.length <= 14 ? 1 : rows.length <= 40 ? 2 : 3
  const perCol = Math.ceil(rows.length / cols)
  const head = <div className="ar-colhead ar-cols" aria-hidden="true"><span>#</span><span>Nombre</span><span>{isProj ? 'Predicción' : 'Pred.'}</span><span>{isProj ? 'Distancia' : 'Dif.'}</span>{!isProj && <span />}</div>

  const list = (
    <>
      {isProj ? <div className="ar-heads" style={{ '--cols': cols }}>{Array.from({ length: cols }, (_, i) => <div key={i}>{head}</div>)}</div> : head}
      <ol className="ar-list" style={{ '--cols': cols, '--rows': perCol }}>
        {rows.map(r => (
          <li
            key={r.key}
            className={`ar-row ar-cols${r.win ? ' win' : ''}${off.has(r.key) ? ' off' : ''}`}
            onClick={e => { if (e.altKey && !isProj) toggle(r.key) }}
          >
            <span className="ar-rank">{r.rank}</span>
            <span className="ar-name" title={r.name}>{r.name}</span>
            <span className="ar-val">{r.value}</span>
            <span className="ar-diff">{fmt1(r.diff)}</span>
            {!isProj && (
              <button
                type="button"
                className="ar-more"
                onClick={() => toggle(r.key)}
                aria-pressed={off.has(r.key)}
                title={off.has(r.key) ? 'Volver a incluir en la simulación' : 'Simular sin esta predicción'}
                aria-label={off.has(r.key) ? `Volver a incluir a ${r.name}` : `Simular sin ${r.name}`}
              >⋯</button>
            )}
          </li>
        ))}
      </ol>
    </>
  )

  if (isProj) {
    return (
      <div className="proj-list rise" style={{ '--rows': perCol }}>
        <div className="proj-list-title"><span>Todas las predicciones</span><span>objetivo <b>{fmt1(round.target)}</b></span></div>
        {list}
      </div>
    )
  }

  return (
    <div className="card">
      <div className="ar-head">
        <div className="section-title" style={{ marginBottom: 0 }}>
          Todas las predicciones <span style={{ color: 'var(--muted)', fontWeight: 600 }}>· ronda {round.number} · {rows.length}</span>
        </div>
        <div className="ar-tools">
          <label htmlFor={`ar-sort-${round.number}`} className="sr-only">Ordenar</label>
          <select id={`ar-sort-${round.number}`} value={sort} onChange={e => setSort(e.target.value)}>
            <option value="diff">Más cerca del objetivo</option>
            <option value="value">De mayor a menor</option>
          </select>
        </div>
      </div>
      {sim && (
        <div className="ar-sim" role="status">
          {sim.empty
            ? <span>Marcaste todas las predicciones.</span>
            : <span>
                Sin {sim.n === 1 ? 'la marcada' : `las ${sim.n} marcadas`}: promedio <b>{fmt1(sim.avg)}</b>, objetivo <b>{fmt1(sim.tgt)}</b>,
                ganaría <b>{sim.names.join(', ')}</b>. Es solo una simulación: el resultado oficial no cambia.
              </span>}
          <button type="button" onClick={() => setOff(new Set())}>Limpiar</button>
        </div>
      )}
      {list}
      {winners.length > 0 && !sim && (
        <p className="note" style={{ textAlign: 'left', marginTop: 10 }}>Objetivo de la ronda: {fmt1(round.target)}.</p>
      )}
    </div>
  )
}
