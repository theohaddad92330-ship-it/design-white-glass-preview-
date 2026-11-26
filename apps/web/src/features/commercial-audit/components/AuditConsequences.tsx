import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { AuditBlockValidation } from './AuditBlockValidation'
import { AuditCard } from './AuditCard'
import type { AuditConsequence, AuditConsequenceRule } from '../lib/build-audit'

type Translate = ReturnType<typeof useTranslation>['t']

/**
 * #2075.1 à #2075.10 — « À partir de maintenant, … va… ».
 *
 * Six blocs, chacun avec la RÈGLE retenue, son ORIGINE et sa porte de
 * modification. Les règles se lisent sur les champs STRUCTURÉS du profil
 * (taille de compte, niveau de décision, ton, cadence, profondeur d'analyse) —
 * pas sur les quatre phrases de personnalisation, qui sont déjà rendues par
 * l'écran du contexte de profil : deux écrans ne disent pas la même chose sous
 * la même forme.
 */
export function AuditConsequences({ consequences }: { consequences: AuditConsequence[] }) {
  const { t } = useTranslation('commercialAudit')

  return (
    <section className="space-y-3">
      <Text element="h2" size="lg" weight="semibold">
        {t('consequences.title')}
      </Text>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {consequences.map(item => (
          <AuditCard key={item.key} className="space-y-2">
            <Text element="h3" size="sm" weight="semibold">
              {t(`consequences.${item.key}`)}
            </Text>
            {item.rule === null ? (
              // Aucune règle ne se promet sans le champ qui la fonde.
              <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
                {t('consequences.unmeasured')}
              </Text>
            ) : (
              <div className="space-y-1">
                {renderRule(item.rule, t).map(line => (
                  <Text key={line} element="p" size="sm">
                    {line}
                  </Text>
                ))}
                {/* #2067.7 à #2067.12 — un repère de VOLUME (cadence ou
                    objectifs mensuels) n'est jamais un fait acquis : c'est
                    une hypothèse du produit, elle suppose une capacité à s'y
                    tenir, aucune conversion n'est démontrée, et elle se
                    recalibre — jamais à la hausse quand le temps disponible
                    baisse. */}
                {(item.rule.kind === 'load' || item.rule.kind === 'kpiTargets') && (
                  <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('consequences.loadHypothesis')}
                  </Text>
                )}
              </div>
            )}
            <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('columns.origin', { origin: t(`origin.${item.origin}`) })}
            </Text>
            {/* #2075.10 — « modifier » mène au questionnaire : c'est lui qui
                écrit le profil, donc la seule porte qui change la règle. */}
            <Link
              to="/settings/profile"
              className="inline-flex items-center pointer-coarse:min-h-11 text-xs font-medium text-[var(--bellum-text-accent)]"
            >
              {t('consequences.edit')}
            </Link>
            {/* #2075.14 — valider CE bloc seul. Un bloc sans règle n'a rien à
                valider : il ne se valide pas (« non mesuré » ≠ approuvé). */}
            {item.rule !== null ? <AuditBlockValidation targetKey={`consequence:${item.key}`} /> : null}
          </AuditCard>
        ))}
      </div>
    </section>
  )
}

function renderRule(rule: AuditConsequenceRule, t: Translate): string[] {
  switch (rule.kind) {
    case 'accounts': {
      const lines = [
        t('consequences.rule.accounts', {
          size: t(`discover:sidebar.size.${rule.size}`),
          strategy: t(`strategy.${rule.entryStrategy}`),
        }),
      ]
      if (rule.sectors.length > 0)
        lines.push(t('consequences.rule.accountsSectors', { sectors: rule.sectors.join(', ') }))
      return lines
    }
    case 'contacts':
      return [t('consequences.rule.contacts', { level: t(`discover:sidebar.level.${rule.decisionLevel}`) })]
    case 'messages':
      return [
        t('consequences.rule.messages', {
          tone: t(`tone.${rule.tone}`),
          length: t(`length.${rule.length}`),
          angle: rule.angle,
        }),
      ]
    case 'load':
      return [
        t('consequences.rule.load', {
          analyses: t('cadence.analyses', { count: rule.analysesPerWeek }),
          messages: t('cadence.messages', { count: rule.messagesPerDay }),
          followUps: t('cadence.followUps', { count: rule.followUpsPerWeek }),
        }),
      ]
    case 'kpiTargets': {
      const lines = [t('consequences.rule.kpiTargets', { accounts: rule.accountsPerMonth, rdv: rule.rdvPerMonth })]
      // #2067.2 — la cible partenaires suit l'archétype. Une cible que le
      // moteur n'a pas su calculer NE S'AFFICHE PAS : ni ligne vide, ni
      // « 0 partenaire » (gardes GA-18 / GA-19). Le `>= 1` double la borne du
      // contrat (`kpiTargetsSchema.partnersPerMonth`, `.min(1)`) : une donnée
      // ancienne écrite avant lui ne doit pas ressortir en « 0 » à l'écran.
      if (typeof rule.partnersPerMonth === 'number' && rule.partnersPerMonth >= 1)
        lines.push(t('consequences.rule.kpiTargetsPartners', { partners: rule.partnersPerMonth }))
      return lines
    }
    case 'routines': {
      const lines = [t('consequences.rule.routines', { depth: t(`depth.${rule.depth}`) })]
      if (rule.focusAreas.length > 0)
        lines.push(t('consequences.rule.routinesFocus', { focus: rule.focusAreas.join(', ') }))
      return lines
    }
    case 'copilot':
      return [t('consequences.rule.copilot')]
  }
}
