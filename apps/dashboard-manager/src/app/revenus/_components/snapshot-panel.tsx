'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, EmptyState, KpiTile, type DataTableColumn } from '@/ui'
import type { BusinessCurrent, BusinessMonth } from '@/lib/business-metrics'
import { formaterEuros, libelleMois, messageDErreurApi } from '../revenus.logic'

/**
 * LES INSTANTANÉS MENSUELS DU MRR (#1645).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL A DÉMÉNAGÉ, IL NE S'EST PAS RÉÉCRIT (#1651)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce panneau vivait sur `/revenus/tresorerie` par NÉCESSITÉ : sans écran, #1645
 * aurait été du code juste que personne n'appelle, et le PREMIER instantané de
 * la série ne pouvait pas attendre. Son docblock l'annonçait — « il déménagera,
 * il ne se réécrira pas ». C'est fait : il est ici, sur `/revenus`, sa vraie
 * page, et son mécanisme (le bouton de gel, la table des mois figés) n'a pas
 * bougé d'une ligne.
 *
 * ⚠️ CE QUI A CHANGÉ, ET POURQUOI — les deux tuiles « Revenu contracté » et
 * « Ponctuel facturé » ont quitté ce panneau. Elles n'ont pas disparu : elles
 * sont le BLOC 4 de `/revenus`, où elles gagnent la ligne de total qu'elles
 * n'avaient pas. Les garder ici les aurait affichées DEUX FOIS sur le même
 * écran, avec le même contenu et sous la même forme — ce que la loi 4 du tome 7
 * interdit. Sur `/revenus/tresorerie`, la question ne se posait pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL MOIS EST FIGEABLE — arbitrage de Louis du 07/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bouton ne propose que le mois qui VIENT DE FINIR, et la porte est posée
 * côté API (400 sur tout autre mois, deux messages distincts). La raison, qui
 * doit se LIRE à l'écran et pas seulement se coder : ce bouton ne relit pas un
 * mois passé, il photographie les abonnements d'AUJOURD'HUI et range la photo
 * sous une étiquette de mois. Pour le mois qui vient de finir, c'est la
 * meilleure approximation disponible ; pour mars, ce serait un mensonge
 * DURABLE, puisqu'un instantané ne se recalcule jamais.
 *
 * Conséquence à dire, pas à sous-entendre : **un mois sauté ne se rattrape
 * pas** — il reste un trou nommé dans la série. L'écran le disait à moitié
 * (« ce bouton sert au premier instantané »), ce qui laissait croire l'inverse.
 * Et AUCUN sélecteur de mois : c'était le contournement évident, il est exclu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX CHOSES QUI NE SE CONFONDENT PAS, ET QUI SONT DITES
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **La position du moment** — ce que les abonnements en cours valent AUJOURD'HUI.
 *    Elle bouge à chaque changement d'offre et n'est figée nulle part.
 *  · **Les instantanés** — ce qui était vrai à la fin de chaque mois, FIGÉ.
 *    Un client qui change d'offre le 15 ne réécrit aucun mois passé.
 *
 * ⚠️ Le MRR n'inclut QUE le récurrent. Le revenu contracté (clients sur facture)
 * a son propre bloc, plus haut, et les deux ne sont jamais additionnés sans le
 * dire — un engagement annuel facturé en une fois n'est pas du MRR.
 *
 * ⚠️ Le premier mois de la série n'a pas de mois précédent : ses mouvements
 * affichent « — ». Ce n'est pas un mois sans mouvement, c'est un mois sans terme
 * de comparaison, et « 0 € » mentirait.
 */
