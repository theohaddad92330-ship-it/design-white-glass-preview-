import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Un nombre, une date et un montant se formatent dans la langue de l'APP,
 * jamais dans celle du RUNTIME.
 *
 * `(2241).toLocaleString()` et `new Intl.NumberFormat(undefined, …)` lisent la
 * locale du navigateur. Un utilisateur français dont le navigateur est en
 * anglais lit alors « 2,241 » sur un écran qui dit « Contacts découverts », et
 * un utilisateur anglais lit « 2 241 » sur un écran anglais.
 *
 * Ce défaut est déjà sorti deux fois de ce dépôt, et les deux fois c'est la CI
 * — qui tourne en `en-US` quand les postes sont en `fr_FR` — qui l'a révélé :
 * une fois sur `formatCents` (six écrans le recopiaient), une fois sur le
 * compteur de contacts de la vue focale, où le test cherchait `/2\s?241/` et
 * trouvait `2,241`. La correction avait été écrite ; ce qui manquait, c'est ce
 * qui l'empêche de revenir.
 *
 * La règle passe par {@link appLocale} — GA-26, un réglage vit à un seul
 * endroit : le couple `fr-FR` / `en-GB` ne se réécrit pas à chaque appel.
 */

const RACINE = join(__dirname, '..')

/** Le formateur lui-même a le droit de nommer la locale — c'est son travail. */
const AUTORISES = new Set(['lib/locale.ts', 'lib/money.ts'])

/** ⚠️ Les tests sont EXCLUS : ils fixent une locale exprès pour vérifier les
 *  deux langues, ce qui est l'inverse d'un défaut. */
function sources(dossier: string, prefixe = ''): { chemin: string; code: string }[] {
  const sorties: { chemin: string; code: string }[] = []
  for (const entree of readdirSync(dossier)) {
    const complet = join(dossier, entree)
    const relatif = prefixe ? `${prefixe}/${entree}` : entree
    if (statSync(complet).isDirectory()) {
      sorties.push(...sources(complet, relatif))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entree)) continue
    if (/\.(test|spec)\.tsx?$/.test(entree)) continue
    sorties.push({ chemin: relatif, code: readFileSync(complet, 'utf8') })
  }
  return sorties
}

/** `toLocaleString()` / `toLocaleDateString()` / `toLocaleTimeString()` appelés
 *  SANS argument — la parenthèse fermante suit immédiatement l'ouvrante. */
const NU = /\.toLocale(?:String|DateString|TimeString)\(\s*\)/g

/** `Intl.<X>Format(undefined, …)` — dire `undefined` explicitement revient au
 *  même que ne rien dire, et se lit à tort comme un choix. */
const INTL_INDEFINI = /new\s+Intl\.\w*Format\(\s*undefined\b/g

describe("la locale d'affichage est celle de l'app, jamais celle du runtime", () => {
  const fichiers = sources(RACINE)

  it('lit un corpus non vide', () => {
    // Sans cette assertion, la garde serait verte le jour où le chemin change.
    expect(fichiers.length).toBeGreaterThan(500)
    expect(fichiers.some(f => f.chemin === 'lib/locale.ts')).toBe(true)
    // Témoin : le corpus contient bien du code qui formate des nombres.
    expect(fichiers.filter(f => /Intl\.NumberFormat/.test(f.code)).length).toBeGreaterThan(0)
  })

  it('aucun appel `toLocale*String()` sans locale explicite', () => {
    const fautifs = fichiers
      .filter(f => !AUTORISES.has(f.chemin))
      .flatMap(f => (f.code.match(NU) ?? []).map(m => `${f.chemin} : ${m.trim()}`))
    expect(fautifs).toEqual([])
  })

  it('aucun formateur `Intl` construit sur `undefined`', () => {
    const fautifs = fichiers
      .filter(f => !AUTORISES.has(f.chemin))
      .flatMap(f => (f.code.match(INTL_INDEFINI) ?? []).map(m => `${f.chemin} : ${m.trim()}`))
    expect(fautifs).toEqual([])
  })
})
