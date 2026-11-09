// Número tal como lo escribió el participante (hasta 2 decimales, coma decimal)
export const fmtNum = n =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(n)

export const fmt1 = n =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(n)


export function winnersOf(guesses, target) {
  if (!guesses.length) return []
  const withDiff = guesses.map(g => ({ ...g, diff: Math.abs(g.value - target) }))
  const best = Math.min(...withDiff.map(d => d.diff))
  return withDiff.filter(d => Math.abs(d.diff - best) < 1e-9)
}

export function buildLeaderboard(results) {
  const tally = {}
  results.forEach(r => {
    const winners = winnersOf(r.guesses, r.target)
    // Identifica a cada persona por su id (pid), no por el nombre
    const keyOf = g => g.pid ?? g.name
    const winIds = new Set(winners.map(keyOf))
    r.guesses.forEach(g => {
      const k = keyOf(g)
      if (!tally[k]) tally[k] = { name: g.name, wins: 0, diffs: [] }
      tally[k].name = g.name // nombre más reciente
      tally[k].diffs.push(Math.abs(g.value - r.target))
      if (winIds.has(k)) tally[k].wins++
    })
  })
  return Object.values(tally)
    .map(t => ({ ...t, mean: t.diffs.reduce((a, b) => a + b, 0) / t.diffs.length }))
    .sort((a, b) => b.wins - a.wins || a.mean - b.mean)
}

// ── Gráficos SVG ────────────────────────────────────────────────────────────
// Los colores y fuentes salen de variables CSS (style="fill:var(--accent)"), así
// el gráfico sigue la paleta y la tipografía elegidas.

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const txt = (x, y, s, { size = 12, fill = 'var(--muted)', weight = 400, anchor = 'middle', font = 'var(--font-num)', halo = false } = {}) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" style="font-family:${font};font-size:${size}px;font-weight:${weight};fill:${fill};font-variant-numeric:tabular-nums${halo ? ';stroke:var(--surface);stroke-width:5px;stroke-linejoin:round;paint-order:stroke' : ''}">${esc(s)}</text>`

// Pastilla con texto (para las etiquetas de promedio y objetivo)
function pill(cx, cy, label, { size, fill, text = 'var(--on-accent)' }) {
  const w = label.length * size * 0.6 + size * 1.3
  const h = size * 1.75
  return (
    `<rect x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" style="fill:${fill}"/>` +
    txt(cx, cy + size * 0.36, label, { size, fill: text, weight: 700 })
  )
}

