'use client'

import { DataTable, type DataTableColumn } from '@/ui'
import { libelleEtatAdoption, type LigneAdoption } from '../feature-adoption.logic'

/**
 * issue 1657.2 / issue 1685 — le tableau des fonctions gatées par offre, sur
 * `DataTable` (#1642). `DataTable` est un Client Component (ses colonnes
 * portent des fonctions `render`/`sortValue`, qui ne traversent pas la
 * frontière RSC serveur → client) : ce fichier est la frontière, `page.tsx`
 * (Server Component) lui passe des LIGNES déjà calculées — même patron que
 * `produit/_components/produit-tables.tsx`.
 *
 * Aucun nom d'espace ici : `LigneAdoption` ne porte que la fonction, son
 * dénominateur (un compte) et son état — voir la garde
 * `src/architecture/adoption-ne-nomme-jamais-un-espace.test.ts`.
 */

/** Un token de couleur PAR état — jamais un hexadécimal, jamais une classe
 *  Tailwind : les mêmes variables que `/produit`. */
function tokenDeLetat(kind: LigneAdoption['etat']['kind']): string {
  switch (kind) {
    case 'adoptee':
      return 'var(--green)'
    case 'confidentielle':
      return 'var(--text)'
    case 'ignoree':
      return 'var(--amber)'
    case 'morte':
      return 'var(--red)'
    case 'observation_insuffisante':
    case 'sans_titulaire':
    case 'non_mesurable':
      return 'var(--muted)'
  }
}

export function AdoptionTable({ lignes }: { lignes: readonly LigneAdoption[] }) {
  const colonnes: DataTableColumn<LigneAdoption>[] = [
    { key: 'fonction', header: 'Fonction', sortValue: row => row.labelFr, render: row => row.labelFr },
    {
      key: 'paliers',
      header: 'Ouverte par',
      render: row =>
        row.entitlement.grantingPlanLabels.length > 0 ? (
          row.entitlement.grantingPlanLabels.join(', ')
        ) : (
          <span className="muted">aucun palier aujourd’hui</span>
        ),
    },
    {
      key: 'denominateur',
      header: 'Espaces éligibles (dénominateur)',
      align: 'right',
      sortValue: row => row.entitlement.entitledSubscriptions,
      // #1657.2/#1685 — le dénominateur est écrit À L'ÉCRAN, jamais seulement
      // dans le code : « sur N abonnements » nomme ce qui est compté (voir
      // `feature-adoption.logic.ts`, docblock de `entitlementPourFonction`).
      render: row => `${row.entitlement.entitledSubscriptions} sur ${row.entitlement.totalSubscriptions} abonnements`,
    },
    {
      key: 'etat',
      header: 'Adoption',
      sortValue: row => row.etat.kind,
      render: row => <span style={{ color: tokenDeLetat(row.etat.kind) }}>{libelleEtatAdoption(row.etat)}</span>,
    },
  ]
  return (
    <DataTable rows={lignes} columns={colonnes} rowKey={row => row.feature} maxHeight="60vh" persistKey="adoption" />
  )
}
