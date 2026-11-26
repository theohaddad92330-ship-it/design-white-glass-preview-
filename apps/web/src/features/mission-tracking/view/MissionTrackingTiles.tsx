import { Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatCents } from '@/lib/money'
import { formatCount } from '@/lib/locale'
import type { CollectionsBucket } from '@/features/missions/collections'
import type { ReadinessSummary } from '@bellum/contracts'

type TimesheetSummary = { awaiting: number; blocking: number } | undefined

/**
 * LES CINQ TUILES — chacune une lecture RÉELLE déjà calculée ailleurs,
 * aucune inventée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1379 — CE QUE CE LOT LEUR AJOUTE, ET CE QU'IL LEUR REFUSE
 * ─────────────────────────────────────────────────────────────────────────
 * « Conserver les KPI existants mais les rendre réellement actionnables : un
 * chiffre principal, une metadata courte, sa PÉRIODE, et cliquable — clic =
 * filtre la table sur ces paiements. »
 *
 * Livré : la période, et le clic. **Pas le filtre**, et la raison a été
 * MESURÉE en production le 04/09/2026 : la tuile « Paiements en retard »
 * annonçait 2, et le filtre rendait ZÉRO ligne. « Prêt à facturer » annonçait
 * 9 pour 8 lignes.
 *
 * ⚠️ **Les tuiles et la table ne comptent pas la même population, et c'est
 * structurel.** Les encaissements se lisent sur une fenêtre de DOUZE MOIS
 * (`collectionMonths`), les relevés et la facturation sur le mois PRÉCÉDENT
 * (`useInvoiceReadiness()` sans argument, D781), et la table ne porte que les
 * missions ACTIVES. Trois dénominateurs, trois populations. Un filtre qui vide
 * la table sous un compteur à 2 est exactement le motif « même nom, forme
 * différente » — et il transforme un chiffre juste en promesse fausse.
 *
 * La réponse tient dans le retour lui-même : « ne pas recréer les écrans
 * Finance/Facturation — cette page SYNTHÉTISE puis RENVOIE vers eux ». Chaque
 * tuile mène donc à l'écran qui porte SA population et sait la montrer
 * entière. Le filtrage de CETTE table, lui, est assuré par ses deux vues
 * (#1378), dont les comptes sont pris sur les lignes qu'elle affiche.
 *
 * La seule exception est « Missions actives » : son compte EST celui de la
 * table (dix et dix, mesurés). Elle reste un bouton, et elle ouvre la vue
 * complète — le seul geste de filtrage qu'elle puisse tenir sans mentir.
 *
 * ⚠️ Aucun delta (« +2 vs mois dernier ») : aucune des cinq lectures ne porte
 * de comparaison période/période aujourd'hui. L'omettre est le choix honnête —
 * l'écrire « +0 » en attendant laisserait croire à une mesure qui n'existe pas.
 */
