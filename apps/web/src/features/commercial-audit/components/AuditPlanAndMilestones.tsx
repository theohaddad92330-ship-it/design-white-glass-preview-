import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Text } from '@bellum/ui'
import type { CommercialAuditContext } from '@bellum/contracts'
import { AUDIT_PARAMETER_VALUE_NAMESPACE } from '../lib/audit-product-configuration'
import { AuditCard } from './AuditCard'

type Props = {
  thirtyDayPlan: CommercialAuditContext['thirtyDayPlan']
  milestones: CommercialAuditContext['milestones']
  productConfiguration: CommercialAuditContext['productConfiguration']
}

/**
 * #2068.1-.33 — LE PLAN À 4 SEMAINES, LES PALIERS, LA CONFIGURATION PRODUIT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CHAÎNON RÉPARÉ PAR CE FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 * `buildCommercialAuditContext()` (`lib/build-audit.ts`) calcule ces trois
 * blocs depuis longtemps — codé, testé (9+18 tests) — mais jusqu'à ce lot
 * AUCUN écran ne les rendait : le seul appelant vivait dans le fichier de
 * test lui-même. Ce composant est cet appelant.
 *
 * #2068.1 — décision Louis 19/09/2026 (2068.11) : `thirtyDayPlan` a désormais
 * une source — ACTIONS, `myActions` de `useCommercialAudit()` — la
 * replanification vit là, l'audit y RENVOIE (GA-26, jamais un deuxième
 * chemin qui la réécrirait). `milestones` et `productConfiguration`, eux,
 * restent sans source (#2068.14-.33, moteur séparé, hors périmètre de ce
 * lot) : `buildCommercialAuditContext` continue de les écrire `null` en dur.
 * La doctrine de ce produit interdit d'inventer un plan à 3 priorités pour
 * remplir l'espace — ce composant NOMME l'absence à la place, avec un lien
 * vers Actions pour en créer une, exactement comme `AuditDecisionColumns` le
 * fait pour les trois colonnes.
 */
