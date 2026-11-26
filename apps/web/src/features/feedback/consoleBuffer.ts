/* eslint-disable no-console -- this module's whole purpose is to wrap console. */
// Ring buffer of recent console output, attached to beta feedback so a bug is
// reproducible without asking the user to reopen devtools. Patches the console
// methods once; always forwards to the original so nothing is swallowed.

type Entry = { level: string; time: string; text: string }

const MAX_ENTRIES = 100
const MAX_CHARS = 15000
const buffer: Entry[] = []
let installed = false

export function installConsoleBuffer(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  const levels = ['log', 'info', 'warn', 'error'] as const
  for (const level of levels) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      try {
        buffer.push({ level, time: new Date().toISOString(), text: args.map(stringify).join(' ') })
        if (buffer.length > MAX_ENTRIES) buffer.shift()
      } catch {
        // Never let logging break the app.
      }
      original(...args)
    }
  }
}

/** The buffered console as a single string, most recent last, char-capped. */
export function getRecentConsole(): string {
  const text = buffer.map(e => `[${e.time}] ${e.level.toUpperCase()}: ${e.text}`).join('\n')
  return text.length > MAX_CHARS ? text.slice(text.length - MAX_CHARS) : text
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
