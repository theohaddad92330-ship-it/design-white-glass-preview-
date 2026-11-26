import type { CustomFieldEntity, CustomFieldType } from '@bellum/contracts'
import { CUSTOM_FIELDS_MAX_PER_ENTITY, CUSTOM_FIELD_TYPES } from '@bellum/contracts'
import { Badge, Box, Button, Input, Text } from '@bellum/ui'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useArchiveCustomField, useCreateCustomField, useCustomFields } from '../api'

/**
 * La GOUVERNANCE de la base — les champs personnalisés, bornés.
 *
 * La doctrine : le produit BORNE et PROPOSE, il ne décide pas à la place de
 * l'utilisateur. Dix champs par objet, et le compteur est affiché — une borne
 * qu'on découvre en la heurtant se lit comme une panne.
 *
 * ⚠️ Les DOUBLONS proposés vivaient ici jusqu'au 29/08/2026. Ils sont partis sur
 * l'écran Qualité des données (`DuplicatesPanel`), et c'est une décision : ce
 * panneau n'est monté que dans la branche « un CRM est connecté » de l'écran
 * Connaissances, alors que `duplicate_pairs` est produit par la base de
 * l'espace et non par le CRM. Un espace sans CRM comptait donc ses doublons non
 * tranchés sans avoir aucune porte pour les trancher.
 *
 * Ils sont partis, pas dupliqués : le même objet arbitré à deux endroits est
 * deux files d'attente pour une seule décision (loi 4 du tome 7). Un champ
 * personnalisé, lui, EST un réglage de la base — il reste ici.
 */
export function GovernancePanel({ entityType = 'contact' }: { entityType?: CustomFieldEntity }) {
  return (
    <Box className="space-y-6">
      <CustomFieldsBlock entityType={entityType} />
    </Box>
  )
}

function CustomFieldsBlock({ entityType }: { entityType: CustomFieldEntity }) {
  const { t } = useTranslation('governance')
  const { data: fields, isError } = useCustomFields(entityType)
  const create = useCreateCustomField(entityType)
  const archive = useArchiveCustomField(entityType)
  const [label, setLabel] = useState('')
  const [type, setType] = useState<CustomFieldType>('text')

  const active = (fields ?? []).filter(field => !field.archived)

  return (
    <Box className="space-y-3">
      <Box display="flex" className="flex-wrap items-baseline gap-x-3 gap-y-1">
        <Text element="p" size="sm" weight="medium">
          {t('fields.title')}
        </Text>
        {/* Le compteur est AFFICHÉ : une borne qu'on découvre en la heurtant se
            lit comme une panne. */}
        <Text element="span" size="xs" color="text-muted-foreground">
          {t('fields.counter', { used: active.length, max: CUSTOM_FIELDS_MAX_PER_ENTITY })}
        </Text>
      </Box>
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('fields.hint')}
      </Text>

      <Box display="flex" className="flex-wrap items-center gap-2">
        <Input
          value={label}
          onChange={event => setLabel(event.target.value)}
          placeholder={t('fields.placeholder')}
          aria-label={t('fields.label')}
          className="min-w-[200px] flex-1"
        />
        {CUSTOM_FIELD_TYPES.map(value => (
          <Button key={value} variant={type === value ? 'secondary' : 'ghost'} size="sm" onClick={() => setType(value)}>
            {t(`fields.types.${value}`)}
          </Button>
        ))}
        <Button
          variant="black"
          size="sm"
          disabled={label.trim().length === 0 || active.length >= CUSTOM_FIELDS_MAX_PER_ENTITY}
          isLoading={create.isPending}
          onClick={() =>
            create.mutate(
              { entityType, label: label.trim(), type, options: type === 'select' ? ['À définir'] : [] },
              { onSuccess: () => setLabel('') },
            )
          }
        >
          {t('fields.add')}
        </Button>
      </Box>

      {isError ? (
        <Text size="xs" color="text-muted-foreground">
          {t('fields.loadError')}
        </Text>
      ) : active.length === 0 ? (
        <Text size="xs" color="text-muted-foreground">
          {t('fields.empty')}
        </Text>
      ) : (
        <Box className="space-y-1">
          {active.map(field => (
            <Box
              key={field.id}
              display="flex"
              className="items-center justify-between gap-2 rounded-md border border-border p-2"
            >
              <Box display="flex" className="min-w-0 items-center gap-2">
                <Text element="span" size="xs" weight="medium">
                  {field.label}
                </Text>
                <Badge variant="secondary">{t(`fields.types.${field.type}`)}</Badge>
                {/* La clé machine est montrée : c'est elle qui sort dans les
                    exports, et la découvrir dans un CSV surprend. */}
                <Text element="span" size="xs" color="text-muted-foreground">
                  {field.key}
                </Text>
              </Box>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('fields.archive')}
                title={t('fields.archiveHint')}
                onClick={() => archive.mutate({ id: field.id })}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
