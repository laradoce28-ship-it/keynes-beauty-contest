// Backend simulado para el modo demo (/demo, o cualquier vista con ?demo=1).
// Imita las mismas funciones que el Worker, pero guarda todo en localStorage del
// navegador: nunca toca la base real. Varias pestañas o iframes del mismo navegador
// comparten el mismo estado, así el laboratorio /demo controla proyector, panel y celular.
import { validateFullName } from './nameRules'

const KEY = 'keynes_demo_db_v1'

export const isDemo = (() => {
  try {
    return location.pathname.startsWith('/demo') || new URLSearchParams(location.search).get('demo') === '1'
  } catch {
    return false
  }
})()

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now())
const now = () => new Date().toISOString()

function fresh() {
  return { session: uuid(), participants: [], rounds: [], guesses: [], seq: 0 }
}
export function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* sin almacenamiento */ }
  const db = fresh()
  save(db)
  return db
}
export function save(db) {
  db.seq = (db.seq ?? 0) + 1
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* sin almacenamiento */ }
}

class MockError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

const latestRound = db => [...db.rounds].sort((a, b) => b.number - a.number)[0] ?? null
const guessesOf = (db, roundId) => db.guesses.filter(g => g.round_id === roundId)

const handlers = {
  default_session(db) { return db.session },

  register_participant(db, { p_first, p_last, p_token }) {
    const check = validateFullName(p_first, p_last)
    if (!check.ok) throw new MockError(check.error, 422)
    const name = check.full
    const mine = db.participants.find(p => p.token === p_token)
    const taken = db.participants.find(p => p.token !== p_token && p.name.toLowerCase() === name.toLowerCase())
    if (taken) throw new MockError('Ya hay alguien con ese nombre. Si eres tú y cambiaste de celular o navegador, avísale a quien dirige el juego; si no, agrega tu segundo apellido.', 409)
    if (mine) { mine.name = name; return mine.id }
    const p = { id: uuid(), name, token: p_token, created: now() }
    db.participants.push(p)
    return p.id
  },

  participant_state(db, { p_token }) {
    const p = db.participants.find(x => x.token === p_token) ?? null
    const r = latestRound(db)
    let submitted = false, my_value = null, my_history = []
    if (p && r) {
      const g = db.guesses.find(x => x.round_id === r.id && x.participant_id === p.id)
      if (g) { submitted = true; my_value = g.value }
    }
    if (p) {
      my_history = db.rounds
        .filter(x => x.status === 'closed')
        .sort((a, b) => a.number - b.number)
        .map(x => ({ number: x.number, value: db.guesses.find(g => g.round_id === x.id && g.participant_id === p.id)?.value }))
        .filter(x => x.value !== undefined)
    }
    return {
      participant: p ? { id: p.id, name: p.name } : null,
      round: r ? { id: r.id, number: r.number, status: r.status } : null,
      submitted, my_value, my_history,
    }
  },

  submit_guess(db, { p_token, p_value }) {
    const v = p_value
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) throw new MockError('Escribe un número entero del 0 al 100.')
    const p = db.participants.find(x => x.token === p_token)
    if (!p) throw new MockError('No estás registrado en esta sesión. Recarga la página.', 403)
    const r = latestRound(db)
    if (!r || r.status !== 'open') throw new MockError('No hay una ronda abierta en este momento.', 409)
    if (db.guesses.some(g => g.round_id === r.id && g.participant_id === p.id)) throw new MockError('Ya enviaste tu número en esta ronda.', 409)
    db.guesses.push({ round_id: r.id, participant_id: p.id, value: v, created: now() })
    return null
  },

  host_open_round(db) {
    const last = latestRound(db)
    if (last?.status === 'open') throw new MockError(`La ronda ${last.number} ya está abierta.`, 409)
    const r = { id: uuid(), number: (last?.number ?? 0) + 1, status: 'open', average: null, target: null }
    db.rounds.push(r)
    return r.id
  },

  host_close_round(db, { p_round }) {
    const r = db.rounds.find(x => x.id === p_round)
    if (!r) throw new MockError('La ronda no existe.', 404)
    if (r.status !== 'open') throw new MockError('La ronda ya estaba cerrada.', 409)
    const gs = guessesOf(db, r.id)
    if (!gs.length) throw new MockError('Nadie ha respondido todavía: espera al menos una respuesta antes de cerrar.', 409)
    r.average = gs.reduce((s, g) => s + g.value, 0) / gs.length
    r.target = (r.average * 2) / 3
    r.status = 'closed'
    return null
  },

  host_state(db) {
    const names = db.participants.map(p => p.name)
    const last = latestRound(db)
    const current = last
      ? {
          id: last.id, number: last.number, status: last.status,
          count: guessesOf(db, last.id).length,
          submitted_names: guessesOf(db, last.id).map(g => db.participants.find(p => p.id === g.participant_id)?.name).filter(Boolean),
        }
      : null
    const results = db.rounds
      .filter(r => r.status === 'closed')
      .sort((a, b) => a.number - b.number)
      .map(r => {
        const guesses = guessesOf(db, r.id).map(g => {
          const p = db.participants.find(x => x.id === g.participant_id)
          return { pid: p?.id, name: p?.name ?? '—', value: g.value }
        })
        return { number: r.number, average: r.average, target: r.target, n: guesses.length, guesses }
      })
    return { participants: names.length, participant_names: names, current, results }
  },

  host_reset_session(db) {
    db.participants = []
    db.rounds = []
    db.guesses = []
    return null
  },
}

