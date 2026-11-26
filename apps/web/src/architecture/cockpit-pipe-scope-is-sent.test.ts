import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-225 — « MON PIPE » DEMANDE VRAIMENT SON PÉRIMÈTRE, PAS SEULEMENT LE SERVEUR.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────
 * `GET /projects/pipeline` accepte `?scope=own` depuis le 28/08 (fix
 * `a1f30e39b`, gardé côté API par `cockpit-scope-is-owned.spec.ts`), et son
 * propre commentaire annonçait que le cockpit (« **Mon** pipe ») demande le
 * sien. Il ne le demandait pas : `usePipeline()` n'acceptait aucun paramètre de
 * portée, et `MyActivityBlock` l'appelait sans argument. Sur une ESN à cinq
 * commerciaux, « Mon pipe » affichait le pipe des cinq sous le mot « Mon ».
 *
 * C'est la cause racine « paramètre déclaré, jamais passé » — la moitié
 * SERVEUR livrée et testée (19 tests dans `cockpit-scope-is-owned.spec.ts`),
 * la moitié WEB absente, et RIEN de rouge pour le dire côté web : aucune garde
 * n'existait ici avant celle-ci, contrairement au chiffre d'affaires
 * (`finance-scope-is-sent.test.ts`) que la même classe de défaut a produit le
 * même jour sur les mêmes quatre routes finance (PR #1206).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────
 *  1. Le CORPUS existe : trois fichiers réels, non vides.
 *  2. `MyActivityBlock.tsx` appelle `usePipeline('own')` — pas `usePipeline()`.
 *  3. `usePipeline.ts` NE JETTE PAS son paramètre : il le passe au SERVICE
 *     (`projectsApi.pipeline(language, scope)`), et il entre dans la CLÉ DE
 *     CACHE (`projectQueryKeys.pipeline(language, scope)`) — sans elle, le
 *     cockpit (soi) et `/projects` (l'espace) partageraient une entrée, et le
 *     premier écran ouvert déciderait de ce que l'autre affiche.
 *  4. `api.ts` construit vraiment `?scope=own` dans l'URL quand on le demande,
 *     et RIEN quand on ne demande rien — un `scope=workspace` inventé serait
 *     une valeur que le serveur ne connaît pas.
 *  5. Elle SAIT DIRE NON : la forme exacte du défaut d'origine (l'appel sans
 *     portée) est reproduite à la main et doit être repérée, sur les trois
 *     fichiers.
 */

const WEB_SRC = join(__dirname, '..')
const COCKPIT_BLOCK = join(WEB_SRC, 'features', 'briefing', 'view', 'MyActivityBlock.tsx')
const USE_PIPELINE = join(WEB_SRC, 'features', 'projects', 'hooks', 'usePipeline.ts')
const PROJECTS_API = join(WEB_SRC, 'features', 'projects', 'api.ts')

const cockpitBlock = readFileSync(COCKPIT_BLOCK, 'utf8')
const usePipelineSource = readFileSync(USE_PIPELINE, 'utf8')
const projectsApi = readFileSync(PROJECTS_API, 'utf8')

const CORPUS = [
  ['MyActivityBlock.tsx', cockpitBlock],
  ['usePipeline.ts', usePipelineSource],
  ['api.ts (projects)', projectsApi],
] as const

/**
 * Le corps qui suit un marqueur, coupé AVANT le membre suivant — recopié de
 * `cockpit-scope-is-owned.spec.ts` (API) pour la même raison : chercher un
 * motif « dans le fichier » entier rendrait VRAI grâce à un AUTRE appelant. Un
 * marqueur absent rend la chaîne VIDE, jamais le fichier entier.
 */
function bodyAfter(source: string, marker: string, stopAt: RegExp): string {
  const start = source.indexOf(marker)
  if (start < 0) return ''
  const rest = source.slice(start + marker.length)
  const next = rest.search(stopAt)
  return next < 0 ? rest : rest.slice(0, next)
}

const NEXT_TOP_LEVEL_EXPORT = /\nexport (function|const)/
const NEXT_OBJECT_METHOD = /\n {2}\w+\(/

describe('le cockpit demande le pipe DU LECTEUR, pas celui de l’espace', () => {
  /* ---------------------------------------------------------------------- */
  /*  La garde LIT quelque chose                                            */
  /* ---------------------------------------------------------------------- */

  it('a un corpus — trois fichiers réels, non vides, et ce sont les bons', () => {
    // Le faux zéro silencieux : un chemin qui n'existe pas rend une chaîne
    // vide, zéro faute, et un test vert pour toujours.
    for (const [name, source] of CORPUS) {
      expect(`${name}:${source.length > 300}`).toBe(`${name}:true`)
    }
    expect(cockpitBlock).toContain('export function MyActivityBlock')
    expect(usePipelineSource).toContain('export function usePipeline')
    expect(projectsApi).toContain('export const projectsApi')
  })

  /* ---------------------------------------------------------------------- */
  /*  1 — le cockpit DEMANDE son périmètre                                  */
  /* ---------------------------------------------------------------------- */

  it("`MyActivityBlock` appelle `usePipeline('own')`, pas `usePipeline()`", () => {
    const call = bodyAfter(cockpitBlock, 'const pipeline = usePipeline(', /\n/)
    expect(call.length).toBeGreaterThan(0)
    expect(call).toContain("'own'")
  })

  /* ---------------------------------------------------------------------- */
  /*  2 — le hook PASSE la portée, il ne la jette pas                       */
  /* ---------------------------------------------------------------------- */

  it('`usePipeline` transmet `scope` au SERVICE, pas seulement à sa signature', () => {
    const body = bodyAfter(usePipelineSource, 'export function usePipeline(', NEXT_TOP_LEVEL_EXPORT)
    expect(body.length).toBeGreaterThan(100)
    expect(body).toContain('scope')
    // Lu ET passé : un paramètre déclaré pour rien ne filtre rien — la forme
    // exacte du défaut du 28/08 sur le chiffre d'affaires, reproduite ici sur
    // le pipe.
    expect(body).toContain('projectsApi.pipeline(')
    expect(body).toMatch(/projectsApi\.pipeline\([^)]*scope[^)]*\)/)
  })

  it('la portée entre dans la CLÉ DE CACHE du hook', () => {
    const body = bodyAfter(usePipelineSource, 'export function usePipeline(', NEXT_TOP_LEVEL_EXPORT)
    expect(body).toMatch(/projectQueryKeys\.pipeline\([^)]*scope[^)]*\)/)
  })

  /* ---------------------------------------------------------------------- */
  /*  3 — l'URL porte vraiment `?scope=own`                                 */
  /* ---------------------------------------------------------------------- */

  it('`projectsApi.pipeline` construit `scope=own` dans l’URL — un seul endroit le fabrique', () => {
    const method = bodyAfter(projectsApi, 'pipeline(language:', NEXT_OBJECT_METHOD)
    expect(method.length).toBeGreaterThan(0)
    expect(method).toContain('pipelinePath(')
    // La fabrication de l'URL vit dans UNE fonction — la recopier à la main
    // dans deux appelants est la façon dont un troisième oublie le paramètre.
    expect(projectsApi).toContain("params.set('scope', scope)")
  })

  /* ---------------------------------------------------------------------- */
  /*  La garde SAIT DIRE NON                                                */
  /* ---------------------------------------------------------------------- */

  it('reconnaît le cockpit qui redeviendrait muet sur sa portée', () => {
    const faux = `
export function MyActivityBlock({ tasks }: { tasks?: readonly Task[] }) {
  const revenue = useRevenue(undefined, 'own')
  const pipeline = usePipeline()
  const missions = useMissions()
  return null
}
`
    const call = bodyAfter(faux, 'const pipeline = usePipeline(', /\n/)
    expect(call).not.toContain("'own'")
  })

  it('reconnaît un hook qui LIT `scope` sans le PASSER au service', () => {
    const faux = `
export function usePipeline(scope?: 'own') {
  const language = i18n.language === 'en' ? 'en' : 'fr'
  return useQuery({
    queryKey: projectQueryKeys.pipeline(language),
    queryFn: () => projectsApi.pipeline(language),
  })
}
`
    const body = bodyAfter(faux, 'export function usePipeline(', NEXT_TOP_LEVEL_EXPORT)
    expect(body).not.toMatch(/projectsApi\.pipeline\([^)]*scope[^)]*\)/)
    expect(body).not.toMatch(/projectQueryKeys\.pipeline\([^)]*scope[^)]*\)/)
  })

  it('reconnaît une fabrique d’URL qui ignorerait la portée demandée', () => {
    const faux = `
function pipelinePath(language: 'fr' | 'en'): string {
  return \`/projects/pipeline?lang=\${language}\`
}
`
    expect(faux).not.toContain("params.set('scope', scope)")
  })

  it('ne mord PAS sur les DEUX autres appelants — `/projects` et l’état vide de `/missions` restent SANS portée, à dessein', () => {
    // `usePipeline()` sans argument reste légitime ailleurs : le pipe complet
    // est l'objet même de `/projects`, et l'état vide de `/missions` décide
    // d'après ce que l'ESPACE a gagné, pas d'après le lecteur. Cette garde ne
    // porte que sur le cockpit — elle ne doit pas se mettre à exiger `'own'`
    // partout où `usePipeline` est importé.
    const légitime = `const { data: summary, isLoading: loadingSummary, isError } = usePipeline()`
    expect(légitime).not.toContain("usePipeline('own')")
  })

  it('rend une chaîne VIDE quand le marqueur n’existe pas — jamais tout le fichier', () => {
    // Le faux zéro inverse : une découpe qui rendrait le fichier entier
    // ferait passer n'importe quelle assertion.
    expect(bodyAfter(cockpitBlock, 'const marqueur-qui-n-existe-pas', /\n/)).toBe('')
    expect(bodyAfter(usePipelineSource, 'fonction-qui-n-existe-pas(', NEXT_TOP_LEVEL_EXPORT)).toBe('')
  })
})
