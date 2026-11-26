import type { Catalogue, CatalogueKey, CatalogueValue } from '@bellum/contracts'
import { EDITABLE_CATALOGUES } from '@bellum/contracts'
import { Badge, Box, Button, Input, Text } from '@bellum/ui'
import { useId, useState } from 'react'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import {
  SettingsBlock,
  SettingsField,
  SettingsInlineForm,
  SettingsTableFrame,
} from '@/features/settings/components/SettingsBlocks'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useFirstName } from '@/hooks/useFirstName'
import { useAddCatalogueValue, useCatalogues, useRemoveCatalogueValue } from '../api'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import { SkillAliasQueue } from './SkillAliasQueue'
import { SettingsViewHeader } from '@/features/settings/components/SettingsViewHeader'

/**
 * Les huit catalogues d'un espace (PDF 2 §11.3, ticket BEL-CRM-105).
 *
 * Motifs et libellés étaient dispersés : les motifs de perte avaient une table
 * et un CRUD mais aucun écran, les libellés d'étapes un endpoint et aucun
 * écran, quatre autres n'existaient pas. Un administrateur qui voulait adapter
 * le vocabulaire de son ESN n'avait nulle part où aller.
 *
 * Chaque valeur affiche son NOMBRE D'USAGES. Sans ce chiffre, désactiver
 * revient à tirer au sort : personne ne sait si « concurrent installé » sert
 * deux fois ou deux cents.
 */
/**
 * `only` — Réglages › Catalogues & vocabulaire (maquette `settings-espace`, 22/10/2026) montre UN catalogue par
 * onglet (Motifs de perte · Comptes écartés · Non-staffabilité). Avec `only`, la vue rend ces catalogues-là, sans
 * titre de page (l'onglet nomme l'endroit) et sans la file des compétences à rapprocher (elle vit dans l'onglet
 * Vocabulaire) : un catalogue ne s'affiche qu'à un seul endroit (GA-26). Les listes fermées gardent leur repli.
 */
export function CataloguesView({ only }: { only?: readonly CatalogueKey[] } = {}) {
  const { t } = useTranslation('catalogues')
  const firstName = useFirstName()
  const { data, isLoading, isError } = useCatalogues()
  const [showReadOnly, setShowReadOnly] = useState(false)
  const items = (data?.items ?? []).filter(catalogue => only === undefined || only.includes(catalogue.key))
  // `editable` est la propriété du catalogue lui-même : l'écran ne devine pas
  // ce qui se modifie, il lit ce que le serveur déclare.
  const editable = items.filter(catalogue => catalogue.editable === 'editable')
  const readOnly = items.filter(catalogue => catalogue.editable !== 'editable')

  return (
    <Box className="flex flex-col gap-5">
      {/* #1525 — « Catalogues » ne dit pas à quoi la page sert. Elle règle le
          VOCABULAIRE de l'espace : les motifs qu'on choisit pour expliquer une
          perte, une mise en pause, un besoin qu'on ne sait pas staffer. */}
      {only !== undefined ? null : (
        <SettingsViewHeader
          scope="space"
          title={firstName ? t('page.heading', { name: firstName }) : t('page.headingNoName')}
          subtitle={t('page.subtitle')}
        />
      )}

      {isLoading ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('page.loading')}
        </Text>
      ) : isError ? (
        // #3666.k — une lecture en échec n'est pas « aucune liste ».
        <QueryLoadError />
      ) : (
        <>
          {/* Les listes que l'espace peut réellement MODIFIER d'abord : ce sont
              elles qui appellent une décision. Les référentiels en lecture seule
              se replient — ils occupaient le plus de hauteur pour ce qu'on ne
              peut pas changer. */}
          {editable.map(catalogue => (
            <CatalogueCard key={catalogue.key} catalogue={catalogue} />
          ))}

          {readOnly.length > 0 ? (
            <Box className="space-y-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pointer-coarse:min-h-11"
                aria-expanded={showReadOnly}
                onClick={() => setShowReadOnly(open => !open)}
              >
                {t('page.showReadOnly', { count: readOnly.length })}
              </Button>
              {showReadOnly
                ? readOnly.map(catalogue => <CatalogueCard key={catalogue.key} catalogue={catalogue} />)
                : null}
            </Box>
          ) : null}
        </>
      )}

      {/* #1527 avait déplacé la file des compétences à rapprocher vers Pilotage ›
          Qualité des données. Louis 14/10/2026 (refonte Pilotage, L0a) : cet
          onglet est supprimé, la file REVIENT ici, d'où elle venait — elle
          reste le seul point de montage, et le lien « a déménagé » disparaît
          avec le déménagement. */}
      {only === undefined ? <SkillAliasQueue /> : null}
    </Box>
  )
}

