import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import type { CommercialAuditContext } from '@bellum/contracts'
import { AuditCard } from './AuditCard'

type Props = {
  declaredSignals: CommercialAuditContext['declaredSignals']
  funnel: CommercialAuditContext['funnel']
}

/**
 * #2042.15 · #2043.10 · #2049.15 · #2050.14 · #2051.16 — CE QUE TES RÉPONSES
 * DISENT, LU PAR L'AUDIT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CHAÎNON RÉPARÉ PAR CE FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 * Les réponses du Temps 1 étaient collectées, stockées en base et envoyées au
 * modèle. L'audit, lui, ne lit que `ProfileContext` — la SORTIE du Profileur.
 * Cinq demandes tombaient donc dans ce trou, chacune parquée dans un
 * commentaire source (« N'EST PAS ici »), et `funnelBreak`, calculé juste
 * depuis le lot L19, n'avait AUCUN appelant hors de ses tests.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC NE S'AUTORISE PAS À DIRE
 * ─────────────────────────────────────────────────────────────────────────
 *  - **Aucun pourcentage, aucune conversion** (#2049.15). L'entonnoir dit
 *    quelles unités sont COMPTÉES et où la trace s'arrête ; il n'affiche aucun
 *    nombre, parce que le questionnaire n'en demande aucun. « 0 » y serait faux.
 *  - **Aucune probabilité**, aucune chance de quoi que ce soit.
 *  - **Aucun libellé inventé** : les réponses s'affichent VERBATIM telles que
 *    la personne les a cochées ; seules les phrases de cadre viennent de l'i18n,
 *    aux deux langues.
 *  - **« Non déclaré » se dit**, signal par signal, plutôt que de laisser un
 *    bloc muet qui se lirait « rien à signaler ».
 */
export function AuditDeclaredSignals({ declaredSignals, funnel }: Props) {
  const { t } = useTranslation('commercialAudit')

  return (
    <section className="space-y-3">
      <Text element="h2" size="lg" weight="semibold">
        {t('declaredSignals.title')}
      </Text>
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('declaredSignals.description')}
      </Text>

      {declaredSignals === null ? (
        <AuditCard className="space-y-1">
          <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
            {t('common:unknownValue')}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('declaredSignals.unmeasured')}
          </Text>
        </AuditCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FunnelBreakCard signal={declaredSignals.funnelBreak} funnel={funnel} />
          <StartingPointCard signal={declaredSignals.startingPoint} />
          <EntryAxisCard signal={declaredSignals.entryAxis} />
          <FrontsBudgetCard signal={declaredSignals.frontsBudget} />
          <RoutineSeedsCard signal={declaredSignals.routineSeeds} />
        </div>
      )}
    </section>
  )
}

/** Le cadre partagé des cinq cartes — un titre, et un corps qui dit ou se tait. */
function SignalCard({ titleKey, children }: { titleKey: string; children: ReactNode }) {
  const { t } = useTranslation('commercialAudit')
  return (
    <AuditCard className="space-y-2">
      <Text element="h3" size="sm" weight="semibold">
        {t(titleKey)}
      </Text>
      {children}
    </AuditCard>
  )
}

/** Un signal que la personne n'a pas renseigné — NOMMÉ, jamais laissé vide. */
function NotDeclared({ reasonKey }: { reasonKey: string }) {
  const { t } = useTranslation('commercialAudit')
  return (
    <div className="space-y-1">
      <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
        {t('common:unknownValue')}
      </Text>
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {t(reasonKey)}
      </Text>
    </div>
  )
}

/** La réponse de la personne, citée telle quelle. */
function DeclaredAnswers({ answers }: { answers: readonly string[] }) {
  return (
    <ul className="space-y-0.5">
      {answers.map(answer => (
        <li key={answer}>
          <Text element="p" size="sm">
            {answer}
          </Text>
        </li>
      ))}
    </ul>
  )
}

/**
 * #2049.15 — une étape non mesurée se NOMME, elle ne vaut pas 0 %.
 *
 * L'entonnoir rend les onze unités dans leur ordre, chacune « comptée » ou
 * « non comptée ». Aucun nombre, aucun taux : ce bloc localise, il ne convertit
 * pas. Les deux seaux s'ADDITIONNENT jusqu'aux onze — on dit de quoi la part
 * est la part, ou on n'en dit rien.
 */
