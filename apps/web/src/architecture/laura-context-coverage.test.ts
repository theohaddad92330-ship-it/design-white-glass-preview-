import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allNavRoutes } from '@/components/navigation/sections'

/**
 * #1904.14 — CHAQUE ÉCRAN DE LA NAVIGATION DIT CE QU'IL MONTRE À LAURA, OU DIT POURQUOI PAS.
 *
 * Le constat : cinq écrans sur trente-neuf déclaraient leur contexte. Les autres
 * laissaient Laura répondre « je ne sais pas ce qui est ouvert » — vrai, et
 * inutile. Déclarer trente-quatre écrans d'un coup n'est pas un lot ; ce qui
 * l'est, c'est que la question ait une réponse ÉCRITE pour chacun, et que le
 * nombre d'écrans muets ne puisse que baisser.
 *
 * Trois états, comme la parité démo (`demo-coverage.ts`) :
 *  - `declared` : le fichier qui APPELLE `useLauraContext`, et l'écran qui le
 *    monte quand ce n'est pas le même fichier ;
 *  - `byDesign` : muet à dessein, avec sa raison ;
 *  - `pending`  : pas encore déclaré — compté par un cliquet.
 *
 * ⚠️ Ne jamais passer un écran en `byDesign` pour faire baisser le cliquet.
 *
 * Les trois preuves d'une garde :
 *  - elle LIT : la navigation réelle (`allNavRoutes`) et les fichiers sur disque ;
 *  - elle sait dire NON : un fichier sans appel est refusé ;
 *  - elle n'attrape pas le voisin : `page-context-store.ts` CITE l'appel dans un
 *    commentaire et DÉCLARE la fonction, sans jamais l'appeler.
 */

type Coverage =
  | { state: 'declared'; caller: string; mountedBy?: string }
  | { state: 'byDesign'; reason: string }
  | { state: 'pending' }

const PENDING: Coverage = { state: 'pending' }

const COVERAGE: Record<string, Coverage> = {
  '/briefing': { state: 'declared', caller: 'features/briefing/view/BriefingPage.tsx' },
  '/mailbox': PENDING,
  '/accounts': PENDING,
  '/contacts': PENDING,
  // #2155.13 — « Mes cibles » naît déclarée.
  // Théo A signaux (R22) — `/mes-cibles` est devenue `/signals` (la bibliothèque d'informations par compte).
  '/signals': { state: 'declared', caller: 'features/signals-library/view/SignalsLibraryPage.tsx' },
  // Théo B c2-mes-listes — « Contacts › Mes listes » naît déclarée.
  '/contacts/lists': { state: 'declared', caller: 'features/target-lists/view/ContactListsPage.tsx' },
  // #4492.3 (PR 12C) — « Contacts › Imports & sources », sous-entrée V22 : contexte pas encore déclaré.
  '/contacts/imports': PENDING,
  // Théo B r2-mes-analyses — « Mes analyses » naît déclarée.
  '/search/history': { state: 'declared', caller: 'features/analysis-history/view/AnalysisHistoryPage.tsx' },
  '/discover': PENDING,
  // #2151.60 — `/watchlist` a QUITTÉ ce registre : elle redirige vers
  // `/mes-cibles` et ne rend plus rien, comme `/favorites` qui n'y a jamais
  // figuré. Ce n'est pas un écran déclaré en douce pour faire baisser le
  // cliquet — c'est un écran qui n'existe plus. ⚠️ Ce qui reste dû : le
  // contexte déclaré par « Mes cibles » (`TargetListsContent`) nomme ses listes
  // et ses éléments à vérifier, pas encore ses signaux. La Veille ne déclarait
  // rien non plus : rien n'est perdu, rien n'est encore gagné.
  '/accounts/partners': PENDING,
  // Louis 14/10/2026 (refonte Pilotage, L0a) — « Marché » est de nouveau un
  // ÉCRAN, onglet de Comptes (`/accounts/marches`, muet pour l'instant).
  // `/pilotage/memoire-collective`, `/pilotage/marche`, `/pilotage/qualite` et
  // `/pilotage/energie` ont QUITTÉ ce registre : ces routes redirigent et ne
  // rendent plus rien (même raisonnement que `/watchlist`). Ce n'est pas un
  // écran déclaré en douce pour faire baisser le cliquet — ils n'existent plus.
  '/accounts/marches': PENDING,
  '/projects': { state: 'declared', caller: 'features/projects/view/ProjectsPage.tsx' },
  '/projects/needs': PENDING,
  // Décision Louis du 19/10/2026 — `/projects/pistes` (#4340), `/rfp` (#4341) et
  // `/consultants/submissions` (#4349) ont QUITTÉ ce registre : ces routes
  // redirigent et ne rendent plus rien (même raisonnement que `/watchlist`). Leur
  // contenu est monté par Signaux, le pipe et le Vivier, qui déclarent déjà.
  '/consultants': { state: 'declared', caller: 'features/consultants/view/ConsultantsPage.tsx' },
  // La liste des missions ne déclare que dans sa lentille « prête à facturer »
  // (le panneau y est monté) : les autres lentilles restent muettes.
  '/missions': PENDING,
  '/missions/nouvelle': PENDING,
  '/missions/planification': PENDING,
  '/missions/cra': PENDING,
  // #4491.2 (PR 12C) — onglet V22 « Factures » : écran servi, contexte pas encore déclaré.
  '/missions/factures': PENDING,
  '/missions/adv': PENDING,
  '/missions/notes-de-frais': { state: 'declared', caller: 'features/expenses/view/ExpenseReportsPage.tsx' },
  '/missions/facturation': {
    state: 'declared',
    caller: 'features/missions/view/InvoiceReadinessPanel.tsx',
    mountedBy: 'features/missions/view/InvoicingPage.tsx',
  },
  '/missions/encaissements': PENDING,
  '/missions/finance': PENDING,
  '/missions/paiements': PENDING,
  '/pilotage/rex': PENDING,
  '/missions/suivi': PENDING,
  '/actions': PENDING,
  '/actions/sequences': { state: 'declared', caller: 'features/outreach/view/SequencesPage.tsx' },
  '/actions/automatisations': { state: 'declared', caller: 'features/automations/view/AutomationsPage.tsx' },
  '/chat': {
    state: 'byDesign',
    reason:
      'La conversation EST l’écran : Laura y a déjà le fil, le compte actif et la portée. Déclarer « tu es dans ' +
      'la conversation » n’apprendrait rien au modèle, et le prompt de /chat doit rester byte-identique.',
  },
  '/pilotage': {
    state: 'declared',
    caller: 'features/pilotage/view/CockpitBody.tsx',
    mountedBy: 'features/pilotage/view/PilotagePage.tsx',
  },
  '/pilotage/pipe': { state: 'declared', caller: 'features/pilotage/pipe/PipeScreen.tsx' },
  '/pilotage/finance': PENDING,
  '/pilotage/staffing': { state: 'declared', caller: 'features/pilotage/staffing/StaffingScreen.tsx' },
  '/team': PENDING,
  // Théo D (22/10/2026) — Équipe › Recherches, Activité & échanges : chaque écran déclare son utilité à Laura.
  '/team/recherches': { state: 'declared', caller: 'features/team-research/view/TeamResearchView.tsx' },
  '/team/activite': { state: 'declared', caller: 'features/team-activity/view/TeamActivityView.tsx' },
  '/team/admin': { state: 'declared', caller: 'features/team-admin/view/TeamAdminView.tsx' },
  '/settings': PENDING,
}

