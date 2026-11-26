import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import type { CollectionsBucket, summarizeCollections } from '@/features/missions/collections'
import { formatCents } from '@/lib/money'

/**
 * #2564.3 — LES ENCAISSEMENTS, sur `/pilotage/finance`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE LENTILLE, PAS UN SECOND `/missions/encaissements`
 * ─────────────────────────────────────────────────────────────────────────
 * `/missions/encaissements` (`CollectionsPage.tsx`) porte déjà TOUT le calcul
 * — la fenêtre glissante de douze mois, le statut ligne à ligne, les quatre
 * seaux (`collectionStatus`, `summarizeCollections`, `../missions/collections`)
 * — et son propre commentaire de tête le dit : « les deux écrans ne montrent
 * pas la même population ». Ce bloc ne recalcule RIEN : il reçoit le même
 * agrégat (`summarizeCollections`) déjà produit pour l'écran opérationnel, et
 * se contente de le totaliser en quatre chiffres avec un lien vers le détail —
 * exactement le patron déjà posé par `FinanceAdvBlock` et
 * `FinanceTimesheetBands` pour l'ADV et les relevés.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2419.9 — LE CINQUIÈME BLOC, « NON RAPPROCHÉ », UNE SOURCE À PART
 * ─────────────────────────────────────────────────────────────────────────
 * Sa donnée ne vient PAS de `summarizeCollections` : ce sont les paiements
 * CONSTATÉS (#2419.1, `GET /delivery/payments`, `unmatched`) qu'aucun humain
 * n'a encore rattachés à une facture — `unmatchedPaymentsBucket`
 * (`../missions/collections`). Un AGRÉGAT de paiements, jamais un cinquième
 * statut de LIGNE facturée (c72) : les quatre statuts d'encaissement restent
 * inchangés. Sa lecture peut échouer (`unmatchedFailed`) SANS faire échouer
 * les quatre autres — deux requêtes indépendantes, deux échecs indépendants.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `null` N'EST JAMAIS `0`
 * ─────────────────────────────────────────────────────────────────────────
 * Un seau à `amountCents: null` (aucune ligne chiffrable) reste `null` ici :
 * « pas encore encaissé » n'est pas « 0 € encaissé ». Un seau VIDE
 * (`count: 0`), en revanche, affiche bien 0 — c'est un fait vrai, pas une
 * absence de mesure. `summarizeCollections` porte déjà cette distinction ;
 * ce composant ne fait que la RENDRE.
 */
type CollectionsSummary = ReturnType<typeof summarizeCollections>