function CatalogueCard({ catalogue }: { catalogue: Catalogue }) {
  const { t } = useTranslation('catalogues')
  const add = useAddCatalogueValue()
  const remove = useRemoveCatalogueValue()
  const [draft, setDraft] = useState('')
  const inputId = useId()
  const editable = EDITABLE_CATALOGUES.includes(catalogue.key as CatalogueKey)
  // Les catalogues FERMÉS portent une clé, pas un libellé : leur vocabulaire vit dans le code et se traduit ici.
  const label = (value: CatalogueValue) => labelOf(catalogue.key, value.label, t)

  // Maquette `settings-espace` (Catalogues) : un bloc par liste — Valeur · Usage · État · Actions, puis « Ajouter une
  // valeur » en ligne. Un catalogue fermé le DIT dans son en-tête : le cacher ferait croire qu'il n'existe pas.
  return (
    <SettingsBlock
      title={t(`names.${catalogue.key}`)}
      description={t(`descriptions.${catalogue.key}`)}
      testId={`catalogue-${catalogue.key}`}
      action={editable ? undefined : <Badge variant="outline">{t('readOnly')}</Badge>}
    >
      {catalogue.values.length === 0 ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('emptyValues')}
        </Text>
      ) : (
        <SettingsTableFrame>
          <ResponsiveTable<CatalogueValue>
            rows={catalogue.values}
            rowKey={value => `${catalogue.key}:${value.id ?? value.label}`}
            scrollLabel={t(`names.${catalogue.key}`)}
            columns={[
              {
                key: 'value',
                header: t('table.value'),
                mobile: 'title',
                render: value => (
                  <Text element="span" size="sm" className={value.archived ? 'line-through opacity-60' : undefined}>
                    {label(value)}
                  </Text>
                ),
              },
              {
                key: 'usage',
                header: t('table.usage'),
                render: value => (
                  <Text element="span" size="sm" color="text-[var(--bellum-text-secondary)]">
                    {t('usage', { count: value.usage })}
                  </Text>
                ),
              },
              {
                key: 'state',
                header: t('table.state'),
                render: value =>
                  value.archived ? (
                    <Badge variant="outline">{t('state.archived')}</Badge>
                  ) : (
                    <Badge variant="success">{t('state.active')}</Badge>
                  ),
              },
              ...(editable
                ? [
                    {
                      key: 'actions',
                      header: t('table.actions'),
                      className: 'w-px whitespace-nowrap text-right',
                      render: (value: CatalogueValue) =>
                        value.id ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11"
                            aria-label={t('removeAria', { label: label(value) })}
                            disabled={remove.isPending}
                            onClick={() => remove.mutate({ key: catalogue.key, id: value.id as string })}
                          >
                            {t('remove')}
                          </Button>
                        ) : null,
                    },
                  ]
                : []),
            ]}
          />
        </SettingsTableFrame>
      )}

      {editable && (
        <SettingsInlineForm
          label={t('addLabel')}
          onSubmit={() => {
            if (draft.trim().length === 0 || add.isPending) return
            add.mutate({ key: catalogue.key, label: draft.trim() })
            setDraft('')
          }}
        >
          <SettingsField label={t('addLabel')} htmlFor={inputId}>
            <Input
              id={inputId}
              value={draft}
              maxLength={120}
              placeholder={t('addPlaceholder')}
              onChange={event => setDraft(event.target.value)}
            />
          </SettingsField>
          <Button
            type="submit"
            variant="outline"
            className="min-h-11"
            disabled={draft.trim().length === 0 || add.isPending}
          >
            {t('add')}
          </Button>
        </SettingsInlineForm>
      )}
    </SettingsBlock>
  )
}

function labelOf(key: string, raw: string, t: TFunction): string {
  if (key !== 'submission_outcome_reasons') return raw
  return t(`submissions:reasons.${raw}`, { defaultValue: raw })
}
