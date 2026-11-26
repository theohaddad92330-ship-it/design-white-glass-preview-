import type { ReactNode } from 'react'
import type { BusinessUnitAccess, BusinessUnitView, EsnAnswers } from '@bellum/contracts'
import { Badge, Button, Text } from '@bellum/ui'
import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useMyBusinessUnits } from '@/features/business-units/hooks/useMyBusinessUnits'
import { QuestionField } from '@/features/onboarding/components/QuestionField'
import { ciblesStep } from '@/features/onboarding/lib/questions/cibles'
import { implantationStep } from '@/features/onboarding/lib/questions/implantation'
import type { Question } from '@/features/onboarding/lib/questions'
import { useAutoSaveProfile } from '../hooks/useAutoSaveProfile'
import { useProfileAnswers } from '../hooks/useProfileAnswers'

type Props = { answers: EsnAnswers }

/** #2847 — le catalogue des questions est statique : une clé absente serait un
 *  changement de catalogue sous ce composant, jamais une donnée d'exécution. */
function findQuestion(questions: readonly Question[], key: Question['key']): Question {
  const found = questions.find(q => q.key === key)
  if (!found) throw new Error(`Territoire (#2847) : question « ${key} » absente du catalogue de l'onboarding.`)
  return found
}

const COMPANY_LOCATIONS = findQuestion(implantationStep.questions, 'company_locations')
const GEO_ZONES = findQuestion(ciblesStep.questions, 'geo_zones')
const REMOTE_AND_TRAVEL_SCOPE = findQuestion(ciblesStep.questions, 'remote_and_travel_scope')
const ZONE_CAPABILITY_STATUS = findQuestion(ciblesStep.questions, 'zone_capability_status')

/**
 * #2118.9 — « Mes périmètres » : le geste qui fait PORTER une BU à un membre.
 *
 * La dimension existait (`business_units` + `business_unit_members`, une
 * personne peut porter deux agences) et les BU portées partent au moteur, mais
 * `POST /business-units/:id/join` n'avait aucun appelant web : personne ne
 * pouvait se rattacher à un périmètre, donc le verdict n'avait rien à citer.
 *
 * Il vit dans Réglages › Profil, avec l'identité : c'est un réglage de la
 * PERSONNE (« où je travaille »), pas de l'espace — créer un périmètre ou
 * régler l'accès de quelqu'un d'autre reste un geste d'organisation.
 *
 * Trois états par périmètre, jamais deux boutons :
 *  - porté → « Tu en fais partie » ;
 *  - accès à tout l'espace → « Rejoindre » ;
 *  - accès cloisonné → « Demander l'accès » (le serveur refuse le « Rejoindre »
 *    d'un membre cloisonné : le proposer serait promettre un 403), ou
 *    « Demande envoyée » quand elle est en attente.
 * Un périmètre archivé n'est proposé qu'à qui le porte déjà.
 *
 * #2847 — recette 27/09 (réel) — NON PROUVÉ : cette section, seul endroit du
 * produit qui parle de « périmètre », ne montrait RIEN du modèle de territoire
 * à 7 axes (#2036) — lui-même invisible ailleurs (les trois axes déjà posés
 * comme colonnes ne vivaient QUE dans le questionnaire d'onboarding). Le bloc
 * `TerritoryModel` ci-dessous les rend VISIBLES et ÉDITABLES ici, avec le même
 * `QuestionField` générique que le questionnaire et la même écriture
 * autosauvegardée que les pages `/settings/profile/$stage`
 * (`useProfileAnswers`/`useAutoSaveProfile`) — jamais un second formulaire
 * dédié (doctrine c75). Les quatre axes SANS colonne restent NOMMÉS
 * « non renseigné », jamais un champ qui prétendrait exister.
 */
export function MyBusinessUnitsSection({ answers }: Props) {
  const { t } = useTranslation('profile')
  const units = useMyBusinessUnits()
  const list = units.data
  const visible = (list?.businessUnits ?? [])
    .filter(unit => unit.status === 'active' || unit.viewerIsMember)
    .sort((a, b) => Number(b.viewerIsMember) - Number(a.viewerIsMember))
  const { values, setField, dirty } = useProfileAnswers(answers)
  useAutoSaveProfile(values, dirty)

  return (
    <SettingsBlock label={t('businessUnits.title')} description={t('businessUnits.subtitle')}>
      {list?.viewerAccess === 'business_unit' ? (
        <Text element="p" size="xs" className="px-5 pt-4 text-[var(--bellum-text-secondary)] sm:px-6">
          {t('businessUnits.restricted')}
        </Text>
      ) : null}
      <div className="divide-y divide-[var(--bellum-border)] border-b border-[var(--bellum-border)]">
        {units.isLoading ? (
          <Text element="p" size="sm" className="px-4 py-3 text-[var(--bellum-text-secondary)]" role="status">
            {t('businessUnits.loading')}
          </Text>
        ) : units.isError || !list ? (
          <Text element="p" size="sm" className="px-4 py-3 text-[var(--bellum-text-secondary)]">
            {t('businessUnits.error')}
          </Text>
        ) : visible.length === 0 ? (
          <Text element="p" size="sm" className="px-4 py-3 text-[var(--bellum-text-secondary)]">
            {t('businessUnits.empty')}
          </Text>
        ) : (
          visible.map(unit => (
            <BusinessUnitRow
              key={unit.id}
              unit={unit}
              access={list.viewerAccess}
              pending={units.pendingId === unit.id}
              onJoin={() => units.join({ id: unit.id, name: unit.name })}
              onRequestAccess={() => units.requestAccess({ id: unit.id, name: unit.name })}
            />
          ))
        )}
      </div>
      <TerritoryModel values={values} setField={setField} />
    </SettingsBlock>
  )
}

