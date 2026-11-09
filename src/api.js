// Cliente de la API del Worker. Mantiene la forma { data, error } que usaba supabase.rpc
// para que las vistas no cambien: error es { message } con un texto listo para mostrar.
// En modo demo (/demo o ?demo=1) responde un backend simulado que no toca la base real.
import { isDemo, mockRpc } from './lib/mockApi'

export { isDemo }

// Las vistas consultan cada 4 s; en la demo cada 1 s para que se sienta inmediata.
export const POLL_MS = isDemo ? 1000 : 4000

export async function rpc(fn, params = {}) {
  if (isDemo) return mockRpc(fn, params)
  try {
    const res = await fetch(`/api/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { data: null, error: { message: body.error || `Error ${res.status}`, status: res.status } }
    }
    return { data: body.data ?? null, error: null }
  } catch {
    return { data: null, error: { message: 'Sin conexión. Revisa tu internet e intenta de nuevo.', status: 0 } }
  }
}
