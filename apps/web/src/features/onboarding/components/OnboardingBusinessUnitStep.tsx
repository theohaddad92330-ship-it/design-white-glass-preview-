import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  businessUnitKindValues,
  hasPermission,
  type BusinessUnitKind,
  type BusinessUnitView,
  type CreateBusinessUnit,
} from '@bellum/contracts'
import { Badge, BrailleLoader, Button, Input, Text, Textarea } from '@bellum/ui'
import { BusinessUnitScopePath } from '@/features/onboarding/components/BusinessUnitScopePath'
import { ChoiceList } from '@/features/onboarding/components/ChoiceList'
import { ChoiceRow } from '@/features/onboarding/components/ChoiceRow'
import { TagsField } from '@/features/onboarding/components/TagsField'
import { useMyBusinessUnits } from '@/features/business-units/hooks/useMyBusinessUnits'
import { useTeam } from '@/features/team/hooks/useTeam'

type Props = { onContinue: () => void }

/**
 * #2017 — « Toute l'entreprise ou un périmètre ? », posée après l'étape
 * entreprise (DÉCISION Louis 17/09 après-midi : RÉUTILISER la dimension BU
 * existante — `business_units`, `business_unit_members`,
 * `business_unit_access_requests`, aucun libellé parallèle). Les sept valeurs
 * de {@link businessUnitKindValues} sont les sept choix demandés (#2087.2-.8).
 *
 * ⚠️ « Toute l'entreprise » (`kind: 'company'`) est le DÉFAUT (2017.19) et
 * n'écrit RIEN : `workspace_members.business_unit_access` vaut déjà
 * `'workspace'` pour tout nouveau compte — c'est le comportement d'aujourd'hui,
 * à l'octet près. Aucune BU n'est créée pour ce choix ; il ne fait qu'avancer.
 *
 * Ce sous-écran vit HORS du pipeline `Question`/`EsnAnswers` (comme
 * `ExistingWorkspaceNotice` / `OnboardingPrivacyStep` sur l'accueil) : il
 * n'ajoute aucune colonne `esn_profiles` — les données collectées vont dans
 * les colonnes EXISTANTES de `business_units` via `POST /business-units`, pas
 * dans une réponse de questionnaire.
 */
export function OnboardingBusinessUnitStep({ onContinue }: Props) {
  const { t } = useTranslation('onboarding')
  const [kind, setKind] = useState<BusinessUnitKind>('company')
  const [creating, setCreating] = useState(false)

  const units = useMyBusinessUnits()
  const { team } = useTeam()
  const role = team?.workspace.role ?? 'member'
  // #2017.18 — « en créer une : seulement si le rôle le permet, sinon la
  // demande d'accès. » Même permission que le serveur (`@RequirePermission
  // ('team:manage')` sur `POST /business-units`) : un refus visible avant le
  // clic, jamais un 403 découvert après coup.
  const canCreate = hasPermission(role, 'team:manage')

  const list = (units.data?.businessUnits ?? []).filter(unit => unit.status === 'active')
  const viewerHasScope = list.some(unit => unit.viewerIsMember)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Text element="h1" size="2xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('businessUnitScope.title')}
        </Text>
        <Text element="p" size="base" className="text-[var(--bellum-text-secondary)]">
          {t('businessUnitScope.subtitle')}
        </Text>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {businessUnitKindValues.map(value => (
          <ChoiceRow
            key={value}
            layout="card"
            label={t(`businessUnitScope.kinds.${value}`)}
            selected={kind === value}
            onClick={() => {
              setKind(value)
              setCreating(false)
            }}
          />
        ))}
      </div>

      {kind === 'company' ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('businessUnitScope.companyHint')}
        </Text>
      ) : (
        <div className="space-y-4">
          <ExistingScopesList
            kind={kind}
            list={list}
            isLoading={units.isLoading}
            isError={units.isError}
            pendingId={units.pendingId}
            onJoin={unit => units.join(unit)}
            onRequestAccess={unit => units.requestAccess(unit)}
          />

          {creating ? (
            <CreateScopeForm
              kind={kind}
              creatingPending={units.creating}
              onCancel={() => setCreating(false)}
              onSubmit={async input => {
                await units.create(input)
                setCreating(false)
              }}
            />
          ) : canCreate ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
              {t('businessUnitScope.createToggle')}
            </Button>
          ) : (
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('businessUnitScope.createNoPermission')}
            </Text>
          )}
        </div>
      )}

      {/* #2087.12 / #2087.13 — « Entreprise → Agence → Équipe », puis la phrase
          de cloisonnement. Se tait tant que le membre ne porte aucun périmètre. */}
      <BusinessUnitScopePath
        companyName={team?.workspace?.name ?? null}
        units={units.data?.businessUnits ?? []}
        members={team?.members ?? []}
      />

      <div className="flex justify-end pt-2">
        <Button type="button" variant="default" onClick={onContinue} data-testid="business-unit-scope-continue">
          {t('businessUnitScope.continue')}
        </Button>
      </div>
      {/* `viewerHasScope` n'est lu par rien d'autre ici : « Continuer » n'est
          JAMAIS bloqué par ce choix (L3, jamais un blocage dur) — mais un test
          peut vérifier que le geste a bien été enregistré avant de continuer. */}
      <span data-testid="business-unit-scope-viewer-has-scope" hidden>
        {String(viewerHasScope)}
      </span>
    </div>
  )
}