export function SnapshotPanel({
  series,
  current,
  moisCourant,
}: {
  series: BusinessMonth[]
  current: BusinessCurrent
  moisCourant: string
}) {
  const router = useRouter()
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const dejaFige = new Set(series.map(m => m.month))
  // Le mois figeable est celui qui VIENT DE FINIR — jamais le mois en cours,
  // dont la position est incomplète par construction.
  const aFiger = moisPrecedent(moisCourant)

  async function figer() {
    setErreur(null)
    setMessage(null)
    setEnCours(true)
    try {
      const res = await fetch('/api/admin/business-metrics/snapshot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ month: aFiger }),
      })
      const data = (await res.json().catch(() => null)) as unknown
      if (!res.ok) {
        // ⚠️ Le refus de l'API est ÉCRIT POUR ÊTRE LU : « un mois à venir ne se
        // fige pas », « un mois manqué reste un trou nommé dans la série ». Il
        // s'affiche tel quel, jamais remplacé par un « Bad Request ».
        setErreur(messageDErreurApi(data, res.status))
        return
      }
      const succes = typeof data === 'object' && data !== null ? (data as { frozen?: boolean }) : null
      setMessage(
        succes?.frozen
          ? `${libelleMois(aFiger)} est figé.`
          : `${libelleMois(aFiger)} était déjà figé — rien n’a été réécrit.`,
      )
      router.refresh()
    } catch (err) {
      setErreur(`API injoignable. ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setEnCours(false)
    }
  }

  const colonnes: DataTableColumn<BusinessMonth>[] = [
    { key: 'month', header: 'Mois', sortValue: row => row.month, render: row => libelleMois(row.month) },
    {
      key: 'start',
      header: 'MRR début',
      align: 'right',
      sortValue: row => row.mrrStartCents,
      render: row => formaterEuros(row.mrrStartCents),
    },
    {
      key: 'new',
      header: 'Nouveau',
      align: 'right',
      sortValue: row => row.mrrNewCents,
      render: row => formaterEuros(row.mrrNewCents),
    },
    {
      key: 'expansion',
      header: 'Expansion',
      align: 'right',
      sortValue: row => row.mrrExpansionCents,
      render: row => formaterEuros(row.mrrExpansionCents),
    },
    {
      key: 'contraction',
      header: 'Contraction',
      align: 'right',
      sortValue: row => row.mrrContractionCents,
      render: row => formaterEuros(row.mrrContractionCents),
    },
    {
      key: 'churn',
      header: 'Churn',
      align: 'right',
      sortValue: row => row.mrrChurnedCents,
      render: row => formaterEuros(row.mrrChurnedCents),
    },
    {
      key: 'end',
      header: 'MRR fin',
      align: 'right',
      sortValue: row => row.mrrEndCents,
      render: row => formaterEuros(row.mrrEndCents),
    },
    {
      key: 'customers',
      header: 'Clients',
      align: 'right',
      sortValue: row => row.customersEnd,
      render: row => row.customersEnd,
    },
    {
      key: 'contracted',
      header: 'Contracté',
      align: 'right',
      sortValue: row => row.contractedRevenueCents,
      render: row => formaterEuros(row.contractedRevenueCents),
    },
  ]

  return (
    <section style={{ margin: '0 0 20px' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>MRR — instantanés mensuels</h2>
      <p className="subtitle" style={{ marginTop: 0 }}>
        Le MRR n’inclut que les abonnements récurrents. Les clients sur facture ont leur propre bloc, plus haut — un
        engagement annuel facturé en une fois n’est pas du MRR. Un mois figé n’est jamais recalculé.
      </p>

      <div className="cards" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <KpiTile
          label="MRR (position du moment)"
          value={formaterEuros(current.mrrCents)}
          period="abonnements en cours — jamais figé, il bouge à chaque changement d’offre"
        />
        <KpiTile label="Clients récurrents" value={current.customers} period="hors clients sur facture" />
      </div>

      <div style={{ margin: '0 0 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={figer} disabled={enCours || dejaFige.has(aFiger)}>
          {dejaFige.has(aFiger) ? `${libelleMois(aFiger)} déjà figé` : `Figer ${libelleMois(aFiger)}`}
        </button>
        <span className="subtitle" style={{ margin: 0, maxWidth: '70ch' }}>
          Le 1er de chaque mois, un passage automatique le fait. Ce bouton sert au premier instantané de la série, et il
          ne propose QUE le mois qui vient de finir : il ne relit pas un mois passé, il photographie les abonnements
          d’aujourd’hui et range la photo sous une étiquette de mois. <strong>Un mois sauté ne se rattrape pas</strong>{' '}
          — il reste un trou nommé dans la série, parce qu’un instantané ne se recalcule jamais et qu’une photo
          d’aujourd’hui étiquetée « mars » serait un mensonge durable.
        </span>
      </div>

      {message ? (
        <p className="subtitle" style={{ marginTop: 0 }}>
          {message}
        </p>
      ) : null}
      {erreur ? (
        <div className="error" style={{ margin: '12px 0' }}>
          {erreur}
        </div>
      ) : null}

      {series.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <EmptyState
            icon="◷"
            message="Aucun mois figé. La série commencera au premier instantané — et son mrrStart sera « — », pas 0 : on ne mesurait rien avant."
          />
        </div>
      ) : (
        <DataTable rows={[...series].reverse()} columns={colonnes} rowKey={row => row.month} maxHeight={420} />
      )}
    </section>
  )
}

/** `YYYY-MM` du mois précédent. Local au panneau : rien d'autre ne le demande. */
function moisPrecedent(month: string): string {
  const [anneeBrute = '', moisBrut = ''] = month.split('-')
  const annee = Number(anneeBrute)
  const mois = Number(moisBrut)
  if (!Number.isInteger(annee) || !Number.isInteger(mois) || mois < 1 || mois > 12) return month
  return mois === 1 ? `${annee - 1}-12` : `${annee}-${String(mois - 1).padStart(2, '0')}`
}
