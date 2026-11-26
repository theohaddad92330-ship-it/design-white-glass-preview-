/**
 * GA-257 (numéro à vérifier à l'intégration — plusieurs lots parallèles
 * posent des gardes le même jour) — LE SCORE D'EXTERNALISATION NE SE LIT
 * QU'À UN UNIQUE ENDROIT CALIBRÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `market_company_signal.externalization_score` (`MarketCompanySignalEntity.
 * externalizationScore`, `apps/api/src/database/entities/
 * market-company-signal.entity.ts:61-62`) est stocké depuis l'ingestion de la
 * mémoire marché et LU PAR AUCUN service applicatif — `MarketMemoryService`
 * construit sa `MarketMemoryCoverage` sans lui, délibérément (vérifié le
 * 07/09/2026). Rien dans `apps/web` ne le lit non plus, à ce jour.
 *
 * C'est exactement la situation où un score fini par se brancher un jour, par
 * quelqu'un de bonne foi qui trouve dommage de ne pas exploiter une colonne
 * déjà remplie — sur le VOLUME BRUT, sans la normalisation par cohorte que la
 * doctrine exige (`MARKET_MEMORY_SCORING_ENABLED`, `@bellum/contracts`,
 * #1640.6, toujours `false`). Une PME de 20 personnes et un groupe du CAC 40
 * n'ont pas la même échelle d'externalisation possible : un score brut
 * comparerait leur TAILLE, pas leur comportement d'achat.
 *
 * Cette garde ne calcule rien et n'empêche pas le calcul — elle empêche le
 * RENDU d'apparaître à plus d'un endroit, et cet endroit unique est celui que
 * l'équipe calibre en connaissance de cause (`AccountMarketMemoryCard.tsx`,
 * la carte du dossier de compte, #1640.3 — qui ne lit AUJOURD'HUI que
 * `paths_observed`/`esn_observed`, jamais le score).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE DU TÉMOIN VOISIN
 * ─────────────────────────────────────────────────────────────────────────────
 * `sector_prior_externalization_score` (DataForge,
 * `apps/api/src/database/entities/dataforge-account-domain.entity.ts:55`) est
 * un champ TOTALEMENT différent — un prior de secteur, pas une observation de
 * marché — qui se trouve CONTENIR `externalization_score` comme sous-chaîne.
 * Un détecteur en `.includes()` l'attraperait à tort. Le détecteur ci-dessous
 * tokenise en IDENTIFIANTS complets (`[A-Za-z_][A-Za-z0-9_]*`) et compare une
 * égalité EXACTE — `sectorPriorExternalizationScore` et
 * `sector_prior_externalization_score` restent des identifiants entiers,
 * distincts de ceux qu'elle surveille.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')

/**
 * Le drapeau est lu comme SOURCE, pas importé comme module : `@bellum/contracts`
 * n'expose qu'un unique point d'entrée (`package.json` → `exports["."]`), et un
 * fichier de schéma neuf n'est réexporté par le barrel qu'à sa propre revue —
 * hors du périmètre de cette garde. C'est le même choix que `CONTRACTS_SCHEMAS`
 * dans `no-vendor-names-in-app.test.ts` : lire le texte du fichier plutôt que de
 * dépendre d'un export qui n'existe pas encore.
 */
const SCORING_FLAG_FILE = join(
  WEB_SRC,
  '..',
  '..',
  '..',
  'packages',
  'contracts',
  'src',
  'schemas',
  'market-memory-scoring.ts',
)

/** L'unique endroit autorisé à lire le score, s'il se branche un jour. */
const CALIBRATED_LOCATION = join(
  WEB_SRC,
  'features',
  'accounts',
  'view',
  'account-detail',
  'tabs',
  'sections',
  'AccountMarketMemoryCard.tsx',
)

/**
 * Les identifiants qu'un score de mémoire marché peut porter — extensible : un
 * futur score de mémoire marché (autre que l'externalisation) s'ajoute ICI et
 * nulle part ailleurs.
 */
const SCORE_FIELDS = ['externalizationScore', 'externalization_score'] as const

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Tokenise en identifiants COMPLETS — camelCase et snake_case inclus dans un
 * seul token chacun, jamais coupés à une sous-chaîne. C'est ce qui distingue
 * `externalization_score` de `sector_prior_externalization_score` : le second
 * est UN identifiant, pas deux, et ne contient jamais le premier comme token.
 */
function identifiers(source: string): string[] {
  return [...source.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].map(m => m[0])
}

const SCORE_FIELD_SET = new Set<string>(SCORE_FIELDS)