/** Les 7 axes de #2036 (épopée #2847), NOMMÉS que la colonne existe ou pas. */
function TerritoryModel({
  values,
  setField,
}: {
  values: Record<string, string | string[]>
  setField: (key: string, value: string | string[]) => void
}) {
  const { t } = useTranslation('profile')
  const UNSET_AXES = ['localSectors', 'reservedAccounts', 'territoryRules', 'exclusiveOrShared'] as const

  return (
    <div className="space-y-4 px-5 py-4 sm:px-6">
      <div>
        <Text element="h3" size="sm" weight="semibold">
          {t('businessUnits.territory.title')}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('businessUnits.territory.subtitle')}
        </Text>
      </div>

      <TerritoryAxis title={t('businessUnits.territory.axes.agenciesRegionsCountries.title')}>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('businessUnits.territory.axes.agenciesRegionsCountries.hint')}
        </Text>
        <QuestionField
          question={COMPANY_LOCATIONS}
          value={values.company_locations ?? []}
          onChange={next => setField('company_locations', next)}
        />
        <QuestionField
          question={GEO_ZONES}
          value={values.geo_zones ?? []}
          onChange={next => setField('geo_zones', next)}
        />
      </TerritoryAxis>

      <TerritoryAxis title={t('businessUnits.territory.axes.remoteAndTravel.title')}>
        <QuestionField
          question={REMOTE_AND_TRAVEL_SCOPE}
          value={values.remote_and_travel_scope ?? []}
          onChange={next => setField('remote_and_travel_scope', next)}
        />
      </TerritoryAxis>

      {UNSET_AXES.map(axis => (
        <TerritoryAxis key={axis} title={t(`businessUnits.territory.axes.${axis}.title`)}>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('businessUnits.territory.unset', { reason: t(`businessUnits.territory.axes.${axis}.reason`) })}
          </Text>
        </TerritoryAxis>
      ))}

      <TerritoryAxis title={t('businessUnits.territory.axes.capabilityStatus.title')}>
        <QuestionField
          question={ZONE_CAPABILITY_STATUS}
          value={values.zone_capability_status ?? []}
          onChange={next => setField('zone_capability_status', next)}
        />
      </TerritoryAxis>
    </div>
  )
}

function TerritoryAxis({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-t border-[var(--bellum-border)] pt-3 first:border-0 first:pt-0">
      <Text size="sm" weight="medium">
        {title}
      </Text>
      {children}
    </div>
  )
}

function BusinessUnitRow({
  unit,
  access,
  pending,
  onJoin,
  onRequestAccess,
}: {
  unit: BusinessUnitView
  access: BusinessUnitAccess
  pending: boolean
  onJoin: () => void
  onRequestAccess: () => void
}) {
  const { t } = useTranslation('profile')
  const details = [
    t(`businessUnits.kinds.${unit.kind}`),
    unit.territory,
    t('businessUnits.memberCount', { count: unit.memberCount }),
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' · ')

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Building2 className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
        <div className="min-w-0">
          <Text element="p" size="sm" weight="medium" className="truncate">
            {unit.name}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {details}
          </Text>
        </div>
      </div>
      <RowAction unit={unit} access={access} pending={pending} onJoin={onJoin} onRequestAccess={onRequestAccess} />
    </div>
  )
}

function RowAction({
  unit,
  access,
  pending,
  onJoin,
  onRequestAccess,
}: {
  unit: BusinessUnitView
  access: BusinessUnitAccess
  pending: boolean
  onJoin: () => void
  onRequestAccess: () => void
}) {
  const { t } = useTranslation('profile')
  if (unit.viewerIsMember) return <Badge variant="success">{t('businessUnits.member')}</Badge>
  if (unit.status !== 'active') return <Badge variant="outline">{t('businessUnits.archived')}</Badge>
  if (access === 'workspace') {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        isLoading={pending}
        disabled={pending}
        aria-label={t('businessUnits.joinAria', { name: unit.name })}
        onClick={onJoin}
      >
        {t('businessUnits.join')}
      </Button>
    )
  }
  if (unit.viewerAccessRequestStatus === 'pending') {
    return <Badge variant="info">{t('businessUnits.requestPending')}</Badge>
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      isLoading={pending}
      disabled={pending}
      aria-label={t('businessUnits.requestAccessAria', { name: unit.name })}
      onClick={onRequestAccess}
    >
      {t('businessUnits.requestAccess')}
    </Button>
  )
}
