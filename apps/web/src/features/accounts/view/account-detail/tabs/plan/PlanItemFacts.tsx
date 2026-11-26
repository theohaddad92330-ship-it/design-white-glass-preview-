import type { ActionPlanItem } from '@bellum/contracts'
import { Button, cn, Input } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCalendarDate } from '@/lib/deadline'
import { buildPlanItemFacts } from './planItemFactsData'

type Facts = ReturnType<typeof buildPlanItemFacts>
type OwnerLink = NonNullable<NonNullable<Facts['target']>['link']>

const CHIP =
  'inline-flex items-center gap-1 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]'
/** #3416.1 — au-delà, les puces se replient derrière « +N ». */
const MAX_VISIBLE_CHIPS = 4

type Chip = { key: string; className?: string; node: ReactNode }

const LINK_CHIP = cn(CHIP, 'text-[var(--bellum-text-accent)] underline-offset-2 hover:underline')

/**
 * #2123.1-.10, .21-.33, .35 — la ligne d'une action du plan affiche ce qu'elle
 * est : statut, objet visé et sa page, contact, dépendance, source ET date,
 * confiance, coût, raison — et ce qu'il faut vérifier d'abord.
 *
 * Chaque champ absent est NOMMÉ absent (« Confiance non renseignée », « Coût non
 * renseigné », « Source non conservée ») : une puce qui disparaît se lit « rien à
 * signaler », et une confiance manquante n'est pas une confiance faible
 * (GA-18 / GA-19). Aucune probabilité : la confiance est un cran nommé.
 */
