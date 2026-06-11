export const fmt1 = n =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(n)

const clampInt = x => Math.max(0, Math.min(100, Math.round(x)))

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
    const winIds = new Set(winners.map(w => w.name))
    r.guesses.forEach(g => {
      if (!tally[g.name]) tally[g.name] = { name: g.name, wins: 0, diffs: [] }
      tally[g.name].diffs.push(Math.abs(g.value - r.target))
      if (winIds.has(g.name)) tally[g.name].wins++
    })
  })
  return Object.values(tally)
    .map(t => ({ ...t, mean: t.diffs.reduce((a, b) => a + b, 0) / t.diffs.length }))
    .sort((a, b) => b.wins - a.wins || a.mean - b.mean)
}

// ── Histogram SVG (exact replica of prototype) ──────────────────────────────

export function histogramSVG(guesses, average, target, showNash) {
  const W = 640, H = 310
  const m = { t: 22, r: 14, b: 38, l: 40 }
  const pw = W - m.l - m.r
  const ph = H - m.t - m.b

  const counts = new Array(101).fill(0)
  guesses.forEach(g => { counts[clampInt(g.value)]++ })
  const maxC = Math.max(1, ...counts)

  const slotW = pw / 101
  const xCont = c => m.l + ((c + 0.5) / 101) * pw
  const yTop = c => m.t + ph - (c / maxC) * ph

  let yaxis = ''
  ;[0, Math.ceil(maxC / 2), maxC].forEach(c => {
    const yy = yTop(c).toFixed(1)
    yaxis +=
      `<line x1="${m.l}" y1="${yy}" x2="${m.l + pw}" y2="${yy}" stroke="#EEE8DE"/>` +
      `<text x="${m.l - 7}" y="${(parseFloat(yy) + 3).toFixed(1)}" font-family="Space Mono" font-size="9" fill="#9b9489" text-anchor="end">${c}</text>`
  })

  let bars = ''
  for (let v = 0; v <= 100; v++) {
    if (!counts[v]) continue
    const by = yTop(counts[v])
    const bx = (xCont(v) - slotW * 0.42).toFixed(2)
    bars += `<rect x="${bx}" y="${by.toFixed(1)}" width="${(slotW * 0.84).toFixed(2)}" height="${(m.t + ph - by).toFixed(1)}" rx="1" fill="#BFD0C6"/>`
  }

  let axis = `<line x1="${m.l}" y1="${m.t + ph}" x2="${m.l + pw}" y2="${m.t + ph}" stroke="#D9D2C6"/>`
  ;[0, 25, 50, 75, 100].forEach(v => {
    axis += `<text x="${xCont(v).toFixed(1)}" y="${H - 14}" font-family="Space Mono" font-size="10" fill="#9b9489" text-anchor="middle">${v}</text>`
  })

  const vline = (v, color, dash, label, labY) => {
    const xx = xCont(v).toFixed(1)
    return (
      `<line x1="${xx}" y1="${m.t}" x2="${xx}" y2="${m.t + ph}" stroke="${color}" stroke-width="2.5" ${dash ? 'stroke-dasharray="5 4"' : ''}/>` +
      `<text x="${xx}" y="${labY}" font-family="Space Mono" font-size="11" font-weight="700" fill="${color}" text-anchor="middle">${label}</text>`
    )
  }

  const nashRef = showNash ? vline(0, '#2C6A55', true, 'Nash 0', m.t - 7) : ''
  const refs =
    nashRef +
    vline(average, '#756E63', true, 'Prom ' + fmt1(average), m.t - 7) +
    vline(target, '#D8453E', false, '⅔ = ' + fmt1(target), m.t + ph + 24)

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${yaxis}${bars}${axis}${refs}</svg>`
}

// ── Trend SVG (exact replica of prototype) ──────────────────────────────────

export function trendSVG(results, showNash) {
  const W = 620, H = 300
  const m = { t: 24, r: 46, b: 34, l: 40 }
  const pw = W - m.l - m.r
  const ph = H - m.t - m.b

  if (results.length < 2) {
    return `<svg viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" font-family="Inter" font-size="14" fill="#9b9489" text-anchor="middle">Disponible desde la ronda 2 (para comparar).</text></svg>`
  }

  const maxY = Math.max(50, ...results.map(c => c.average)) * 1.08
  const x = i => m.l + (i / (results.length - 1)) * pw
  const y = v => m.t + ph - (v / maxY) * ph

  let grid = ''
  ;[0, maxY / 2, maxY].forEach(v => {
    grid +=
      `<line x1="${m.l}" y1="${y(v).toFixed(1)}" x2="${m.l + pw}" y2="${y(v).toFixed(1)}" stroke="#EDE7DD"/>` +
      `<text x="${m.l - 8}" y="${(y(v) + 3).toFixed(1)}" font-family="Space Mono" font-size="9" fill="#9b9489" text-anchor="end">${fmt1(v)}</text>`
  })

  if (showNash) {
    grid +=
      `<line x1="${m.l}" y1="${y(0)}" x2="${m.l + pw}" y2="${y(0)}" stroke="#2C6A55" stroke-width="1.5" stroke-dasharray="4 4"/>` +
      `<text x="${m.l + pw + 4}" y="${y(0) + 3}" font-family="Space Mono" font-size="9" fill="#2C6A55">Nash 0</text>`
  }

  let xl = ''
  results.forEach((c, i) => {
    xl += `<text x="${x(i).toFixed(1)}" y="${H - 10}" font-family="Space Mono" font-size="11" fill="#756E63" text-anchor="middle">R${c.number}</text>`
  })

  const series = (key, color, gid, labelAbove) => {
    const pts = results.map((c, i) => [x(i), y(c[key])])
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
    const area =
      line +
      ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + y(0).toFixed(1) +
      ' L' + pts[0][0].toFixed(1) + ' ' + y(0).toFixed(1) + ' Z'
    let dots = '', labels = ''
    pts.forEach((p, i) => {
      dots += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5" fill="#fff" stroke="${color}" stroke-width="2.5"/>`
      labels += `<text x="${p[0].toFixed(1)}" y="${(p[1] + (labelAbove ? -12 : 18)).toFixed(1)}" font-family="Space Mono" font-size="10" font-weight="700" fill="${color}" text-anchor="middle">${fmt1(results[i][key])}</text>`
    })
    return `<path d="${area}" fill="url(#${gid})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}`
  }

  const defs =
    `<defs>` +
    `<linearGradient id="gA" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#756E63" stop-opacity="0.18"/><stop offset="100%" stop-color="#756E63" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="gT" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#D8453E" stop-opacity="0.22"/><stop offset="100%" stop-color="#D8453E" stop-opacity="0"/></linearGradient>` +
    `</defs>`

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${defs}${grid}${xl}${series('average', '#756E63', 'gA', true)}${series('target', '#D8453E', 'gT', false)}</svg>`
}
