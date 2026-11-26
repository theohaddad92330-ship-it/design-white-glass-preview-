import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-37 — les priors DATAFORGE ne sortent JAMAIS vers l'utilisateur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le pack V10 tient 78 870 lignes dont **97,5 % en Tier D** — des priors
 * SECTORIELS, c'est-à-dire « ce qu'une entreprise de ce secteur achète
 * habituellement ». Ce n'est pas ce que CE compte achète. Les afficher comme un
 * fait est de la donnée inventée, l'interdit n°1 du dépôt, et c'est le premier
 * refus écrit du plan DATAFORGE.
 *
 * Même chose pour la route d'achat : elle est identique sur les 66 domaines de
 * chacun des 1 195 comptes (mesuré, 0 exception). C'est un SEED de recherche au
 * niveau compte, jamais une preuve par domaine — d'où son nom
 * `procurementRouteSeed`, et d'où l'interdit de l'addendum Stelya §12 : « la
 * route V10 ne doit jamais être exposée comme une route vérifiée par domaine ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE PLUTÔT QU'UN GUARD À L'EXÉCUTION
 * ─────────────────────────────────────────────────────────────────────────────
 * `priorsForSiren` n'a aujourd'hui aucun consommateur en production : un guard
 * runtime serait du code que rien n'appelle — le défaut que ce dépôt a déjà payé
 * plusieurs fois. Une garde d'architecture, elle, ne coûte rien et tient le jour
 * où quelqu'un branchera la lecture : c'est précisément à ce moment-là qu'on
 * risque d'exposer un Tier D sans y penser.
 */

const MODULES = join(__dirname, '..', 'modules')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

/** Retire les commentaires AVANT lecture — leçon GA-08 : une garde qui lit ses
 *  propres commentaires compare du bruit à du bruit. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('GA-37 — les priors DATAFORGE restent internes', () => {
  const files = sourceFiles(MODULES)

  it('lit un corpus non vide', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.some(file => file.includes('dataforge'))).toBe(true)
  })

  it('aucun contrôleur UTILISATEUR n’injecte le service DATAFORGE', () => {
    // Un contrôleur est la frontière avec l'utilisateur : y faire entrer les
    // priors est le seul chemin par lequel un Tier D peut atteindre un écran.
    //
    // Les contrôleurs INTERNES (`InternalSecretGuard`) sont exclus, et ce n'est
    // pas une échappatoire : c'est leur raison d'être. Le back-office DOIT voir
    // la couverture du pack — combien de comptes résolus, combien de Tier A —
    // pour savoir ce que l'ingestion a produit. Ce que la garde interdit, c'est
    // qu'un prior atteigne un écran de COMMERCIAL, où il se lirait comme un fait.
    const offenders = files
      .filter(file => file.endsWith('.controller.ts'))
      .map(file => ({ file, source: stripComments(readFileSync(file, 'utf8')) }))
      .filter(({ source }) => /\bDataforgeService\b/.test(source))
      .filter(({ source }) => !/\bInternalSecretGuard\b/.test(source))
      .map(({ file }) => file.slice(file.indexOf('modules')))
    expect(offenders.sort()).toEqual([])
  })

  it('la garde sait dire NON — un contrôleur utilisateur qui les lirait serait vu', () => {
    // Preuve qu'elle ne passe pas au vert sur du vide : le contrôleur interne
    // EXISTE et injecte bien le service ; c'est son garde qui l'excuse, pas
    // l'absence de corpus.
    const internal = files.filter(
      file => file.endsWith('.controller.ts') && /\bDataforgeService\b/.test(stripComments(readFileSync(file, 'utf8'))),
    )
    expect(internal.length).toBeGreaterThan(0)
    for (const file of internal) {
      expect(stripComments(readFileSync(file, 'utf8'))).toContain('InternalSecretGuard')
    }
  })

  it('la route d’achat ne voyage que sous un nom qui dit qu’elle est un SEED', () => {
    // `procurement_route` est la colonne de staging ; dès qu'elle sort du
    // parseur et du service, elle doit porter « seed » dans son nom — sans quoi
    // un écran finira par la présenter comme une route vérifiée.
    const leaks: string[] = []
    for (const file of files) {
      if (file.includes(`${'dataforge'}`)) continue
      const source = stripComments(readFileSync(file, 'utf8'))
      if (/procurementRoute(?!Seed)\b/.test(source)) leaks.push(file.slice(file.indexOf('modules')))
    }
    expect(leaks.sort()).toEqual([])
  })
})
