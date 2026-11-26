import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-10 — un connecteur ne rend jamais une liste NUE.
 *
 * « Une erreur se remarque. Une liste vide se croit. » (PDF 7 §3)
 *
 * Le 16/08/2026, `GET /microsoft/files/search` rendait `[]` quand la portée
 * `Files.Read.All` manquait. Rien ne plantait, rien ne s'affichait en rouge,
 * aucune alerte ne partait : l'utilisateur lisait « tu n'as aucun document » et
 * le croyait. C'était la pire des trois pannes du jour, précisément parce
 * qu'elle ne ressemblait pas à une panne.
 *
 * Le correctif de l'époque a été posé sur cette route-là. Cette garde empêche
 * la prochaine : toute route de connecteur qui rend une COLLECTION doit la
 * rendre qualifiée — `{ items, searched, scanned }` via `connectorSearchResult`,
 * ou une forme qui distingue explicitement le vide du refus (`{ items,
 * unavailable }`, comme le fait déjà l'administratif).
 *
 * Le périmètre est volontairement limité aux modules qui parlent à un
 * FOURNISSEUR TIERS. Une liste vide venant de notre propre base est une réponse
 * vraie : personne n'a besoin de savoir qu'on avait le droit de lire nos tables.
 */

const MODULES = join(__dirname, '..', 'modules')

/** Les modules dont les lectures traversent le réseau vers un tiers. */
const CONNECTOR_MODULES = [
  'google',
  'microsoft',
  'notion',
  'telephony',
  'admin-docs',
  'ats',
  'crm',
  'salesforce',
  'pipedrive',
  'attio',
] as const

/** Les formes acceptées : elles disent toutes si la lecture a eu lieu. */
const QUALIFIED = [
  /connectorSearchResult/,
  /\bitems\s*:/, // { items, unavailable } — la forme de l'administratif
]

function controllersOf(module: string): string[] {
  const dir = join(MODULES, module)
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries
    .filter(name => name.endsWith('.controller.ts'))
    .map(name => join(dir, name))
    .filter(path => statSync(path).isFile())
}

/**
 * Les signatures de retour d'un fichier, telles qu'elles sont écrites.
 *
 * Volontairement littéral : on cherche `): Promise<…>` sur les gestionnaires de
 * route. Une signature construite dynamiquement ne serait de toute façon pas
 * lisible, et il n'y en a aucune dans le dépôt.
 */
function returnTypes(source: string): { signature: string; line: number }[] {
  const out: { signature: string; line: number }[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    // `): Promise<X>` sur une seule ligne, ou `): Promise<` ouvert sur plusieurs.
    const match = /\)\s*:\s*Promise<([^]*)$/.exec(line)
    if (!match) continue
    // Reconstitue jusqu'à trois lignes : au-delà, la signature est un objet
    // multi-lignes, et ceux-là sont qualifiés par construction.
    const window = [line, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ')
    out.push({ signature: window, line: i + 1 })
  }
  return out
}

/** Rend-elle une collection NUE — `Promise<X[]>` ou `Promise<Array<…>>` ? */
function isBareCollection(signature: string): boolean {
  return /Promise<\s*(?:Array<|[A-Za-z0-9_.]+\[\])/.test(signature)
}

describe('GA-10 — une liste vide de connecteur est toujours qualifiée', () => {
  it('inspecte des contrôleurs et des signatures : 0 inspecté serait un faux vert (#4682.4)', () => {
    const controllers = CONNECTOR_MODULES.flatMap(module => controllersOf(module))
    expect(controllers.length).toBeGreaterThan(0)
    const signatures = controllers.flatMap(path => returnTypes(readFileSync(path, 'utf8')))
    expect(signatures.length).toBeGreaterThan(0)
  })

  it('aucune route de connecteur ne rend un tableau nu', () => {
    const offenders: string[] = []

    for (const module of CONNECTOR_MODULES) {
      for (const path of controllersOf(module)) {
        const source = readFileSync(path, 'utf8')
        for (const { signature, line } of returnTypes(source)) {
          if (!isBareCollection(signature)) continue
          if (QUALIFIED.some(pattern => pattern.test(source))) {
            // Le fichier emploie la forme qualifiée quelque part ; on vérifie
            // que CETTE signature-ci l'emploie aussi.
            if (/ConnectorSearchResult|items\s*:/.test(signature)) continue
          }
          offenders.push(`${module}/${path.split('/').pop()}:${line} — ${signature.trim().slice(0, 90)}`)
        }
      }
    }

    // La garde doit dire quoi faire, pas seulement échouer.
    if (offenders.length > 0) {
      throw new Error(
        `Ces routes rendent une liste NUE. Enveloppe-les avec connectorSearchResult() (voir common/connector-error.ts) :\n  ${offenders.join('\n  ')}`,
      )
    }
    expect(offenders).toEqual([])
  })

  it('les codes d’erreur de connecteur restent une liste fermée', () => {
    // Chaque module avait le sien avant ce chantier (`files_scope_missing`,
    // `crm_missing_scope`, `agenda_provider_api_disabled`). Un code local de
    // plus, et le navigateur — qui ne branche que sur `code` — recommence à
    // afficher « erreur inconnue » sur une panne parfaitement diagnostiquée.
    const localCodes =
      /reason:\s*'(?!scope_missing|provider_unavailable|provider_api_disabled|rate_limited|not_connected)[a-z_]+'/
    const offenders: string[] = []
    for (const module of CONNECTOR_MODULES) {
      for (const path of controllersOf(module)) {
        const source = readFileSync(path, 'utf8')
        if (localCodes.test(source)) offenders.push(`${module}/${path.split('/').pop()}`)
      }
    }
    if (offenders.length > 0) {
      throw new Error(`Code d'erreur local détecté — utilise connectorFailure() :\n  ${offenders.join('\n  ')}`)
    }
    expect(offenders).toEqual([])
  })
})
