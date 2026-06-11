import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase'

function getOrCreateToken() {
  let token = localStorage.getItem('device_token')
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem('device_token', token)
  }
  return token
}

export default function ParticipantView() {
  const [sessionId, setSessionId] = useState(null)
  const [token] = useState(getOrCreateToken)
  const [participant, setParticipant] = useState(null)
  const [round, setRound] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [myValue, setMyValue] = useState(null)

  const [nameInput, setNameInput] = useState('')
  const [guessInput, setGuessInput] = useState('')
  const [regErr, setRegErr] = useState('')
  const [guessErr, setGuessErr] = useState('')
  const [loading, setLoading] = useState(false)

  const pollRef = useRef(null)

  // 1. Fetch default session on mount
  useEffect(() => {
    supabase.rpc('default_session').then(({ data, error }) => {
      if (error || !data) return
      setSessionId(data)
    })
  }, [])

  // 2. Poll participant_state every 4s once we have a session
  const poll = useCallback(async () => {
    if (!sessionId) return
    const { data, error } = await supabase.rpc('participant_state', {
      p_session: sessionId,
      p_token: token,
    })
    if (error || !data) return
    setParticipant(data.participant)
    setRound(data.round)
    setSubmitted(data.submitted)
  }, [sessionId, token])

  useEffect(() => {
    if (!sessionId) return
    poll()
    pollRef.current = setInterval(poll, 4000)
    return () => clearInterval(pollRef.current)
  }, [poll, sessionId])

  async function handleRegister() {
    setRegErr('')
    const name = nameInput.trim()
    if (!name) { setRegErr('Escribe tu nombre.'); return }
    setLoading(true)
    const { data, error } = await supabase.rpc('register_participant', {
      p_session: sessionId,
      p_name: name,
      p_token: token,
    })
    setLoading(false)
    if (error) { setRegErr(error.message); return }
    await poll()
  }

  async function handleGuess() {
    setGuessErr('')
    const raw = guessInput.trim().replace(',', '.')
    if (!/^\d+(\.\d+)?$/.test(raw)) { setGuessErr('Escribe un número entre 0 y 100 (se aceptan decimales, ej. 33,5).'); return }
    const v = parseFloat(raw)
    if (isNaN(v) || v < 0 || v > 100) { setGuessErr('Debe estar entre 0 y 100.'); return }
    setLoading(true)
    const { error } = await supabase.rpc('submit_guess', {
      p_session: sessionId,
      p_token: token,
      p_value: v,
    })
    setLoading(false)
    if (error) { setGuessErr(error.message); return }
    setMyValue(v)
    await poll()
  }

  if (!sessionId) {
    return (
      <div className="wrap part">
        <div className="eyebrow">Concurso de belleza de Keynes</div>
        <h1>Cargando…</h1>
      </div>
    )
  }

  const screen = (() => {
    if (!participant) return 'register'
    if (!round || round.status === 'closed') return 'wait'
    if (submitted) return 'sent'
    return 'guess'
  })()

  return (
    <div className="wrap part">
      <div className="eyebrow">Concurso de belleza de Keynes</div>
      <h1>Tu apuesta</h1>
      <p className="lede">
        Escribe un número del 0 al 100 (puedes usar decimales) que crees que será{' '}
        <strong>dos tercios del promedio</strong> de todo el grupo. Gana quien más se acerque.
      </p>

      {screen === 'register' && (
        <div className="card">
          <label className="field-label" htmlFor="pname">Tu nombre</label>
          <input
            type="text"
            id="pname"
            placeholder="Ej. Camila"
            maxLength={40}
            autoComplete="off"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRegister()}
          />
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={handleRegister}
            disabled={loading}
          >
            {loading ? <><span className="spinner" />Entrando…</> : 'Entrar al juego'}
          </button>
          {regErr && <div className="error">{regErr}</div>}
        </div>
      )}

      {screen === 'wait' && (
        <div className="card">
          <div className="status">{participant?.name}</div>
          <div style={{ margin: '16px 0', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 22 }}>
            {round
              ? 'Ronda cerrada. Espera la siguiente…'
              : 'Esperando a que el anfitrión abra la ronda…'}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Cuando se abra una ronda podrás enviar tu número aquí mismo.
          </p>
        </div>
      )}

      {screen === 'guess' && (
        <div className="card">
          <div className="status">Ronda {round.number} abierta</div>
          <label className="field-label" htmlFor="pnum" style={{ marginTop: 14 }}>
            Tu número (0–100, decimales con coma o punto)
          </label>
          <input
            type="text"
            className="num"
            id="pnum"
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            value={guessInput}
            onChange={e => setGuessInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGuess()}
          />
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={handleGuess}
            disabled={loading}
          >
            {loading ? <><span className="spinner" />Enviando…</> : 'Enviar'}
          </button>
          {guessErr && <div className="error">{guessErr}</div>}
          <p className="note" style={{ textAlign: 'left', marginTop: 12 }}>
            Una vez enviado, tu número queda fijo hasta el cierre de la ronda.
          </p>
        </div>
      )}

      {screen === 'sent' && (
        <div className="card">
          <span className="pill open"><span className="dot" />Enviado</span>
          <div style={{ margin: '16px 0', fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 40 }}>
            {myValue ?? '—'}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Tu número quedó registrado y fijo. Espera a que el anfitrión cierre la ronda. No verás el resultado desde aquí.
          </p>
        </div>
      )}
    </div>
  )
}