function ExistingScopesList({
  kind,
  list,
  isLoading,
  isError,
  pendingId,
  onJoin,
  onRequestAccess,
}: {
  kind: BusinessUnitKind
  list: BusinessUnitView[]
  isLoading: boolean
  isError: boolean
  pendingId: string | null
  onJoin: (unit: { id: string; name: string }) => void
  onRequestAccess: (unit: { id: string; name: string }) => void
}) {
  const { t } = useTranslation('onboarding')
  const scoped = list.filter(unit => unit.kind === kind)

  return (
    <div className="space-y-2">
      <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('businessUnitScope.existingTitle')}
      </Text>
      {isLoading ? (
        <div className="flex items-center gap-2 py-3" role="status">
          <BrailleLoader variant="grid-searching" />
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('businessUnitScope.existingLoading')}
          </Text>
        </div>
      ) : isError ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('businessUnitScope.existingError')}
        </Text>
      ) : scoped.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('businessUnitScope.existingEmpty')}
        </Text>
      ) : (
        <ChoiceList>
          {scoped.map(unit => (
            <div key={unit.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Building2 className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
                <div className="min-w-0">
                  <Text element="p" size="sm" weight="medium" className="truncate">
                    {unit.name}
                  </Text>
                  {unit.territory && (
                    <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                      {unit.territory}
                    </Text>
                  )}
                </div>
              </div>
              {unit.viewerIsMember ? (
                <Badge variant="success">{t('businessUnitScope.member')}</Badge>
              ) : unit.viewerAccessRequestStatus === 'pending' ? (
                <Badge variant="info">{t('businessUnitScope.requestPending')}</Badge>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={pendingId === unit.id}
                  disabled={pendingId === unit.id}
                  aria-label={t('businessUnitScope.requestAccessAria', { name: unit.name })}
                  onClick={() => onRequestAccess({ id: unit.id, name: unit.name })}
                >
                  {t('businessUnitScope.requestAccess')}
                </Button>
              )}
            </div>
          ))}
        </ChoiceList>
      )}
    </div>
  )
}

