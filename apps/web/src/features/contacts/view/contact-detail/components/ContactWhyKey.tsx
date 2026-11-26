import type { Contact } from '@bellum/contracts'
import { Badge, Button, LauraFace, Text, cn } from '@bellum/ui'
import { Check, ChevronDown, Copy, HelpCircle } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  contactScoreView,
  deriveLauraBrief,
  formatLauraBriefForCopy,
  hasStaleEmployer,
  scoreLabel,
  scoreTone,
} from '../contactDerive'
import { ContactReachabilityPastille } from '@/features/contacts/components/ContactReachabilityPastille'

const LINK_BUTTON =
  'h-auto gap-1 p-0 text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)] pointer-coarse:min-h-11'

/**
 * #3692 — le bloc court de Laura : pourquoi la personne compte, avec les FAITS
 * d'un côté et les HYPOTHÈSES « à vérifier » de l'autre. Il remplace
 * « Pourquoi c'est un contact clé » (#3155), la carte « psychologie » (retirée :
 * aucune ambition, peur ou trait psychologique) et le motif dupliqué de
 * « Utilité commerciale ». Pas d'onglet Intelligence : le détail riche est
 * replié ici, l'explication du score et les signaux restent à un clic.
 *
 * La source est la FUSION des textes déjà stockés (pas de nouvelle génération) ;
 * une hypothèse n'est jamais présentée ni copiée comme un fait. Une personne
 * mal documentée montre le connu et la vérification utile — rien ne bloque les
 * notes, l'historique ni l'édition qui suivent.
 */
