import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * #2081.14 — UN CSV NE SORT DU NAVIGATEUR QU'À TRAVERS LA RÈGLE D'ESPACE.
 *
 * DÉCISION Louis 19/09/2026 (QCM) — la règle « qui peut exporter » couvre
 * TOUS les exports, y compris les CSV construits DANS LE NAVIGATEUR
 * (Découvrir, le chat, la sélection de contacts, la finance). Ceux-là n'ont
 * pas de route à garder : la décision vient de l'API (`dataExitAllowed`),
 * l'écran la lit par `useDataExit()` et n'offre le bouton que si elle dit oui.
 *
 * Ce que la garde tient :
 *  1. un fichier CSV (un `Blob` `text/csv`) ne se fabrique QUE dans
 *     `lib/export-csv.ts` (`downloadCSV`) — sauf exemption écrite ;
 *  2. `downloadCSV` exige la preuve `DataExitGrant` : sans elle, l'appel ne
 *     compile pas ;
 *  3. cette preuve ne se fabrique QUE dans `lib/data-exit.ts` (`useDataExit`) ;
 *  4. un GÉNÉRATEUR de CSV (un fichier qui importe `toCsv`) est inscrit ici
 *     avec l'écran qui offre son bouton, et cet écran lit `useDataExit()`.
 *     Un nouveau générateur non inscrit fait rougir la garde.
 */

const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const src = join(racineWeb, 'src')

function fichiersSous(dir: string): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir)) {
    if (entree === 'node_modules' || entree === 'dist') continue
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSous(chemin))
    else if (/\.(ts|tsx)$/.test(entree) && !entree.includes('.test.') && entree !== 'setup.ts') sortie.push(chemin)
  }
  return sortie
}

const LA_SORTIE = 'lib/export-csv.ts'
const LA_PREUVE = 'lib/data-exit.ts'

