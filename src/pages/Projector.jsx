import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { fmt1, fmtNum, winnersOf, histogramSVG } from '../lib/gameCalc'
import AllResponses from './AllResponses'

// Modo proyector: pantalla completa pensada para la sala.
// - Ronda abierta (o sin rondas): QR grande + contador de respuestas.
// - Ronda cerrada: revelación por pasos que controla quien dirige el juego
//   (→ / Espacio avanza, ← retrocede, F pantalla completa, Esc sale).

const STEPS = ['intro', 'average', 'target', 'histogram', 'list', 'winner']

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Número que sube desde 0 hasta `value` cuando `active` pasa a true
function useCountUp(value, active, duration = 1400) {
  const [shown, setShown] = useState(active ? value : 0)
  const raf = useRef(0)
  useEffect(() => {
    if (!active) { setShown(0); return }
    if (reducedMotion()) { setShown(value); return }
    const start = performance.now()
    const tick = now => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(value * eased)
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    // Respaldo: si la pestaña no dibuja (oculta/minimizada), igual llega al valor final
    const done = setTimeout(() => setShown(value), duration + 100)
    return () => { cancelAnimationFrame(raf.current); clearTimeout(done) }
  }, [value, active, duration])
  return shown
}

// Siempre con un decimal ("0,0" … "14,3") para que la coma no aparezca y desaparezca
const fmtFixed1 = n => new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)

// Número animado sin saltos: una copia invisible del valor final reserva el ancho,
// y el valor que sube se alinea a la derecha encima, así las cifras no se mueven.
function AnimNum({ shown, final }) {
  return (
    <span className="anum" aria-label={fmtFixed1(final)}>
      <span className="anum-ghost" aria-hidden="true">{fmtFixed1(final)}</span>
      <span className="anum-live" aria-hidden="true">{fmtFixed1(shown)}</span>
    </span>
  )
}

