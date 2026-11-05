// Cliente de la API del Worker. Mantiene la forma { data, error } que usaba supabase.rpc
// para que las vistas no cambien: error es { message } con un texto listo para mostrar.

export async function rpc(fn, params = {}) {
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
