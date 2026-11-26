type Listener = () => void

let open = false
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function subscribeCookieSettings(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCookieSettingsOpen(): boolean {
  return open
}

export function getCookieSettingsServerSnapshot(): boolean {
  return false
}

export function openCookieSettings(): void {
  if (open) return
  open = true
  emit()
}

export function closeCookieSettings(): void {
  if (!open) return
  open = false
  emit()
}