// Histograma en grupos de 5 (0–4, 5–9, …, 95–100). Con ~30 estudiantes se lee
// mucho mejor que 101 barras de un punto. La barra del ganador va en oro.
export function histogramSVG(guesses, average, target, { size = 'panel' } = {}) {
  const proj = size === 'proj'
  const k = proj ? 1.6 : 1
  const W = 760, H = proj ? 400 : 330
  const m = { t: 70 * k, r: 18, b: 34 * k, l: 18 }
  const pw = W - m.l - m.r
  const ph = H - m.t - m.b
  const x = v => m.l + (v / 100) * pw
  const y0 = m.t + ph

  const BIN = 5, NB = 20
  const binOf = v => Math.min(NB - 1, Math.floor(v / BIN))
  const counts = new Array(NB).fill(0)
  guesses.forEach(g => { counts[binOf(g.value)]++ })
  const maxC = Math.max(1, ...counts)
  const winBins = new Set(winnersOf(guesses, target).map(w => binOf(w.value)))

  let out = ''
  let counts_ = '' // conteos: se dibujan al final, encima de las líneas
  // Rejilla vertical suave cada 10 y rótulos del eje X
  for (let v = 0; v <= 100; v += 10) {
    out += `<line x1="${x(v).toFixed(1)}" y1="${m.t}" x2="${x(v).toFixed(1)}" y2="${y0}" style="stroke:var(--line);stroke-opacity:.45"/>`
    out += txt(x(v), H - m.b + 20 * k, v, { size: 11 * k })
  }
  // Barras con su conteo encima
  for (let i = 0; i < NB; i++) {
    if (!counts[i]) continue
    const bx = x(i * BIN) + 2
    const bw = x((i + 1) * BIN) - x(i * BIN) - 4
    const bh = (counts[i] / maxC) * (ph - 22 * k)
    const by = y0 - bh
    const fill = winBins.has(i) ? 'var(--gold)' : 'var(--bar, #9FB8AC)'
    out += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" style="fill:${fill}"/>`
    counts_ += txt(bx + bw / 2, by - 6 * k, counts[i], { size: 12 * k, fill: 'var(--ink)', weight: 700, halo: true })
  }
  out += `<line x1="${m.l}" y1="${y0}" x2="${m.l + pw}" y2="${y0}" style="stroke:var(--ink);stroke-opacity:.35"/>`

  // Líneas de promedio y objetivo, con etiquetas arriba que no se tapan
  const fs = 12 * k
  const lab = (v, label) => ({ v, label, w: label.length * fs * 0.6 + fs * 1.3 })
  const A = lab(average, `Prom. ${fmt1(average)}`)
  const T = lab(target, `⅔ = ${fmt1(target)}`)
  // Como el objetivo siempre es menor que el promedio, la pastilla del objetivo se
  // ancla a la izquierda de su línea y la del promedio a la derecha: una sola fila,
  // sin que ninguna línea cruce la otra pastilla. Si el objetivo está muy cerca de 0
  // y no cabe a la izquierda, se apilan (objetivo arriba) ambas hacia la derecha.
  const xT = x(T.v), xA = x(A.v)
  const fitsLeft = xT - T.w - 4 >= m.l
  let tx, ax, rowT, rowA
  if (fitsLeft) {
    tx = xT - T.w / 2 - 3
    ax = xA + A.w / 2 + 3 > m.l + pw ? xA - A.w / 2 - 3 : xA + A.w / 2 + 3
    rowT = rowA = m.t - 26 * k
  } else {
    tx = xT + T.w / 2 + 3
    ax = xA + A.w / 2 + 3
    rowT = m.t - 48 * k
    rowA = m.t - 18 * k
  }
  out += `<line x1="${x(average).toFixed(1)}" y1="${rowA + 10 * k}" x2="${x(average).toFixed(1)}" y2="${y0}" style="stroke:var(--muted);stroke-width:${2 * k};stroke-dasharray:6 5"/>`
  out += `<line x1="${x(target).toFixed(1)}" y1="${rowT + 10 * k}" x2="${x(target).toFixed(1)}" y2="${y0}" style="stroke:var(--accent);stroke-width:${2.5 * k}"/>`
  out += counts_
  out += pill(ax, rowA, A.label, { size: fs, fill: 'var(--muted)' })
  out += pill(tx, rowT, T.label, { size: fs, fill: 'var(--accent)' })

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Histograma de predicciones: promedio ${fmt1(average)}, objetivo ${fmt1(target)}">${out}</svg>`
}

// Tendencia entre rondas: eje fijo 0–100, cada predicción como punto tenue y
// las líneas de promedio y objetivo encima.
export function trendSVG(results) {
  const W = 620, H = 300
  const m = { t: 20, r: 24, b: 34, l: 40 }
  const pw = W - m.l - m.r
  const ph = H - m.t - m.b
  if (!results.length) return ''
  const n = results.length
  const x = i => (n === 1 ? m.l + pw / 2 : m.l + 28 + (i / (n - 1)) * (pw - 56))
  const y = v => m.t + ph - (v / 100) * ph

  let out = ''
  ;[0, 33, 67, 100].forEach(v => {
    out += `<line x1="${m.l}" y1="${y(v).toFixed(1)}" x2="${m.l + pw}" y2="${y(v).toFixed(1)}" style="stroke:var(--line);stroke-opacity:.7"/>`
    out += txt(m.l - 8, y(v) + 4, v, { size: 11, anchor: 'end' })
  })
  results.forEach((r, i) => {
    out += txt(x(i), H - 10, `R${r.number}`, { size: 12, fill: 'var(--ink)', weight: 600 })
    // Nube de puntos con un leve desplazamiento horizontal determinista
    r.guesses.forEach((g, j) => {
      const jitter = (((j * 37) % 17) - 8) * 1.4
      out += `<circle cx="${(x(i) + jitter).toFixed(1)}" cy="${y(g.value).toFixed(1)}" r="3.2" style="fill:var(--ink);fill-opacity:.16"/>`
    })
  })
  const series = (key, color, dash, above) => {
    const pts = results.map((r, i) => [x(i), y(r[key])])
    let s = ''
    if (pts.length > 1) {
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
      s += `<path d="${d}" style="fill:none;stroke:${color};stroke-width:3;stroke-linecap:round;stroke-linejoin:round${dash ? ';stroke-dasharray:7 6' : ''}"/>`
    }
    pts.forEach((p, i) => {
      s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5" style="fill:var(--surface);stroke:${color};stroke-width:2.5"/>`
      s += txt(p[0] + 10, p[1] + (above ? -8 : 16), fmt1(results[i][key]), { size: 11, fill: color, weight: 700, anchor: 'start' })
    })
    return s
  }
  out += series('average', 'var(--muted)', true, true)
  out += series('target', 'var(--accent)', false, false)
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tendencia de promedio y objetivo por ronda">${out}</svg>`
}