/** Les identifiants du score EXACTEMENT présents dans une source, comme jetons entiers. */
function scoreFieldTokens(source: string): string[] {
  return identifiers(stripComments(source)).filter(id => SCORE_FIELD_SET.has(id))
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Les fichiers, hors endroit calibré, qui lisent au moins un identifiant du
 * score.
 *
 * ⚠️ Pas d'exclusion spéciale pour `src/architecture/` : `sourceFiles()` retire
 * déjà tout `*.test.ts(x)` / `*.spec.ts(x)`, et CETTE garde — comme toutes
 * celles du dossier — n'existe que sous cette forme. Une exclusion par CHEMIN
 * en plus serait du code mort, invérifiable et donc jamais vérifié.
 */
function readersOutsideCalibratedLocation(): string[] {
  const found: string[] = []
  for (const file of sourceFiles(WEB_SRC)) {
    if (file === CALIBRATED_LOCATION) continue
    const hits = scoreFieldTokens(readFileSync(file, 'utf8'))
    if (hits.length > 0) found.push(`${file.slice(file.indexOf('/src'))} → ${hits.join(', ')}`)
  }
  return found
}

describe('GA-257 — la garde LIT vraiment quelque chose', () => {
  it('le corpus balayé n’est pas vide, et l’endroit calibré existe', () => {
    // Un chemin devenu faux rendrait « zéro lecteur » et resterait vert pour
    // toujours — c'est le faux zéro silencieux, pas une preuve.
    const files = sourceFiles(WEB_SRC)
    expect(files.length).toBeGreaterThan(200)
    expect(files).toContain(CALIBRATED_LOCATION)
  })

  it('le drapeau qui tient l’autre moitié du refus existe, et vaut `false`', () => {
    // #1640.6 — sans lui, rien ne dirait POURQUOI le score reste à un seul
    // endroit ; c'est le même refus, tenu à deux endroits complémentaires.
    expect(existsSync(SCORING_FLAG_FILE), `drapeau introuvable : ${SCORING_FLAG_FILE}`).toBe(true)
    const flagSource = stripComments(readFileSync(SCORING_FLAG_FILE, 'utf8'))
    expect(flagSource).toMatch(/export const MARKET_MEMORY_SCORING_ENABLED\s*=\s*false\b/)
  })
})

describe('GA-257 — le détecteur sait dire NON', () => {
  it('voit une lecture du score, en camelCase comme en snake_case', () => {
    expect(scoreFieldTokens('const s = signal.externalizationScore')).toEqual(['externalizationScore'])
    expect(scoreFieldTokens("row['externalization_score']")).toEqual(['externalization_score'])
    expect(scoreFieldTokens('{formatDecimal(data.externalizationScore)}')).toEqual(['externalizationScore'])
  })

  it('ne prend pas un commentaire pour du code', () => {
    expect(scoreFieldTokens('/* on ne lit jamais externalizationScore ici */')).toEqual([])
    expect(scoreFieldTokens('// externalization_score reste à false')).toEqual([])
  })

  it('n’attrape PAS le témoin voisin — `sector_prior_externalization_score` de DataForge', () => {
    // La forme qui désarmerait un détecteur en `.includes()` : le champ de
    // DataForge CONTIENT la sous-chaîne du champ surveillé, mais n'est pas le
    // même identifiant.
    expect(scoreFieldTokens('const s = row.sectorPriorExternalizationScore')).toEqual([])
    expect(scoreFieldTokens("row['sector_prior_externalization_score']")).toEqual([])
    expect(scoreFieldTokens('domain__sector_prior_externalization_score')).toEqual([])
  })

  it('voit les deux, distinctement, sur la même ligne', () => {
    expect(
      scoreFieldTokens('const a = signal.externalizationScore; const b = row.sectorPriorExternalizationScore'),
    ).toEqual(['externalizationScore'])
  })
})

describe('GA-257 — aucun écran hors de l’endroit calibré ne lit le score', () => {
  it('AccountMarketMemoryCard.tsx (l’endroit calibré) ne le lit pas non plus, aujourd’hui', () => {
    // Le point du docblock : « calibré » ne veut pas dire « déjà branché ».
    // Tant que `MARKET_MEMORY_SCORING_ENABLED` est `false`, l'endroit autorisé
    // reste lui aussi silencieux — c'est ce que #1640.3 livre.
    expect(scoreFieldTokens(readFileSync(CALIBRATED_LOCATION, 'utf8'))).toEqual([])
  })

  it('aucun autre fichier ne lit `externalizationScore` ou `externalization_score`', () => {
    const offenders = readersOutsideCalibratedLocation()
    if (offenders.length > 0) {
      throw new Error(
        `Un score de mémoire marché est lu hors de son unique endroit calibré :\n  ${offenders.join('\n  ')}\n` +
          `Seul ${CALIBRATED_LOCATION.slice(CALIBRATED_LOCATION.indexOf('/src'))} a le droit de le lire — ` +
          `et seulement une fois MARKET_MEMORY_SCORING_ENABLED passé à true (#1640.6), après normalisation ` +
          `par cohorte. Un score n'est de toute façon jamais affiché nu (doctrine, c26_probabilite) : ses axes ` +
          `doivent être nommés.`,
      )
    }
    expect(offenders).toEqual([])
  })
})
