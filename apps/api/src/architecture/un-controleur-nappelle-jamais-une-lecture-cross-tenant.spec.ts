import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-382 — un contrôleur (ou une passerelle websocket) n'appelle JAMAIS,
 * directement, une lecture explicitement non cloisonnée. #2671.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CONTEXTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Revue sécurité du cloisonnement par espace (21/09/2026, `origin/main` =
 * `dc9614fdf`) : le périmètre BU lui-même TIENT, mais quatre lectures internes
 * du pipeline des comptes lisaient un id SANS borne d'espace
 * (`accounts.service.ts:3443,3486,3537,4382`). Trois ont reçu leur borne
 * `workspace_id` — l'appelant la connaissait déjà, l'ajouter était gratuit
 * (commit `bccb04c03`, #2671). La quatrième, `findByIdUnscoped`, est restée
 * TELLE QUELLE, par design : c'est la lecture cross-tenant du back-office
 * opérateur (`AnalysisService.cancelByAdmin`, derrière `InternalSecretGuard`
 * dans `AdminAnalysesController`) — un id BRUT venu d'un JWT utilisateur ne
 * l'atteint jamais aujourd'hui, et ce n'est vrai que tant qu'aucun contrôleur
 * ne l'appelle en direct.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun fichier `*.controller.ts` ni `*.gateway.ts` du dépôt — les deux formes
 * de point d'entrée réseau de ce service NestJS (HTTP et Socket.IO) — ne
 * contient d'appel `.xxxUnscoped(`. `findByIdUnscoped` est aujourd'hui le SEUL
 * lecteur qui porte ce suffixe (recherché exhaustivement ci-dessous) ; le motif
 * du suffixe plutôt qu'un nom en dur attrape aussi la PROCHAINE méthode
 * délibérément non cloisonnée qu'on nommera pareil, sans réécrire la garde.
 *
 * Elle ne juge pas le SERVICE qui expose la méthode : porter `Unscoped` dans
 * son nom est la documentation volontaire d'un lecteur cross-tenant (voir
 * `accounts.service.ts:4390-4396`). Ce qu'elle interdit est la DISTANCE d'un
 * clic entre un JWT utilisateur et cette lecture — la chaîne légitime actuelle
 * (contrôleur admin → `AnalysisService` → `AccountsService`) reste à deux
 * sauts, jamais un.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE VOIT PAS — NOMMÉ, PAS SILENCIEUX (une garde aveugle nomme)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Les `*.worker.ts` (`@Processor` BullMQ, sept dans ce dépôt à ce jour —
 *    voir le test « les points d'entrée réseau balayés existent bien » plus
 *    bas) consomment un job déjà mis en file par un contrôleur qui a validé
 *    son id — jamais un id brut de client. Le jour où un worker lirait un id
 *    fourni par le client sans détour par un contrôleur, cette garde ne le
 *    verrait pas.
 * 2. Un appel à DEUX sauts ou plus (contrôleur → service A → service B →
 *    `xxxUnscoped`) n'est pas vu — seul le texte SOURCE du contrôleur/passerelle
 *    est lu. La chaîne admin actuelle passe par `AnalysisService`, donc à un
 *    saut de la lecture directe qu'elle interdit ; un futur détour par un
 *    service intermédiaire la contournerait. Documenté, pas corrigé : une
 *    garde de graphe d'appel complet demanderait un vrai analyseur, hors de
 *    portée de ce lot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS PREUVES
 * ─────────────────────────────────────────────────────────────────────────────
 * La garde LIT un corpus non vide (les 165+ contrôleurs existent bien), sait
 * dire NON (un extrait fabriqué, collé dans un contrôleur réel le temps du
 * test, la fait rougir en NOMMANT le fichier coupable), et ne s'alarme pas sur
 * un appel `Unscoped` qui ne serait pas un appel de MÉTHODE (ex. un
 * commentaire, ou le nom `findByIdUnscoped` cité en prose) — seule la forme
 * `.xxxUnscoped(` compte.
 */

const API_SRC = join(__dirname, '..')
const MODULES = join(API_SRC, 'modules')

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.turbo'])

/** Tous les fichiers de `modules/` dont le nom se termine par `suffix`,
 *  jamais un `.spec.ts` — récursif, pour ne rater aucun sous-dossier de
 *  module. */
