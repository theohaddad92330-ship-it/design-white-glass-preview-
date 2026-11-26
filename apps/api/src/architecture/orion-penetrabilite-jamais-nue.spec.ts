import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Avertissement 7 (ORION V12) — la pénétrabilité est un ORDRE DE PASSAGE,
 * jamais un verdict, et ne se lit JAMAIS sans sa couverture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Jules et Pimkie sortaient à 84 et 76 dans le pack ; leur IT est externalisée
 * à CGI par contrat de dix ans. Le score était haut PARCE QUE la donnée
 * manquait — 494 des 620 comptes cibles ont une couverture ≤ 1 champ sur 24.
 * Un score de pénétrabilité affiché seul se lit comme un fait ; affiché avec
 * sa couverture, il se lit pour ce qu'il est : un tri sur un socle creux.
 *
 * `OrionAccountsService.statusFor` est le SEUL point d'entrée qui lit
 * `penetrabiliteScore` (`DataforgeAccountStatusEntity`) : il rend un objet
 * `{ score, couvertureTotale, caveat }` ou `null` — jamais le nombre nu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun autre fichier de production ne lit `.penetrabiliteScore` — la lecture
 * reste concentrée dans les fichiers du pack (entité, parseur, script
 * d'ingestion, service). Un futur écran ou service qui la lirait directement
 * contournerait le groupement et pourrait afficher le score sans couverture.
 */

const MODULES = join(__dirname, '..', 'modules')
const SCRIPTS = join(__dirname, '..', 'scripts')
const ENTITIES = join(__dirname, '..', 'database', 'entities')

const ALLOWED_FILES = new Set([
  'orion-accounts.service.ts',
  'orion-accounts.service.spec.ts',
  'orion-csv.ts',
  'orion-csv.spec.ts',
  'dataforge-account-status.entity.ts',
  'ingest-orion-accounts-master.ts',
])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** La fonction de détection, testée directement dans « sait dire NON ». */
function readsRawPenetrabiliteScore(source: string): boolean {
  return /\.penetrabiliteScore\b/.test(stripComments(source))
}

describe('ORION V12 — la pénétrabilité ne se lit jamais sans sa couverture', () => {
  const files = [...sourceFiles(MODULES), ...sourceFiles(SCRIPTS), ...sourceFiles(ENTITIES)]

  it('lit un corpus non vide', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.some(file => file.endsWith('orion-accounts.service.ts'))).toBe(true)
  })

  it('aucun fichier hors de la liste autorisée ne lit `.penetrabiliteScore`', () => {
    const offenders = files
      .filter(file => !ALLOWED_FILES.has(file.split('/').pop() ?? ''))
      .filter(file => readsRawPenetrabiliteScore(readFileSync(file, 'utf8')))
      .map(file => file.slice(file.indexOf('src')))
    expect(offenders.sort()).toEqual([])
  })

  it('la liste autorisée existe VRAIMENT — la garde ne s’excuse pas sur du vide', () => {
    const present = [...ALLOWED_FILES].filter(name => files.some(file => file.endsWith(`/${name}`)))
    expect(present.length).toBe(ALLOWED_FILES.size)
  })

  it('la garde sait dire NON — un extrait qui lit le score brut est détecté', () => {
    const offendingSnippet = `
      export function renderScore(account: DataforgeAccountStatusEntity) {
        return account.penetrabiliteScore
      }
    `
    expect(readsRawPenetrabiliteScore(offendingSnippet)).toBe(true)
  })

  it('la garde ne se déclenche pas sur un commentaire qui MENTIONNE le champ', () => {
    const commentOnly = `
      // Ne jamais lire account.penetrabiliteScore directement — passer par le service.
      export function renderScore() { return null }
    `
    expect(readsRawPenetrabiliteScore(commentOnly)).toBe(false)
  })
})