export default function Projector({
  hostData, participantUrl, nextRoundNum, loading,
  onOpenRound, onCloseRound, onExit,
}) {
  const current = hostData?.current ?? null
  const results = hostData?.results ?? []
  const total = hostData?.participants ?? 0
  const isOpen = current?.status === 'open'
  const lastClosed = results[results.length - 1] ?? null
  const revealing = !isOpen && !!lastClosed

  // Paso de la revelación; vuelve a 0 cuando cambia la ronda cerrada
  // Paso de la revelación y página de la lista, en un solo estado para que → / ← sean consistentes
  // aunque se pulsen muy seguido. Con muchos participantes, → recorre las páginas antes de seguir.
  const [nav, setNav] = useState({ step: 0, page: 0 })
  const { step, page: listPage } = nav
  const listPages = listPageCount(lastClosed?.guesses?.length ?? 0)
  const revealKey = lastClosed?.number
  useEffect(() => { setNav({ step: 0, page: 0 }) }, [revealKey])

  const LIST = STEPS.indexOf('list')
  const next = useCallback(() => setNav(({ step, page }) => {
    if (step === LIST && page < listPages - 1) return { step, page: page + 1 }
    return { step: Math.min(STEPS.length - 1, step + 1), page: 0 }
  }), [listPages, LIST])
  const prev = useCallback(() => setNav(({ step, page }) => {
    if (step === LIST && page > 0) return { step, page: page - 1 }
    const ns = Math.max(0, step - 1)
    return { step: ns, page: ns === LIST ? listPages - 1 : 0 }
  }), [listPages, LIST])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }, [])

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    onExit()
  }, [onExit])

  useEffect(() => {
    const onKey = e => {
      if (e.target instanceof HTMLInputElement) return
      if (revealing && (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown')) { e.preventDefault(); next() }
      else if (revealing && (e.key === 'ArrowLeft' || e.key === 'PageUp')) { e.preventDefault(); prev() }
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      else if (e.key === 'Escape' && !document.fullscreenElement) exit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealing, next, prev, toggleFullscreen, exit])

  return (
    <div className="proj" role="dialog" aria-label="Modo proyector">
      <div className="proj-top">
        <span className="eyebrow" style={{ margin: 0 }}>Concurso de Keynes</span>
        <span className="proj-rule">objetivo = ⅔ del promedio</span>
      </div>

      <div className="proj-stage">
        {revealing
          ? <Reveal round={lastClosed} step={step} listPage={listPage} listPages={listPages} />
          : <Collect current={current} total={total} url={participantUrl} nextRoundNum={nextRoundNum} />}
      </div>

      <div className="proj-bar">
        {revealing && (
          <div className="proj-steps" aria-hidden="true">
            {STEPS.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}
          </div>
        )}
        <div className="proj-actions">
          {revealing && (
            <>
              <button className="proj-btn" onClick={prev} disabled={step === 0}>← Atrás</button>
              {step < STEPS.length - 1
                ? <button className="proj-btn primary" onClick={next}>Revelar →</button>
                : <button className="proj-btn primary" onClick={onOpenRound} disabled={loading}>
                    {loading ? 'Abriendo…' : `Abrir ronda ${nextRoundNum}`}
                  </button>}
            </>
          )}
          {!revealing && !isOpen && (
            <button className="proj-btn primary" onClick={onOpenRound} disabled={loading}>
              {loading ? 'Abriendo…' : `Abrir ronda ${nextRoundNum}`}
            </button>
          )}
          {isOpen && (
            <button className="proj-btn dark" onClick={onCloseRound} disabled={loading || !current?.count}>
              {loading ? 'Cerrando…' : 'Cerrar ronda y revelar'}
            </button>
          )}
          <button className="proj-btn" onClick={toggleFullscreen}>Pantalla completa</button>
          <button className="proj-btn" onClick={exit}>Salir</button>
        </div>
      </div>
    </div>
  )
}

function Collect({ current, total, url, nextRoundNum }) {
  const isOpen = current?.status === 'open'
  const count = isOpen ? current.count : 0
  return (
    <div className="proj-collect">
      <div className="proj-qr">
        <QRCodeSVG value={url} size={512} style={{ width: '100%', height: 'auto' }} />
        <div className="proj-url">{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</div>
      </div>
      <div className="proj-collect-info">
        <div className="proj-round">
          {isOpen ? `Ronda ${current.number}` : `Ronda ${nextRoundNum}`}
          <span className={`pill ${isOpen ? 'open' : 'closed'}`}>
            <span className="dot" />{isOpen ? 'Abierta' : 'Por abrir'}
          </span>
        </div>
        <p className="proj-instr">
          Escanea el código y escribe tu predicción: un número entero del <b>0 al 100</b>.
          Gana quien más se acerque a <b className="hl">⅔ del promedio</b> del grupo.
        </p>
        <div className="proj-counter" aria-live="polite">
          <span className={isOpen ? 'live' : ''}>{count}</span>
          <span className="sep">/</span>
          <span>{total}</span>
        </div>
        <div className="proj-cap">{isOpen ? 'predicciones recibidas' : `participante${total !== 1 ? 's' : ''} conectado${total !== 1 ? 's' : ''}`}</div>
      </div>
    </div>
  )
}

// Con muchos empatados, columnas y tamaño de letra según la cantidad, para que quepan siempre
function winnerGrid(n) {
  if (n <= 4) return undefined
  const cols = n <= 9 ? 3 : n <= 16 ? 4 : 5
  return { '--cols': cols, '--rows': Math.ceil(n / cols) }
}

// Hasta 40 participantes la lista cabe en una pantalla; con más, páginas de 30 (2 columnas de 15)
export const LIST_PAGE_SIZE = 30
function listPageCount(n) {
  return n > 40 ? Math.ceil(n / LIST_PAGE_SIZE) : 1
}

function Reveal({ round, step, listPage = 0, listPages = 1 }) {
  const { average, target, guesses, number } = round
  const winners = winnersOf(guesses, target)
  const avgShown = useCountUp(average, step >= 1)
  const tgtShown = useCountUp(target, step >= 2)

  return (
    <div className="proj-reveal">
      {step !== 4 && <div className="proj-round" style={{ justifyContent: 'center' }}>
        Ronda {number} <span className="muted">· {guesses.length} predicci{guesses.length !== 1 ? 'ones' : 'ón'}</span>
      </div>}

      {step === 0 && (
        <div className="proj-big-q rise">¿Qué tan cerca estuvieron?</div>
      )}

      {step >= 1 && step <= 2 && (
        <div className="proj-nums">
          <div className="proj-num rise">
            <div className="v"><AnimNum shown={avgShown} final={average} /></div>
            <div className="c">promedio del grupo</div>
          </div>
          {step >= 2 && (
            <>
              <div className="proj-op rise">× ⅔ =</div>
              <div className="proj-num accent rise">
                <div className="v"><AnimNum shown={tgtShown} final={target} /></div>
                <div className="c">número objetivo</div>
              </div>
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="proj-hist rise">
          <div dangerouslySetInnerHTML={{ __html: histogramSVG(guesses, average, target, { size: 'proj' }) }} />
        </div>
      )}

      {step === 4 && <AllResponses round={round} variant="proj" page={listPage} pages={listPages} pageSize={LIST_PAGE_SIZE} />}

      {step === 5 && (
        <div className="proj-winner rise">
          <div className="crown">{winners.length === 1 ? 'Gana' : winners.length === guesses.length ? `Empate entre todos (${winners.length})` : `Empate entre ${winners.length} de ${guesses.length}`}</div>
          <div className={`names ${winners.length <= 2 ? 'few' : winners.length <= 4 ? 'some' : 'many'}`} style={winnerGrid(winners.length)}>
            {winners.map(w => (
              <div key={w.pid ?? w.name} className="name">{w.name}</div>
            ))}
          </div>
          <div className="detail">
            predijo <b>{[...new Set(winners.map(w => w.value))].sort((a, b) => a - b).map(fmtNum).join(' / ')}</b>
            {' '}· objetivo <b className="hl">{fmt1(target)}</b>
            {' '}· diferencia {fmt1(winners[0].diff)}
          </div>
        </div>
      )}
    </div>
  )
}