function filesEndingWith(directory: string, suffix: string): readonly string[] {
  if (!existsSync(directory)) return []
  const found: string[] = []
  for (const entry of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      found.push(...filesEndingWith(path, suffix))
    } else if (entry.endsWith(suffix) && !entry.endsWith('.spec.ts')) {
      found.push(path)
    }
  }
  return found
}

/** Chaque appel `.xxxUnscoped(` trouvé dans un texte — le nom complet de la
 *  méthode, pour nommer le coupable exact plutôt que de dire juste « trouvé
 *  quelque chose ». */
const UNSCOPED_CALL = /\.\w*Unscoped\s*\(/g

function unscopedCallsIn(source: string): readonly string[] {
  const matches = source.match(UNSCOPED_CALL)
  return matches ? matches.map(m => m.replace(/\s*\($/, '')) : []
}

describe('GA-382 — un contrôleur n’appelle jamais une lecture cross-tenant en direct', () => {
  const controllers = filesEndingWith(MODULES, '.controller.ts')
  const gateways = filesEndingWith(MODULES, '.gateway.ts')
  const entryPoints = [...controllers, ...gateways]

  /* ------------------------------------------------------------------ */
  /*  0. La garde LIT quelque chose                                      */
  /* ------------------------------------------------------------------ */

  it('les points d’entrée réseau balayés existent bien (corpus non vide)', () => {
    // Mesuré le 22/09/2026 : 165 contrôleurs, 2 passerelles websocket. Un
    // chemin renommé (`modules/` déplacé, extension changée) ferait tomber ce
    // compte à zéro plutôt que de laisser la garde crier « rien trouvé, donc
    // rien à reprocher » en silence.
    expect(controllers.length).toBeGreaterThan(50)
    expect(gateways.length).toBeGreaterThan(0)
  })

  it('recense les lecteurs `xxxUnscoped` du dépôt — un seul aujourd’hui', () => {
    const services = filesEndingWith(MODULES, '.service.ts')
    const declarations = services.flatMap(path => {
      const source = readFileSync(path, 'utf8')
      const re = /async (\w*Unscoped)\s*\(/g
      const names: string[] = []
      let match: RegExpExecArray | null
      while ((match = re.exec(source)) !== null) names.push(match[1] as string)
      return names
    })
    // Si un second lecteur `xxxUnscoped` apparaît un jour, cette assertion le
    // signale explicitement plutôt que de laisser la garde principale ci-dessous
    // continuer de tourner sans que personne n'ait remarqué le nouveau venu.
    expect(declarations).toEqual(['findByIdUnscoped'])
  })

  /* ------------------------------------------------------------------ */
  /*  1. Le refus, sur le corpus réel                                    */
  /* ------------------------------------------------------------------ */

  it('aucun contrôleur ni passerelle n’appelle une méthode `xxxUnscoped`', () => {
    const offenders = entryPoints.flatMap(path => {
      const source = readFileSync(path, 'utf8')
      const calls = unscopedCallsIn(source)
      return calls.map(call => `${path.slice(API_SRC.length + 1)} → ${call}(`)
    })
    expect(offenders).toEqual([])
  })

  /* ------------------------------------------------------------------ */
  /*  2. Elle sait dire NON — coupable factice, nommé                    */
  /* ------------------------------------------------------------------ */

  it('rougit et NOMME le fichier sur un appel direct fabriqué', () => {
    const fabricatedController = join(MODULES, 'admin', 'admin-analyses.controller.ts')
    const realSource = readFileSync(fabricatedController, 'utf8')
    const withOffence = `${realSource}\n// coupable factice pour la preuve GA-382\nvoid this.analysisService['accountsService'].findByIdUnscoped('x')\n`

    const offenders = [fabricatedController].flatMap(path => {
      const source = path === fabricatedController ? withOffence : readFileSync(path, 'utf8')
      const calls = unscopedCallsIn(source)
      return calls.map(call => `${path.slice(API_SRC.length + 1)} → ${call}(`)
    })

    expect(offenders).not.toEqual([])
    expect(offenders[0]).toContain('admin-analyses.controller.ts')
    expect(offenders[0]).toContain('findByIdUnscoped')
  })

  /* ------------------------------------------------------------------ */
  /*  3. Elle n'attrape pas ce qu'elle ne vise pas                       */
  /* ------------------------------------------------------------------ */

  it('ne s’alarme pas sur le nom cité en prose, hors appel de méthode', () => {
    const prose = 'Voir `findByIdUnscoped` (accounts.service.ts) — jamais un appel direct ici.'
    expect(unscopedCallsIn(prose)).toEqual([])
  })
})
