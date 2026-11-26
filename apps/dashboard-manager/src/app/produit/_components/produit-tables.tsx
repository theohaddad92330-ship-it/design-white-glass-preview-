'use client'

import type {
  RapportDemande,
  RapportEcrans,
  RapportFriction,
  RapportParcours,
  RapportSectionsDossier,
} from '@/lib/product-analytics'
import { DataTable, type DataTableColumn } from '@/ui'
import type { LigneCroisement } from '../usage-demand-crossing.logic'
import { libelleQuadrant } from '../usage-demand-crossing.logic'
import { destinationPrincipale } from '../journey-summary.logic'
import { formaterDureeMediane, formaterTaux, libelleEtat, etatDe } from '../product-instrumentation.logic'
import { libelleVerdict, type VerdictEcran } from '../screen-verdict.logic'

/**
 * #1642.2 — LES TABLEAUX DE `/produit`, SUR `DataTable`.
 *
 * `DataTable` est un Client Component : ses colonnes portent des fonctions
 * (`render`/`sortValue`), et une fonction ne traverse pas la frontière RSC
 * serveur → client (voir le docblock de tête de `src/ui/DataTable.tsx`). Ce
 * fichier est donc la frontière — `page.tsx` (Server Component, async) lui
 * passe des LIGNES déjà calculées, jamais une fonction, exactement le patron
 * de `app/users/_components/users-table.tsx`.
 *
 * Aucune colonne existante ne disparaît : ce lot ajoute un `Verdict` à côté
 * des chiffres (#1683.1), une `Destination principale` et une `Fermeture
 * pure` à côté du compte de sorties (#1684.1), et un tableau neuf pour le
 * croisement usage × demande (#1688.4). Le tri (chrome de `DataTable`) est un
 * ajout gratuit, jamais une exigence de l'issue.
 */

// ─────────────────────────────────────────────────────────────────────────────
// #1683.1 — Utilisation par écran, verdict inclus
// ─────────────────────────────────────────────────────────────────────────────

type EcranLigne = RapportEcrans['screens'][number] & { verdict: VerdictEcran }

/** Une couleur de TOKEN par verdict — jamais un hexadécimal, jamais une classe
 *  de palette Tailwind (ce dépôt n'en a pas, mais la règle est celle du
 *  monorepo) : les mêmes variables que le reste de cette page. */
function tokenDuVerdict(kind: VerdictEcran['kind']): string {
  switch (kind) {
    case 'travaille':
      return 'var(--green)'
    case 'consulte':
      return 'var(--text)'
    case 'survole':
    case 'trop_recent':
    case 'observations_insuffisantes':
      return 'var(--amber)'
    case 'jamais_ouvert':
    case 'non_mesure':
      return 'var(--muted)'
  }
}

export function EcransTable({ lignes }: { lignes: readonly EcranLigne[] }) {
  const colonnes: DataTableColumn<EcranLigne>[] = [
    { key: 'ecran', header: 'Écran', sortValue: row => row.label.fr, render: row => row.label.fr },
    {
      key: 'nature',
      header: 'Nature',
      sortValue: row => row.nature,
      render: row => <span className="muted">{row.nature}</span>,
    },
    { key: 'vues', header: 'Vues', align: 'right', sortValue: row => row.views, render: row => row.views },
    {
      key: 'sessions',
      header: 'Sessions',
      align: 'right',
      sortValue: row => row.sessions,
      render: row => row.sessions,
    },
    {
      key: 'mesures',
      header: 'Mesures',
      render: row =>
        row.measures.kind === 'below_threshold' ? (
          <span className="muted">
            {libelleEtat(
              etatDe({ kind: 'below_threshold', sessions: row.sessions, minSessions: row.measures.minSessions }),
            )}
          </span>
        ) : (
          <>
            {row.measures.viewsPerWeek} vues/sem · durée médiane {formaterDureeMediane(row.measures.medianDuration)} ·
            rebond {formaterTaux(row.measures.bounceRate)} · action {formaterTaux(row.measures.actionRate)}
          </>
        ),
    },
    {
      key: 'verdict',
      header: 'Verdict',
      // #1683.1 — le verdict est rendu À CÔTÉ du chiffre (colonne propre),
      // jamais à sa place : les colonnes « Vues »/« Sessions »/« Mesures »
      // ci-dessus restent celles d'avant ce lot, inchangées.
      sortValue: row => row.verdict.kind,
      render: row => <span style={{ color: tokenDuVerdict(row.verdict.kind) }}>{libelleVerdict(row.verdict)}</span>,
    },
  ]
  return <DataTable rows={lignes} columns={colonnes} rowKey={row => row.route} maxHeight="60vh" />
}