// Misma forma que rpc() real: { data, error: { message, status } }
export async function mockRpc(fn, params = {}) {
  await new Promise(r => setTimeout(r, 120))
  const h = handlers[fn]
  if (!h) return { data: null, error: { message: 'Función desconocida.', status: 404 } }
  const db = load()
  try {
    const data = h(db, params)
    if (!fn.startsWith('participant_state') && fn !== 'host_state' && fn !== 'default_session') save(db)
    return { data: data ?? null, error: null }
  } catch (e) {
    return { data: null, error: { message: e.message, status: e.status ?? 500 } }
  }
}

// ── Utilidades del laboratorio ─────────────────────────────────────────────

export const DEMO_PEOPLE = [
  ['Camila', 'Rojas'], ['Benjamín', 'Soto'], ['Carolina', 'Muñoz'], ['Tomás', 'Picota'], ['Francisca', 'Díaz'],
  ['Javier', 'Contreras'], ['Sofía', 'Concha'], ['Matías', 'Silva'], ['Valentina', 'Morales'], ['Agustín', 'Reyes'],
  ['Isidora', 'Fuentes'], ['Vicente', 'Castro'], ['Martina', 'Vergara'], ['Joaquín', 'Pizarro'], ['Antonia', 'Núñez'],
  ['Maximiliano', 'Espinoza'], ['Florencia', 'Tapia'], ['Cristóbal', 'Herrera'], ['Emilia', 'Sepúlveda'], ['Lucas', 'Araya'],
  ['Catalina', 'Gómez'], ['Diego', 'Cortés'], ['Josefa', 'Valenzuela'], ['Gaspar', 'Torres'], ['Amanda', 'Fernández'],
  ['Bastián', 'Gil'], ['Renata', 'Huenchullán'], ['Felipe', 'Ramírez'], ['Trinidad', 'Olivares'], ['Ignacio', 'Bravo'],
  ['Magdalena', 'Rivera'], ['Alonso', 'Vidal'], ['Rafaela', 'Cáceres'], ['Martín', 'Saavedra'], ['Julieta', 'Navarro'],
]

const rand = (a, b) => a + Math.random() * (b - a)
// Predicción simulada: en la ronda 1 hay mucha dispersión (niveles de razonamiento 0–3);
// en rondas siguientes el grupo se acerca a valores más bajos.
function simulatedValue(roundNumber, jokers) {
  if (jokers && Math.random() < 0.07) return Math.random() < 0.6 ? 100 : Math.round(rand(80, 99))
  const shrink = Math.pow(0.62, roundNumber - 1)
  const r = Math.random()
  let v
  if (r < 0.06) v = 0
  else if (r < 0.22) v = rand(40, 70) * shrink
  else if (r < 0.55) v = rand(28, 38) * shrink
  else if (r < 0.85) v = rand(18, 26) * shrink
  else v = rand(9, 16) * shrink
  return Math.max(0, Math.min(100, Math.round(v)))
}

