import { intelligenceEstimateKind, type AccountIntelligenceRecommendation } from '@bellum/contracts'
import { Badge, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import { Provenance } from '@/components/primitives/Provenance'
import { formatDate } from '@/lib/locale'
import type { TabId } from '../../components/AccountDetailTabsBar'

/**
 * #2116.17-24 — UNE recommandation et ses HUIT métadonnées.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES HUIT SONT RENDUES, ET AUCUNE N'EST MASQUÉE QUAND ELLE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le prédécesseur (`BellumRecommendation`) affichait un libellé et une
 * justification — et n'avait aucun appelant. Les huit que le retour demande
 * changent le GESTE du commercial : une inférence se relit, un fait se cite,
 * une information sans date se revérifie avant un rendez-vous.
 *
 * Ce qui manque est NOMMÉ : pas de date ⇒ « date inconnue » (#2116.19), pas de
 * corroboration ⇒ le niveau se lit seul, sans compte inventé (#2116.21).
 *
 * ⚠️ L'action PROPOSE. Elle ouvre un onglet du dossier — elle n'envoie rien et
 * n'écrit rien : « le copilote prépare, le commercial envoie ».
 */
export function AccountRecommendationCard({
  recommendation,
  onTabChange,
}: {
  recommendation: AccountIntelligenceRecommendation
  onTabChange: (tab: TabId) => void
}) {
  const { t } = useTranslation('accountDetail')
  const { confidence } = recommendation
  // RV4-E-FIX 4295.21 (#4016.46) — une recommandation tirée d'un prior de la base de référence, d'un parcours vu
  // ailleurs ou d'une inférence est une HYPOTHÈSE : badgée « estimé » avec sa base (la base ne se nomme jamais).
  const estimate = intelligenceEstimateKind(recommendation.provenance.source, 'hypothesis')
  const [elementsOpen, setElementsOpen] = useState(false)
  // #3672.5 — une période n'existe que pour un HISTORIQUE, et seulement si la date est lisible : jamais devinée.
  const periodEnd = HISTORICAL_SOURCES.has(recommendation.provenance.source)
    ? formatDate(recommendation.provenance.observedAt, { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  return (
    // #2117.50 — un élément PRÉPARÉ AUTOMATIQUEMENT PAR BELLUMAI (ici, une
    // action que le modèle a déduite, jamais un fait relevé) se distingue en
    // lavande — le trio `--accent-soft-bg/-border/-text`, déjà mesuré AA des
    // deux thèmes et déjà en usage ailleurs (discover, onboarding, chat),
    // jamais dans le dossier de compte. Un fond OPAQUE garde son propre
    // texte : la couleur n'est PAS une opacité posée sur le fond du thème.
    <div className="rounded-md border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-3 py-3 text-[var(--accent-soft-text)]">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {/* #2116.17 — la NATURE : fait / observation / inférence / correction. */}
        <Badge variant="outline">{t(`recommendationMeta.nature.${recommendation.nature}`)}</Badge>
        {/* #2116.20 — la fraîcheur, dont « date inconnue » qui n'est pas une durée. */}
        <Badge variant="outline">{t(`recommendationMeta.freshness.${recommendation.freshness}`)}</Badge>
        {estimate ? (
          <EstimatedBadge kind={estimate} basis={t(`estimateBasis.${recommendation.provenance.source}`)} />
        ) : null}
        {/* #2116.21 — un NIVEAU nommé, jamais un pourcentage. Le compte de
            sources concordantes le justifie quand on l'a. */}
        {/* #3672 (Louis 10/10) — le niveau « déduite » ne fait plus de badge : doublon de la ligne
            Provenance « Hypothèse à valider ». Les autres niveaux restent nommés. */}
        {confidence.level === 'deduced' ? null : (
          <Badge variant="outline">
            {confidence.corroborationCount && confidence.corroborationCount > 1
              ? t('recommendationMeta.confidenceCorroborated', {
                  level: t(`recommendationMeta.confidence.${confidence.level}`),
                  count: confidence.corroborationCount,
                })
              : t(`recommendationMeta.confidence.${confidence.level}`)}
          </Badge>
        )}
      </div>

      <Text size="sm" weight="medium">
        {recommendation.label}
      </Text>
      {recommendation.detail ? (
        <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
          {recommendation.detail}
        </Text>
      ) : null}

      <dl className="mt-2 space-y-1">
        {/* #3712.6 (DEC-4036 Q9, Louis 19/10 : « c'est parasite ») — la limite (#2116.22, « Ne couvre
            pas : … ») ne s'affiche plus sur la fiche compte. Le champ reste au contrat, non rendu. */}
        {/* #2116.23 — la vérification la moins chère qui tranche. */}
        <MetaLine
          label={t('recommendationMeta.checkLabel')}
          value={t(`recommendationMeta.check.${recommendation.check}`)}
        />
      </dl>

      {/* #3672.5 — « Voir les éléments » : l'origine détaillée, la période couverte et le chemin vers les
          preuves AUTORISÉES, sans quitter la recommandation. Replié : la lecture principale reste fait + implication. */}
      <button
        type="button"
        aria-expanded={elementsOpen}
        onClick={() => setElementsOpen(open => !open)}
        className="mt-2 min-h-11 rounded-md px-2 text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
      >
        {t('recommendationMeta.elements.toggle')}
      </button>
      {elementsOpen ? (
        // #3672 (VISUEL, recette prod 07/10) — le panneau n'a plus de padding gauche : « Voir les éléments »
        // (x=319) et « Ouvrir les preuves du compte » (x=332) partagent désormais le MÊME bord gauche ; les
        // textes reprennent le `px-2` des boutons.
        <div className="space-y-1 border-t border-[var(--bellum-border)] py-2">
          {periodEnd ? (
            // #3672 (R4 07/10, réfuté en recette) — calculable (historique ET daté), elle s'affiche.
            <>
              <Text size="xs" className="block px-2 text-[var(--bellum-text-secondary)]">
                {t('recommendationMeta.elements.period', { date: periodEnd })}
              </Text>
              <Text size="xs" className="block px-2 text-[var(--bellum-text-muted)]">
                {t('recommendationMeta.elements.periodNotLatest')}
              </Text>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => onTabChange('proofs')}
            className="min-h-11 rounded-md px-2 text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
          >
            {t('recommendationMeta.elements.openProofs')}
          </button>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {/* #2116.18 (la source) + #2116.19 (la date, ou son absence NOMMÉE). */}
        <Provenance
          source={recommendation.provenance.source}
          observedAt={recommendation.provenance.observedAt}
          nameMissingDate
        />
        {/* #2116.24 — un bouton qui OUVRE. Aucun chemin d'envoi ici (GA-35 :
            ce qui se clique se tabule, donc un vrai <button>). */}
        <button
          type="button"
          onClick={() => onTabChange(RECOMMENDATION_ACTION_TABS[recommendation.action])}
          className="min-h-11 rounded-md px-2 text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
        >
          {t(`recommendationMeta.action.${recommendation.action}`)}
        </button>
      </div>
    </div>
  )
}

/**
 * L'onglet qu'ouvre chaque action — la carte vit ICI, à un seul endroit
 * (GA-26), et elle est TOTALE : ajouter une action au contrat sans lui donner
 * de destination ne compile pas.
 *
 * ⚠️ `prepare_message` ouvre les contacts : préparer un message commence par
 * choisir à QUI. Il n'existe aucune destination qui envoie.
 */
const HISTORICAL_SOURCES: ReadonlySet<AccountIntelligenceRecommendation['provenance']['source']> = new Set([
  'dataforge',
  'market_memory',
])

const RECOMMENDATION_ACTION_TABS: Record<AccountIntelligenceRecommendation['action'], TabId> = {
  open_contacts: 'contacts',
  open_plan: 'plan',
  prepare_message: 'contacts',
  open_sources: 'proofs',
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {label}
        </Text>
      </dt>
      <dd className="min-w-0">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {value}
        </Text>
      </dd>
    </div>
  )
}
