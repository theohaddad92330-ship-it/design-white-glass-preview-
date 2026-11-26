import { useMemo } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { AuditHypothesis, AuditMove, EntryStrategy, FirstAnalysisSuggestion } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { attachChatConversationAuditSnapshot } from '@/features/chat/api/agentChatApi'
import { newConversationId } from '@/features/chat/lib/conversation'
import { AuditCard } from './AuditCard'
import { AuditSources } from './AuditSources'
import { ShareAudit } from './ShareAudit'
import { unestablishedReasonText } from './AuditUnestablished'
import { ValidateContextStatus } from './ValidateContextStatus'
import { auditFreshness } from '../lib/audit-freshness'
import { renderAuditHeadlineText } from '../lib/audit-headline-text'
import { AUDIT_HEADLINE_SOURCES } from '../lib/audit-sources'
import { useAuditPdfExport } from '../hooks/useAuditPdfExport'
import type { AuditHeadline, CommercialAudit } from '../lib/build-audit'

/**
 * #2071 — L'ENTÊTE QUI DONNE UNE CONCLUSION, PAS UN PARAGRAPHE.
 *
 * Cinq faits courts, chacun avec ce qui l'a produit. Ce qui manque le dit
 * (#2071.14 : « pas de paragraphe générique » se tient en n'écrivant AUCUNE
 * phrase de remplissage — un fait absent laisse « non mesuré », il ne laisse
 * pas une prose qui occupe la place).
 */
