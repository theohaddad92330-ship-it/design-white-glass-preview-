import type { Contact, DecisionRole, MarketLocale, PersonCompanyRelationValue } from '@bellum/contracts'
import { formatPhoneForDisplay, marketLocaleValues, PERSON_COMPANY_RELATION_VALUES } from '@bellum/contracts'
import { Box, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import { History, IdCard, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EditableField } from '@/features/crm-core/view/EditableField'
import { RecordHistory } from '@/features/crm-core/view/RecordHistory'
import { useDeleteContact, usePatchContact } from '@/features/crm-core/hooks/useRecordEdit'
import { CURRENT_DECISION_ROLES, getRoleLabel } from '@/lib/contactRoles'
import { SectionCard } from './SectionCard'

// #2861 (#2437.2) — non renseigné (`null`) est une VALEUR au sélecteur,
// distincte du bouton HTML natif « aucune sélection » : ni deviné depuis
// une adresse, ni retombé sur le premier de la liste.
const CONTACT_LOCALE_UNSET = '__unset__'
// #3400.6 (retour bêta #3400) — même geste, pour le rôle de décision : l'API
// et le contrat (`ContactCorePatch.decisionRole`) acceptaient déjà cette
// écriture (voir `apps/api/src/modules/crm-core/record-fields.ts`,
// `CONTACT_FIELD_COLUMNS.decisionRole`) — aucun écran ne l'appelait.
const CONTACT_DECISION_ROLE_UNSET = '__unset__'

// #219.8 (#3231, lot Q03) — la relation personne↔entreprise DÉCLARÉE. Même
// geste que la langue et le rôle ; `unknown_relationship` n'est pas proposée :
// c'est l'absence de déclaration, donc « Non renseigné » (`null`).
const CONTACT_RELATION_UNSET = '__unset__'
const DECLARABLE_RELATIONS = PERSON_COMPANY_RELATION_VALUES.filter(
  (value): value is Exclude<PersonCompanyRelationValue, 'unknown_relationship'> => value !== 'unknown_relationship',
)

/**
 * La fiche d'identité du contact, corrigeable sur place.
 *
 * Avant : tout venait du pipeline et rien n'était modifiable. Une erreur de
 * collecte — un titre périmé, une adresse fausse — restait affichée jusqu'au run
 * suivant, qui la reproduisait à l'identique. Corriger ici pose la provenance
 * « saisi à la main », et c'est cette provenance qui empêche l'analyse de
 * l'écraser la nuit suivante.
 */
export function ContactRecordCard({ contact }: { contact: Contact }) {
  const { t } = useTranslation('crm')
  const patch = usePatchContact(contact)
  const remove = useDeleteContact(contact)
  const [showHistory, setShowHistory] = useState(false)

  return (
    <SectionCard icon={IdCard} title={t('fields.fullName')}>
      <Box className="space-y-4">
        <Box className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <EditableField
            label={t('fields.fullName')}
            value={contact.full_name}
            isSaving={patch.isPending}
            onSave={next => next && patch.mutate({ fullName: next })}
          />
          <EditableField
            label={t('fields.title')}
            value={contact.title}
            isSaving={patch.isPending}
            onSave={next => patch.mutate({ title: next })}
          />
          <EditableField
            label={t('fields.entity')}
            value={contact.entity}
            isSaving={patch.isPending}
            onSave={next => patch.mutate({ entity: next })}
          />
          {/* #4404.2 — coordonnées dans l'ordre e-mail, téléphone, LinkedIn. */}
          <EditableField
            label={t('fields.email')}
            value={contact.email}
            type="email"
            isSaving={patch.isPending}
            onSave={next => patch.mutate({ email: next })}
          />
          <EditableField
            label={t('fields.phone')}
            value={contact.phone}
            // #3850.4 — se LIT en international lisible, s'ÉDITE/se SAUVE en forme stockée.
            displayValue={contact.phone ? formatPhoneForDisplay(contact.phone) : contact.phone}
            type="tel"
            isSaving={patch.isPending}
            onSave={next => patch.mutate({ phone: next })}
          />
          <EditableField
            label={t('fields.linkedinUrl')}
            value={contact.linkedin_url}
            isSaving={patch.isPending}
            onSave={next => patch.mutate({ linkedinUrl: next })}
          />
          <Box className="space-y-1">
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('fields.locale')}
            </Text>
            <Select
              value={contact.locale ?? CONTACT_LOCALE_UNSET}
              onValueChange={next =>
                patch.mutate({ locale: next === CONTACT_LOCALE_UNSET ? null : (next as MarketLocale) })
              }
              disabled={patch.isPending}
            >
              <SelectTrigger aria-label={t('fields.locale')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CONTACT_LOCALE_UNSET}>{t('field.empty')}</SelectItem>
                {marketLocaleValues.map(locale => (
                  <SelectItem key={locale} value={locale}>
                    {t(`locales.${locale}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
          {/* #3400.6 (retour bêta #3400) — corriger le rôle de décision, geste
              jusqu'ici IMPOSSIBLE depuis l'écran alors que l'écriture était déjà
              plombée côté API/contrat : source `human`, elle gagne sur la
              prochaine analyse (`decideFieldWrite`). */}
          <Box className="space-y-1">
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('fields.decisionRole')}
            </Text>
            <Select
              value={contact.decision_role ?? CONTACT_DECISION_ROLE_UNSET}
              onValueChange={next =>
                patch.mutate({
                  decisionRole: next === CONTACT_DECISION_ROLE_UNSET ? null : (next as DecisionRole),
                })
              }
              disabled={patch.isPending}
            >
              <SelectTrigger aria-label={t('fields.decisionRole')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CONTACT_DECISION_ROLE_UNSET}>{t('field.empty')}</SelectItem>
                {CURRENT_DECISION_ROLES.map(role => (
                  <SelectItem key={role} value={role}>
                    {getRoleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
          {/* #219.8 (#3231) — la relation DÉCLARÉE : elle pilote la prudence du
              message (ex-salarié, ex-prestataire : jamais écrire comme s'il
              était encore en poste). Non renseignée = « relation inconnue ». */}
          <Box className="space-y-1">
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('fields.declaredPersonCompanyRelation')}
            </Text>
            <Select
              value={contact.declared_person_company_relation ?? CONTACT_RELATION_UNSET}
              onValueChange={next =>
                patch.mutate({
                  declaredPersonCompanyRelation:
                    next === CONTACT_RELATION_UNSET ? null : (next as (typeof DECLARABLE_RELATIONS)[number]),
                })
              }
              disabled={patch.isPending}
            >
              <SelectTrigger aria-label={t('fields.declaredPersonCompanyRelation')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CONTACT_RELATION_UNSET}>{t('field.empty')}</SelectItem>
                {DECLARABLE_RELATIONS.map(relation => (
                  <SelectItem key={relation} value={relation}>
                    {t(`personCompanyRelations.${relation}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
        </Box>

        <Text element="p" size="xs" color="text-muted-foreground">
          {t('record.editHint')}
        </Text>

        <Box display="flex" className="items-center justify-between gap-3 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(current => !current)}>
            <History className="mr-1.5 size-3.5" aria-hidden />
            {t('history.title')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--danger-soft-text)]"
            isLoading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            <Trash2 className="mr-1.5 size-3.5" aria-hidden />
            {t('delete.action')}
          </Button>
        </Box>

        {showHistory ? <RecordHistory entityType="contact" entityId={contact.id} /> : null}
      </Box>
    </SectionCard>
  )
}