/**
 * LE CLIQUET — trente-deux écrans muets au 13/09/2026 (39 de navigation, 6
 * déclarés, 1 muet à dessein). Il ne remonte jamais : déclarer un écran le
 * fait baisser, et ce test oblige alors à baisser ce nombre avec lui.
 *
 * 31 depuis #2151.60 (16/09/2026) : `/watchlist` ne rend plus d'écran.
 * 28 depuis la refonte Pilotage (14/10/2026) : quatre écrans supprimés, un onglet Marché ajouté.
 * 26 depuis le 19/10/2026 (#4341, #4349) : `/rfp` et `/consultants/submissions` redirigent.
 * 23 depuis le 20/10/2026 (#4359, intégration PR n°2b) : trois écrans muets retirés avec leurs anciennes adresses.
 * 22 depuis le 22/10/2026 (Théo C missions-notes-de-frais.N2) : « Notes de frais » déclare son contexte ; `/expenses` redirige.
 * 21 depuis le 22/10/2026 (intégration PR11 : 22 + Théo A today-jour.A8) : `/dashboard` retiré, redirigé vers `/briefing`.
 * 23 depuis le 24/10/2026 (#4491.2, PR 12C) : ce n'est PAS un écran redevenu muet — deux écrans déjà servis ENTRENT
 * dans la navigation (onglets V22) sans avoir jamais déclaré leur contexte : `/contacts/imports` et
 * `/missions/factures`. Leur déclaration est dans leur écran (hors du lot NAV) : à redescendre à 21 avec elle.
 */
const PENDING_CEILING = 23

const WEB_SRC = resolve(__dirname, '..')

