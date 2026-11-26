'use client'

import { useMemo, useState, type JSX } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DataTable, EmptyState, FilterBar, type DataTableColumn } from '@/ui'
import { readFilterFromSearch, withFilterInSearch } from '@/ui/FilterBar.logic'
import { EmailEnClair } from '@/app/_components/email-en-clair'
import { UserRowActions } from '@/app/clients/_components/user-row-actions'
import { PosteDeTravailSeulement } from '@/ui'
import { PlanSelect } from '@/app/users/_components/plan-select'
import { GrantCredits } from '@/app/users/[userId]/_components/grant-credits'
import { jourCompact } from '@/lib/dates'
import type { ClientHealthReport, ClientRow } from '@/lib/client-health'
import {
  compterLesAlertes,
  depuisQuand,
  estEnAlerte,
  estUnPlanEditable,
  formaterAxe,
  formaterEuros,
  formaterRapport,
  libelleFacturation,
  libelleSante,
  scoreDe,
  trierParSanteCroissante,
} from '../clients.logic'

/**
 * LE TABLEAU DES CLIENTS — un espace par ligne (#1652).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE DÉTAIL DE SANTÉ EST UN PANNEAU, ET PAS UNE INFOBULLE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue dit « au survol, ses 5 axes ». Un `title=` était la réponse facile :
 * c'est un défaut connu de ce dépôt (une donnée rangée dans un attribut n'est ni
 * tabulable, ni lisible au clavier, ni copiable, et disparaît sur mobile).
 * Une infobulle FLOTTANTE ne marchait pas non plus : `DataTable` borne son
 * propre débordement (`overflow: auto`), donc tout ce qui dépasse d'une cellule
 * est COUPÉ par le conteneur — la règle D81 du produit, qu'on ne va pas casser
 * pour une bulle.
 *
 * Le score est donc un `<button type="button">` qui ouvre un panneau sous le
 * tableau : tabulable, annoncé (`aria-expanded` / `aria-controls`), jamais
 * coupé, et assez large pour porter les cinq axes AVEC ce que chacun a lu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES ACTIONS SONT CELLES QUI EXISTAIENT — AUCUNE N'EST RÉÉCRITE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - incarner / lien de connexion / fiche → `<UserRowActions>` (ADMIN-01) ;
 *  - changer d'offre                       → `<PlanSelect>` ;
 *  - créditer                              → `<GrantCredits>`, dans le panneau.
 *
 * ⚠️ **Suspendre reste sur la FICHE, et c'est la décision déjà écrite dans
 * `user-row-actions.tsx`** : cette liste ne porte pas l'état d'authentification
 * (`banned`), et le lire coûterait un appel Supabase PAR LIGNE à chaque
 * affichage. Un bouton « Suspendre » qui ne saurait pas si le compte l'est déjà
 * proposerait une action qui ne fait rien — pire qu'un clic de plus. Le panneau
 * mène donc à la fiche, où l'état est connu.
 */
// #1673.2 — le filtre vit dans l'URL, pas dans un `useState` : un lien copié
// ou un retour arrière doit rouvrir le même filtre. Motif copié de
// `app/queues/page.tsx:97,126`, généralisé dans `FilterBar.logic.ts`.
const FILTRE_CLES = ['tous', 'alertes'] as const
type FiltreClient = (typeof FILTRE_CLES)[number]

