/**
 * Lot 783 (#5205) — le PLAN du script unique opérateur `import:tout` (le CLI : `import-tout.ts`). Pur : la recherche
 * de fichiers et l'exécution d'une étape sont injectées, ce qui se teste sans disque ni base.
 *
 * Ordre (issue #5205) : le pack v2.1, puis les importeurs existants dont les lecteurs actuels dépendent — pack v1
 * (remplit `market_person_paths`), comptes ORION (10), besoins ORION (24 puis 25), chunks ORION (50) — puis la
 * couverture. Arrêt à la PREMIÈRE étape en échec : la suite ne part pas.
 *
 * `--dry-run` descend aux deux importeurs qui ont un mode à blanc (`ingest:market-v2`, `ingest:market-memory`) ; les
 * importeurs ORION n'en ont pas, ils ne sont donc PAS lancés à blanc (leur fichier est seulement trouvé), et la
 * couverture, qui lit la base, non plus.
 *
 * Lot 791 : `market-paths-v2` dérive `market_person_paths` du dataset `positions` que `market-v2` vient de charger. Elle
 * lit la base (le pack n'y est pas encore en `--dry-run`) : à blanc elle n'est donc pas lancée ; son propre
 * `ingest:market-paths-v2 --dry-run` se lance à la main une fois `market-v2` chargé.
 *
 * Lot 793 : `common-account-links` construit le référentiel pivot (BM-A ↔ DF ↔ groupe ↔ clés normalisées) depuis
 * `accounts` / `account_aliases` du pack et `dataforge_accounts`. Elle lit la base : à blanc, non lancée par la chaîne
 * (son `ingest:common-account-links --dry-run` se lance à la main une fois `market-v2` chargé).
 *
 * Le pack v1 n'est rejoué QUE s'il porte `05_freelances.csv` (les parcours) : le zip « bellum-data-freelances-2022 »
 * du Drive ne l'a pas (son 05 est `05_catalogue_competences.csv`) et ses entreprises sont importées depuis le 06/09.
 * Sans ce fichier, l'étape est SAUTÉE et le rapport le dit — elle n'arrête plus toute la chaîne. Les parcours sont
 * aussi dans le pack v2.1 (`positions`), importé en premier.
 */

interface ImportToutArgs {
  v2: string
  v1: string
  orion: string
  dryRun: boolean
}

export type ImportToutStep =
  | { name: string; kind: 'script'; script: string; args: string[]; dryRunCapable: boolean }
  | { name: 'couverture'; kind: 'coverage' }

type StepStatus = 'ok' | 'failed' | 'not-run' | 'dry-run-skipped'

interface StepReport {
  name: string
  status: StepStatus
  summary: string[]
}

const USAGE =
  'Usage: import-tout <dossier BELLUM_MARKET_MEMORY_v2> <dossier bellum-data-freelances-2022> <dossier ORION_DATAPACK_V12> [--dry-run]'

export function parseImportToutArgs(argv: string[]): ImportToutArgs | { error: string } {
  const paths = argv.filter(a => !a.startsWith('--'))
  const [v2, v1, orion] = paths
  if (paths.length !== 3 || !v2 || !v1 || !orion) return { error: USAGE }
  return { v2, v1, orion, dryRun: argv.includes('--dry-run') }
}

/** Les fichiers ORION V12 attendus, par préfixe de nom (le 25 s'appelle `25_PIPELINE_CRM_CREME_DE_LA_CREME.csv`). */
const ORION_PREFIXES = ['10_COMPTES_MASTER', '24_MISSIONS_BESOINS', '25_PIPELINE_CRM', '50_CHUNKS_INDEXABLES'] as const

export function planImportTout(
  args: ImportToutArgs,
  findFile: (dir: string, prefix: string) => string | null,
): { steps: ImportToutStep[]; notes: string[] } | { error: string } {
  const orion: Record<string, string> = {}
  const missing: string[] = []
  for (const prefix of ORION_PREFIXES) {
    const found = findFile(args.orion, prefix)
    if (found) orion[prefix] = found
    else missing.push(`${prefix}*.csv`)
  }
  if (missing.length > 0) {
    return { error: `Dossier ORION ${args.orion} : introuvable(s) ${missing.join(', ')} — aucune étape lancée.` }
  }
  const notes: string[] = []
  const v1HasPaths = findFile(args.v1, '05_freelances') !== null
  if (!v1HasPaths) {
    notes.push(
      `market-memory (v1) SAUTÉE : 05_freelances.csv absent de ${args.v1} (parcours v1 indisponibles ; ceux du pack v2.1 sont importés).`,
    )
  }
  const dry = args.dryRun ? ['--dry-run'] : []
  const script = (name: string, scriptName: string, scriptArgs: string[], dryRunCapable: boolean): ImportToutStep => ({
    name,
    kind: 'script',
    script: scriptName,
    args: dryRunCapable ? [...scriptArgs, ...dry] : scriptArgs,
    dryRunCapable,
  })
  return {
    steps: [
      script('market-v2', 'ingest:market-v2', [args.v2], true),
      script('market-paths-v2', 'ingest:market-paths-v2', [], false),
      script('common-account-links', 'ingest:common-account-links', [], false),
      ...(v1HasPaths ? [script('market-memory (v1)', 'ingest:market-memory', [args.v1], true)] : []),
      script('orion-accounts', 'ingest:orion-accounts', [orion['10_COMPTES_MASTER'] as string], false),
      script(
        'orion-needs 24',
        'ingest:orion-needs',
        ['24_MISSIONS_BESOINS', orion['24_MISSIONS_BESOINS'] as string],
        false,
      ),
      script('orion-needs 25', 'ingest:orion-needs', ['25_PIPELINE_CRM', orion['25_PIPELINE_CRM'] as string], false),
      script('orion-rag-chunks', 'ingest:orion-rag-chunks', [orion['50_CHUNKS_INDEXABLES'] as string], false),
      { name: 'couverture', kind: 'coverage' },
    ],
    notes,
  }
}

export async function runImportTout(
  steps: ImportToutStep[],
  dryRun: boolean,
  runStep: (step: ImportToutStep) => Promise<{ ok: boolean; summary: string[] }>,
  log: (line: string) => void,
): Promise<{ ok: boolean; report: StepReport[] }> {
  const report: StepReport[] = steps.map(step => ({ name: step.name, status: 'not-run', summary: [] }))
  let ok = true
  for (const [index, step] of steps.entries()) {
    const entry = report[index] as StepReport
    if (dryRun && (step.kind === 'coverage' || !step.dryRunCapable)) {
      entry.status = 'dry-run-skipped'
      log(`— ${step.name} : à blanc, NON lancée (${step.kind === 'coverage' ? 'lit la base' : 'pas de mode à blanc'})`)
      continue
    }
    log(`▶ ${step.name}`)
    const result = await runStep(step)
    entry.summary = result.summary
    if (!result.ok) {
      entry.status = 'failed'
      ok = false
      log(`ARRÊT à l’étape « ${step.name} » — les étapes suivantes ne sont pas lancées.`)
      break
    }
    entry.status = 'ok'
  }
  log('')
  log('Rapport par étape :')
  for (const entry of report) {
    log(`  ${entry.name.padEnd(22)} ${entry.status}`)
    for (const line of entry.summary) log(`      ${line}`)
  }
  return { ok, report }
}
