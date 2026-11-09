// Selector temporal para comparar paletas y tipografías en la app real.
//   ?tema=1..4    1 Papel (actual) · 2 Aula alto contraste · 3 Pizarra · 4 Bolsa de 1936
//   ?fuente=1..3  1 Legible · 2 Editorial 1936 · 3 Actual corregida
// La elección se recuerda en este navegador; ?tema=0 o ?fuente=0 la borra.
// Se eliminará cuando la profesora elija la combinación definitiva.

const FONT_URLS = {
  1: 'https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@500;600;700;800&family=Atkinson+Hyperlegible:wght@400;700&display=swap',
  2: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800&family=Source+Sans+3:wght@400;600;700;800&family=IBM+Plex+Mono:wght@500;700&display=swap',
}

function pick(name, max) {
  let v = null
  try {
    const q = new URLSearchParams(location.search).get(name)
    if (q === '0') localStorage.removeItem('preview_' + name)
    else if (q && Number(q) >= 1 && Number(q) <= max) localStorage.setItem('preview_' + name, q)
    v = localStorage.getItem('preview_' + name)
  } catch { /* sin almacenamiento */ }
  return v
}

export function applyPreview() {
  const tema = pick('tema', 4)
  const fuente = pick('fuente', 3)
  const root = document.documentElement
  if (tema && tema !== '1') root.dataset.tema = tema
  if (fuente && fuente !== '3') {
    root.dataset.fuente = fuente
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_URLS[fuente]
    document.head.appendChild(link)
  }
}
