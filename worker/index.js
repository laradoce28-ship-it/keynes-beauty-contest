// API del Concurso de belleza de Keynes sobre Cloudflare Workers + D1.
// Reemplaza las funciones RPC de Supabase: el frontend llama POST /api/<función>
// con los mismos parámetros (p_session, p_token, …) y nunca toca la base directamente.

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

const uuid = () => crypto.randomUUID()

function requireStr(v, field, max = 200) {
  if (typeof v !== 'string' || !v.trim()) throw new ApiError(`Falta el campo ${field}.`)
  if (v.length > max) throw new ApiError(`El campo ${field} es demasiado largo.`)
  return v.trim()
}

// Comparación en tiempo constante para el PIN
function safeEqual(a, b) {
  const enc = new TextEncoder()
  const x = enc.encode(String(a))
  const y = enc.encode(String(b))
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

function checkPin(env, pin) {
  if (!env.HOST_PIN) throw new ApiError('El servidor no tiene PIN configurado (HOST_PIN).', 500)
  if (typeof pin !== 'string' || !safeEqual(pin.trim(), env.HOST_PIN)) {
    throw new ApiError('PIN incorrecto.', 401)
  }
}

async function requireSession(db, id) {
  requireStr(id, 'p_session')
  const s = await db.prepare('SELECT id FROM sessions WHERE id = ?').bind(id).first()
  if (!s) throw new ApiError('La sesión no existe. Recarga la página.', 404)
  return s.id
}

const latestRound = (db, session) =>
  db
    .prepare('SELECT id, number, status FROM rounds WHERE session_id = ? ORDER BY number DESC LIMIT 1')
    .bind(session)
    .first()

// ── Funciones ────────────────────────────────────────────────────────────────

const handlers = {
  // uuid de la sesión más reciente (la crea si no hay ninguna)
  async default_session(db) {
    const s = await db.prepare('SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1').first()
    if (s) return s.id
    const id = uuid()
    await db.prepare('INSERT INTO sessions (id) VALUES (?)').bind(id).run()
    return id
  },

  async register_participant(db, { p_session, p_name, p_token }) {
    const session = await requireSession(db, p_session)
    const token = requireStr(p_token, 'p_token', 100)
    const name = requireStr(p_name, 'nombre', 40).replace(/\s+/g, ' ')

    const mine = await db
      .prepare('SELECT id, name FROM participants WHERE session_id = ? AND token = ?')
      .bind(session, token)
      .first()

    const taken = await db
      .prepare('SELECT id FROM participants WHERE session_id = ? AND name = ? COLLATE NOCASE AND token <> ?')
      .bind(session, name, token)
      .first()
    if (taken) throw new ApiError('Ese nombre ya está en uso. Agrega tu apellido o una inicial.', 409)

    if (mine) {
      if (mine.name !== name) {
        await db.prepare('UPDATE participants SET name = ? WHERE id = ?').bind(name, mine.id).run()
      }
      return mine.id
    }
    const id = uuid()
    try {
      await db
        .prepare('INSERT INTO participants (id, session_id, name, token) VALUES (?, ?, ?, ?)')
        .bind(id, session, name, token)
        .run()
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        throw new ApiError('Ese nombre ya está en uso. Agrega tu apellido o una inicial.', 409)
      }
      throw e
    }
    return id
  },

  // { participant, round, submitted, my_value } — nunca expone datos de otros
  async participant_state(db, { p_session, p_token }) {
    const session = await requireSession(db, p_session)
    const token = requireStr(p_token, 'p_token', 100)
    const participant = await db
      .prepare('SELECT id, name FROM participants WHERE session_id = ? AND token = ?')
      .bind(session, token)
      .first()
    const round = await latestRound(db, session)
    let submitted = false
    let my_value = null
    if (participant && round) {
      const g = await db
        .prepare('SELECT value FROM guesses WHERE round_id = ? AND participant_id = ?')
        .bind(round.id, participant.id)
        .first()
      if (g) {
        submitted = true
        my_value = g.value
      }
    }
    return { participant: participant ?? null, round: round ?? null, submitted, my_value }
  },

  async submit_guess(db, { p_session, p_token, p_value }) {
    const session = await requireSession(db, p_session)
    const token = requireStr(p_token, 'p_token', 100)
    const value = Number(p_value)
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new ApiError('El número debe estar entre 0 y 100.')
    }
    const participant = await db
      .prepare('SELECT id FROM participants WHERE session_id = ? AND token = ?')
      .bind(session, token)
      .first()
    if (!participant) throw new ApiError('No estás registrado en esta sesión. Recarga la página.', 403)
    const round = await latestRound(db, session)
    if (!round || round.status !== 'open') throw new ApiError('No hay una ronda abierta en este momento.', 409)
    try {
      await db
        .prepare('INSERT INTO guesses (id, round_id, participant_id, value) VALUES (?, ?, ?, ?)')
        .bind(uuid(), round.id, participant.id, value)
        .run()
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new ApiError('Ya enviaste tu número en esta ronda.', 409)
      throw e
    }
    return null
  },

  async host_open_round(db, { p_session, p_pin }, env) {
    checkPin(env, p_pin)
    const session = await requireSession(db, p_session)
    const last = await latestRound(db, session)
    if (last?.status === 'open') throw new ApiError(`La ronda ${last.number} ya está abierta.`, 409)
    const id = uuid()
    await db
      .prepare("INSERT INTO rounds (id, session_id, number, status) VALUES (?, ?, ?, 'open')")
      .bind(id, session, (last?.number ?? 0) + 1)
      .run()
    return id
  },

  // Calcula promedio y objetivo = promedio × 2/3. No permite cerrar rondas vacías.
  async host_close_round(db, { p_round, p_pin }, env) {
    checkPin(env, p_pin)
    const roundId = requireStr(p_round, 'p_round')
    const round = await db.prepare('SELECT id, status FROM rounds WHERE id = ?').bind(roundId).first()
    if (!round) throw new ApiError('La ronda no existe.', 404)
    if (round.status !== 'open') throw new ApiError('La ronda ya estaba cerrada.', 409)
    const agg = await db
      .prepare('SELECT COUNT(*) AS n, AVG(value) AS avg FROM guesses WHERE round_id = ?')
      .bind(roundId)
      .first()
    if (!agg.n) throw new ApiError('Nadie ha respondido todavía: espera al menos una respuesta antes de cerrar.', 409)
    const average = agg.avg
    const target = (average * 2) / 3
    await db
      .prepare(
        "UPDATE rounds SET status = 'closed', average = ?, target = ?, closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'open'"
      )
      .bind(average, target, roundId)
      .run()
    return null
  },

  async host_state(db, { p_session, p_pin }, env) {
    checkPin(env, p_pin)
    const session = await requireSession(db, p_session)
    const [names, current, closed, allGuesses] = await db.batch([
      db.prepare('SELECT name FROM participants WHERE session_id = ? ORDER BY created_at').bind(session),
      db
        .prepare(
          `SELECT r.id, r.number, r.status, (SELECT COUNT(*) FROM guesses g WHERE g.round_id = r.id) AS count
           FROM rounds r WHERE r.session_id = ? ORDER BY r.number DESC LIMIT 1`
        )
        .bind(session),
      db
        .prepare(
          "SELECT id, number, average, target FROM rounds WHERE session_id = ? AND status = 'closed' ORDER BY number"
        )
        .bind(session),
      db
        .prepare(
          `SELECT g.round_id, p.id AS pid, p.name, g.value
           FROM guesses g
           JOIN rounds r ON r.id = g.round_id
           JOIN participants p ON p.id = g.participant_id
           WHERE r.session_id = ? AND r.status = 'closed'
           ORDER BY g.created_at`
        )
        .bind(session),
    ])
    const byRound = {}
    for (const g of allGuesses.results) {
      ;(byRound[g.round_id] ??= []).push({ pid: g.pid, name: g.name, value: g.value })
    }
    const participant_names = names.results.map(r => r.name)
    return {
      participants: participant_names.length,
      participant_names,
      current: current.results[0] ?? null,
      results: closed.results.map(r => {
        const guesses = byRound[r.id] ?? []
        return { number: r.number, average: r.average, target: r.target, n: guesses.length, guesses }
      }),
    }
  },

  // Borra rondas, respuestas y participantes de la sesión
  async host_reset_session(db, { p_session, p_pin }, env) {
    checkPin(env, p_pin)
    const session = await requireSession(db, p_session)
    await db.batch([
      db.prepare('DELETE FROM guesses WHERE round_id IN (SELECT id FROM rounds WHERE session_id = ?)').bind(session),
      db.prepare('DELETE FROM rounds WHERE session_id = ?').bind(session),
      db.prepare('DELETE FROM participants WHERE session_id = ?').bind(session),
    ])
    return null
  },
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request)
    }
    if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)
    const fn = url.pathname.slice('/api/'.length)
    const handler = Object.hasOwn(handlers, fn) ? handlers[fn] : null
    if (!handler) return json({ error: 'Función desconocida.' }, 404)

    let params = {}
    try {
      const text = await request.text()
      params = text ? JSON.parse(text) : {}
      if (typeof params !== 'object' || params === null || Array.isArray(params)) throw new Error()
    } catch {
      return json({ error: 'Cuerpo JSON inválido.' }, 400)
    }

    try {
      const data = await handler(env.DB, params, env)
      return json({ data })
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status)
      console.error(fn, e)
      return json({ error: 'Error del servidor. Intenta de nuevo.' }, 500)
    }
  },
}