export function MissionTrackingTiles({
  activeMissionsCount,
  craSummary,
  readinessSummary,
  readinessCanReadFinance,
  overdueBucket,
  collectionsCanReadFinance,
  collectionsWindowMonths,
  marginPercent,
  marginMonth,
  marginForbidden,
  period,
  onShowAll,
}: {
  activeMissionsCount: number
  craSummary: TimesheetSummary
  readinessSummary: ReadinessSummary | undefined
  readinessCanReadFinance: boolean
  overdueBucket: CollectionsBucket | undefined
  collectionsCanReadFinance: boolean
  collectionsWindowMonths: number
  marginPercent: number | null | undefined
  marginMonth: string | undefined
  marginForbidden: boolean
  /** Le mois que le serveur a lu pour les relevés et la facturation. */
  period: string | undefined
  /** Ouvre la vue complète de la table — le seul filtrage exact d'une tuile. */
  onShowAll: () => void
}) {
  const { t } = useTranslation('missionTracking')

  return (
    <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {/* La seule tuile dont le compte est CELUI de la table. */}
      <Tile
        label={t('tiles.activeMissions')}
        period={t('tiles.periodNow')}
        onSelect={onShowAll}
        selectLabel={t('tiles.showAll')}
      >
        <Text size="xl" weight="semibold">
          {formatCount(activeMissionsCount)}
        </Text>
      </Tile>

      <Tile label={t('tiles.craToValidate')} period={period} href="/missions/cra" hrefLabel={t('tiles.openCra')}>
        {craSummary ? (
          <>
            <Text size="xl" weight="semibold">
              {formatCount(craSummary.awaiting)}
            </Text>
            {craSummary.blocking > 0 ? (
              <Text size="xs" color="text-[var(--warning-soft-text)]">
                {t('tiles.craBlocking', { count: craSummary.blocking })}
              </Text>
            ) : null}
          </>
        ) : (
          <UnknownValue />
        )}
      </Tile>

      <Tile
        label={t('tiles.readyToInvoice')}
        period={period}
        href="/missions/facturation"
        hrefLabel={t('tiles.openInvoicing')}
      >
        {readinessSummary ? (
          <>
            <Text size="xl" weight="semibold">
              {formatCount(readinessSummary.ready)}
            </Text>
            {readinessCanReadFinance ? (
              readinessSummary.preparedAmountCents !== null ? (
                <Text size="xs" color="text-muted-foreground">
                  {formatCents(readinessSummary.preparedAmountCents)}
                </Text>
              ) : null
            ) : (
              <UnknownValue reason={t('tiles.financeHidden')} />
            )}
          </>
        ) : (
          <UnknownValue />
        )}
      </Tile>

      <Tile
        label={t('tiles.overduePayments')}
        // ⚠️ PAS le mois précédent : les encaissements se lisent sur une fenêtre
        // de douze mois. Recopier la période des deux tuiles voisines aurait
        // annoncé un chiffre sur un mois alors qu'il en couvre douze — et c'est
        // précisément cet écart qui rendait le filtre faux.
        period={t('tiles.periodWindow', { count: collectionsWindowMonths })}
        href="/missions/encaissements"
        hrefLabel={t('tiles.openCollections')}
      >
        {overdueBucket ? (
          <>
            <Text size="xl" weight="semibold">
              {formatCount(overdueBucket.count)}
            </Text>
            {collectionsCanReadFinance ? (
              overdueBucket.amountCents !== null ? (
                <Text size="xs" color="text-[var(--warning-soft-text)]">
                  {formatCents(overdueBucket.amountCents)}
                </Text>
              ) : null
            ) : (
              <UnknownValue reason={t('tiles.financeHidden')} />
            )}
          </>
        ) : (
          <UnknownValue />
        )}
      </Tile>

      {/* #2575.1 — ce chiffre est aggregateMargin, la marge COMMERCIALE, pas la brute */}
      <Tile
        label={t('tiles.commercialMargin')}
        period={marginMonth}
        href="/pilotage"
        hrefLabel={t('tiles.openPilotage')}
      >
        {marginForbidden ? (
          <UnknownValue reason={t('tiles.financeHidden')} />
        ) : marginPercent == null ? (
          <UnknownValue />
        ) : (
          <Text size="xl" weight="semibold">
            {marginPercent.toFixed(1)} %
          </Text>
        )}
      </Tile>
    </Box>
  )
}

/**
 * UNE TUILE — un bouton quand elle filtre, un lien quand elle renvoie ailleurs.
 *
 * ⚠️ Jamais un `<div onClick>` : ce qui se clique se tabule (GA-35). Et le nom
 * accessible dit ce que le clic FAIT (« Ouvrir les relevés d'activité »), pas
 * seulement ce que la tuile compte — sans quoi un lecteur d'écran annonce cinq
 * cibles dont aucune n'annonce son effet.
 *
 * ⚠️ Aucun `#FFFFFF`, aucun `#E8E8EE`, aucun `radius 12–14 px` : la spec de
 * #1385 en portait sept. Une couleur hexadécimale ne suit pas le thème (D79).
 */
function Tile({
  label,
  period,
  children,
  onSelect,
  selectLabel,
  href,
  hrefLabel,
}: {
  label: string
  period?: string
  children: React.ReactNode
  onSelect?: () => void
  selectLabel?: string
  href?: '/pilotage' | '/missions/cra' | '/missions/facturation' | '/missions/encaissements'
  hrefLabel?: string
}) {
  const body = (
    <>
      <Text size="xs" color="text-muted-foreground">
        {label}
      </Text>
      {children}
      {period ? (
        <Text size="xs" color="text-muted-foreground">
          {period}
        </Text>
      ) : null}
    </>
  )
  const shell =
    'flex flex-col gap-1 rounded-xl border border-[var(--bellum-border)] p-4 text-left hover:bg-[var(--bg-surface-hover)] pointer-coarse:min-h-11'

  if (href) {
    return (
      <Link to={href} aria-label={hrefLabel} className={shell}>
        {body}
      </Link>
    )
  }

  return (
    <button type="button" aria-label={selectLabel} onClick={onSelect} className={shell}>
      {body}
    </button>
  )
}
