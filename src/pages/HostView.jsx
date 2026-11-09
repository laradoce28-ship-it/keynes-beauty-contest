import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { rpc, isDemo, POLL_MS } from '../api'
import Projector from './Projector'
import AllResponses from './AllResponses'
import { fmt1, fmtNum, winnersOf, buildLeaderboard, histogramSVG, trendSVG } from '../lib/gameCalc'

const PARTICIPANT_URL = window.location.origin + '/'

export default function HostView() {
  const [pinInput, setPinInput] = useState('')
  // El PIN se recuerda en esta pestaña (sessionStorage) para sobrevivir a una recarga del proyector
  const [pin, setPin] = useState(() => {
    if (isDemo) return 'demo'
    try { return sessionStorage.getItem('host_pin') } catch { return null }
  })
  const [pinErr, setPinErr] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [hostData, setHostData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const [projector, setProjector] = useState(() => isDemo && new URLSearchParams(location.search).get('proyector') === '1')
  const [toast, setToast] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const toastTimer = useRef(null)
  const pollRef = useRef(null)

  // Bloquea el scroll de la página mientras el modo proyector está abierto
  useEffect(() => {
    document.body.classList.toggle('proj-open', projector)
    return () => document.body.classList.remove('proj-open')
  }, [projector])

  // Fetch default session on mount (reintenta si falla)
  useEffect(() => {
    let cancelled = false
    let timer
    const load = async () => {
      const { data, error } = await rpc('default_session')
      if (cancelled) return
      if (error || !data) { setOffline(true); timer = setTimeout(load, 4000); return }
      setOffline(false)
      setSessionId(data)
    }
    load()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [])

  const forgetPin = useCallback(() => {
    try { sessionStorage.removeItem('host_pin') } catch { /* sin almacenamiento */ }
    setPin(null)
    setHostData(null)
  }, [])

  const fetchHostState = useCallback(async (currentPin) => {
    if (!sessionId) return { message: 'Conectando con el servidor…' }
    if (!currentPin) return null
    const { data, error } = await rpc('host_state', {
      p_session: sessionId,
      p_pin: currentPin,
    })
    if (error) {
      setOffline(error.status === 0 || error.status >= 500)
      return error
    }
    setOffline(false)
    setHostData(data)
    return null
  }, [sessionId])

  // Poll every 4s (siempre, para ver nuevos participantes)
  useEffect(() => {
    if (!pin || !sessionId) return
    const tick = async () => {
      const err = await fetchHostState(pin)
      if (err?.status === 401) forgetPin() // el PIN guardado ya no es válido
    }
    tick()
    pollRef.current = setInterval(tick, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [pin, sessionId, fetchHostState, forgetPin])

  async function handlePinSubmit() {
    setPinErr('')
    const value = pinInput.trim()
    if (!value) { setPinErr('Escribe el PIN.'); return }
    setLoading(true)
    const err = await fetchHostState(value)
    setLoading(false)
    if (err) { setPinErr(err.status === 401 ? 'PIN incorrecto.' : err.message); return }
    try { sessionStorage.setItem('host_pin', value) } catch { /* sin almacenamiento */ }
    setPin(value)
  }

  // Aviso dentro de la página (reemplaza alert, que bloquea el proyector)
  const showToast = useCallback(msg => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }, [])

  async function openRound() {
    setLoading(true)
    const { error } = await rpc('host_open_round', { p_session: sessionId, p_pin: pin })
    setLoading(false)
    if (error) { showToast(error.message); return }
    await fetchHostState(pin)
  }

  async function resetSession() {
    setConfirmReset(false)
    setLoading(true)
    const { error } = await rpc('host_reset_session', { p_session: sessionId, p_pin: pin })
    setLoading(false)
    if (error) { showToast(error.message); return }
    setHostData(null)
    showToast('Sesión reiniciada: se borraron rondas y participantes.')
    await fetchHostState(pin)
  }

  async function closeRound() {
    const current = hostData?.current
    if (!current) return
    setLoading(true)
    const { error } = await rpc('host_close_round', { p_round: current.id, p_pin: pin })
    setLoading(false)
    if (error) { showToast(error.message); return }
    await fetchHostState(pin)
  }

  // PIN gate
  if (!pin) {
    return (
      <div className="wrap part">
        <div className="eyebrow">Concurso de belleza de Keynes · docente</div>
        <h1>Panel docente</h1>
        <p className="lede">Introduce el PIN docente para acceder al panel y controlar las rondas.</p>
        <div className="card">
          <label className="field-label" htmlFor="pin">PIN docente</label>
          <input
            type="text"
            id="pin"
            placeholder="Tu PIN"
            autoComplete="off"
            inputMode="numeric"
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
          />
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handlePinSubmit} disabled={loading}>
            {loading ? <><span className="spinner" />Verificando…</> : 'Acceder'}
          </button>
          {pinErr && <div className="error">{pinErr}</div>}
        </div>
      </div>
    )
  }

  const current = hostData?.current ?? null
  const results = hostData?.results ?? []
  const totalParticipants = hostData?.participants ?? 0
  const participantNames = hostData?.participant_names ?? []
  const isOpen = current?.status === 'open'
  const submittedSet = new Set(isOpen ? current?.submitted_names ?? [] : [])
  const pendingCount = isOpen ? participantNames.filter(n => !submittedSet.has(n)).length : 0
  // Ronda que se muestra (la última, abierta o cerrada) y la que se abrirá con el botón
  const currentRoundNum = current?.number ?? 1
  const nextRoundNum = (current?.number ?? 0) + 1

  return (
    <div className="wrap host">
      {projector && (
        <Projector
          hostData={hostData}
          participantUrl={PARTICIPANT_URL}
          nextRoundNum={nextRoundNum}
          loading={loading}
          onOpenRound={openRound}
          onCloseRound={closeRound}
          onExit={() => setProjector(false)}
        />
      )}
      <div className="host-head">
        <div>
          <div className="eyebrow">Concurso de belleza de Keynes · objetivo = <span style={{ fontFamily: 'var(--font-body)' }}>⅔</span> del promedio</div>
          <h1>Panel docente</h1>
        </div>
        <button className="btn btn-dark" onClick={() => setProjector(true)}>
          Modo proyector
        </button>
      </div>
      {offline && <div className="error" style={{ marginBottom: 14 }}>Sin conexión con el servidor. Reintentando…</div>}

      {/* QR + participantes */}
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 28, alignItems: 'start' }}>
        <div style={{ flexShrink: 0, background: '#fff', padding: 12, border: '1px solid var(--line)', borderRadius: 14 }}>
          <QRCodeSVG value={PARTICIPANT_URL} size={150} />
          <div style={{ fontFamily: 'var(--font-label)', fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 8, letterSpacing: '.04em' }}>
            Escanea para entrar
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-label)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
            Enlace para participantes
          </div>
          <div style={{ fontFamily: 'var(--font-label)', fontSize: 15, fontWeight: 700, wordBreak: 'break-all', marginBottom: 16 }}>
            {PARTICIPANT_URL}
          </div>
          <div style={{ fontFamily: 'var(--font-label)', fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
            {participantNames.length} participante{participantNames.length !== 1 ? 's' : ''} registrado{participantNames.length !== 1 ? 's' : ''}
            {isOpen && participantNames.length > 0 && (
              <span style={{ color: pendingCount ? 'var(--accent)' : 'var(--green)', marginLeft: 10 }}>
                · {pendingCount ? `faltan ${pendingCount}` : 'respondieron todos'}
              </span>
            )}
          </div>
          {participantNames.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, maxHeight: 150, overflowY: 'auto' }}>
              {[...participantNames]
                .sort((a, b) => (isOpen ? Number(submittedSet.has(a)) - Number(submittedSet.has(b)) : 0))
                .map(name => (
                  <span key={name} className={`chip${isOpen ? (submittedSet.has(name) ? ' done' : ' pending') : ''}`}>{name}</span>
                ))}
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Aún no hay participantes. Comparte el QR.</div>
          )}
        </div>
      </div>

      {/* Control de ronda */}
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 24 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(22px, 3vw, 32px)', lineHeight: 1.1, marginBottom: 12 }}>
              Ronda {currentRoundNum}
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>
                {isOpen ? ' · abierta' : current ? ' · cerrada' : ' · sin abrir'}
              </span>
            </div>
            <span className={`pill ${isOpen ? 'open' : 'closed'}`} style={{ fontSize: 14, padding: '7px 16px' }}>
              <span className="dot" />{isOpen ? 'Abierta' : 'Cerrada'}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 'clamp(42px, 6vw, 64px)', lineHeight: 1, color: isOpen ? 'var(--green)' : 'var(--ink)' }}>
              {current?.count ?? 0}<span style={{ color: 'var(--line)' }}> /</span> {totalParticipants}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 6 }}>
              predicciones recibidas
            </div>
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: 20 }}>
          {!isOpen && (
            <button className="btn btn-primary" onClick={openRound} disabled={loading} style={{ fontSize: 17, padding: '16px 24px' }}>
              {loading ? <><span className="spinner" />Abriendo…</> : `Abrir ronda ${nextRoundNum}`}
            </button>
          )}
          {isOpen && (
            <button className="btn btn-dark" onClick={closeRound} disabled={loading || !current?.count} style={{ fontSize: 17, padding: '16px 24px' }}>
              {loading ? <><span className="spinner" />Cerrando…</> : current?.count ? 'Cerrar ronda y revelar' : 'Esperando la primera predicción…'}
            </button>
          )}
        </div>
      </div>

      {results.length > 0 && <Dashboard results={results} onNextRound={openRound} nextRoundNum={nextRoundNum} loading={loading} isOpen={isOpen} />}

      {/* Reiniciar */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
        {!confirmReset ? (
          <button
            className="btn btn-ghost"
            style={{ color: 'var(--accent)', borderColor: 'var(--accent)', width: 'auto' }}
            onClick={() => setConfirmReset(true)}
            disabled={loading}
          >
            Reiniciar sesión desde cero
          </button>
        ) : (
          <div className="confirm-box" role="alertdialog" aria-label="Confirmar reinicio">
            <b>¿Borrar todas las rondas y participantes?</b>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>No se puede deshacer. Los estudiantes tendrán que registrarse de nuevo.</span>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={resetSession} disabled={loading}>Sí, borrar todo</button>
              <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Cancelar</button>
            </div>
          </div>
        )}
        <p className="note" style={{ marginTop: 8, textAlign: 'left' }}>Borra todas las rondas y participantes. Útil para pruebas.</p>
      </div>

      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Cerrar aviso">×</button>
        </div>
      )}
    </div>
  )
}