export function AuditPlanAndMilestones({ thirtyDayPlan, milestones, productConfiguration }: Props) {
  const { t } = useTranslation('commercialAudit')

  /* #2068.32 — le NOM d'un réglage vit en i18n, aux deux langues. `defaultValue`
     rend la clé telle quelle plutôt qu'un libellé inventé : une source qui
     nommerait un réglage que cet écran ne connaît pas encore reste lisible, et
     ne prétend rien. */
  const parameterLabel = (key: string) => t(`productConfiguration.parameter.${key}`, { defaultValue: key })

  /* #2068.32 — un réglage que l'espace n'a PAS renseigné se dit « non réglé »,
     jamais « non mesuré » (le bloc a été lu) et jamais « 0 » — GA-18 / GA-19.
     La valeur, elle, est du texte de l'utilisateur rendu VERBATIM ; seuls les
     jetons d'énumération déclarés dans `AUDIT_PARAMETER_VALUE_NAMESPACE`
     passent par l'i18n. */
  const parameterValue = (key: string, value: string | null) => {
    if (value === null) return t('productConfiguration.notSet')
    const namespace = AUDIT_PARAMETER_VALUE_NAMESPACE[key] ?? null
    return namespace === null ? value : t(`${namespace}.${value}`, { defaultValue: value })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <Text element="h2" size="lg" weight="semibold">
          {t('plan.title')}
        </Text>
        {thirtyDayPlan === null ? (
          <AuditCard className="space-y-1">
            <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
              {t('common:unknownValue')}
            </Text>
            <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('plan.unmeasured')}
            </Text>
            {/* #2068.1 — « aucun élément du tout » nomme sa raison ET renvoie
                vers Actions pour en créer une : la replanification vit là
                (GA-26), pas un plan inventé ici pour remplir l'espace. */}
            <Link to="/actions" className="text-xs text-[var(--bellum-text-secondary)] underline underline-offset-2">
              {t('plan.createInActions')}
            </Link>
          </AuditCard>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {thirtyDayPlan.map(week => (
              <AuditCard key={week.weekNumber} className="space-y-2">
                <Text element="h3" size="sm" weight="semibold">
                  {t('plan.week', { number: week.weekNumber })}
                </Text>
                {week.priorities.length === 0 ? (
                  <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                    {t('plan.noPriority')}
                  </Text>
                ) : (
                  <ul className="space-y-2">
                    {week.priorities.map((priority, index) => (
                      <li key={index} className="space-y-0.5">
                        <Text element="p" size="sm" weight="semibold">
                          {priority.expectedResult}
                        </Text>
                        <Text element="p" size="sm">
                          {priority.action}
                        </Text>
                        {priority.owner ? (
                          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                            {t('plan.priority.owner', { owner: priority.owner })}
                          </Text>
                        ) : null}
                        {priority.slot ? (
                          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                            {t('plan.priority.slot', { slot: priority.slot })}
                          </Text>
                        ) : null}
                        {/* #2068.7-.10 — dépendance, preuve de réalisation, lien
                            de surface et condition de remplacement : les 4
                            derniers champs du contrat (`build-audit.ts`
                            n'écrit encore que `null`), rendus dès qu'une
                            source les mesure. */}
                        {priority.dependency ? (
                          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                            {t('plan.priority.dependency', { dependency: priority.dependency })}
                          </Text>
                        ) : null}
                        {priority.completionProof ? (
                          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                            {t('plan.priority.completionProof', { proof: priority.completionProof })}
                          </Text>
                        ) : null}
                        {priority.surfaceLink ? (
                          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                            {t('plan.priority.surfaceLink', { link: priority.surfaceLink })}
                          </Text>
                        ) : null}
                        {priority.replacementCondition ? (
                          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                            {t('plan.priority.replacementCondition', {
                              condition: priority.replacementCondition,
                            })}
                          </Text>
                        ) : null}
                        {/* #2068.24-.31 — le domaine produit que cette
                            priorité fait avancer, quand l'action d'origine
                            porte un objet dont le type se relie à une aire
                            (lien UNIQUE : `domainForActionTarget`,
                            `build-audit.ts`). `null` = aucune aire ne le
                            porte encore — rien à nommer, jamais une aire
                            devinée. */}
                        {priority.domain ? (
                          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                            {t('plan.priority.domain', { domain: t(`productConfiguration.area.${priority.domain}`) })}
                          </Text>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </AuditCard>
            ))}
          </div>
        )}
        {/* #2068.1 — un lien de retour, TOUJOURS : le plan est LU depuis
            Actions, il ne se réplique pas ici — Actions reste le seul
            endroit où le modifier (GA-26). */}
        {thirtyDayPlan !== null ? (
          <Link to="/actions" className="text-xs text-[var(--bellum-text-secondary)] underline underline-offset-2">
            {t('plan.openInActions')}
          </Link>
        ) : null}
      </section>

      <section className="space-y-3">
        <Text element="h2" size="lg" weight="semibold">
          {t('milestones.title')}
        </Text>
        {milestones === null ? (
          <AuditCard className="space-y-1">
            <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
              {t('common:unknownValue')}
            </Text>
            <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('milestones.unmeasured')}
            </Text>
          </AuditCard>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {milestones.map(milestone => (
              <AuditCard key={milestone.horizon} className="space-y-1">
                <Text element="h3" size="sm" weight="semibold">
                  {t(`milestones.horizon.${milestone.horizon}`)}
                </Text>
                {milestone.systemObjective ? (
                  <Text element="p" size="sm">
                    {milestone.systemObjective}
                  </Text>
                ) : null}
                {milestone.passageCondition ? (
                  <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('milestones.passageCondition', { condition: milestone.passageCondition })}
                  </Text>
                ) : null}
                {/* #2068.15/.17/.18 — preuve attendue, décision à prendre,
                    correction si le palier n'est pas atteint : trois champs
                    du contrat sans rendu jusqu'à ce lot. */}
                {milestone.expectedProof ? (
                  <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('milestones.expectedProof', { proof: milestone.expectedProof })}
                  </Text>
                ) : null}
                {milestone.decisionToMake ? (
                  <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('milestones.decisionToMake', { decision: milestone.decisionToMake })}
                  </Text>
                ) : null}
                {milestone.correctionIfNotReached ? (
                  <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('milestones.correctionIfNotReached', { correction: milestone.correctionIfNotReached })}
                  </Text>
                ) : null}
              </AuditCard>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <Text element="h2" size="lg" weight="semibold">
          {t('productConfiguration.title')}
        </Text>
        {productConfiguration === null ? (
          <AuditCard className="space-y-1">
            <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
              {t('common:unknownValue')}
            </Text>
            <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('productConfiguration.unmeasured')}
            </Text>
          </AuditCard>
        ) : productConfiguration.length === 0 ? (
          /* #2068.24/.26/.27 — le bloc a été LU et ne nomme aucune aire : ce
             n'est pas « non mesuré » (la carte au-dessus), et sûrement pas une
             liste d'aires « rien à régler » — dans une LISTE, une absence ne
             fait AUCUNE ligne. */
          <AuditCard>
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('productConfiguration.noArea')}
            </Text>
          </AuditCard>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {productConfiguration.map(configuration => (
              <AuditCard key={configuration.area} className="space-y-1">
                <Text element="h3" size="sm" weight="semibold">
                  {t(`productConfiguration.area.${configuration.area}`)}
                </Text>
                {configuration.parameters.length === 0 ? (
                  <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                    {t('productConfiguration.noParameter')}
                  </Text>
                ) : (
                  <ul className="space-y-1">
                    {configuration.parameters.map(parameter => (
                      <li key={parameter.key} className="space-y-0.5">
                        {/* #2068.32 — une valeur ABSENTE se nomme, jamais un
                            zéro ni une chaîne vide de remplissage. Un seul
                            nœud texte (template literal), pas une expression
                            JSX éclatée sur plusieurs nœuds — sinon un lecteur
                            de texte (et un test) ne peut plus cibler la
                            valeur seule. */}
                        <Text element="p" size="sm">
                          {`${parameterLabel(parameter.key)} : ${parameterValue(parameter.key, parameter.value)}`}
                        </Text>
                        {/* #2068.33 — un paramètre avec une valeur remonte à
                            une réponse ou conclusion VALIDÉE (garanti côté
                            contrat par le `.superRefine` de
                            `auditProductParameterSchema`) ; ce lot rend enfin
                            cette trace VISIBLE, pas seulement vérifiée. */}
                        {parameter.trace ? (
                          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                            {t('productConfiguration.trace', { statement: parameter.trace.statement })}
                          </Text>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </AuditCard>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
