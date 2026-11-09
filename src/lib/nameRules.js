// Reglas para el nombre del participante. Lo usan el frontend (aviso mientras se escribe)
// y el Worker (validación final), para que haya una sola fuente de verdad.
//
// - Nombre y apellido obligatorios, solo letras (con tildes y ñ), espacios, guion y apóstrofo.
// - Sin dígitos ni símbolos (evita "69", "67" y similares).
// - Filtro de groserías en español general y chilenismos, con normalización para
//   atrapar variantes ("WEOOON", "Cu-liao") sin bloquear apellidos reales ("Picota", "Concha").

const MIN = 2
const MAX = 20
const ALLOWED = /^[\p{L}]+(?:[ '\-][\p{L}]+)*$/u
const VOWEL = /[aeiouáéíóúàèìòùäëïöüy]/i

// Minúsculas, sin tildes, solo letras y letras repetidas reducidas a una ("weooon" → "weon")
function collapse(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1')
}

// Raíces largas e inequívocas: se buscan dentro del texto completo (sin espacios)
const ROOTS = [
  'conchetumare', 'conchetumadre', 'conchesumare', 'conchesumadre', 'conchatumare', 'conchatumadre',
  'conchadetumadre', 'conchadesumadre', 'chuchetumare', 'chuchesumare',
  'weon', 'weona', 'hueon', 'huevon', 'guevon', 'gueon', 'aweonao', 'aweonado', 'ahueonao', 'sacowea',
  'culiao', 'culiado', 'culiada', 'qliao', 'qlio',
  'maricon', 'maraco', 'mariposon',
  'pichula', 'lamepico', 'chupapico', 'chupalo', 'chupala', 'comepico', 'tragapico',
  'hijodeputa', 'hijueputa', 'malparido', 'pajero', 'pajera',
  'mierda', 'cabron', 'pendejo', 'pendeja',
  'violador', 'pedofilo', 'hitler',
  'sesentaynueve', 'sesentainueve', 'sixtynine', 'sixnine', 'sixseven', 'seisnueve', 'seissiete',
  'fuck', 'shit', 'bitch', 'asshole', 'porno',
]

// Palabras cortas o ambiguas: solo bloquean si son una palabra completa
const WORDS = [
  'puta', 'puto', 'putas', 'putos', 'ctm', 'csm', 'ql', 'qlo', 'ksm', 'hdp', 'wn', 'wna', 'wea', 'weas',
  'chucha', 'pico', 'raja', 'culo', 'poto', 'teta', 'tetas', 'pene', 'vagina', 'sexo', 'sexy', 'caca',
  'zorra', 'perra', 'paja', 'coño', 'cono', 'marica', 'maraca', 'chupa', 'cagon', 'cagona', 'pichi',
  'mojon', 'nalga', 'nalgas', 'dick', 'cock', 'sex', 'penis', 'tonto', 'tonta', 'idiota', 'estupido',
  'estupida', 'imbecil', 'verga', 'vergon', 'nazi', 'gil', 'gila', 'aweonao', 'anonimo', 'anonima', 'nadie', 'nose', 'yo', 'test',
].map(collapse)
const WORD_SET = new Set(WORDS)
// "gil"/"gila" solo como apodo suelto: Gil es apellido real, así que solo bloquea si es el nombre de pila.
const FIRST_NAME_ONLY = new Set(['gil', 'gila'].map(collapse))
const ROOTS_C = ROOTS.map(collapse)
// Raíces largas (6+ letras): se buscan en el texto unido, para atrapar "Concha Tu Madre".
// Raíces cortas: solo dentro de cada palabra, para no unir pedazos de nombre y apellido.
const LONG = ROOTS_C.filter(r => r.length >= 6)
const SHORT = ROOTS_C.filter(r => r.length < 6)

function hasProfanity(first, last) {
  const tokens = `${first} ${last}`.split(/[ '\-]+/).filter(Boolean)
  const joined = collapse(tokens.join(''))
  if (LONG.some(r => joined.includes(r))) return true
  return tokens.some((t, i) => {
    const c = collapse(t)
    if (SHORT.some(r => c.includes(r))) return true
    if (FIRST_NAME_ONLY.has(c)) return i === 0
    return WORD_SET.has(c)
  })
}

const tidy = s => String(s ?? '').trim().replace(/\s+/g, ' ')

// "camila  ROJAS" → "Camila Rojas"; respeta guion y apóstrofo ("O'Higgins", "Pérez-Cotapos")
const titleCase = s =>
  s.toLowerCase().replace(/(^|[ '\-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())

// Valida un campo; devuelve un mensaje de error o null
export function checkPart(value, label) {
  const v = tidy(value)
  if (!v) return `Escribe tu ${label}.`
  if (/\d/.test(v)) return `Tu ${label} no puede tener números.`
  if (!ALLOWED.test(v)) return `Tu ${label} solo puede tener letras.`
  const letters = v.replace(/[ '\-]/g, '')
  if (letters.length < MIN) return `Tu ${label} es demasiado corto.`
  if (v.length > MAX) return `Tu ${label} es demasiado largo (máximo ${MAX} letras).`
  if (!VOWEL.test(v)) return `Escribe tu ${label} real.`
  return null
}

// Valida nombre y apellido juntos. { ok, error, field, full }
export function validateFullName(first, last) {
  const e1 = checkPart(first, 'nombre')
  if (e1) return { ok: false, error: e1, field: 'first' }
  const e2 = checkPart(last, 'apellido')
  if (e2) return { ok: false, error: e2, field: 'last' }
  const f = tidy(first)
  const l = tidy(last)
  if (hasProfanity(f, l)) return { ok: false, error: 'Usa tu nombre y apellido reales.', field: 'both' }
  if (collapse(f) === collapse(l)) return { ok: false, error: 'Usa tu nombre y apellido reales.', field: 'last' }
  return { ok: true, error: null, field: null, full: `${titleCase(f)} ${titleCase(l)}` }
}