export function ClientsTable({ report }: { report: ClientHealthReport }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [selection, setSelection] = useState<string | null>(null)

  const filtre = readFilterFromSearch(searchParams.toString(), 'filtre', FILTRE_CLES, 'tous')
  const alertesSeulement = filtre === 'alertes'

  function setFiltre(next: FiltreClient): void {
    const qs = withFilterInSearch(searchParams.toString(), 'filtre', next, 'tous')
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  // ⚠️ L'ancre de temps vient du SERVEUR (`computedAt`), pas de `new Date()`.
  // Un composant client qui lirait l'horloge rendrait deux textes différents —
  // au rendu serveur puis à l'hydratation — et React refuserait le second
  // (erreurs #418 / #423 déjà payées par cette console le 07/09/2026).
  const maintenant = useMemo(() => new Date(report.computedAt), [report.computedAt])

  const alertes = compterLesAlertes(report.rows)
  const lignes = useMemo(() => {
    const triees = trierParSanteCroissante(report.rows)
    return alertesSeulement ? triees.filter(row => estEnAlerte(row.health)) : triees
  }, [report.rows, alertesSeulement])

  const choisie = lignes.find(row => row.workspaceId === selection) ?? null

  const colonnes: DataTableColumn<ClientRow>[] = [
    {
      key: 'espace',
      header: 'Espace',
      sortValue: row => row.name,
      render: row => (
        <a className="link" href={`/esn/${encodeURIComponent(row.workspaceId)}`} style={{ color: 'var(--text)' }}>
          {row.name}
        </a>
      ),
    },
    {
      key: 'offre',
      header: 'Offre',
      sortValue: row => row.planLabel,
      // Le palier s'édite en ligne quand il est au catalogue de `PlanSelect` ;
      // sinon il s'AFFICHE — un `<select>` sans son option courante mentirait.
      render: row =>
        estUnPlanEditable(row.plan) ? (
          <PlanSelect userId={row.ownerUserId} plan={row.plan} />
        ) : (
          <span className="muted">{row.planLabel ?? '—'}</span>
        ),
    },
    {
      key: 'mrr',
      header: 'MRR',
      align: 'right',
      sortValue: row => row.mrrCents,
      render: row => formaterEuros(row.mrrCents),
    },
    {
      key: 'sieges',
      header: 'Sièges',
      align: 'right',
      sortValue: row => row.seats,
      render: row => formaterRapport(row.activeMembers, row.seats),
    },
    {
      key: 'depuis',
      header: 'Depuis',
      sortValue: row => row.createdAt,
      render: row => <span className="muted">{jourCompact(row.createdAt)}</span>,
    },
    {
      key: 'activite',
      header: 'Dernière activité',
      sortValue: row => row.lastActivityAt,
      render: row => <span className="muted">{depuisQuand(row.lastActivityAt, maintenant)}</span>,
    },
    {
      key: 'sante',
      header: 'Santé',
      align: 'right',
      // `null` trie TOUJOURS en dernier dans `DataTable.logic` — un espace sans
      // score ne se lit donc jamais comme le pire ni comme le meilleur.
      sortValue: row => scoreDe(row.health),
      render: row => <CelluleSante row={row} ouverte={selection === row.workspaceId} onOuvrir={setSelection} />,
    },
    {
      key: 'credits',
      header: 'Crédits',
      align: 'right',
      sortValue: row => row.creditsUsed,
      render: row => formaterRapport(row.creditsUsed, row.creditsAllowance),
    },
    {
      key: 'facturation',
      header: 'Facturation',
      sortValue: row => libelleFacturation(row),
      render: row => <span className="muted">{libelleFacturation(row)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      // #1674.9 — « incarner » est une impersonation : elle n'est pas RENDUE
      // sous 768 px. La colonne reste, sa cellule est vide sur un écran étroit.
      render: row => (
        <PosteDeTravailSeulement>
          <UserRowActions userId={row.ownerUserId} email={row.ownerEmail ?? row.name} />
        </PosteDeTravailSeulement>
      ),
    },
  ]

  if (report.rows.length === 0) {
    return <EmptyState icon="◇" message="Aucun espace client. Rien à mesurer tant qu’il n’y a pas de client." />
  }

  return (
    <>
      <FilterBar
        pills={[
          { key: 'tous', label: 'Tous', count: report.rows.length },
          { key: 'alertes', label: 'Alertes de churn', count: alertes },
        ]}
        activeKey={filtre}
        defaultKey="tous"
        onSelect={key => setFiltre(key === 'alertes' ? 'alertes' : 'tous')}
        onClear={() => setFiltre('tous')}
        labels={{ clear: 'Réinitialiser le filtre', advanced: 'Filtres avancés' }}
      />
      <p className="muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
        Adoption et incidents mesurés sur {report.windowDays} jours
        {report.featureCatalogue === null
          ? ' — aucun geste enregistré, l’axe adoption sort du calcul pour tout le monde'
          : ` · ${report.featureCatalogue} fonctions observées sur la plateforme`}
      </p>

      {lignes.length === 0 ? (
        <EmptyState icon="✓" message="Aucun espace sous 25 de santé. Rien ne remonte dans la file de décision." />
      ) : (
        <DataTable rows={lignes} columns={colonnes} rowKey={row => row.workspaceId} maxHeight="60vh" />
      )}

      <PanneauDetail ligne={choisie} onFermer={() => setSelection(null)} />
    </>
  )
}

/**
 * Le score, jamais nu : un bouton qui ouvre ses axes.
 *
 * ⚠️ « trop récent » et « non mesuré » ne sont PAS des zéros — ils sont écrits
 * en toutes lettres, en ton neutre, et ils ouvrent le même panneau : c'est là
 * qu'on lit POURQUOI il n'y a pas de score.
 */
function CelluleSante({
  row,
  ouverte,
  onOuvrir,
}: {
  row: ClientRow
  ouverte: boolean
  onOuvrir: (id: string | null) => void
}) {
  const libelle = libelleSante(row.health)
  const couleur = libelle.ton === 'alerte' ? 'var(--red)' : libelle.ton === 'absent' ? 'var(--muted)' : 'var(--text)'
  return (
    <button
      type="button"
      aria-expanded={ouverte}
      aria-controls="detail-sante"
      onClick={() => onOuvrir(ouverte ? null : row.workspaceId)}
      style={{
        background: 'none',
        border: 0,
        padding: 0,
        font: 'inherit',
        cursor: 'pointer',
        color: couleur,
        fontWeight: libelle.ton === 'alerte' ? 700 : 600,
        textDecoration: 'underline dotted',
        textUnderlineOffset: 3,
      }}
    >
      {libelle.ton === 'alerte' ? '⚠ ' : ''}
      {libelle.texte}
    </button>
  )
}

/**
 * Le détail d'une ligne : ses cinq axes, ce que chacun a lu — ou la raison pour
 * laquelle il n'a pas pu être évalué — puis les gestes de support.
 *
 * Le panneau existe TOUJOURS dans le DOM (`hidden` quand rien n'est choisi) :
 * `aria-controls` doit désigner un élément qui existe, sinon l'annonce est
 * cassée pour un lecteur d'écran.
 */
function PanneauDetail({ ligne, onFermer }: { ligne: ClientRow | null; onFermer: () => void }): JSX.Element {
  if (!ligne) return <div id="detail-sante" hidden />

  const libelle = libelleSante(ligne.health)

  return (
    <section
      id="detail-sante"
      className="card"
      style={{ margin: '16px 0 0', padding: 20, display: 'grid', gap: 16 }}
      aria-label={`Détail de santé — ${ligne.name}`}
    >
      <header style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 16 }}>{ligne.name}</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {ligne.planLabel ?? 'aucun palier'} · {libelle.aide}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <button type="button" className="btn-sm" onClick={onFermer}>
            Fermer
          </button>
        </span>
      </header>

      <div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Les cinq axes. Un axe non évaluable SORT du dénominateur — il ne compte pas zéro.
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {ligne.health.axes.map(axe => (
            <li key={axe.key} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ minWidth: 180 }}>{axe.label}</span>
              <span className="muted" style={{ fontSize: 12, minWidth: 60 }}>
                poids {axe.weight}
              </span>
              <strong style={{ minWidth: 90, color: axe.ratio === null ? 'var(--muted)' : 'var(--text)' }}>
                {formaterAxe(axe.ratio)}
              </strong>
              <span className="muted" style={{ fontSize: 12 }}>
                {/* Ce qui n'a pas pu être évalué est NOMMÉ — c'est la moitié
                    utile du panneau, et la raison pour laquelle un `title=`
                    n'aurait pas suffi. */}
                {axe.detail ?? `non évalué — ${axe.unmeasured ?? 'raison inconnue'}`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span className="muted" style={{ fontSize: 12 }}>
          Propriétaire :
        </span>
        {/* #1670.4 — l'adresse est masquée, révélée au clic, et le clic est journalisé. */}
        <EmailEnClair email={ligne.ownerEmail} />
        <span className="muted" style={{ fontSize: 12 }}>
          {ligne.memberCount} membre{ligne.memberCount > 1 ? 's' : ''} · MRR {formaterEuros(ligne.mrrCents)} ·{' '}
          {libelleFacturation(ligne)}
        </span>
      </div>

      <div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Créditer cet espace — le mouvement est tracé dans le ledger, au nom du propriétaire.
        </div>
        <GrantCredits userId={ligne.ownerUserId} />
      </div>

      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Suspendre ou réactiver le compte se fait sur{' '}
        <a className="link" href={`/users/${encodeURIComponent(ligne.ownerUserId)}`}>
          la fiche du propriétaire
        </a>{' '}
        : cette liste ne porte pas l’état d’authentification, et un bouton qui ne sait pas si le compte est déjà
        suspendu proposerait une action sans effet.
      </p>
    </section>
  )
}
