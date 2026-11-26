import { Checkbox, Text } from '@bellum/ui'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { APPROACH_CARD } from './ApproachLayout'
import { defaultGroundingIds, type GroundingChoice, type groundingFacts } from './approach-grounding'

type Facts = ReturnType<typeof groundingFacts>

/**
 * #4524.1 — « Sur quoi {copilote} s'appuie » : au-dessus de « Générer » (e-mail, LinkedIn, Appel), les faits cochables
 * — signaux du COMPTE, signaux et besoins du CONTACT — ou « Angle libre ». Par défaut, les deux meilleurs signaux sont
 * cochés (l'ordre est celui du dossier). Aucun signal : une ligne le dit et propose l'angle libre ; une absence ne fait
 * AUCUNE ligne de liste. Cocher ne génère rien : le choix part au prochain « Régénérer ».
 */
export function ApproachGroundingBlock({
  facts,
  choice,
  onChoice,
  collapsible = false,
}: {
  facts: Facts
  choice: GroundingChoice | null
  onChoice: (next: GroundingChoice) => void
  /** #4980.2 — replié par défaut (rien n'est supprimé) : l'e-mail passe d'abord, ses appuis se rouvrent au clic. */
  collapsible?: boolean
}) {
  const { t } = useTranslation('engagement')
  const freeId = useId()
  const known = [...facts.account, ...facts.contact]
  const effective: GroundingChoice =
    choice ?? (known.length > 0 ? { mode: 'facts', ids: defaultGroundingIds(facts) } : { mode: 'free_angle' })
  const checkedIds = effective.mode === 'facts' ? effective.ids : []
  const free = effective.mode === 'free_angle'

  const toggle = (id: string, on: boolean) => {
    const next = on ? [...checkedIds, id] : checkedIds.filter(item => item !== id)
    // L'ordre est celui de l'affichage (compte puis contact), pas celui des clics.
    const ordered = known.filter(fact => next.includes(fact.id)).map(fact => fact.id)
    onChoice(ordered.length > 0 ? { mode: 'facts', ids: ordered } : { mode: 'free_angle' })
  }

  const group = (label: string, items: Facts['account']) =>
    items.length === 0 ? null : (
      <fieldset className="space-y-1" key={label}>
        <legend className="text-xs font-medium text-[var(--bellum-text-muted)]">{label}</legend>
        {items.map(fact => {
          const id = `${freeId}-${fact.id}`
          return (
            <div key={fact.id} className="flex min-h-11 items-start gap-3 py-2">
              <Checkbox
                id={id}
                checked={checkedIds.includes(fact.id)}
                onCheckedChange={value => toggle(fact.id, value === true)}
              />
              <label htmlFor={id} className="min-w-0 cursor-pointer text-sm text-[var(--bellum-text-primary)]">
                {fact.label}
                {fact.homonymDoubt ? (
                  <span className="mt-0.5 block text-xs font-medium text-[var(--warning-soft-text)]">
                    {t('approachPage.grounding.homonym')}
                  </span>
                ) : null}
                {fact.proof ? (
                  <span className="mt-0.5 block text-xs text-[var(--bellum-text-muted)]">{fact.proof}</span>
                ) : null}
              </label>
            </div>
          )
        })}
      </fieldset>
    )

  const title = (
    <h2 id={`${freeId}-title`} className="text-base font-semibold text-[var(--bellum-text-primary)]">
      {t('approachPage.grounding.title')}
    </h2>
  )
  const body = (
    <>
      {known.length === 0 ? (
        <Text size="sm" className="mt-1 block text-[var(--bellum-text-secondary)]">
          {t('approachPage.grounding.none')}
        </Text>
      ) : (
        <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
          {t('approachPage.grounding.hint')}
        </Text>
      )}
      <div className="mt-2 divide-y divide-[var(--bellum-border)]">
        {group(t('approachPage.grounding.account'), facts.account)}
        {group(t('approachPage.grounding.contact'), facts.contact)}
        <div className="flex min-h-11 items-start gap-3 py-2">
          <Checkbox
            id={`${freeId}-free`}
            checked={free}
            onCheckedChange={value => {
              if (value === true) onChoice({ mode: 'free_angle' })
            }}
            disabled={known.length === 0}
          />
          <label
            htmlFor={`${freeId}-free`}
            className="min-w-0 cursor-pointer text-sm text-[var(--bellum-text-primary)]"
          >
            {t('approachPage.grounding.free')}
            <span className="mt-0.5 block text-xs text-[var(--bellum-text-muted)]">
              {t('approachPage.grounding.freeHint')}
            </span>
          </label>
        </div>
      </div>
    </>
  )

  if (collapsible) {
    return (
      <details className={APPROACH_CARD} data-testid="approach-grounding">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-5">{title}</summary>
        <div className="border-t border-[var(--bellum-border)] p-5 pt-3">{body}</div>
      </details>
    )
  }
  return (
    <section className={`${APPROACH_CARD} p-5`} aria-labelledby={`${freeId}-title`} data-testid="approach-grounding">
      {title}
      {body}
    </section>
  )
}
