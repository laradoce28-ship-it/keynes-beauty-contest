import { useState, useEffect, useRef } from 'react'
import {
  DEMO_PEOPLE, demoAddStudents, demoVote, demoVoteValues, demoOpen, demoClose, demoReset, demoSummary,
} from '../lib/mockApi'

// Laboratorio de interfaz: muestra el proyector, el panel de control y un celular a la vez,
// todos funcionando contra el backend simulado (datos solo en este navegador).
// Los botones de arriba hacen avanzar el juego para ver cada estado.

function ScaledFrame({ src, w, h, title, maxWidth }) {
  const box = useRef(null)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.clientWidth / w))
    ro.observe(el)
    return () => ro.disconnect()
  }, [w])
  return (
    <div ref={box} className="demo-frame" style={{ height: h * scale, maxWidth }}>
      <iframe
        title={title}
        src={src}
        width={w}
        height={h}
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  )
}

const TIE_VALUES = [10, 14, 30, 9, 11, 12, 0, 13, 11, 8, 13, 10, 9, 12, 7, 15, 6, 10, 9, 20, 11, 13, 8, 14, 10, 100, 9, 5]

export default function DemoView() {
  const [sum, setSum] = useState(demoSummary)
  const [jokers, setJokers] = useState(false)
  const [as, setAs] = useState('demo-CamilaRojas')
  const [msg, setMsg] = useState('')
  const [frameKey, setFrameKey] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setSum(demoSummary()), 600)
    return () => clearInterval(t)
  }, [])

  const say = m => { setMsg(m); setTimeout(() => setMsg(''), 3500) }
  const refresh = () => setSum(demoSummary())

  async function run(fn) {
    const r = await fn()
    if (r?.error) say(r.error.message)
    refresh()
  }

  async function scenario(kind) {
    demoReset()
    if (kind === 'empty') { /* sala vacía */ }
    if (kind === 'arriving') demoAddStudents(12)
    if (['r1open', 'r1closed', 'final', 'tie', 'jokers'].includes(kind)) demoAddStudents(28)
    if (kind === 'full' || kind === 'massTie') demoAddStudents(35)
    if (kind === 'full') { await demoOpen(); demoVote(99); await demoClose() }
    if (kind === 'hundred') { demoAddStudents(100); await demoOpen(); demoVote(100); await demoClose() }
    if (kind === 'massTie') { await demoOpen(); demoVoteValues([...Array(33).fill(0), 1, 2]); await demoClose() }
    if (kind === 'r1open') { await demoOpen(); demoVote(17) }
    if (kind === 'r1closed') { await demoOpen(); demoVote(28); await demoClose() }
    if (kind === 'final') { for (let i = 0; i < 3; i++) { await demoOpen(); demoVote(28); await demoClose() } }
    if (kind === 'tie') {
      await demoOpen(); demoVote(28); await demoClose()
      await demoOpen(); demoVoteValues(TIE_VALUES); await demoClose()
    }
    if (kind === 'jokers') { await demoOpen(); demoVoteValues([100, 100, 99]); demoVote(25); await demoClose() }
    setFrameKey(k => k + 1) // recarga las vistas para empezar desde el primer paso
    refresh()
  }

  const r = sum.round
  const status = !r
    ? 'Ninguna ronda abierta todavía'
    : r.status === 'open'
      ? `Ronda ${r.number} abierta · ${r.count} de ${sum.students} predicciones`
      : `Ronda ${r.number} cerrada · ${r.count} predicciones`

  return (
    <div className="demo">
      <header className="demo-head">
        <div>
          <div className="eyebrow">Laboratorio de interfaz · datos simulados</div>
          <h1 className="demo-title">Concurso de Keynes: demo</h1>
        </div>
        <p className="demo-note">
          Nada de esto toca la base real: los datos viven solo en este navegador. Haz clic dentro del proyector
          y usa <kbd>→</kbd> para avanzar la revelación.
        </p>
      </header>

      <div className="demo-bar" role="toolbar" aria-label="Controles de la demo">
        <div className="demo-group">
          <span className="demo-k">Escenarios</span>
          <button onClick={() => scenario('empty')}>Sala vacía</button>
          <button onClick={() => scenario('arriving')}>Llegando estudiantes</button>
          <button onClick={() => scenario('r1open')}>Ronda 1 en curso</button>
          <button onClick={() => scenario('r1closed')}>Ronda 1 cerrada</button>
          <button onClick={() => scenario('final')}>Final de 3 rondas</button>
          <button onClick={() => scenario('tie')}>Empate múltiple</button>
          <button onClick={() => scenario('jokers')}>Con bromistas</button>
          <button onClick={() => scenario('full')}>Curso de 35</button>
          <button onClick={() => scenario('massTie')}>Empate masivo</button>
          <button onClick={() => scenario('hundred')}>Curso de 100</button>
        </div>
        <div className="demo-group">
          <span className="demo-k">Paso a paso</span>
          <button onClick={() => { const n = demoAddStudents(5); n ? refresh() : say('Ya están todos los estudiantes de ejemplo.') }}>+5 estudiantes</button>
          <button onClick={() => { demoAddStudents(35); refresh() }}>Completar curso</button>
          <button className="pri" onClick={() => run(demoOpen)}>Abrir ronda</button>
          <button onClick={() => { const n = demoVote(1, { jokers }); n ? refresh() : say('No hay ronda abierta o ya respondieron todos.') }}>+1 predicción</button>
          <button onClick={() => { const n = demoVote(5, { jokers }); n ? refresh() : say('No hay ronda abierta o ya respondieron todos.') }}>+5 predicciones</button>
          <button onClick={() => { const n = demoVote(99, { jokers }); n ? refresh() : say('No hay ronda abierta o ya respondieron todos.') }}>Todos responden</button>
          <button className="pri" onClick={() => run(demoClose)}>Cerrar ronda</button>
          <label className="demo-check"><input type="checkbox" checked={jokers} onChange={e => setJokers(e.target.checked)} /> Incluir bromistas (100)</label>
        </div>
        <div className="demo-status" role="status">
          <b>{sum.students}</b> estudiantes · {status} · {sum.closed} ronda{sum.closed !== 1 ? 's' : ''} cerrada{sum.closed !== 1 ? 's' : ''}
          {msg && <span className="demo-msg"> · {msg}</span>}
        </div>
      </div>

      <section className="demo-sec">
        <div className="demo-sec-head">
          <h2>Proyector</h2>
          <span>1920×1080 escalado · controla la revelación con → / ← o los botones de abajo</span>
        </div>
        <ScaledFrame key={'p' + frameKey} title="Proyector" src="/host?demo=1&proyector=1" w={1920} h={1080} />
      </section>

      <div className="demo-row">
        <section className="demo-sec">
          <div className="demo-sec-head">
            <h2>Panel de control</h2>
            <span>laptop 1280 px · se puede desplazar dentro</span>
          </div>
          <ScaledFrame key={'h' + frameKey} title="Panel de control" src="/host?demo=1" w={1280} h={900} />
        </section>

        <section className="demo-sec demo-phone">
          <div className="demo-sec-head">
            <h2>Celular</h2>
            <label>
              <span className="sr-only">Ver como</span>
              <select value={as} onChange={e => setAs(e.target.value)}>
                <option value="demo-yo">Estudiante nuevo (tú)</option>
                {DEMO_PEOPLE.map(([f, l]) => <option key={f + l} value={'demo-' + f + l}>{f} {l}</option>)}
              </select>
            </label>
          </div>
          <div className="demo-phone-shell">
            <ScaledFrame key={as + frameKey} title="Celular" src={`/?demo=1&as=${encodeURIComponent(as)}`} w={390} h={780} />
          </div>
        </section>
      </div>
    </div>
  )
}