// Para casos extremos (p. ej. 100 participantes): combina nombres y apellidos comunes,
// incluidos nombres compuestos y dos apellidos, que son los más largos de mostrar.
const EXTRA_FIRST = ['María José', 'Juan Pablo', 'Benjamín', 'Agustina', 'Sebastián', 'Constanza', 'Nicolás', 'Fernanda', 'Francisco', 'Javiera', 'José Tomás', 'Daniela', 'Cristóbal', 'Catalina', 'Ignacio', 'Antonella', 'Maximiliano', 'Florencia', 'Matías', 'Valentina']
const EXTRA_LAST = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández', 'Torres', 'Araya', 'Flores', 'Espinoza', 'Valenzuela', 'Castillo', 'Tapia', 'Reyes', 'Gutiérrez', 'Castro', 'Pizarro', 'Álvarez', 'Vásquez', 'Sánchez', 'Fernández']
function* demoPeople() {
  yield* DEMO_PEOPLE
  const total = EXTRA_FIRST.length * EXTRA_LAST.length // 600 combinaciones
  for (let i = 0; i < total; i++) {
    const idx = (i * 7) % total // 7 es coprimo con 600: recorre todas sin repetir, en orden variado
    const f = EXTRA_FIRST[idx % EXTRA_FIRST.length]
    const l1 = EXTRA_LAST[Math.floor(idx / EXTRA_FIRST.length)]
    const l2 = EXTRA_LAST[(idx * 11 + 3) % EXTRA_LAST.length]
    yield [f, i % 3 === 0 && l1 !== l2 ? `${l1} ${l2}` : l1]
  }
}

export function demoAddStudents(n) {
  const db = load()
  const have = new Set(db.participants.map(p => p.name))
  let added = 0
  for (const [f, l] of demoPeople()) {
    if (added >= n) break
    const name = `${f} ${l}`
    if (have.has(name)) continue
    have.add(name)
    db.participants.push({ id: uuid(), name, token: 'demo-' + f + l, created: now() })
    added++
  }
  save(db)
  return added
}

export function demoVote(n, { jokers = false } = {}) {
  const db = load()
  const r = latestRound(db)
  if (!r || r.status !== 'open') return 0
  const done = new Set(guessesOf(db, r.id).map(g => g.participant_id))
  const pending = db.participants.filter(p => !done.has(p.id) && p.token.startsWith('demo-'))
  let c = 0
  for (const p of pending.sort(() => Math.random() - 0.5)) {
    if (c >= n) break
    db.guesses.push({ round_id: r.id, participant_id: p.id, value: simulatedValue(r.number, jokers), created: now() })
    c++
  }
  save(db)
  return c
}

// Fuerza valores concretos (para escenarios: empates, bromistas)
export function demoVoteValues(values) {
  const db = load()
  const r = latestRound(db)
  if (!r || r.status !== 'open') return
  const done = new Set(guessesOf(db, r.id).map(g => g.participant_id))
  const pending = db.participants.filter(p => !done.has(p.id))
  values.forEach((v, i) => {
    if (pending[i]) db.guesses.push({ round_id: r.id, participant_id: pending[i].id, value: v, created: now() })
  })
  save(db)
}

export async function demoOpen() { return mockRpc('host_open_round', {}) }
export async function demoClose() {
  const r = latestRound(load())
  return r ? mockRpc('host_close_round', { p_round: r.id }) : { error: { message: 'No hay ronda.' } }
}
export function demoReset() {
  const db = load()
  db.participants = []; db.rounds = []; db.guesses = []
  save(db)
}
export function demoSummary() {
  const db = load()
  const r = latestRound(db)
  return {
    students: db.participants.length,
    closed: db.rounds.filter(x => x.status === 'closed').length,
    round: r ? { number: r.number, status: r.status, count: guessesOf(db, r.id).length } : null,
    seq: db.seq,
  }
}
