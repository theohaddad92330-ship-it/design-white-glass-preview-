import { Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatCount } from '@/lib/locale'
import { Amounts } from '@/features/pilotage/finance/FinanceForecastHorizons'
import type { Money } from '@bellum/contracts'

/**
 * #2408.63 / #2408.64 / #2408.65 — LES TROIS TUILES KPI DU COCKPIT QUI NE
 * DUPLIQUENT RIEN DE DÉJÀ AFFICHÉ SUR CET ÉCRAN.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI SEULEMENT TROIS DES NEUF DEMANDÉES (#2408, section « KPI utiles »)
 * ─────────────────────────────────────────────────────────────────────────
 * Quatre lots successifs (25 au 27/09/2026, #2979) ont laissé les neuf en
 * « reste, cadrage requis » : construire les neuf sans trier aurait
 * reproduit, tuile par tuile, des chiffres déjà affichés SOUS UNE AUTRE
 * FORME sur CET écran — exactement ce que la loi 4 du tome 7 interdit
 * (`MissionsToolbar.tsx:32-40`, déjà invoquée ici pour « 1 renouvellement à
 * engager » / « 1 marge non mesurable »).
 *
 * Les six tuiles ÉCARTÉES, et où leur population vit déjà :
 *  - **Renouvellements à engager** (.66) → la pastille `toRenew` de
 *    `MissionsToolbar` compte EXACTEMENT la même population, sur ce MÊME
 *    écran (`MissionsPage.tsx:586-595`).
 *  - **Consultants bientôt disponibles** (.67) → idem, pastille
 *    `consultantsSoonAvailable` (#2408.60).
 *  - **Marge non mesurée** (.70) → `withRisk`/`marginAtRisk` comptent déjà
 *    les risques de marge sur ce même écran ; un troisième compteur pour
 *    `margin_unknown` seul romprait la même règle que celle qui a exclu la
 *    « marge non mesurable » de la synthèse d'attention de #1348.
 *  - **CA facturable non facturé** (.68) → la tuile « Prêt à facturer »
 *    (`MissionTrackingTiles.tsx`, `/missions/suivi`) porte déjà ce nombre,
 *    sur SON mois nommé — l'atteindre est déjà #2408.77 (action de ligne
 *    « préparer la facture »).
 *  - **Factures échues** (.69) → idem, tuile « Paiements en retard »
 *    (`MissionTrackingTiles.tsx`) — atteinte par #2408.78.
 *
 * Les trois GARDÉES ne recoupent RIEN de ce qui précède :
 *  - **Missions actives** (.63) : aucune pastille ni tuile ne compte
 *    aujourd'hui la population de CETTE lentille — un simple total, jamais
 *    calculé une seconde fois (c'est `missions.length`, déjà lu par la
 *    page).
 *  - **Revenu mensuel sécurisé** / **Revenu à risque** (.64/.65) : deux
 *    montants qu'AUCUNE tuile de ce dépôt n'affiche en tête de page — ils
 *    vivent, détaillés, dans le prévisionnel par horizon de `/pilotage`
 *    (scénario `downside`, décision `unblockMission`, #2425) sous forme de
 *    carte de scénario et de ligne de décision, jamais sous forme de tuile
 *    KPI. `kpis.ts` les LIT, ne les recalcule pas (GA-26).
 *
 * #2408.71 — « KPI 0 = zéro réel » : `activeMissionsCount` est un compte
 * réel, un zéro y est un zéro. Les deux montants sont `undefined` (non
 * mesuré — `finance:read` absent, requête en cours ou en échec) ou `null`
 * (mesuré, sans ligne chiffrable) ou une liste de montants — jamais un
 * « 0 € » deviné en silence (`UnknownValue`/`Amounts`, même convention que
 * `/pilotage/finance`).
 */