function Dashboard({ results, onNextRound, nextRoundNum, loading, isOpen }) {
  const lastClosed = results[results.length - 1]
  const [listRound, setListRound] = useState(lastClosed.number)
  // Al cerrarse una ronda nueva, la lista salta a esa ronda
  useEffect(() => { setListRound(lastClosed.number) }, [lastClosed.number])
  const listData = results.find(r => r.number === listRound) ?? lastClosed

  const { average, target, guesses, number: roundNumber } = lastClosed
  const winners = winnersOf(guesses, target)
  const winValues = [...new Set(winners.map(w => w.value))].sort((a, b) => a - b).map(fmtNum).join(' / ')
  const leaderboard = buildLeaderboard(results)

  return (
    <>
      <div className="section-title" style={{ margin: '28px 0 12px' }}>
        Resultados · ronda {roundNumber}
        {isOpen && <span style={{ color: 'var(--muted)', fontWeight: 600 }}> (ronda anterior)</span>}
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="k-val">{guesses.length}</div>
          <div className="k-cap">participaron</div>
        </div>
        <div className="kpi">
          <div className="k-val">{fmt1(average)}</div>
          <div className="k-cap">promedio</div>
        </div>
        <div className="kpi accent">
          <div className="k-val">{fmt1(target)}</div>
          <div className="k-cap">objetivo (⅔ del promedio)</div>
        </div>
        <div className="kpi gold">
          <div className="k-val">{winValues || '—'}</div>
          <div className="k-cap">predicción ganadora</div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          Distribución de predicciones <span style={{ color: 'var(--muted)', fontWeight: 600 }}>· ronda {roundNumber}</span>
        </div>
        <div dangerouslySetInnerHTML={{ __html: histogramSVG(guesses, average, target) }} />
        <div className="legend">
          <span><i style={{ background: 'var(--muted)' }} />Promedio</span>
          <span><i style={{ background: 'var(--accent)' }} />Objetivo (⅔ del promedio)</span>
          <span><i style={{ background: 'var(--gold)' }} />Grupo del ganador</span>
        </div>
      </div>

      {results.length > 1 && (
        <div className="ar-tools" style={{ marginBottom: 8 }}>
          <label htmlFor="ar-round" style={{ fontSize: 13, color: 'var(--muted)' }}>Ver predicciones de la</label>
          <select id="ar-round" value={listRound} onChange={e => setListRound(Number(e.target.value))}>
            {results.map(r => <option key={r.number} value={r.number}>ronda {r.number}</option>)}
          </select>
        </div>
      )}
      <AllResponses round={listData} />

      <div className="grid2">
        <div className="card">
          <div className="section-title">Tendencia entre rondas</div>
          <div dangerouslySetInnerHTML={{ __html: trendSVG(results) }} />
          <div className="legend">
            <span><i style={{ background: 'var(--muted)' }} />Promedio</span>
            <span><i style={{ background: 'var(--accent)' }} />Objetivo</span>
            <span><i style={{ background: 'var(--line)', height: 8, width: 8, borderRadius: 4 }} />Cada predicción</span>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Tabla acumulada</div>
          <table className="grid">
            <thead>
              <tr><th>Nombre</th><th className="r">Victorias</th><th className="r">Dif. media</th></tr>
            </thead>
            <tbody>
              {leaderboard.slice(0, 12).map(t => (
                <tr key={t.name}>
                  <td>{t.name}</td>
                  <td className="r val">{t.wins}</td>
                  <td className="r dim">{fmt1(t.mean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Resumen de rondas</div>
        <table className="grid">
          <thead>
            <tr>
              <th>Ronda</th><th className="r">n</th>
              <th className="r">Promedio</th><th className="r">Objetivo</th>
              <th>Ganador(es)</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.number}>
                <td>{r.number}</td>
                <td className="r val">{r.n}</td>
                <td className="r val">{fmt1(r.average)}</td>
                <td className="r target">{fmt1(r.target)}</td>
                <td>{winnersOf(r.guesses, r.target).map(w => w.name).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isOpen && (
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onNextRound} disabled={loading}>
            {loading ? <><span className="spinner" />Abriendo…</> : `Abrir ronda ${nextRoundNum}`}
          </button>
        </div>
      )}
    </>
  )
}
