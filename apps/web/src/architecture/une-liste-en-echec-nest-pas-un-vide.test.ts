/**
 * #3666.k — une requête EN ÉCHEC n'est pas un VIDE.
 *
 * Une liste dont la lecture a échoué et qui affiche « Aucun … » rassure à tort :
 * la personne conclut « rien à faire » là où il fallait « réessaie ». Les listes
 * principales (Comptes, Contacts, Découvrir) le tenaient déjà ; ce balayage a
 * trouvé la FAMILLE (historique, exécutions, séquences, affaires, catalogues…).
 *
 * LA GARDE LIT `features/**` : un composant qui lit une requête (`data` +
 * `isLoading|isPending`), rend une liste (`.map(`) avec un état vide, et ne
 * mentionne JAMAIS l'erreur, est un coupable — SAUF s'il est nommé dans
 * `RENDERS_NOTHING_ON_FAILURE` avec sa raison. Cette liste ne peut que
 * rétrécir : une entrée devenue propre fait échouer le test.
 *
 * LES TROIS PREUVES : elle sait dire NON (un coupable planté est NOMMÉ), elle
 * LIT (le balayage voit des dizaines de fichiers) et elle n'attrape pas ce
 * qu'elle ne vise pas (un composant qui traite `isError` passe).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
const FEATURES = join(SRC, 'features')

/** Rendent `null` / une ligne absente sur échec : une absence ne fait AUCUNE ligne, ou ce n'est pas une liste. */
const RENDERS_NOTHING_ON_FAILURE: Readonly<Record<string, string>> = {
  'features/profile-context/components/ImpactedAccountsBanner.tsx': 'bandeau : rend null sans donnée',
  'features/commercial-audit/components/AuditMarketMemory.tsx': 'carte : rend null sans donnée',
  'features/consultants/view/TalentDeleteDialog.tsx': 'dialogue de suppression, pas une liste',
  'features/consultants/view/NeedsMatchRail.tsx': 'rail : rend null sans donnée',
  'features/outreach/view/DelegationBlock.tsx': 'bloc secondaire, l’état de la boîte est lu à part',
  'features/chat/view/AttachmentPreviewDialog.tsx': 'aperçu d’une pièce, pas une liste',
  'features/contacts/view/contact-detail/components/ContactLifecycleTimeline.tsx':
    'chronologie : rend null sans donnée',
  'features/pilotage/view/InterestPenetrabilityPortfolioPanel.tsx': 'carte : rend null sans donnée',
  'features/missions/view/MissionBusinessUnitLine.tsx': 'ligne unique, pas une liste',
  'features/chains/view/ChainProgressBlock.tsx': 'bloc : rend null sans donnée',
  'features/onboarding/components/FirstSelectionCard.tsx': 'carte : rend null sans suggestion',
}

const QUERY_DESTRUCTURE = /const\s*\{([^}]*)\}\s*=\s*(use[A-Z]\w*)\(/g

/** Vrai quand la source lit une requête, rend une liste avec état vide, et ignore l'erreur. */
function ignoresQueryFailure(source: string): boolean {
  if (/isError|\berror\b|loadError|isFetchError|QueryLoadError/.test(source)) return false
  if (!source.includes('.map(') || !/length === 0|empty|Empty/.test(source)) return false
  for (const match of source.matchAll(QUERY_DESTRUCTURE)) {
    const names = match[1] ?? ''
    if (/\bdata\b/.test(names) && /isLoading|isPending|isFetching/.test(names)) return true
  }
  return false
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (path.endsWith('.tsx') && !/\.(test|stories)\./.test(path)) out.push(path)
  }
  return out
}

/** Les fichiers fautifs d'un ensemble `chemin → source`, hors exceptions nommées. */
function unnamedCulpritsOf(sources: Readonly<Record<string, string>>): string[] {
  return Object.keys(sources)
    .filter(file => ignoresQueryFailure(sources[file] ?? '') && !(file in RENDERS_NOTHING_ON_FAILURE))
    .sort()
}

function allSources(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of walk(FEATURES)) out[relative(SRC, file).split('\\').join('/')] = readFileSync(file, 'utf8')
  return out
}

describe('#3666.k — une liste en échec n’est pas un vide', () => {
  it('LIT quelque chose : le balayage voit les écrans de features', () => {
    expect(walk(FEATURES).length).toBeGreaterThan(200)
  })

  it('aucune liste ne rend son « Aucun … » sur une requête en échec (hors liste nommée avec sa raison)', () => {
    const unnamed = unnamedCulpritsOf(allSources())
    expect(unnamed, `Écrans qui affichent un vide sur une lecture en échec : ${unnamed.join(', ')}`).toEqual([])
  })

  it('la liste des exceptions ne peut que rétrécir : une entrée devenue propre est retirée', () => {
    const sources = allSources()
    const current = new Set(Object.keys(sources).filter(file => ignoresQueryFailure(sources[file] ?? '')))
    const stale = Object.keys(RENDERS_NOTHING_ON_FAILURE).filter(file => !current.has(file))
    expect(
      stale,
      `Entrées à retirer (le fichier traite désormais l’erreur ou n’existe plus) : ${stale.join(', ')}`,
    ).toEqual([])
  })

  it('SAIT DIRE NON : un coupable planté est reconnu — et un écran qui traite l’erreur passe', () => {
    const culprit = `
      export function Planted() {
        const { data: rows, isLoading } = useThings()
        if (isLoading) return null
        if (rows.length === 0) return <p>Aucun élément</p>
        return rows.map(r => <li key={r.id}>{r.name}</li>)
      }`
    expect(ignoresQueryFailure(culprit)).toBe(true)
    expect(ignoresQueryFailure(culprit.replace('isLoading }', 'isLoading, isError }'))).toBe(false)
    expect(ignoresQueryFailure(culprit.replace('rows.length === 0', 'false').replace('Aucun', 'x'))).toBe(false)
  })

  it('NOMME le coupable : un écran planté dans l’ensemble lu est rendu par son chemin', () => {
    const planted = `const { data: rows, isLoading } = useThings()
      if (rows.length === 0) return <p>Aucun</p>
      return rows.map(r => r)`
    expect(unnamedCulpritsOf({ 'features/planted/view/PlantedList.tsx': planted })).toEqual([
      'features/planted/view/PlantedList.tsx',
    ])
  })
})
