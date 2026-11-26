import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-126 — UNE DATE CIVILE NE SE LIT PAS SUR L'HORLOGE UTC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `date.toISOString().slice(0, 10)` rend la date de l'instant **en UTC**, pas la
 * date qu'affiche l'horloge. À Paris en heure d'été, entre minuit et 02 h 00,
 * l'instant UTC est encore la veille. Tout ce qui en dépend recule d'un jour
 * pendant deux heures chaque nuit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ — 01/09/2026, 00 h 06 CEST
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `matching.controller.ts` — une échéance à J+7 posée à J+6 ;
 *  · `demo-seed.service.ts` — le 1er du mois, `setDate(1)` puis `toISOString()`
 *    rend le mois PRÉCÉDENT : le semis posait ses relevés deux mois en arrière
 *    et l'écran « Prêt à facturer » se vidait ;
 *  · `staffing.service.spec.ts` × 2 — onze jours amortis au lieu de dix.
 *
 * Trois AUTRES fichiers avaient déjà écrit la bonne réponse dans un commentaire,
 * chacun en privé (`staffing.ts`, `computed-at.ts`, `agenda-view.ts`). C'est
 * précisément le motif que cette garde existe pour arrêter : **une connaissance
 * écrite trois fois en privé n'est pas une dérivation partagée**, c'est trois
 * occasions de la réinventer de travers une quatrième fois.
 *
 * La réponse par défaut : `localDayKey` / `localMonthKey` / `shiftLocalDays` de
 * `@bellum/contracts`.
 *
 * ⚠️ CE QUI N'EST PAS VISÉ : `toISOString()` NU, qui est la bonne façon
 * d'écrire un INSTANT. Seule la TRONCATURE en date civile est fautive.
 */

const ROOT = join(__dirname, '..', '..', '..', '..')
const SCANNED = ['apps/api/src', 'apps/web/src', 'packages/contracts/src', 'packages/ui/src']

/**
 * Le motif fautif : une date DÉCALÉE puis tronquée en jour.
 *
 * ⚠️ On exige les DEUX. Tronquer un instant déjà ancré à minuit UTC — une
 * chaîne `YYYY-MM-DD` relue de la base — est légitime ; c'est le décalage sur
 * l'horloge locale suivi d'une lecture UTC qui mélange deux horloges.
 */
const SHIFTED = /\.set(Date|Month|FullYear)\(/
const TRUNCATED = /toISOString\(\)\s*\.\s*(slice|substring|split)\s*\(/

/**
 * Ce qui reste toléré, NOMMÉ, avec sa raison. Un cliquet : cette liste ne
 * s'allonge pas sans qu'on écrive pourquoi la date UTC est la bonne ici.
 */
const ALLOWED = new Set<string>([
  // La clé partagée elle-même : elle prouve, dans son propre test, que l'ancien
  // chemin rendait la veille. Elle DOIT donc citer le motif qu'elle remplace.
  'packages/contracts/src/schemas/local-day.test.ts',
  // Cette garde elle-même : son test « sait dire NON » CITE le motif interdit
  // dans un littéral de gabarit, que `codeOnly` ne retire pas — un littéral
  // n'est pas un commentaire. Sans cette ligne, la garde se dénoncerait
  // elle-même et il faudrait affaiblir sa preuve pour la faire taire.
  'apps/api/src/architecture/local-day-not-utc.spec.ts',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

/** Le fichier, sans ses commentaires : un motif CITÉ dans un docblock n'est pas du code. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

function offenders(): string[] {
  const found: string[] = []
  for (const scope of SCANNED) {
    for (const file of walk(join(ROOT, scope))) {
      const rel = file.slice(ROOT.length + 1)
      if (ALLOWED.has(rel)) continue
      const code = codeOnly(readFileSync(file, 'utf8'))
      let m: RegExpExecArray | null
      const shifted = new RegExp(SHIFTED.source, 'g')
      // eslint-disable-next-line no-cond-assign
      while ((m = shifted.exec(code))) {
        // La fenêtre qui SUIT le décalage : au-delà, c'est une autre date.
        if (TRUNCATED.test(code.slice(m.index, m.index + 400))) {
          found.push(`${rel}:${code.slice(0, m.index).split('\n').length}`)
          break
        }
      }
    }
  }
  return found
}

describe('GA-126 — une date civile se lit sur l’horloge locale', () => {
  it('la garde LIT quelque chose — le corpus n’est pas vide', () => {
    let count = 0
    for (const scope of SCANNED) count += walk(join(ROOT, scope)).length
    // Mesuré à plus de 4 000 le 01/09/2026. Un chemin faux rendrait 0 et la
    // garde passerait au vert en ne regardant rien.
    expect(count).toBeGreaterThan(2000)
  })

  it('AUCUN fichier ne décale une date puis la tronque en UTC', () => {
    expect(offenders()).toEqual([])
  })

  it('la garde sait dire NON — le motif exact qu’elle interdit est reconnu', () => {
    const sabotage = codeOnly(`
      const d = new Date()
      d.setDate(d.getDate() + 7)
      return d.toISOString().slice(0, 10)
    `)
    const shifted = new RegExp(SHIFTED.source, 'g')
    const m = shifted.exec(sabotage)
    expect(m).not.toBeNull()
    expect(TRUNCATED.test(sabotage.slice(m?.index ?? 0, (m?.index ?? 0) + 400))).toBe(true)
  })

  it('ne condamne PAS un `toISOString()` nu — un instant s’écrit comme ça', () => {
    const legitime = codeOnly(`
      const d = new Date()
      d.setDate(1)
      return d.toISOString()
    `)
    const shifted = new RegExp(SHIFTED.source, 'g')
    const m = shifted.exec(legitime)
    expect(TRUNCATED.test(legitime.slice(m?.index ?? 0, (m?.index ?? 0) + 400))).toBe(false)
  })

  it('un motif cité dans un COMMENTAIRE n’est pas du code', () => {
    const commente = codeOnly(`
      // d.setDate(d.getDate() + 7) puis d.toISOString().slice(0, 10) : interdit.
      const x = 1
    `)
    expect(SHIFTED.test(commente)).toBe(false)
  })
})
