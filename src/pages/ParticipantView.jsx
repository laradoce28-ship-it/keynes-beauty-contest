import { useState, useEffect, useRef, useCallback } from 'react'
import { rpc, isDemo, POLL_MS } from '../api'
import { validateFullName, checkPart } from '../lib/nameRules'

function getOrCreateToken() {
  // En la demo, la identidad viene de ?as= (el laboratorio elige a quién ver)
  if (isDemo) return new URLSearchParams(location.search).get('as') || 'demo-yo'
  try {
    let token = localStorage.getItem('device_token')
    if (!token) {
      token = crypto.randomUUID()
      localStorage.setItem('device_token', token)
    }
    return token
  } catch {
    return crypto.randomUUID()
  }
}

export default function ParticipantView() {
  const [sessionId, setSessionId] = useState(null)
  const [token] = useState(getOrCreateToken)
  const [participant, setParticipant] = useState(null)
  const [round, setRound] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [myValue, setMyValue] = useState(null)
  const [history, setHistory] = useState([])

  const [firstInput, setFirstInput] = useState('')
  const [lastInput, setLastInput] = useState('')
  const [touched, setTouched] = useState({ first: false, last: false })
  const [guessInput, setGuessInput] = useState('')
  const [regErr, setRegErr] = useState('')
  const [guessErr, setGuessErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)

  const pollRef = useRef(null)

  // Sesión activa (reintenta cada 4 s si falla la conexión)
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

  const poll = useCallback(async () => {
    if (!sessionId) return
    const { data, error } = await rpc('participant_state', { p_session: sessionId, p_token: token })
    if (error || !data) { setOffline(true); return }
    setOffline(false)
    setParticipant(data.participant)
    setRound(data.round)
    setSubmitted(data.submitted)
    setMyValue(data.my_value ?? null)
    setHistory(data.my_history ?? [])
  }, [sessionId, token])

  // Al cambiar de ronda, limpia lo escrito en la ronda anterior
  const roundId = round?.id
  useEffect(() => {
    setGuessInput('')
    setGuessErr('')
  }, [roundId])

  useEffect(() => {
    if (!sessionId) return
    poll()
    pollRef.current = setInterval(poll, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [poll, sessionId])

  // Avisos mientras se escribe (solo después de tocar el campo)
  const firstHint = touched.first ? checkPart(firstInput, 'nombre') : null
  const lastHint = touched.last ? checkPart(lastInput, 'apellido') : null

  async function handleRegister(e) {
    e?.preventDefault()
    setRegErr('')
    setTouched({ first: true, last: true })
    const check = validateFullName(firstInput, lastInput)
    if (!check.ok) { setRegErr(check.error); return }
    setLoading(true)
    const { error } = await rpc('register_participant', {
      p_session: sessionId,
      p_first: firstInput,
      p_last: lastInput,
      p_token: token,
    })
    setLoading(false)
    if (error) { setRegErr(error.message); return }
    await poll()
  }

  async function handleGuess(e) {
    e?.preventDefault()
    setGuessErr('')
    const raw = guessInput.trim()
    if (!/^\d{1,3}$/.test(raw) || Number(raw) > 100) {
      setGuessErr('Escribe un número entero del 0 al 100.')
      return
    }
    const v = Number(raw)
    setLoading(true)
    const { error } = await rpc('submit_guess', { p_session: sessionId, p_token: token, p_value: v })
    setLoading(false)
    if (error) { setGuessErr(error.message); return }
    setMyValue(v)
    await poll()
  }

  const screen = (() => {
    if (!sessionId) return 'loading'
    if (!participant) return 'register'
    if (!round || round.status === 'closed') return 'wait'
    if (submitted) return 'sent'
    return 'guess'
  })()

  const nextRound = round ? (round.status === 'closed' ? round.number + 1 : round.number) : 1

  return (
    <div className="pv">
      <header className="pv-top">
        <span className="pv-brand">Concurso de Keynes</span>
        {participant && <span className="pv-who">{participant.name}</span>}
      </header>

      {offline && <div className="pv-offline" role="status">Conexión inestable. Reintentando…</div>}

      {screen === 'loading' && (
        <main className="pv-main pv-center">
          <span className="spinner" aria-hidden="true" />
          <p className="pv-sub">Conectando…</p>
        </main>
      )}

      {screen === 'register' && (
        <form className="pv-main" onSubmit={handleRegister} noValidate>
          <div className="pv-body">
            <h1 className="pv-title">¿Cómo te llamas?</h1>
            <p className="pv-sub">Escribe tu nombre y apellido reales. Así te verá la profesora en la lista.</p>
            <div className="pv-fields">
              <div className="pv-field">
                <label htmlFor="pfirst">Nombre</label>
                <input
                  type="text" id="pfirst" placeholder="Camila" maxLength={20}
                  autoComplete="given-name" autoCapitalize="words" enterKeyHint="next"
                  value={firstInput}
                  aria-invalid={!!firstHint}
                  onChange={e => setFirstInput(e.target.value)}
                  onBlur={() => setTouched(t => ({ ...t, first: true }))}
                />
                {firstHint && <span className="pv-hint">{firstHint}</span>}
              </div>
              <div className="pv-field">
                <label htmlFor="plast">Apellido</label>
                <input
                  type="text" id="plast" placeholder="Rojas" maxLength={20}
                  autoComplete="family-name" autoCapitalize="words" enterKeyHint="go"
                  value={lastInput}
                  aria-invalid={!!lastHint}
                  onChange={e => setLastInput(e.target.value)}
                  onBlur={() => setTouched(t => ({ ...t, last: true }))}
                />
                {lastHint && <span className="pv-hint">{lastHint}</span>}
              </div>
            </div>
            {regErr && <div className="pv-error" role="alert">{regErr}</div>}
          </div>
          <div className="pv-action">
            <button type="submit" className="btn btn-primary pv-btn" disabled={loading}>
              {loading ? <><span className="spinner" />Entrando…</> : 'Entrar al juego'}
            </button>
          </div>
        </form>
      )}

      {screen === 'wait' && (
        <main className="pv-main">
          <div className="pv-body pv-center">
            <span className="pv-pulse" aria-hidden="true" />
            <h1 className="pv-title">Mira el proyector</h1>
            <p className="pv-sub">
              {round ? `La ronda ${round.number} terminó. ` : ''}La ronda {nextRound} empieza pronto.
            </p>
            <Rules />
          </div>
          <History history={history} />
        </main>
      )}

      {screen === 'guess' && (
        <form className="pv-main" onSubmit={handleGuess} noValidate>
          <div className="pv-body">
            <span className="pill open"><span className="dot" />Ronda {round.number} abierta</span>
            <label className="pv-title" htmlFor="pnum">Tu predicción</label>
            <input
              type="text" className="pv-num" id="pnum"
              inputMode="numeric" pattern="[0-9]*" maxLength={3}
              placeholder="0" autoComplete="off" enterKeyHint="send"
              value={guessInput}
              onChange={e => setGuessInput(e.target.value.replace(/\D/g, '').slice(0, 3))}
            />
            <p className="pv-sub pv-tight">Un número entero del 0 al 100. Gana quien más se acerque a <b>⅔ del promedio</b> del grupo.</p>
            {guessErr && <div className="pv-error" role="alert">{guessErr}</div>}
          </div>
          <div className="pv-action">
            <button type="submit" className="btn btn-primary pv-btn" disabled={loading || guessInput === ''}>
              {loading ? <><span className="spinner" />Enviando…</> : 'Enviar predicción'}
            </button>
            <p className="pv-note">No podrás cambiarla después.</p>
          </div>
        </form>
      )}

      {screen === 'sent' && (
        <main className="pv-main">
          <div className="pv-body pv-center">
            <span className="pill open"><span className="dot" />Predicción registrada</span>
            <div className="pv-big" aria-label={`Tu predicción: ${myValue ?? ''}`}>{myValue ?? '—'}</div>
            <p className="pv-sub">Ronda {round.number}. El resultado aparece en el proyector.</p>
          </div>
          <History history={history} />
        </main>
      )}
    </div>
  )
}

function Rules() {
  return (
    <details className="pv-rules">
      <summary>¿Cómo se juega?</summary>
      <p>Cada persona escribe un número entero del 0 al 100. Se calcula el promedio del grupo y se multiplica por ⅔. Gana quien quede más cerca de ese resultado.</p>
    </details>
  )
}

function History({ history }) {
  if (!history?.length) return null
  return (
    <footer className="pv-history">
      <span className="pv-history-k">Tus predicciones</span>
      <span className="pv-history-v">
        {history.map(h => <span key={h.number}>R{h.number} <b>{h.value}</b></span>)}
      </span>
    </footer>
  )
}