function FunnelBreakCard({
  signal,
  funnel,
}: {
  signal: NonNullable<CommercialAuditContext['declaredSignals']>['funnelBreak']
  funnel: CommercialAuditContext['funnel']
}) {
  const { t } = useTranslation('commercialAudit')

  if (signal.kind === 'notDeclared') {
    return (
      <SignalCard titleKey="declaredSignals.funnelBreak.title">
        <NotDeclared reasonKey="declaredSignals.funnelBreak.notDeclared" />
      </SignalCard>
    )
  }

  return (
    <SignalCard titleKey="declaredSignals.funnelBreak.title">
      <Text element="p" size="sm" weight="semibold">
        {signal.kind === 'complete'
          ? t('declaredSignals.funnelBreak.complete')
          : t('declaredSignals.funnelBreak.break', { stage: signal.stage, unit: signal.unit })}
      </Text>
      {funnel === null ? null : (
        <ul className="space-y-0.5">
          {funnel.map(stage => (
            <li key={stage.stage}>
              <Text
                element="p"
                size="xs"
                className={
                  stage.measurement === 'tracked'
                    ? 'text-[var(--bellum-text-secondary)]'
                    : 'text-[var(--bellum-text-muted)]'
                }
              >
                {t(
                  stage.measurement === 'tracked'
                    ? 'declaredSignals.funnelBreak.tracked'
                    : 'declaredSignals.funnelBreak.notTracked',
                  { stage: stage.stage },
                )}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </SignalCard>
  )
}

/** #2042.15 — le point de départ peut ne pas être l'ambition, et on le dit. */
function StartingPointCard({
  signal,
}: {
  signal: NonNullable<CommercialAuditContext['declaredSignals']>['startingPoint']
}) {
  const { t } = useTranslation('commercialAudit')

  if (signal.kind === 'notDeclared') {
    return (
      <SignalCard titleKey="declaredSignals.startingPoint.title">
        <NotDeclared reasonKey="declaredSignals.startingPoint.notDeclared" />
      </SignalCard>
    )
  }

  return (
    <SignalCard titleKey="declaredSignals.startingPoint.title">
      <Text element="p" size="sm" weight="semibold">
        {t(`declaredSignals.startingPoint.${signal.kind}`)}
      </Text>
      {signal.reachableToday.length > 0 ? (
        <>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('declaredSignals.startingPoint.reachableToday')}
          </Text>
          <DeclaredAnswers answers={signal.reachableToday} />
        </>
      ) : null}
      {signal.gaps.length > 0 ? (
        <>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('declaredSignals.startingPoint.gaps')}
          </Text>
          <DeclaredAnswers answers={signal.gaps} />
        </>
      ) : null}
      {signal.declaredStates.length > 0 ? (
        <>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('declaredSignals.startingPoint.declaredStates')}
          </Text>
          <DeclaredAnswers answers={signal.declaredStates} />
        </>
      ) : null}
    </SignalCard>
  )
}

/** #2043.10 — l'axe d'entrée, lu sur le niveau où les réponses ARRIVENT. */
function EntryAxisCard({ signal }: { signal: NonNullable<CommercialAuditContext['declaredSignals']>['entryAxis'] }) {
  const { t } = useTranslation('commercialAudit')

  if (signal.kind === 'notDeclared') {
    return (
      <SignalCard titleKey="declaredSignals.entryAxis.title">
        <NotDeclared reasonKey="declaredSignals.entryAxis.notDeclared" />
      </SignalCard>
    )
  }

  return (
    <SignalCard titleKey="declaredSignals.entryAxis.title">
      <Text element="p" size="sm" weight="semibold">
        {/* GA-26 — le libellé d'un axe vit DÉJÀ dans `strategy.*` (rendu par
            `AuditStrategyOptions`) : l'écrire une deuxième fois ici ferait
            diverger les deux au premier ajustement. */}
        {t(`strategy.${signal.axis}`)}
      </Text>
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('declaredSignals.entryAxis.source', { level: signal.declaredResponseLevel })}
      </Text>
      {signal.divergesFromAim ? (
        <Text element="p" size="sm">
          {t('declaredSignals.entryAxis.diverges', {
            aim: t(`strategy.${signal.aimedEntryStrategy}`, { defaultValue: signal.aimedEntryStrategy ?? '' }),
          })}
        </Text>
      ) : null}
    </SignalCard>
  )
}

/**
 * #2050.14 — peu de temps ⇒ MOINS DE FRONTS, pas plus d'outils.
 *
 * Le nombre affiché est un BUDGET tiré d'une bande d'heures DÉCLARÉE, jamais une
 * prévision : un plan qui demande plus de fronts que ça ne sera pas tenu.
 */
function FrontsBudgetCard({
  signal,
}: {
  signal: NonNullable<CommercialAuditContext['declaredSignals']>['frontsBudget']
}) {
  const { t } = useTranslation('commercialAudit')

  if (signal.kind === 'notDeclared') {
    return (
      <SignalCard titleKey="declaredSignals.frontsBudget.title">
        <NotDeclared reasonKey="declaredSignals.frontsBudget.notDeclared" />
      </SignalCard>
    )
  }

  return (
    <SignalCard titleKey="declaredSignals.frontsBudget.title">
      <Text element="p" size="sm" weight="semibold">
        {/* ⚠️ `_zero` n'est PAS une catégorie de pluriel d'i18next : ni le
            français ni l'anglais n'en ont une, et `count: 0` tomberait sur
            `_other` (« 0 fronts au maximum »). Le zéro DÉCLARÉ mérite sa
            propre phrase, il ne se déduit pas d'un pluriel. */}
        {signal.maxFronts === 0
          ? t('declaredSignals.frontsBudget.noFront')
          : t('declaredSignals.frontsBudget.maxFronts', { count: signal.maxFronts })}
      </Text>
      <Text element="p" size="sm">
        {t('declaredSignals.frontsBudget.notMoreTools')}
      </Text>
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {t(`declaredSignals.frontsBudget.source.${signal.source}`, { band: signal.band })}
      </Text>
      {signal.erosionRisks.length > 0 ? (
        <>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('declaredSignals.frontsBudget.erosion')}
          </Text>
          <DeclaredAnswers answers={signal.erosionRisks} />
        </>
      ) : null}
    </SignalCard>
  )
}