/** Un Blob CSV construit à la main — un fichier qui sort sans passer par `downloadCSV`. */
const BLOB_CSV = /new Blob\([^)]*text\/csv|['"`]text\/csv/

/** Les fichiers CSV qui ne sont PAS une sortie de données de l'espace, avec leur raison. */
const BLOB_EXEMPTES: Readonly<Record<string, string>> = {
  'features/import/view/ImportWizard.tsx':
    'Le MODÈLE d’import : une ligne d’en-têtes, aucune donnée de l’espace — c’est une entrée, pas une sortie.',
  // Même patron qu'`ImportWizard` : une ENTRÉE. `isDeterministicOrgFile` lit le type
  // d'un fichier d'organigramme DÉPOSÉ (`file.type === 'text/csv'`) ; aucun Blob n'est fabriqué.
  'features/accounts/view/account-detail/tabs/organigramme/declare/DeclareOrgPanel.tsx':
    'Lit le type d’un organigramme DÉPOSÉ à l’import — c’est une entrée, aucun CSV n’en sort.',
  'features/settings/lib/portability-api.ts':
    'RGPD, droit d’accès et de portabilité : la personne reçoit SES données — une règle d’espace ne le retire pas.',
}

/** Chaque générateur de CSV → l'écran qui offre son bouton (et doit lire `useDataExit`). */
const GENERATEURS: Readonly<Record<string, string>> = {
  'features/discover/lib/discover-call-list.ts': 'features/discover/view/Discover.tsx',
  'features/discover/lib/discover-export.ts': 'features/discover/view/Discover.tsx',
  'features/chat/view/reply-blocks/FileExportCard.tsx': 'features/chat/view/reply-blocks/FileExportCard.tsx',
  // #2945/#2299.39 — la sélection de comptes classés s'exporte comme un
  // `file_export` : même paire générateur/écran (elle lit `useDataExit()` elle-même).
  'features/chat/view/reply-blocks/AccountRankingCard.tsx': 'features/chat/view/reply-blocks/AccountRankingCard.tsx',
  'features/pilotage/finance/finance-export.ts': 'features/pilotage/view/FinancePanel.tsx',
  // #2662.3 — l'export de la sélection du vivier lit la règle dans
  // `ConsultantsPage.tsx` (`useDataExit()`), pas dans le générateur lui-même :
  // même découpage que `discover-export.ts` / `Discover.tsx`.
  'features/consultants/lib/talentExport.ts': 'features/consultants/view/ConsultantsPage.tsx',
  // #2326.8 (épopée #2794) — un bouton autonome (`AtsExportButton.tsx`), à
  // côté des trois dialogues d'import du vivier : il lit `useDataExit()`
  // lui-même, plutôt que de le recevoir de `ConsultantsPage.tsx`.
  'features/consultants/lib/atsExport.ts': 'features/consultants/view/AtsExportButton.tsx',
  // #4051 — « Télécharger le rapport » de l'assistant de reprise (/settings/import) : le rapport d'import
  // sort des données (libellés du fichier). L'écran lit la règle lui-même (`useDataExit()`), comme le bilan de
  // l'import universel.
  'features/import/view/ImportWizard.tsx': 'features/import/view/ImportWizard.tsx',
  // Théo C missions-dossier.N6 — « Exporter le récapitulatif » du dossier de mission : l'entrée du menu « ⋯ »
  // lit la règle elle-même (`DossierMoreMenu`, `useDataExit()`).
  'features/missions/view/MissionDossierPage.tsx': 'features/missions/view/MissionDossierPage.tsx',
  // Théo D settings-outils.A4 — « Exporter » du journal d'activité : l'écran (`ActivityLogView.tsx`) lit `useDataExit()`
  // lui-même et masque le bouton quand la règle refuse ; il appelle `downloadCSV` avec la preuve.
  'features/team/view/ActivityLogView.tsx': 'features/team/view/ActivityLogView.tsx',
  // Refonte Théo PR12 (c/missions-notes-de-frais) — « Exporter » : le CSV des notes affichées ; l'écran lit la règle lui-même.
  'features/expenses/view/ExpenseReportsPage.tsx': 'features/expenses/view/ExpenseReportsPage.tsx',
  [LA_SORTIE]: 'features/accounts/view/account-detail/tabs/contacts/ContactsSelectionBar.tsx',
  // #2375.8 — l'export checklist de la session de prospection : même règle
  // d'espace que les deux exports Découvrir, lue au même endroit (`Discover.tsx`,
  // `exportSession` → `onExportSession`), pas dans le générateur lui-même.
  'features/prospecting-session/lib/prospecting-session.ts': 'features/discover/view/Discover.tsx',
  // #2157.46 — l'export d'une cible (« Mes cibles ») lit la règle dans
  // `TargetListCard.tsx` (`useDataExit()`), pas dans le générateur.
  'features/target-lists/lib/target-list-export.ts': 'features/target-lists/view/TargetListCard.tsx',
  // #4295.14 — l'export de la liste filtrée des affaires : l'entrée « Exporter » du menu « … » (`PipelineMoreMenu`,
  // #4499) lit la règle ; le générateur (`projects-export.ts`) est inscrit sous l'écran qui l'offre.
  'features/projects/lib/projects-export.ts': 'features/projects/view/PipelineMoreMenu.tsx',
  // Théo D team-activite.N1 — « Exporter cette vue » du journal d'équipe : le bouton lit la règle (`useDataExit()`) dans `ActivityJournal.tsx`.
  'features/team-activity/lib/journal-export.ts': 'features/team-activity/view/ActivityJournal.tsx',
  // #2957 (#2181.46) — la matrice de réponse d'un appel d'offres, exportée depuis son écran.
  'features/rfp/view/RfpWorkspace.tsx': 'features/rfp/view/RfpWorkspace.tsx',
  // Théo C missions-planning.N6 — le planning exporté : le bouton lit lui-même la règle (`useDataExit()`).
  'features/missions/view/PlanningExportButton.tsx': 'features/missions/view/PlanningExportButton.tsx',
  // Refonte Théo comptes-liste — « Exporter les comptes affichés » : le bouton lit lui-même la règle (`useDataExit()`).
  'features/accounts/view/accounts-list/AccountsExportButton.tsx':
    'features/accounts/view/accounts-list/AccountsExportButton.tsx',
  // Théo D pilotage.N4 — « Exporter la synthèse » du Cockpit : le bouton lit lui-même la règle (`useDataExit()`).
  'features/pilotage/view/cockpit/CockpitExportButton.tsx': 'features/pilotage/view/cockpit/CockpitExportButton.tsx',
  // Théo D team-activite — « Exporter cette vue » du journal d'équipe : le fil lit lui-même la règle (`useDataExit()`).
  'features/manager/view/cockpit/RecentActivityFeed.tsx': 'features/manager/view/cockpit/RecentActivityFeed.tsx',
}

const IMPORTE_TO_CSV = /import\s*\{[^}]*\btoCsv\b[^}]*\}\s*from\s*['"]@\/lib\/csv['"]/

function blobsHorsSortie(fichiers: ReadonlyArray<{ rel: string; source: string }>): string[] {
  return fichiers
    .filter(f => f.rel !== LA_SORTIE && !(f.rel in BLOB_EXEMPTES) && BLOB_CSV.test(f.source))
    .map(f => f.rel)
}

function generateursNonInscrits(fichiers: ReadonlyArray<{ rel: string; source: string }>): string[] {
  return fichiers.filter(f => IMPORTE_TO_CSV.test(f.source) && !(f.rel in GENERATEURS)).map(f => f.rel)
}

describe('#2081.14 — un CSV ne sort du navigateur qu’à travers la règle d’espace', () => {
  const fichiers = fichiersSous(src).map(chemin => ({
    rel: chemin.slice(src.length + 1),
    source: readFileSync(chemin, 'utf8'),
  }))
  const lire = (rel: string) => fichiers.find(f => f.rel === rel)?.source ?? ''

  it('a un corpus à lire — une garde qui ne lit rien ne garde rien', () => {
    expect(fichiers.length).toBeGreaterThan(1000)
    expect(fichiers.filter(f => IMPORTE_TO_CSV.test(f.source)).length).toBeGreaterThanOrEqual(4)
    expect(fichiers.filter(f => /\bdownloadCSV\(/.test(f.source)).length).toBeGreaterThanOrEqual(6)
  })

  it('1. un Blob CSV ne se fabrique que dans `downloadCSV`', () => {
    expect(blobsHorsSortie(fichiers)).toEqual([])
  })

  it('2. `downloadCSV` exige la preuve de la règle', () => {
    expect(lire(LA_SORTIE)).toMatch(/export function downloadCSV\([^)]*:\s*DataExitGrant\b/)
  })

  it('3. la preuve ne se fabrique que dans `useDataExit`', () => {
    const fabriques = fichiers.filter(f => /as DataExitGrant\b/.test(f.source)).map(f => f.rel)
    expect(fabriques).toEqual([LA_PREUVE])
  })

  it('4. chaque générateur de CSV est inscrit, et son écran lit la règle', () => {
    expect(generateursNonInscrits(fichiers)).toEqual([])
    const ecransSansRegle = Object.values(GENERATEURS).filter(ecran => !/\buseDataExit\(/.test(lire(ecran)))
    expect(ecransSansRegle).toEqual([])
  })

  it('chaque appelant de `downloadCSV` lit la règle', () => {
    const appelants = fichiers.filter(f => f.rel !== LA_SORTIE && /\bdownloadCSV\(/.test(f.source))
    expect(appelants.filter(f => !/\buseDataExit\(/.test(f.source)).map(f => f.rel)).toEqual([])
  })

  it('chaque exemption vise un fichier qui existe encore', () => {
    const rels = new Set(fichiers.map(f => f.rel))
    expect([...Object.keys(BLOB_EXEMPTES), ...Object.keys(GENERATEURS)].filter(rel => !rels.has(rel))).toEqual([])
  })

  it('sait dire NON — un nouveau générateur, un Blob CSV fait à la main', () => {
    const nouveau = {
      rel: 'features/x/lib/x-export.ts',
      source: "import { toCsv } from '@/lib/csv'\nexport const x = toCsv([])",
    }
    expect(generateursNonInscrits([nouveau])).toEqual(['features/x/lib/x-export.ts'])

    const main = {
      rel: 'features/x/view/X.tsx',
      source: "const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))",
    }
    expect(blobsHorsSortie([main])).toEqual(['features/x/view/X.tsx'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — un import de CSV, un parseur', () => {
    const lecture = {
      rel: 'features/y/view/Y.tsx',
      source: '<input accept=".csv,text/plain" />\nimport { parseContactsCsv } from \'../lib/parseContactsCsv\'',
    }
    expect(blobsHorsSortie([lecture])).toEqual([])
    expect(generateursNonInscrits([lecture])).toEqual([])
  })
})
