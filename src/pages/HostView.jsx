import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../supabase'
import { fmt1, winnersOf, buildLeaderboard, histogramSVG, trendSVG } from '../lib/gameCalc'

const PARTICIPANT_URL = window.location.origin + '/'

export default function HostView() {
  const [pinInput, setPinInput] = useState('')
  const [pin, setPin] = useState(null)
  const [pinErr, setPinErr] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [hostData, setHostData] = useState(null)
  const [showNash, setShowNash] = useState(false)
  const [loading, setLoading] = useState(false)
  const pollRef = useRef(null)

  // Fetch default session on mount
  useEffect(() => {
    supabase.rpc('default_session').then(({ data }) => {
      if (data) setSessionId(data)
    })
  }, [])

  const fetchHostState = useCallback(async (currentPin) => {
    if (!sessionId || !currentPin) return null
    const { data, error } = await supabase.rpc('host_state', {
      p_session: sessionId,
      p_pin: currentPin,
    })
    if (error) return error
    setHostData(data)
    return null
  }, [sessionId])

  // Poll every 4s while a round is open
  useEffect(() => {
    if (!pin || !sessionId) return
    pollRef.current = setInterval(() => fetchHostState(pin), 4000)
    return () => clearInterval(pollRef.current)
  }, [pin, sessionId, fetchHostState])

  async function handlePinSubmit() {
    setPinErr('')
    if (!pinInput.trim()) { setPinErr('Escribe el PIN.'); return }
    setLoading(true)
    const err = await fetchHostState(pinInput.trim())
    setLoading(false)
    if (err) { setPinErr('PIN incorrecto o error de conexión.'); return }
    setPin(pinInput.trim())
  }

  async function openRound() {
    setLoading(true)
    const { error } = await supabase.rpc('host_open_round', {
      p_session: sessionId,
      p_pin: pin,
    })
    setLoading(false)
    if (error) { alert(error.message); return }
    await fetchHostState(pin)
  }

  async function resetSession() {
    if (!window.confirm('¿Borrar todas las rondas y participantes? Esta acción no se puede deshacer.')) return
    setLoading(true)
    const { error } = await supabase.rpc('host_reset_session', {
      p_session: sessionId,
      p_pin: pin,
    })
    setLoading(false)
    if (error) { alert(error.message); return }
    setHostData(null)
    setShowNash(false)
    await fetchHostState(pin)
  }

  async function closeRound() {
    const current = hostData?.current
    if (!current) return
    setLoading(true)
    const { error } = await supabase.rpc('host_close_round', {
      p_round: current.id,
      p_pin: pin,
    })
    setLoading(false)
    if (error) { alert(error.message); return }
    await fetchHostState(pin)
  }

  // PIN gate
  if (!pin) {
    return (
      <div className="wrap part">
        <div className="eyebrow">Concurso de belleza de Keynes · anfitrión</div>
        <h1>Panel del anfitrión</h1>
        <p className="lede">Introduce el PIN de anfitrión para acceder al panel y controlar las rondas.</p>
        <div className="card">
          <label className="field-label" htmlFor="pin">PIN de anfitrión</label>
          <input
            type="text"
            id="pin"
            placeholder="Tu PIN"
            autoComplete="off"
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
          />
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={handlePinSubmit}
            disabled={loading}
          >
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
  const hasClosed = results.length > 0
  const nextRoundNum = (current?.number ?? results.length) + (isOpen ? 1 : (current ? 0 : 0))
  const currentRoundNum = current?.number ?? (results.length + 1)

  // Dashboard data: use last closed round
  const lastClosed = results[results.length - 1] ?? null

  return (
    <div className="wrap host">
      <div className="eyebrow">Concurso de belleza de Keynes · objetivo = ⅔ del promedio</div>
      <h1>Panel del anfitrión</h1>

      {/* QR + participants card */}
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'start' }}>
        {/* QR */}
        <div style={{ flexShrink: 0, background: '#fff', padding: 12, border: '1px solid var(--line)', borderRadius: 14 }}>
          <QRCodeSVG value={PARTICIPANT_URL} size={150} />
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 8, letterSpacing: '.04em' }}>
            Escanea para entrar
          </div>
        </div>
        {/* Info */}
        <div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
            Enlace para participantes
          </div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, wordBreak: 'break-all', marginBottom: 16 }}>
            {PARTICIPANT_URL}
          </div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
            {participantNames.length} participante{participantNames.length !== 1 ? 's' : ''} registrado{participantNames.length !== 1 ? 's' : ''}
          </div>
          {participantNames.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, maxHeight: 120, overflowY: 'auto' }}>
              {participantNames.map((name, i) => (
                <span key={i} style={{ fontSize: 13, fontWeight: 500, padding: '5px 12px', borderRadius: 999, background: '#F1EDE6', border: '1px solid var(--line)' }}>
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Aún no hay participantes. Comparte el QR.</div>
          )}
        </div>
      </div>

      {/* Round control card */}
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 24 }}>
          <div>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 'clamp(22px, 3vw, 32px)', lineHeight: 1.1, marginBottom: 12 }}>
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
            <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 'clamp(42px, 6vw, 64px)', lineHeight: 1, color: isOpen ? 'var(--green)' : 'var(--ink)' }}>
              {current?.count ?? 0}<span style={{ color: 'var(--line)' }}> /</span> {totalParticipants}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 6 }}>
              respuestas recibidas
            </div>
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: 20 }}>
          {!isOpen && (
            <button className="btn btn-primary" onClick={openRound} disabled={loading} style={{ fontSize: 17, padding: '16px 24px' }}>
              {loading ? <><span className="spinner" />Abriendo…</> : `Abrir ronda ${currentRoundNum}`}
            </button>
          )}
          {isOpen && (
            <button className="btn btn-dark" onClick={closeRound} disabled={loading} style={{ fontSize: 17, padding: '16px 24px' }}>
              {loading ? <><span className="spinner" />Cerrando…</> : 'Cerrar ronda y revelar'}
            </button>
          )}
        </div>
      </div>

      {/* Dashboard — only shown when there's at least one closed round */}
      {hasClosed && lastClosed && <Dashboard results={results} lastClosed={lastClosed} showNash={showNash} setShowNash={setShowNash} onNextRound={openRound} loading={loading} isOpen={isOpen} />}

      {/* Reset */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
        <button
          className="btn btn-ghost"
          style={{ color: 'var(--accent)', borderColor: 'var(--accent)', width: 'auto' }}
          onClick={resetSession}
          disabled={loading}
        >
          Reiniciar sesión desde cero
        </button>
        <p className="note" style={{ marginTop: 8 }}>Borra todas las rondas y participantes. Útil para pruebas.</p>
      </div>
    </div>
  )
}