export function ContactWhyKey({
  contact,
  onExplainScore,
  onOpenSignals,
  action,
}: {
  contact: Contact
  onExplainScore?: () => void
  onOpenSignals?: () => void
  /** Théo B c5.A23 — le geste contextuel (« Préparer la première approche / une reprise… »), dans la carte. */
  action?: ReactNode
}) {
  const score = contactScoreView(contact)
  const { t } = useTranslation('contacts')
  const [detailOpen, setDetailOpen] = useState(false)
  const brief = deriveLauraBrief(contact)
  const signalCount = (contact.signals ?? []).length
  // Une seule liste pour l'écran ET la copie : ce qu'on voit est ce qu'on copie.
  const hypothesisLines = [
    ...(brief.roleLabel ? [t('whyKey.probableRole', { role: brief.roleLabel })] : []),
    ...brief.hypotheses,
    ...(brief.askKey ? [t('whyKey.ask', { question: t(brief.askKey) })] : []),
  ]
  const showFacts = !brief.isThin && brief.facts.length > 0
  const showHypotheses = !brief.isThin && hypothesisLines.length > 0

  const copy = () => {
    const text = formatLauraBriefForCopy(
      brief,
      { facts: t('whyKey.facts'), hypotheses: t('whyKey.hypotheses') },
      hypothesisLines,
    )
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success(t('whyKey.copied')))
      .catch(() => toast.error(t('whyKey.copyError')))
  }

  return (
    // Théo B c5-fiche-contact `.focus-card` — le visage de Laura, « Pourquoi préparer cet échange », la priorité
    // en MOT (jamais « 8 / 9 ») avec « Comment est-elle calculée ? », et le geste contextuel (`action`).
    <section
      aria-labelledby="contact-why-title"
      data-testid="contact-focus-card"
      className="flex items-start gap-4 rounded-overlay border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] p-6 max-md:gap-3 max-md:p-4"
    >
      <LauraFace size={36} decorative />
      <div className="min-w-0 flex-1">
        <Text id="contact-why-title" element="h2" size="base" weight="semibold" color="text-foreground">
          {t('whyKey.title')}
        </Text>
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5 mb-3">
          {t('whyKey.byLaura')}
        </Text>
        <div data-testid="contact-priority" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={scoreTone(score.total, { employerStale: hasStaleEmployer(score.breakdown) })}>
            {scoreLabel(score.total, { employerStale: hasStaleEmployer(score.breakdown) })}
          </Badge>
          {score.breakdown ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('whyKey.priorityAxes', { count: score.breakdown.length })}
            </Text>
          ) : null}
          {/* Lot 758 — la joignabilité, sortie du score : une pastille à côté, jamais des points. */}
          <ContactReachabilityPastille reachability={contact.contact_reachability} />
        </div>
        {/* Lot 758 — « un score n'est jamais nu » : ses axes NOMMÉS sous le mot, et ce qui n'a pas pu être évalué
            reste nommé (il sort du calcul, il n'est pas compté zéro). */}
        {score.breakdown ? (
          <Text
            element="p"
            size="xs"
            color="text-muted-foreground"
            className="-mt-2 mb-4"
            data-testid="contact-priority-axes"
          >
            {score.breakdown
              .filter(axis => axis.evaluated)
              .map(axis => t(`score.breakdown.criteria.${axis.key}`))
              .join(' · ')}
            {score.breakdown.some(axis => !axis.evaluated)
              ? ` — ${t('whyKey.notEvaluatedAxes', {
                  axes: score.breakdown
                    .filter(axis => !axis.evaluated)
                    .map(axis => t(`score.breakdown.criteria.${axis.key}`))
                    .join(', '),
                })}`
              : null}
          </Text>
        ) : null}
        <div className="space-y-4">
          {showFacts ? (
            <div className="space-y-2">
              <Text element="h3" size="xs" weight="medium" color="text-muted-foreground">
                {t('whyKey.facts')}
              </Text>
              <ul className="space-y-2">
                {brief.facts.map(fact => (
                  <li key={fact} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-[var(--success-soft-text)]" aria-hidden />
                    <Text element="span" size="sm" leading="relaxed" color="text-foreground/90">
                      {fact}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {showHypotheses ? (
            <div className="space-y-2">
              <Text element="h3" size="xs" weight="medium" color="text-muted-foreground">
                {t('whyKey.hypotheses')}
              </Text>
              <ul className="space-y-2">
                {hypothesisLines.map(line => (
                  <li key={line} className="flex items-start gap-2.5">
                    <HelpCircle className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
                    <Text element="span" size="sm" leading="relaxed" color="text-foreground/90">
                      {line}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {brief.employerStale ? (
            <Text element="p" size="sm" leading="relaxed" className="text-[var(--warning-soft-text)]">
              {t('score.employerStale')}
            </Text>
          ) : null}

          {brief.isThin ? (
            <Text element="p" size="sm" leading="relaxed" color="text-muted-foreground">
              {t('whyKey.thin')}
            </Text>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--bellum-border)] pt-3">
          {brief.detail.length > 0 ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className={LINK_BUTTON}
              aria-expanded={detailOpen}
              onClick={() => setDetailOpen(open => !open)}
            >
              {t(detailOpen ? 'whyKey.hideDetail' : 'whyKey.showDetail')}
              <ChevronDown className={cn('size-3.5 transition-transform duration-150', detailOpen && 'rotate-180')} />
            </Button>
          ) : null}
          {onExplainScore ? (
            <Button type="button" variant="link" size="sm" className={LINK_BUTTON} onClick={onExplainScore}>
              {t('whyKey.explainScore')}
            </Button>
          ) : null}
          {onOpenSignals && signalCount > 0 ? (
            <Button type="button" variant="link" size="sm" className={LINK_BUTTON} onClick={onOpenSignals}>
              {t('whyKey.signals', { count: signalCount })}
            </Button>
          ) : null}
          {!brief.isThin ? (
            <Button type="button" variant="link" size="sm" className={LINK_BUTTON} onClick={copy}>
              <Copy className="size-3.5" aria-hidden />
              {t('whyKey.copy')}
            </Button>
          ) : null}
        </div>
        {detailOpen && brief.detail.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {brief.detail.map(line => (
              <li key={line}>
                <Text element="p" size="sm" leading="relaxed" color="text-muted-foreground">
                  {line}
                </Text>
              </li>
            ))}
          </ul>
        ) : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </section>
  )
}