export function FinanceCollectionsSummary({
  summary,
  canReadFinance,
  loading,
  failed,
  unmatched,
  unmatchedLoading,
  unmatchedFailed,
}: {
  summary: CollectionsSummary | null
  canReadFinance: boolean
  loading: boolean
  failed: boolean
  /** #2419.9 — `null` tant que non chargé ; jamais recalculé ici. */
  unmatched: CollectionsBucket | null
  unmatchedLoading: boolean
  /** Une requête à part (`GET /delivery/payments`) : son échec ne doit pas
   *  faire disparaître les quatre autres seaux. */
  unmatchedFailed: boolean
}) {
  const { t } = useTranslation(['pilotage', 'missions'])

  if (loading) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('loading')}
      </Text>
    )
  }
  if (failed || !summary) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('finance.unavailable')}
      </Text>
    )
  }

  const buckets: Array<{ key: 'paid' | 'pending' | 'overdue' | 'disputed'; bucket: CollectionsSummary['paid'] }> = [
    { key: 'paid', bucket: summary.paid },
    { key: 'pending', bucket: summary.pending },
    { key: 'overdue', bucket: summary.overdue },
    { key: 'disputed', bucket: summary.disputed },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* #2744.2 — CETTE GRILLE SE MESURE À SON CONTENEUR, PAS À LA FENÊTRE.
          `lg:grid-cols-5` posait son compte de colonnes sur un palier de
          FENÊTRE alors qu'elle vit dans `FinanceScreen.tsx`, qui divise déjà
          la page sur ce MÊME signal (`md:grid-cols-2` — cette carte partage
          la moitié de la fenêtre avec un autre bloc). À `lg`, la grille
          croyait disposer de toute la largeur et forçait 5 colonnes égales
          dans un conteneur qui n'en faisait que la moitié : chaque carte
          héritait d'environ 85 px, et le montant de « En attente » — trop
          large pour y tenir — se rendait en lettre-à-lettre (85 × 100 px,
          recette écran du 23/09, #2744). Même famille que #2652 (GA-373,
          `une-colonne-se-mesure-a-son-conteneur.test.ts`) :
          `auto-fit`/`minmax` mesure la largeur RÉELLE du conteneur reçu,
          quel que soit ce qui l'entoure, comme `SectorPicker.tsx` /
          `FilterRail.tsx` l'ont déjà fait pour ce même défaut. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        {buckets.map(({ key, bucket }) => (
          <div key={key} className="min-w-0 rounded-md border border-[var(--bellum-border)] p-2">
            <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
              {/* Les libellés des seaux vivent déjà dans l'espace de noms
                  « missions » (`/missions/encaissements`) : les recopier ici en
                  ferait deux jeux, qui divergeraient au premier renommage. */}
              {t(`missions:collections.buckets.${key}`)}
            </Text>
            {canReadFinance && bucket.count > 0 ? (
              bucket.amountCents === null ? (
                <UnknownValue reason={t('missions:collections.noAmount')} />
              ) : (
                <Text size="lg" weight="semibold" className="block text-[var(--bellum-text-primary)]">
                  {formatCents(bucket.amountCents)}
                </Text>
              )
            ) : (
              <Text size="lg" weight="semibold" className="block text-[var(--bellum-text-primary)]">
                {/* Un seau VIDE (aucune ligne) est un fait vrai : 0 est ici la
                    bonne réponse, pas un repli sur l'inconnu. */}
                {canReadFinance ? formatCents(0) : null}
              </Text>
            )}
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {t('missions:collections.invoiceCount', { count: bucket.count })}
            </Text>
            {/* r3a (recette prod 07/10) — « Encaissé » nomme sa PÉRIODE et sa SOURCE juste sous le
                chiffre, comme la ligne « Encaissé » du chiffre d'affaires (#3709) : même suivi de
                facturation, fenêtre glissante de douze mois ici, mois choisi là-bas. */}
            {key === 'paid' ? (
              <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                {t('finance.collections.paidCaption')}
              </Text>
            ) : null}
          </div>
        ))}
        {/* #2419.9 — « NON RAPPROCHÉ » : une SOURCE à part (les paiements
            CONSTATÉS, #2419.1), donc une requête à part, avec son propre
            chargement et son propre échec — un 403 ici n'efface pas les
            quatre seaux au-dessus. */}
        <div className="min-w-0 rounded-md border border-[var(--bellum-border)] p-2">
          <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
            {t('missions:collections.buckets.unmatched')}
          </Text>
          {unmatchedLoading ? (
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {t('loading')}
            </Text>
          ) : unmatchedFailed || !unmatched ? (
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {t('finance.unavailable')}
            </Text>
          ) : (
            <>
              {canReadFinance && unmatched.count > 0 ? (
                unmatched.amountCents === null ? (
                  <UnknownValue reason={t('missions:collections.noAmount')} />
                ) : (
                  <Text size="lg" weight="semibold" className="block text-[var(--bellum-text-primary)]">
                    {formatCents(unmatched.amountCents)}
                  </Text>
                )
              ) : (
                <Text size="lg" weight="semibold" className="block text-[var(--bellum-text-primary)]">
                  {/* Un seau VIDE (aucun paiement en attente) est un fait vrai :
                      0 est ici la bonne réponse, pas un repli sur l'inconnu. */}
                  {canReadFinance ? formatCents(0) : null}
                </Text>
              )}
              <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                {t('missions:collections.invoiceCount', { count: unmatched.count })}
              </Text>
            </>
          )}
        </div>
      </div>
      {summary.withoutDueDate > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('missions:collections.withoutDueDate', { count: summary.withoutDueDate })}
        </Text>
      ) : null}
      <Link
        to="/missions/encaissements"
        aria-label={t('finance.detailAria', { title: t('finance.collections.title') })}
        className="w-fit rounded-md text-xs text-[var(--bellum-text-accent)] underline underline-offset-4 hover:no-underline"
      >
        {t('finance.detail')}
      </Link>
    </div>
  )
}