// ─────────────────────────────────────────────────────────────────────────────
// #1684.1 — Sorties par écran, destination principale + fermeture pure
// ─────────────────────────────────────────────────────────────────────────────

type SortiesMesurees = Extract<RapportParcours['exits'], { kind: 'measured' }>
type SortieLigne = SortiesMesurees['value'][number]

export function SortiesTable({ lignes }: { lignes: readonly SortieLigne[] }) {
  const colonnes: DataTableColumn<SortieLigne>[] = [
    { key: 'ecran', header: 'Écran', sortValue: row => row.label.fr, render: row => row.label.fr },
    { key: 'sorties', header: 'Sorties', align: 'right', sortValue: row => row.exits, render: row => row.exits },
    {
      key: 'sessions',
      header: 'Sessions',
      align: 'right',
      sortValue: row => row.sessions,
      render: row => row.sessions,
    },
    {
      key: 'destination',
      header: 'Destination principale',
      render: row => {
        if (row.detail.kind === 'below_threshold') return <span className="muted">sous le seuil</span>
        const principale = destinationPrincipale(row.detail)
        // #1684.1 — jamais une fermeture ou une inactivité affichée COMME une
        // destination : `principale` vient d'un tableau qui ne les contient
        // structurellement pas (voir `journey-summary.logic.ts`).
        return principale ? (
          <>
            {principale.label.fr} <span className="muted">({principale.exits})</span>
          </>
        ) : (
          <span className="muted">aucune — fermetures/inactivités seules</span>
        )
      },
    },
    {
      key: 'fermeture',
      header: 'Part de fermeture pure',
      render: row =>
        row.detail.kind === 'below_threshold' ? (
          <span className="muted">sous le seuil</span>
        ) : (
          formaterTaux(row.detail.closeRate)
        ),
    },
  ]
  return <DataTable rows={lignes} columns={colonnes} rowKey={row => row.route} maxHeight="50vh" />
}

type InterrompuLigne = Extract<RapportParcours['interrupted'], { kind: 'measured' }>['value'][number]

export function InterrompusTable({ lignes }: { lignes: readonly InterrompuLigne[] }) {
  const colonnes: DataTableColumn<InterrompuLigne>[] = [
    { key: 'action', header: 'Action', sortValue: row => row.action, render: row => row.action },
    {
      key: 'interrompues',
      header: 'Interrompues',
      align: 'right',
      sortValue: row => row.sessions,
      render: row => row.sessions,
    },
    {
      key: 'demarrees',
      header: 'Démarrées',
      align: 'right',
      sortValue: row => row.startedSessions,
      render: row => row.startedSessions,
    },
    { key: 'taux', header: 'Taux d’interruption', render: row => formaterTaux(row.interruptionRate) },
  ]
  return <DataTable rows={lignes} columns={colonnes} rowKey={row => row.action} maxHeight="40vh" />
}

// ─────────────────────────────────────────────────────────────────────────────
// Friction — répétitions, allers-retours, erreurs (chrome DataTable, contenu inchangé)
// ─────────────────────────────────────────────────────────────────────────────

type RepetitionLigne = Extract<RapportFriction['repetitions'], { kind: 'measured' }>['value'][number]

export function RepetitionsTable({ lignes }: { lignes: readonly RepetitionLigne[] }) {
  const colonnes: DataTableColumn<RepetitionLigne>[] = [
    { key: 'action', header: 'Action', sortValue: row => row.action, render: row => row.action },
    {
      key: 'sessions',
      header: 'Sessions',
      align: 'right',
      sortValue: row => row.sessions,
      render: row => row.sessions,
    },
  ]
  return <DataTable rows={lignes} columns={colonnes} rowKey={row => row.action} maxHeight="40vh" />
}

// ─────────────────────────────────────────────────────────────────────────────
// #2130.71 — Les sections du dossier compte, par fréquence
// ─────────────────────────────────────────────────────────────────────────────

type SectionDossierLigne = Extract<RapportSectionsDossier['sections'], { kind: 'measured' }>['value'][number]

export function SectionsDossierTable({ lignes }: { lignes: readonly SectionDossierLigne[] }) {
  const colonnes: DataTableColumn<SectionDossierLigne>[] = [
    { key: 'section', header: 'Section', sortValue: row => row.tab, render: row => row.tab },
    {
      key: 'ouvertures',
      header: 'Ouvertures',
      align: 'right',
      sortValue: row => row.opens,
      render: row => row.opens,
    },
    {
      key: 'sessions',
      header: 'Sessions',
      align: 'right',
      sortValue: row => row.sessions,
      render: row => row.sessions,
    },
  ]
  return <DataTable rows={lignes} columns={colonnes} rowKey={row => row.tab} maxHeight="40vh" />
}

