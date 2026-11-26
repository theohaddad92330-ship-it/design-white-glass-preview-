'use client'

import { DataTable, EmptyState, type DataTableColumn } from '@/ui'
import type { OfferEconomics } from '@/lib/offer-economics'
import {
  formaterCredits,
  formaterEuros,
  libelleClients,
  libelleMarge,
  libelleMedianeConsommation,
  libelleTauxDepassement,
} from './offers-economics.logic'

/**
 * Le catalogue d'offres AVEC ce que chacune rapporte (issue 1656).
 *
 * Huit colonnes : Offre · Prix · Crédits · Clients · MRR généré · Marge ·
 * Consommation médiane · Taux de dépassement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - **Il ne tranche pas.** Un taux de dépassement élevé dit deux choses
 *    opposées : l'offre est mal calibrée, ou elle est le point de bascule vers
 *    l'offre supérieure. Le chiffre ne départage pas les deux — on l'affiche
 *    avec son dénominateur et son incertitude, et aucune recommandation. Un
 *    test le garde (`offers-economics.logic.test.ts`).
 *  - **Il n'écrit rien.** L'édition du catalogue reste sous ce tableau, dans
 *    l'éditeur, avec sa confirmation qui nomme combien de clients sont
 *    concernés aujourd'hui.
 *  - **Il n'affiche jamais « 0 » pour une valeur absente.** Une offre à zéro
 *    client rend « — » sur toutes ses colonnes dérivées ; une marge de « 0 % »
 *    y serait fausse, pas prudente.
 *
 * ⚠️ Le tableau défile dans SON conteneur (`maxHeight`), jamais le corps de la
 * page — huit colonnes débordent.
 *
 * Français seulement, comme le reste du back-office hors monitoring (voir le
 * docblock de `src/lib/i18n.ts`) : huit en-têtes bilingues rendraient le
 * tableau illisible avant de le rendre international.
 */

/**
 * La valeur d'une cellule dérivée, et la phrase qui la qualifie ou l'explique.
 *
 * ⚠️ Ces colonnes sont alignées à GAUCHE, contrairement aux colonnes de
 * chiffres nus : une phrase alignée à droite se relit mal, et chacune de ces
 * trois cellules en porte une — la raison quand la valeur manque, le
 * dénominateur quand elle est là. Une note vide ne rend rien du tout : une
 * ligne blanche sous chaque valeur serait du bruit sur toute la colonne.
 */
function Cellule({ valeur, note }: { valeur: string | null; note: string }) {
  return (
    <div style={{ maxWidth: 260, whiteSpace: 'normal' }}>
      <div style={{ color: valeur === null ? 'var(--muted)' : undefined }}>{valeur ?? '—'}</div>
      {note ? <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{note}</div> : null}
    </div>
  )
}

export function OffersEconomics({ offers }: { offers: OfferEconomics[] }) {
  if (offers.length === 0) {
    return <EmptyState icon="€" message="Aucune offre au catalogue." />
  }

  const colonnes: DataTableColumn<OfferEconomics>[] = [
    {
      key: 'offre',
      header: 'Offre',
      sortValue: row => row.label,
      render: row => (
        <div>
          <div>{row.label}</div>
          <code style={{ fontSize: 12, color: 'var(--muted)' }}>{row.key}</code>
        </div>
      ),
    },
    {
      key: 'prix',
      header: 'Prix',
      align: 'right',
      sortValue: row => row.priceCents,
      render: row => <span>{formaterEuros(row.priceCents)}/mois</span>,
    },
    {
      // L'unité est dans l'en-tête : la répéter sur chaque ligne d'une colonne
      // de chiffres nus n'ajoute rien. Elle reste dans la médiane, où la valeur
      // voisine un « — » et une phrase.
      key: 'credits',
      header: 'Crédits/mois',
      align: 'right',
      sortValue: row => row.creditsPerCycle,
      render: row => row.creditsPerCycle,
    },
    {
      key: 'clients',
      header: 'Clients',
      align: 'right',
      sortValue: row => row.customers,
      render: row => libelleClients(row),
    },
    {
      key: 'mrr',
      header: 'MRR généré',
      sortValue: row => row.mrrCents,
      render: row => (
        <Cellule
          valeur={row.mrrCents === null ? null : formaterEuros(row.mrrCents)}
          // La définition du MRR est écrite UNE fois, au-dessus du tableau : la
          // répéter sur chaque ligne n'apprendrait rien de plus sur celle-ci.
          note={row.mrrCents === null ? 'Aucun client sur cette offre — il n’y a rien à mesurer.' : ''}
        />
      ),
    },
    {
      key: 'marge',
      // La raison est la MÊME sur chaque ligne : elle est écrite UNE fois sous
      // le tableau, et l'astérisque y renvoie. La répéter par ligne serait du
      // bruit, et la taire ferait un « non mesurable » muet.
      header: 'Marge *',
      render: row => <span style={{ color: 'var(--muted)' }}>{libelleMarge(row).mention}</span>,
    },
    {
      key: 'mediane',
      header: 'Consommation médiane',
      sortValue: row => row.medianCreditsUsed,
      render: row => {
        const cellule = libelleMedianeConsommation(row)
        return <Cellule valeur={cellule.valeur} note={cellule.note} />
      },
    },
    {
      key: 'depassement',
      header: 'Taux de dépassement',
      sortValue: row => row.overrunRate,
      render: row => {
        const cellule = libelleTauxDepassement(row)
        return <Cellule valeur={cellule.valeur} note={cellule.note} />
      },
    },
  ]

  // Les raisons RÉELLEMENT présentes dans le tableau, dédoublonnées. La prose
  // n'est pas recopiée ici : elle vient de `libelleMarge`, la seule définition.
  // Une raison ajoutée côté API apparaît donc d'elle-même, plutôt que de laisser
  // un paragraphe figé décrire un état qui a changé.
  const raisons = [...new Set(offers.map(offre => libelleMarge(offre).note))]
  const exclus = offers.find(offre => offre.margin.excludedCostFamilies.length > 0)?.margin.excludedCostFamilies ?? []

  return (
    <>
      <DataTable rows={offers} columns={colonnes} rowKey={row => row.key} maxHeight={520} />

      <section style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
        <h2 style={{ fontSize: 14, margin: '0 0 6px' }}>* Pourquoi la marge n’est pas mesurable</h2>
        {raisons.map(raison => (
          <p key={raison} style={{ margin: '0 0 8px' }}>
            {raison}
          </p>
        ))}
        <p style={{ margin: 0 }}>
          Une marge posée sur un coût deviné servirait à fixer des prix de vente. Tant que ces points ne sont pas levés,
          cette colonne dit pourquoi elle est vide plutôt que d’avancer un chiffre.
          {exclus.length > 0 ? (
            <>
              {' '}
              Et même levés, la mesure resterait une marge sur coût <em>variable</em> : {exclus.join(', ')} ne sont dans
              aucune table de ce produit.
            </>
          ) : null}
        </p>
      </section>
    </>
  )
}