function Dashboard({ results, lastClosed, showNash, setShowNash, onNextRound, loading, isOpen }) {
  const { average, target, guesses, number: roundNumber } = lastClosed
  const winners = winnersOf(guesses, target)
  const winValues = [...new Set(winners.map(w => w.value))].sort((a, b) => a - b).join(' / ')
  const leaderboard = buildLeaderboard(results)

  const topGuesses = guesses
    .map(g => ({ ...g, diff: Math.abs(g.value - target) }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 12)

  return (
    <>
      {/* KPIs */}
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
          <div className="k-cap">número ganador</div>
        </div>
      </div>

      {/* Histogram */}
      <div className="card">
        <div className="dash-head">
          <div className="section-title" style={{ marginBottom: 0 }}>
            Distribución de la ronda <span>· ronda {roundNumber}</span>
          </div>
          <button
            className={`btn-sm ${showNash ? 'on' : ''}`}
            onClick={() => setShowNash(s => !s)}
          >
            {showNash ? 'Ocultar equilibrio de Nash' : 'Mostrar equilibrio de Nash'}
          </button>
        </div>
        <div
          style={{ marginTop: 16 }}
          dangerouslySetInnerHTML={{ __html: histogramSVG(guesses, average, target, showNash) }}
        />
        <div className="legend">
          <span><i style={{ background: 'var(--muted)' }} />Promedio</span>
          <span><i style={{ background: 'var(--accent)' }} />Objetivo (⅔ del promedio)</span>
          {showNash && <span><i style={{ background: 'var(--green)' }} />Equilibrio de Nash (0)</span>}
        </div>
      </div>

      {/* Top closest + Trend */}
      <div className="grid2">
        <div className="card">
          <div className="section-title">Más cerca del objetivo</div>
          <table className="grid">
            <thead><tr><th>Nombre</th><th className="r">Nº</th><th className="r">Dif.</th></tr></thead>
            <tbody>
              {topGuesses.map((g, i) => {
                const isWin = winners.some(w => w.name === g.name && w.value === g.value)
                return (
                  <tr key={i} className={isWin ? 'win' : ''}>
                    <td>{g.name}</td>
                    <td className="r val">{g.value}</td>
                    <td className="r dim">{fmt1(g.diff)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="section-title">Tendencia entre rondas</div>
          <div dangerouslySetInnerHTML={{ __html: trendSVG(results, showNash) }} />
          <div className="legend">
            <span><i style={{ background: 'var(--muted)' }} />Promedio</span>
            <span><i style={{ background: 'var(--accent)' }} />Objetivo</span>
            {showNash && <span><i style={{ background: 'var(--green)' }} />Nash (0)</span>}
          </div>
        </div>
      </div>

      {/* Rounds summary */}
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
            {results.map(r => {
              const ws = winnersOf(r.guesses, r.target).map(w => w.name).join(', ')
              return (
                <tr key={r.number}>
                  <td>{r.number}</td>
                  <td className="r val">{r.n}</td>
                  <td className="r val">{fmt1(r.average)}</td>
                  <td className="r target">{fmt1(r.target)}</td>
                  <td>{ws}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Leaderboard */}
      <div className="card">
        <div className="section-title">Tabla acumulada (quién gana más rondas)</div>
        <table className="grid">
          <thead>
            <tr><th>Nombre</th><th className="r">Victorias</th><th className="r">Dif. media</th></tr>
          </thead>
          <tbody>
            {leaderboard.slice(0, 12).map((t, i) => (
              <tr key={i}>
                <td>{t.name}</td>
                <td className="r val">{t.wins}</td>
                <td className="r dim">{fmt1(t.mean)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isOpen && (
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onNextRound} disabled={loading}>
            {loading ? <><span className="spinner" />Abriendo…</> : `Abrir ronda ${results.length + 1}`}
          </button>
        </div>
      )}
    </>
  )
}