export function MissionCockpitKpiTiles({
  activeMissionsCount,
  canReadFinance,
  securedRevenue,
  atRiskRevenue,
  billing,
}: {
  /** #4193 — `missions_active` de `GET /crm-counters` ; `null` = non mesuré. */
  activeMissionsCount: number | null
  /** #2408.64/.65 — les deux montants ne se rendent que sous ce droit. */
  canReadFinance: boolean | undefined
  securedRevenue: Money[] | null | undefined
  atRiskRevenue: Money[] | null | undefined
  /** #2408.68/.69 — les tuiles de facturation, montées par l'appelant SOUS `finance:read` seulement. */
  billing?: React.ReactNode
}) {
  const { t } = useTranslation('missions')

  return (
    <Box
      className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${billing ? 'lg:grid-cols-5' : ''}`}
      data-testid="mission-cockpit-kpis"
    >
      <Tile label={t('cockpitKpis.activeMissions')} period={t('cockpitKpis.periodNow')}>
        {activeMissionsCount === null ? (
          <UnknownValue />
        ) : (
          <Text size="xl" weight="semibold">
            {formatCount(activeMissionsCount)}
          </Text>
        )}
      </Tile>

      <Tile label={t('cockpitKpis.securedRevenue')} period={t('cockpitKpis.periodThisMonth')} href="/pilotage">
        <MoneyReading
          canReadFinance={canReadFinance}
          amounts={securedRevenue}
          financeHidden={t('cockpitKpis.financeHidden')}
        />
      </Tile>

      <Tile label={t('cockpitKpis.atRiskRevenue')} period={t('cockpitKpis.periodThisMonth')} href="/missions">
        <MoneyReading
          canReadFinance={canReadFinance}
          amounts={atRiskRevenue}
          financeHidden={t('cockpitKpis.financeHidden')}
          color="text-[var(--warning-soft-text)]"
        />
      </Tile>
      {billing}
    </Box>
  )
}

/**
 * #2408.71 — LE RENDU D'UN MONTANT QUI PEUT MANQUER, en une seule ligne.
 *
 * ⚠️ Jamais `<UnknownValue />` NICHÉ dans un `<Text>` : elle en rend déjà un
 * (`<p>`), et l'emboîter romprait le HTML (`<p>` dans `<p>`). Cette garde
 * choisit donc le CONTENEUR une seule fois, pas seulement le contenu.
 */
function MoneyReading({
  canReadFinance,
  amounts,
  financeHidden,
  color,
}: {
  canReadFinance: boolean | undefined
  amounts: Money[] | null | undefined
  financeHidden: string
  color?: string
}) {
  const { t } = useTranslation('missions')
  if (!canReadFinance) return <UnknownValue reason={financeHidden} />
  if (amounts === undefined)
    return (
      <Text size="sm" color="text-muted-foreground">
        {t('common:states.loading')}
      </Text>
    )
  if (amounts === null) return <UnknownValue />
  return (
    <Text size="xl" weight="semibold" color={color}>
      <Amounts amounts={amounts} />
    </Text>
  )
}

/**
 * ⚠️ Aucune couleur hexadécimale, aucun `<div onClick>` — même garde que
 * `Tile` de `MissionTrackingTiles.tsx` (GA-35, D79) : une tuile qui renvoie
 * ailleurs est un LIEN dont le nom accessible dit l'effet, pas seulement ce
 * qu'elle compte.
 */
// L15 — exportée pour `MissionBillingKpiTiles` (#2408.68/.69) : une tuile, un seul dessin (GA-26).
export function Tile({
  label,
  period,
  children,
  href,
}: {
  label: string
  period: string
  children: React.ReactNode
  href?: '/pilotage' | '/missions' | '/missions/facturation' | '/missions/encaissements'
}) {
  const body = (
    <>
      <Text size="xs" color="text-muted-foreground">
        {label}
      </Text>
      {children}
      <Text size="xs" color="text-muted-foreground">
        {period}
      </Text>
    </>
  )
  const shell = 'flex flex-col gap-1 rounded-xl border border-[var(--bellum-border)] p-4 text-left'
  if (href) {
    return (
      <Link to={href} aria-label={label} className={`${shell} hover:bg-[var(--bg-surface-hover)]`}>
        {body}
      </Link>
    )
  }
  return <div className={shell}>{body}</div>
}
