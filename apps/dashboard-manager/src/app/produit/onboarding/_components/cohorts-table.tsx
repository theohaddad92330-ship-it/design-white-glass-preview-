'use client'

import { DataTable, type DataTableColumn } from '@/ui'
import type { RapportEntonnoir } from '../onboarding-funnel.client'
import { formaterDelai, formaterPart, type LigneEntonnoir } from '../onboarding-funnel.logic'

/**
 * #1642.2 — LE TABLEAU DES COHORTES AFFICHÉES, SUR `DataTable`.
 *
 * `DataTable` porte des fonctions dans ses colonnes ; `page.tsx` est un
 * Server Component async, qui ne peut pas les lui fournir directement (une
 * fonction ne traverse pas la frontière RSC serveur → client — voir le
 * docblock de tête de `src/ui/DataTable.tsx`). Ce fichier est la frontière :
 * il reçoit des LIGNES déjà décidées par `construireVueEntonnoir`
 * (`onboarding-funnel.logic.ts`) et les colonnes d'étapes déjà nommées par
 * l'API (`rapport.etapes`), et ne recalcule rien.
 *
 * Aucune colonne ne disparaît : cohorte, espaces, une colonne PAR ÉTAPE (sept
 * aujourd'hui, dynamique — voir `onboarding-funnel.client.ts`), délai médian.
 */
type LigneAffichee = Extract<LigneEntonnoir, { etat: 'affichee' }>

export function CohortesTable({
  lignes,
  etapes,
}: {
  lignes: readonly LigneAffichee[]
  etapes: RapportEntonnoir['etapes']
}) {
  const colonnesEtapes: DataTableColumn<LigneAffichee>[] = etapes.map(etape => ({
    key: etape.cle,
    header: etape.libelle,
    align: 'right',
    render: row => {
      const cellule = row.cohorte.etapes.find(e => e.cle === etape.cle)
      if (!cellule || cellule.etat === 'non_instrumentee') {
        // Trouvé en recette : « Onboarding démarré 0 % » à côté de
        // « Onboarding terminé 88 % ». Rien n'écrit cette étape ; un zéro
        // l'aurait dite mesurée.
        return (
          <span
            className="muted"
            title="Aucun espace n’a jamais franchi cette étape, sur aucune cohorte : rien ne l’écrit. Ce n’est pas un zéro."
          >
            non instrumentée
          </span>
        )
      }
      if (cellule.etat === 'non_mesuree') return <span className="muted">trop tôt</span>
      return formaterPart(cellule.part)
    },
  }))

  const colonnes: DataTableColumn<LigneAffichee>[] = [
    {
      key: 'cohorte',
      header: 'Cohorte',
      sortValue: row => row.cohorte.cohorte,
      render: row => <span style={{ textTransform: 'capitalize' }}>{row.libelle}</span>,
    },
    {
      key: 'espaces',
      header: 'Espaces',
      align: 'right',
      sortValue: row => row.cohorte.espaces,
      render: row => row.cohorte.espaces,
    },
    ...colonnesEtapes,
    {
      key: 'delai',
      header: 'Délai médian · 1ʳᵉ valeur',
      align: 'right',
      render: row =>
        row.cohorte.delaiPremiereValeur.medianJours === null ? (
          <span className="muted">—</span>
        ) : (
          <>
            {formaterDelai(row.cohorte.delaiPremiereValeur.medianJours)}{' '}
            <span className="muted" style={{ fontSize: 12 }}>
              (sur {row.cohorte.delaiPremiereValeur.echantillon})
            </span>
          </>
        ),
    },
  ]

  return <DataTable rows={lignes} columns={colonnes} rowKey={row => row.cohorte.cohorte} />
}