export function PlanItemFacts({
  item,
  items,
  onSetResult,
}: {
  item: ActionPlanItem
  items: readonly ActionPlanItem[]
  /**
   * #2153.57 — présent seulement là où l'écran sait écrire (`ActionPlanBoard`
   * sur une ligne PERSISTÉE) : l'absence de callback n'affiche aucune
   * affordance d'édition plutôt que d'en promettre une qui échouerait.
   */
  onSetResult?: (value: string | null) => void
}) {
  const { t } = useTranslation('accountDetail')
  const { t: tActions } = useTranslation('actions')
  const facts = buildPlanItemFacts(item, items)
  const sourceDate = formatCalendarDate(facts.provenance?.at?.slice(0, 10), { day: '2-digit', month: 'short' })
  const [editingResult, setEditingResult] = useState(false)
  const [draft, setDraft] = useState(facts.result ?? '')
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  // #3287 (#3265.2) — origine, règle, exécution externe : UNE phrase, jamais une
  // puce de plus (l'écran en porte déjà dix). Une clé que l'écran ne sait pas
  // dire en mots n'est PAS affichée brute : elle ne fait aucune partie.
  const originParts = [
    item.source_recommendation
      ? t(`plan.facts.origin.recommendation.${item.source_recommendation}`, { defaultValue: '' })
      : '',
    item.method_rule ? t(`plan.facts.origin.methodRule.${item.method_rule}`, { defaultValue: '' }) : '',
    item.external_execution_id ? t('plan.facts.origin.external') : '',
  ].filter(part => part !== '')

  // #3416.1 — jusqu'à douze puces sur une ligne faite : 4 visibles au plus, ordre
  // de priorité = statut/issue d'abord ; le reste (dont NO-GO et confiance)
  // derrière « +N ». Les puces repliées restent dans le DOM (`hidden`).
  const WARN = 'border-[var(--bellum-warning)] text-[var(--warning-soft-text)]'
  const chips: Chip[] = [{ key: 'status', className: CHIP, node: t(`plan.facts.status.${facts.status}`) }]
  if (facts.outcome) chips.push({ key: 'outcome', className: CHIP, node: tActions(`outcome.${facts.outcome}`) })
  /* #2396.1 — RÉFUTÉ en prod : le mode de complétion était persisté
     (manuel/preuve/événement/proposé) mais AUCUN écran ne le montrait.
     Seulement quand la ligne est faite ET que le mode est CONNU — une
     ligne faite avant cette colonne (`completion_mode: null`) ne fait
     AUCUNE ligne plutôt que de mentir sur « manuel » (GA-18/GA-19). */
  if (facts.status === 'done' && facts.completionMode) {
    chips.push({ key: 'completion', className: CHIP, node: t(`plan.facts.completionMode.${facts.completionMode}`) })
  }
  if (facts.missing) {
    chips.push({ key: 'missing', className: cn(CHIP, WARN), node: t(`plan.facts.verifyFirst.${facts.missing}`) })
  }
  if (facts.target) {
    chips.push({
      key: 'target',
      node: (
        <TargetLabel link={facts.target.link}>
          {t('plan.facts.target', {
            kind: t(`plan.facts.targetKind.${facts.target.kind}`),
            label: facts.target.label,
          })}
        </TargetLabel>
      ),
    })
    chips.push({
      key: 'ownerPage',
      className: CHIP,
      node: t('plan.facts.ownerPage', { page: t(`plan.facts.ownerPages.${facts.target.ownerPage}`) }),
    })
  } else if (facts.missing !== 'target') {
    // #3416 — « À vérifier d'abord : l'objet visé » (puce `missing`) dit déjà que l'objet
    // visé manque : « Objet visé : non renseigné » le répétait sur la même ligne.
    chips.push({ key: 'targetUnset', className: CHIP, node: t('plan.facts.targetUnset') })
  }
  // Le contact dont on connaît le nom EST l'objet visé, déjà nommé juste
  // avant : on ne le répète pas sous la même forme (loi 4).
  if (facts.contact && facts.contact.label === null) {
    chips.push({
      key: 'contactLinked',
      node: (
        <Link to="/contacts/$id" params={{ id: facts.contact.id }} className={LINK_CHIP}>
          {t('plan.facts.contactLinked')}
        </Link>
      ),
    })
  } else if (!facts.contact && facts.target?.kind !== 'contact' && facts.missing !== 'contact') {
    chips.push({ key: 'contactUnset', className: CHIP, node: t('plan.facts.contactUnset') })
  }
  if (facts.dependency) {
    chips.push({
      key: 'dependency',
      className: facts.blocked ? cn(CHIP, WARN) : CHIP,
      node: facts.blocked
        ? t('plan.facts.blockedByDependency', { label: facts.blocked.label })
        : facts.dependency.label
          ? t('plan.facts.dependsOn', { label: facts.dependency.label })
          : t('plan.facts.dependsOnRemoved'),
    })
  }
  chips.push({
    key: 'source',
    className: CHIP,
    node: facts.provenance
      ? sourceDate
        ? t('plan.facts.sourceAt', { source: t(`plan.facts.source.${facts.provenance.source}`), date: sourceDate })
        : t(`plan.facts.source.${facts.provenance.source}`)
      : t('plan.facts.sourceNotKept'),
  })
  /* #2153.57 — le RÉSULTAT, distinct de l'attendu. Purement DÉCLARATIF : jamais
     présenté comme une preuve d'exécution vérifiée (`c73_fait_ne_porte_pas_preuve_denvoi`). */
  if (onSetResult && editingResult) {
    chips.push({
      key: 'result',
      className: 'flex w-full items-center gap-1.5',
      node: (
        <>
          <Input
            autoFocus
            aria-label={t('plan.facts.resultInputLabel')}
            placeholder={t('plan.facts.resultPlaceholder')}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            className="h-7 max-w-xs text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="pointer-coarse:min-h-11"
            onClick={() => {
              onSetResult(draft.trim() || null)
              setEditingResult(false)
            }}
          >
            {t('plan.facts.resultSave')}
          </Button>
        </>
      ),
    })
  } else {
    chips.push({
      key: 'result',
      className: CHIP,
      node: (
        <>
          {facts.result ? t('plan.facts.result', { result: facts.result }) : t('plan.facts.resultNotSet')}
          {onSetResult ? (
            <button
              type="button"
              className="pointer-coarse:min-h-11 underline decoration-dotted underline-offset-2"
              onClick={() => {
                setDraft(facts.result ?? '')
                setEditingResult(true)
              }}
            >
              {t('plan.facts.resultEdit')}
            </button>
          ) : null}
        </>
      ),
    })
  }
  /* #2317.15 — le NO-GO du plan : une recommandation non cliquable, non attribuée
     ou sans date et résultat attendu se NOMME, une raison par puce — rangé dans
     le détail déplié (#3416.1), comme la confiance. */
  for (const reason of facts.noGoReasons) {
    chips.push({ key: `nogo-${reason}`, className: cn(CHIP, WARN), node: t(`plan.facts.noGo.${reason}`) })
  }
  chips.push({
    key: 'confidence',
    className: CHIP,
    node: facts.confidence ? t(`plan.facts.confidence.${facts.confidence}`) : t('plan.facts.confidenceNotMeasured'),
  })
  // Une saisie en cours ne se replie jamais.
  const open = expanded || editingResult
  const hiddenCount = Math.max(0, chips.length - MAX_VISIBLE_CHIPS)

  return (
    <div className="mt-2 space-y-1.5">
      {facts.reason ? (
        <p className="break-words text-xs text-[var(--bellum-text-muted)]">
          {t('plan.facts.reason', { reason: facts.reason })}
        </p>
      ) : null}
      {originParts.length > 0 ? (
        <p className="break-words text-xs text-[var(--bellum-text-muted)]">
          {t('plan.facts.origin.line', { parts: originParts.join(' · ') })}
        </p>
      ) : null}
      {/* #4158.31 — la note laissée par celui qui a délégué l'action : lue par le délégataire. */}
      {item.handoff_note ? (
        <p className="break-words text-xs text-[var(--bellum-text-secondary)]">
          {t('plan.facts.handoffNote', { note: item.handoff_note })}
        </p>
      ) : null}
      {item.stop_condition ? (
        <p className="break-words text-xs text-[var(--bellum-text-muted)]">
          {t('plan.facts.stopCondition', { condition: item.stop_condition })}
        </p>
      ) : null}
      <ul id={listId} className="flex flex-wrap gap-1.5" aria-label={t('plan.facts.label')}>
        {chips.map((chip, index) => {
          const folded = index >= MAX_VISIBLE_CHIPS && !open
          return (
            <li key={chip.key} className={cn(chip.className, folded && 'hidden')} hidden={folded}>
              {chip.node}
            </li>
          )
        })}
        {hiddenCount > 0 ? (
          <li>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              aria-label={open ? t('plan.facts.lessLabel') : t('plan.facts.moreLabel', { count: hiddenCount })}
              // #3416 — cible 44 px au pointeur fin (mesuré 32×24 en prod le 05/10).
              className={cn(LINK_CHIP, 'min-h-11 min-w-11 justify-center')}
              onClick={() => setExpanded(value => !value)}
            >
              {open ? t('plan.facts.less') : t('plan.facts.more', { count: hiddenCount })}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

/** #2123.33 — l'objet visé ouvre la page qui en est propriétaire, quand elle a une route. */
function TargetLabel({ link, children }: { link: OwnerLink | null; children: ReactNode }) {
  if (!link) return <span className={CHIP}>{children}</span>
  if (link.to === '/contacts/$id') {
    return (
      <Link to="/contacts/$id" params={{ id: link.id }} className={LINK_CHIP}>
        {children}
      </Link>
    )
  }
  if (link.to === '/projects/needs/$needId') {
    return (
      <Link to="/projects/needs/$needId" params={{ needId: link.id }} className={LINK_CHIP}>
        {children}
      </Link>
    )
  }
  return (
    <Link to={link.to} className={LINK_CHIP}>
      {children}
    </Link>
  )
}