/** #2051.16 — chaque rupture déclarée cite la routine qui la tiendrait. */
function RoutineSeedsCard({
  signal,
}: {
  signal: NonNullable<CommercialAuditContext['declaredSignals']>['routineSeeds']
}) {
  const { t } = useTranslation('commercialAudit')

  if (signal.kind === 'notDeclared') {
    return (
      <SignalCard titleKey="declaredSignals.routineSeeds.title">
        <NotDeclared reasonKey="declaredSignals.routineSeeds.notDeclared" />
      </SignalCard>
    )
  }

  if (signal.kind === 'notLocatedYet') {
    return (
      <SignalCard titleKey="declaredSignals.routineSeeds.title">
        <Text element="p" size="sm">
          {t('declaredSignals.routineSeeds.notLocatedYet')}
        </Text>
      </SignalCard>
    )
  }

  return (
    <SignalCard titleKey="declaredSignals.routineSeeds.title">
      <ul className="space-y-2">
        {signal.seeds.map(seed => (
          <li key={seed.breakDeclared} className="space-y-0.5">
            <Text element="p" size="sm" weight="semibold">
              {seed.breakDeclared}
            </Text>
            <Text element="p" size="sm">
              {t(
                seed.alreadyHeld
                  ? 'declaredSignals.routineSeeds.alreadyHeld'
                  : 'declaredSignals.routineSeeds.toConfigure',
                { practice: seed.practice },
              )}
            </Text>
          </li>
        ))}
      </ul>
      {signal.unrouted.length > 0 ? (
        <>
          {/* Une rupture qu'aucune routine du produit ne tient se NOMME : lui
              inventer une réponse serait promettre ce qu'on ne fait pas. */}
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('declaredSignals.routineSeeds.unrouted')}
          </Text>
          <DeclaredAnswers answers={signal.unrouted} />
        </>
      ) : null}
    </SignalCard>
  )
}