/** Retire les commentaires — un appel CITÉ dans un docblock n'est pas un appel. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

/** Le fichier APPELLE-t-il `useLauraContext` ? (sa déclaration ne compte pas) */
function callsUseLauraContext(source: string): boolean {
  const code = stripComments(source).replace(/function\s+useLauraContext\(/g, '')
  return /\buseLauraContext\(/.test(code)
}

function read(relative: string): string {
  const path = resolve(WEB_SRC, relative)
  expect(existsSync(path), `fichier introuvable : ${relative}`).toBe(true)
  return readFileSync(path, 'utf8')
}

/** `/accounts/` et `/accounts` sont le même écran ; le routeur écrit les deux. */
function normalise(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/**
 * Les écrans que la SPA SERT vraiment, lus dans le fichier généré du routeur.
 *
 * #2151.1 (16/09/2026) — ce lecteur remplace `allNavRoutes()` du côté « aucun
 * écran qu'elle n'a plus ». La garde comparait les deux sens à la NAVIGATION ;
 * le jour où « Veille » et « Partenaires » ont quitté les onglets de Comptes,
 * elle a réclamé qu'on DÉCLASSE deux écrans toujours servis, toujours
 * atteignables (depuis /discover, depuis un onglet de fiche compte) et où
 * l'utilisateur peut donc toujours se trouver — alors que la question « que
 * montre cet écran à Laura ? » y reste exactement aussi valable qu'avant.
 *
 * Le sens fort de la règle ne bouge pas : tout écran de la navigation DOIT être
 * classé. Le sens retour, lui, garde ce qu'il gardait vraiment — une entrée qui
 * ne désigne plus aucun écran — en le mesurant sur la bonne source.
 */
function servedRoutes(): Set<string> {
  const source = readFileSync(resolve(WEB_SRC, 'routeTree.gen.ts'), 'utf8')
  const start = source.indexOf('export interface FileRoutesByFullPath {')
  expect(start, 'FileRoutesByFullPath introuvable dans routeTree.gen.ts').toBeGreaterThan(-1)
  const block = source.slice(start, source.indexOf('}', start))
  return new Set([...block.matchAll(/^\s*'([^']+)':/gm)].map(match => normalise(match[1] as string)))
}

describe('#1904.14 — chaque écran de la navigation a une réponse écrite pour son contexte Laura', () => {
  it('LIT la navigation réelle ET les écrans réellement servis', () => {
    // 26 depuis #4197 (L6) : Missions passe de treize onglets à trois.
    // 21 depuis le 19/10 (#4340/#4341/#4344/#4349 : Affaires et Talents sans onglet ; #4351.1 ; #4357).
    // 15 depuis le 22/10 (Théo D : Pilotage n'a plus d'onglets, ses sections sont des ancres).
    expect(allNavRoutes().length).toBeGreaterThan(15)
    expect(servedRoutes().size).toBeGreaterThan(40)
  })

  it('classe CHAQUE écran de la navigation, et aucun écran que la SPA ne sert plus', () => {
    const nav = new Set(allNavRoutes())
    const served = servedRoutes()
    const classified = new Set(Object.keys(COVERAGE))
    expect(
      [...nav].filter(route => !classified.has(route)),
      'écran sans réponse écrite',
    ).toEqual([])
    expect(
      [...classified].filter(route => !served.has(route)),
      'écran classé que la SPA ne sert plus',
    ).toEqual([])
  })

  it('sait dire NON : une entrée qui ne désigne aucun écran servi est refusée', () => {
    expect(servedRoutes().has('/veille-des-marches')).toBe(false)
  })

  it('un écran « déclaré » APPELLE vraiment `useLauraContext` — et l’écran monte bien le fichier qui l’appelle', () => {
    for (const [route, coverage] of Object.entries(COVERAGE)) {
      if (coverage.state !== 'declared') continue
      expect(callsUseLauraContext(read(coverage.caller)), `${route} : ${coverage.caller} n’appelle pas`).toBe(true)
      if (coverage.mountedBy) {
        const component = basename(coverage.caller).replace(/\.tsx?$/, '')
        const mounts = new RegExp(`<${component}\\b`).test(stripComments(read(coverage.mountedBy)))
        expect(mounts, `${route} : ${coverage.mountedBy} ne monte pas <${component}>`).toBe(true)
      }
    }
  })

  it('un écran muet à dessein porte sa raison', () => {
    for (const [route, coverage] of Object.entries(COVERAGE)) {
      if (coverage.state === 'byDesign') expect(coverage.reason.trim().length, route).toBeGreaterThan(40)
    }
  })

  it('le nombre d’écrans muets ne remonte jamais — et redescend avec chaque écran déclaré', () => {
    const pending = Object.values(COVERAGE).filter(coverage => coverage.state === 'pending').length
    expect(pending, 'un écran est redevenu muet').toBeLessThanOrEqual(PENDING_CEILING)
    expect(pending, `un écran a été déclaré : baisse PENDING_CEILING à ${pending}`).toBe(PENDING_CEILING)
  })

  it('sait dire NON : un fichier qui n’appelle pas est refusé', () => {
    expect(callsUseLauraContext('export function Page() { return null }')).toBe(false)
    expect(callsUseLauraContext("useLauraContext({ kind: 'screen' })")).toBe(true)
  })

  it('n’attrape pas le voisin : un appel CITÉ en commentaire, ou la fonction déclarée, ne comptent pas', () => {
    // Le magasin cite `useLauraContext({ kind: 'account', … })` dans un docblock et
    // déclare la fonction : il ne DÉCLARE aucun écran.
    expect(callsUseLauraContext(read('features/laura/bubble/page-context-store.ts'))).toBe(false)
    expect(callsUseLauraContext("// useLauraContext({ kind: 'screen' })")).toBe(false)
  })
})