type RoundTripLigne = Extract<RapportFriction['roundTrips'], { kind: 'measured' }>['value'][number]

export function RoundTripsTable({ lignes }: { lignes: readonly RoundTripLigne[] }) {
  const colonnes: DataTableColumn<RoundTripLigne>[] = [
    { key: 'de', header: 'Depuis', sortValue: row => row.fromLabel.fr, render: row => row.fromLabel.fr },
    { key: 'vers', header: 'Vers', sortValue: row => row.toLabel.fr, render: row => row.toLabel.fr },
    {
      key: 'sessions',
      header: 'Sessions',
      align: 'right',
      sortValue: row => row.sessions,
      render: row => row.sessions,
    },
  ]
  return <DataTable rows={lignes} columns={colonnes} rowKey={row => `${row.from}-${row.to}`} maxHeight="40vh" />
}

type ErrorLigne = Extract<RapportFriction['errors'], { kind: 'measured' }>['value'][number]

export function ErrorsTable({ lignes }: { lignes: readonly ErrorLigne[] }) {
  const colonnes: DataTableColumn<ErrorLigne>[] = [
    { key: 'ecran', header: 'Écran', sortValue: row => row.label.fr, render: row => row.label.fr },
    { key: 'code', header: 'Code', sortValue: row => row.errorCode, render: row => row.errorCode },
    {
      key: 'occurrences',
      header: 'Occurrences',
      align: 'right',
      sortValue: row => row.occurrences,
      render: row => row.occurrences,
    },
    {
      key: 'sessions',
      header: 'Sessions',
      align: 'right',
      sortValue: row => row.sessions,
      render: row => row.sessions,
    },
  ]
  return <DataTable rows={lignes} columns={colonnes} rowKey={row => `${row.route}-${row.errorCode}`} maxHeight="40vh" />
}

// ─────────────────────────────────────────────────────────────────────────────
// #1688 — Demande non couverte
// ─────────────────────────────────────────────────────────────────────────────

type DemandeLigne = Extract<RapportDemande['emptySearches'], { kind: 'measured' }>['value'][number]

export function DemandeTable({ lignes }: { lignes: readonly DemandeLigne[] }) {
  const colonnes: DataTableColumn<DemandeLigne>[] = [
    { key: 'ecran', header: 'Écran', sortValue: row => row.label.fr, render: row => row.label.fr },
    {
      key: 'echec',
      header: 'Recherches sans résultat',
      align: 'right',
      sortValue: row => row.emptySearches,
      render: row => `${row.emptySearches} sur ${row.searches}`,
    },
    { key: 'taux', header: 'Taux d’échec', render: row => formaterTaux(row.emptyRate) },
  ]
  return <DataTable rows={lignes} columns={colonnes} rowKey={row => row.route} maxHeight="40vh" />
}

// ─────────────────────────────────────────────────────────────────────────────
// #1688.4 — Le croisement usage × demande
// ─────────────────────────────────────────────────────────────────────────────

function tokenDuQuadrant(quadrant: LigneCroisement['quadrant']): string {
  switch (quadrant) {
    case 'attendu_mais_absent':
      return 'var(--amber)'
    case 'sous_utilise':
      return 'var(--muted)'
    case 'adopte_sous_tension':
      return 'var(--blue)'
    case 'adopte_sans_tension':
      return 'var(--green)'
    case 'non_mesure':
      return 'var(--muted)'
  }
}

export function CroisementTable({ lignes }: { lignes: readonly LigneCroisement[] }) {
  const colonnes: DataTableColumn<LigneCroisement>[] = [
    { key: 'ecran', header: 'Écran', sortValue: row => row.label.fr, render: row => row.label.fr },
    { key: 'usage', header: 'Usage', sortValue: row => row.usage, render: row => row.usage.replace('_', ' ') },
    { key: 'demande', header: 'Demande', sortValue: row => row.demande, render: row => row.demande.replace('_', ' ') },
    {
      key: 'quadrant',
      header: 'Croisement',
      sortValue: row => row.quadrant,
      render: row => <span style={{ color: tokenDuQuadrant(row.quadrant) }}>{libelleQuadrant(row.quadrant)}</span>,
    },
  ]
  return (
    <DataTable
      rows={lignes}
      columns={colonnes}
      rowKey={row => row.route}
      maxHeight="50vh"
      persistKey="produit-croisement"
    />
  )
}