function CreateScopeForm({
  kind,
  creatingPending,
  onCancel,
  onSubmit,
}: {
  kind: BusinessUnitKind
  creatingPending: boolean
  onCancel: () => void
  onSubmit: (input: CreateBusinessUnit) => Promise<void>
}) {
  const { t } = useTranslation('onboarding')
  const [name, setName] = useState('')
  const [territory, setTerritory] = useState('')
  const [specialties, setSpecialties] = useState<string[]>([])
  const [consultantCount, setConsultantCount] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [portfolioNote, setPortfolioNote] = useState('')
  const [nameError, setNameError] = useState(false)

  // #2017.12 — « collecter sa taille » : AUCUNE colonne `business_units` ne
  // porte une taille générique distincte des deux compteurs ci-dessous
  // (`consultant_count`, `team_size`) — la ligne 2017.12 du registre le nomme.
  // Ici, la « taille » est la SOMME affichée des deux, jamais un troisième
  // champ stocké en double.
  const totalSize = (Number(consultantCount) || 0) + (Number(teamSize) || 0)

  const submit = async (): Promise<void> => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError(true)
      return
    }
    await onSubmit({
      name: trimmedName,
      kind,
      territory: territory.trim() || null,
      specialties,
      consultantCount: consultantCount ? Number(consultantCount) : null,
      teamSize: teamSize ? Number(teamSize) : null,
      // #2017.16 — « comptes possédés » : aucune sélection relationnelle de
      // comptes n'existe à la création d'un périmètre (`business_units` n'a
      // pas de colonne dédiée) ; `portfolio_note` capture la déclaration en
      // texte libre. Le rattachement RÉEL d'un compte se fait ensuite via
      // `PUT /accounts/:id/business-unit`, hors de ce formulaire.
      portfolioNote: portfolioNote.trim() || null,
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--bellum-border)] p-4">
      <Text element="h3" size="sm" weight="semibold">
        {t('businessUnitScope.createTitle')}
      </Text>

      <div className="space-y-1">
        <Text element="label" size="xs" weight="medium" htmlFor="bu-scope-name">
          {t('businessUnitScope.createName')}
        </Text>
        <Input
          id="bu-scope-name"
          value={name}
          onChange={e => {
            setName(e.target.value)
            setNameError(false)
          }}
          placeholder={t('businessUnitScope.createNamePlaceholder')}
        />
        {nameError && (
          <Text size="xs" className="text-[var(--danger-soft-text)]">
            {t('businessUnitScope.createNameRequired')}
          </Text>
        )}
      </div>

      <div className="space-y-1">
        <Text element="label" size="xs" weight="medium" htmlFor="bu-scope-territory">
          {t('businessUnitScope.createTerritory')}
        </Text>
        <Input
          id="bu-scope-territory"
          value={territory}
          onChange={e => setTerritory(e.target.value)}
          placeholder={t('businessUnitScope.createTerritoryPlaceholder')}
        />
      </div>

      <div className="space-y-1">
        <Text element="label" size="xs" weight="medium">
          {t('businessUnitScope.createSpecialties')}
        </Text>
        <TagsField
          values={specialties}
          onChange={setSpecialties}
          placeholder={t('businessUnitScope.createSpecialtiesPlaceholder')}
          max={20}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Text element="label" size="xs" weight="medium" htmlFor="bu-scope-consultants">
            {t('businessUnitScope.createConsultantCount')}
          </Text>
          <Input
            id="bu-scope-consultants"
            type="number"
            min={0}
            inputMode="numeric"
            value={consultantCount}
            onChange={e => setConsultantCount(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Text element="label" size="xs" weight="medium" htmlFor="bu-scope-team-size">
            {t('businessUnitScope.createTeamSize')}
          </Text>
          <Input
            id="bu-scope-team-size"
            type="number"
            min={0}
            inputMode="numeric"
            value={teamSize}
            onChange={e => setTeamSize(e.target.value)}
          />
        </div>
      </div>

      {totalSize > 0 && (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('businessUnitScope.createTotalSize', { count: totalSize })}
        </Text>
      )}

      <div className="space-y-1">
        <Text element="label" size="xs" weight="medium" htmlFor="bu-scope-portfolio-note">
          {t('businessUnitScope.createPortfolioNote')}
        </Text>
        <Textarea
          id="bu-scope-portfolio-note"
          value={portfolioNote}
          onChange={e => setPortfolioNote(e.target.value)}
          placeholder={t('businessUnitScope.createPortfolioNotePlaceholder')}
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button type="button" variant="default" size="sm" isLoading={creatingPending} onClick={() => void submit()}>
          {t('businessUnitScope.createSubmit')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={creatingPending}>
          {t('businessUnitScope.createCancel')}
        </Button>
      </div>
    </div>
  )
}