export function AuditHero({
  audit,
  validatedAt,
  isPendingReview = false,
  firstAnalysisSuggestions = [],
  weeklyPriorityAction = null,
  hypotheses = [],
  chosenEntryStrategy = null,
  firstMoves = [],
}: {
  audit: CommercialAudit
  /** D9 — décision Louis 14/09/2026 : valider le contexte commercial. */
  validatedAt: string | null
  /** #2010.1/.17 — tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md
   *  §1) : un résultat IA qui remplace une version antérieure n'est pas
   *  encore la vérité tant qu'il n'a pas été validé (voir
   *  `lib/revision-review-state.ts`). */
  isPendingReview?: boolean
  /** #2075.27/.28 — transmis TEL QUEL à `ValidateContextStatus` (le relais
   *  après validation). */
  firstAnalysisSuggestions?: readonly FirstAnalysisSuggestion[]
  /** #2075.27/.28 — idem. */
  weeklyPriorityAction?: string | null
  /** #2075.23 — LES MÊMES hypothèses que `AuditHypotheses` (dérivées des
   *  mêmes contradictions, GA-26) : le PDF exporté les distingue des faits
   *  et des recommandations, au lieu de les taire. */
  hypotheses?: readonly AuditHypothesis[]
  /** #2075.29 — la stratégie CHOISIE (`profiles.chosen_entry_strategy`),
   *  posée dans le snapshot audit à l'ouverture de « Demander à… ». */
  chosenEntryStrategy?: EntryStrategy | null
  /** #2075.29 — LES MÊMES premiers mouvements que `AuditFirstMoves` (GA-26,
   *  calculés une fois par `CommercialAuditScreen`), posés dans ce même
   *  snapshot. */
  firstMoves?: readonly AuditMove[]
}) {
  const { t, i18n } = useTranslation('commercialAudit')

  const formatDate = (iso: string): string => {
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return iso
    return parsed.toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  // #2084.14 — « tant qu'un compte n'est pas rejoué, son écran DIT que sa
  // collecte est antérieure » (décision Louis 18/09/2026, #2543), appliquée à
  // l'audit : `audit.updatedAt` est déjà le fait (ligne `hero.updatedAt`
  // au-dessus) ; `auditFreshness` n'y ajoute qu'un seuil de lecture pour
  // décider si la bannière ci-dessous doit paraître. Jamais de déclenchement
  // automatique — seul `requestRefresh` (le geste manuel existant,
  // `ReconfigureAnswersSection`) rejoue quoi que ce soit, et seulement sur
  // un clic humain.
  const freshness = auditFreshness(audit.updatedAt, new Date())
  // #2090.35 / #2074.9 — DÉCISION Louis 22/09 soir (decisions-louis-22-09-soir.md
  // §5) : un document PDF dédié (`@react-pdf/renderer`), comme le dossier de
  // compte — pas `window.print()`.
  const pdfExport = useAuditPdfExport(audit, hypotheses)

  /**
   * #2075.29 / #2075.30 — LA CONVERSATION CONSERVE CE QUE L'AUDIT DISAIT.
   *
   * Un fil NEUF miné une fois par montage (même patron que `newConversationId()`
   * appelé par `Chat.tsx` lui-même) : cliquer plusieurs fois sans naviguer garde
   * le MÊME fil, exactement ce que l'utilisateur attend d'un lien qui n'a pas
   * encore été suivi. Passé dans l'URL (`?conversationId=`, le même paramètre
   * que « Partager ») pour que `/chat` ouvre CE fil précis plutôt que d'en tirer
   * un second au hasard.
   *
   * Le snapshot pose du texte déjà RENDU (labels des mouvements, raisons des
   * inconnues) — jamais une seconde dérivation côté serveur (GA-26) : ce
   * fichier a déjà `t()` et les mêmes entrées que `AuditFirstMoves`/
   * `AuditUnestablished`.
   */
  const auditConversationId = useMemo(() => newConversationId(), [])
  const auditSnapshot = {
    auditVersion: audit.version,
    strategy: chosenEntryStrategy,
    firstActions: firstMoves.map(move => `${t(`moves.kind.${move.kind}`)} : ${move.subject}`),
    // #2075.30 — au plus douze (`chatConversationAuditSnapshotSchema`) : une
    // liste plus longue n'est jamais tronquée en silence côté contrat, donc
    // bornée ICI plutôt que de faire échouer tout le geste pour un excédent.
    unknowns: audit.unestablished.map(entry => unestablishedReasonText(entry, t)).slice(0, 12),
  }

  return (
    <section className="space-y-5">
      {/* Maquette Théo V22 `.ob20-heading` : l'eyebrow, le titre de niveau 1, la phrase. */}
      <div className="space-y-2">
        <Text
          element="p"
          size="xs"
          weight="semibold"
          className="uppercase tracking-widest text-[var(--bellum-text-muted)]"
        >
          {t('profile:framing.eyebrow')}
        </Text>
        <Text element="h1" size="3xl" weight="semibold" className="tracking-tight">
          {t('hero.title')}
        </Text>
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('hero.subtitle')}
        </Text>
        {/* #2071.8 / #2071.9 — la version et sa date sont lues sur les
            instantanés du profil. Sans instantané, elles le DISENT : écrire
            « v1 » serait inventer une histoire que la base n'a pas. */}
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {audit.version === null ? t('hero.versionUnknown') : t('hero.version', { version: audit.version })}
          {' · '}
          {audit.updatedAt === null
            ? t('hero.updatedAtUnknown')
            : t('hero.updatedAt', { date: formatDate(audit.updatedAt) })}
        </Text>
        {/* D9 (14/09/2026) — bouton Valider : le clic EST la décision (geste
            utilisateur = auto-approuvé). Une fois validé, `triggerGeneration`
            arrête la régénération automatique tant que rien n'est réédité, et
            Laura cite le contexte comme validé (`esn-profile-workspace.
            resolver.ts::resolveProfileData` → `profileContextValidatedAt`). */}
        <ValidateContextStatus
          validatedAt={validatedAt}
          isPendingReview={isPendingReview}
          firstAnalysisSuggestions={firstAnalysisSuggestions}
          weeklyPriorityAction={weeklyPriorityAction}
        />
        {/* #2084.14 — jamais un jugement (« dépassé », « périmé ») : le FAIT
            daté, et le geste existant pour le rejouer si l'utilisateur le
            décide. */}
        {freshness.state === 'stale' && freshness.updatedAt !== null && (
          <div className="flex items-start gap-2 rounded-control border border-[var(--bellum-warning)]/40 bg-[color-mix(in_srgb,var(--bellum-warning)_10%,transparent)] p-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" />
            <div className="space-y-2">
              <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('hero.stale.message', { date: formatDate(freshness.updatedAt) })}
              </Text>
              <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
                <Link to="/settings/profile">{t('hero.stale.cta')}</Link>
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {audit.headlines.map(headline => (
          <HeadlineCard key={headline.key} headline={headline} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* #2071.12 — « Corriger une information » mène au questionnaire, la
            seule porte qui réécrit réellement le profil. */}
        <Button asChild variant="default" size="sm" className="pointer-coarse:min-h-11">
          <Link to="/settings/profile">{t('actions.correct')}</Link>
        </Button>
        {/* #2071.11 — « Demander à … » ouvre le copilote avec la question
            PRÉ-REMPLIE et non envoyée : c'est l'utilisateur qui décide.
            #2075.29/.30 — le clic pose AUSSI le snapshot audit sur ce fil
            précis (`?conversationId=`), best-effort : une écriture ratée ne
            bloque jamais la navigation, elle laisse seulement la conversation
            sans ce snapshot. */}
        <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
          <Link
            to="/chat"
            search={{ prompt: t('actions.copilotPrompt'), conversationId: auditConversationId }}
            onClick={() => {
              void attachChatConversationAuditSnapshot(auditConversationId, auditSnapshot).catch(() => {})
            }}
          >
            {t('actions.askCopilot')}
          </Link>
        </Button>
        {/* #2075.20 / #2075.18 / #2075.19 — voir les sources, comparer et
            restaurer une version existent DÉJÀ sur l'écran du contexte de
            profil : on y mène, on ne les recode pas ici. */}
        <Button asChild variant="ghost" size="sm" className="pointer-coarse:min-h-11">
          <Link to="/settings/profile/context">{t('actions.sources')}</Link>
        </Button>
        {/* #2090.35 / #2074.9 — un document PDF DÉDIÉ, fabriqué dans le
            navigateur (même patron que le dossier de compte,
            `useAccountPdfExport`) : aucun popup, aucun dialogue d'impression. */}
        <Button
          variant="outline"
          size="sm"
          className="pointer-coarse:min-h-11"
          onClick={() => void pdfExport.exportPdf()}
          disabled={pdfExport.isExporting}
        >
          <Download aria-hidden="true" className="size-4" />
          {t('actions.exportPdf')}
        </Button>
        {/* #2075.17 — DÉSIGNER l'audit à un collègue : même patron que
            `ShareConversation` (#1955.13), aucune API — l'audit est déjà
            visible à tout l'espace par construction. */}
        <ShareAudit />
      </div>
    </section>
  )
}

function HeadlineCard({ headline }: { headline: AuditHeadline }) {
  const { t } = useTranslation('commercialAudit')
  const value = headline.value

  return (
    <AuditCard>
      <Text
        element="h2"
        size="xs"
        weight="semibold"
        className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
      >
        {t(`headline.${headline.key}`)}
      </Text>
      <div className="mt-1.5 space-y-1">
        {value === null ? (
          <>
            {/* Le mot « non mesuré » vit à UN seul endroit (common), il n'est
                pas réécrit ici. */}
            <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
              {t('common:unknownValue')}
            </Text>
            <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('columns.origin', { origin: t(`origin.${headline.origin}`) })}
            </Text>
          </>
        ) : (
          <>
            <Text element="p" size="sm" weight="medium">
              {renderAuditHeadlineText(value, t)}
            </Text>
            {value.kind === 'target' && (
              <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                {value.sectors.length > 0
                  ? t('target.sectors', { sectors: value.sectors.join(', ') })
                  : t('target.sectorsNone')}
              </Text>
            )}
          </>
        )}
      </div>
      {/* #4425.1 — la valeur est CALCULÉE : elle ne s'édite pas, sa source si. */}
      <AuditSources answerKeys={AUDIT_HEADLINE_SOURCES[headline.key]} />
    </AuditCard>
  )
}
