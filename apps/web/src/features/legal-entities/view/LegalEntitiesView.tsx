import { hasPermission, type LegalEntity } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
} from '@bellum/ui'
import { SettingsBlock, SettingsNote, SettingsTableFrame } from '@/features/settings/components/SettingsBlocks'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useFirstName } from '@/hooks/useFirstName'
import { useArchiveLegalEntity, useCreateLegalEntity, useLegalEntities, useUpdateLegalEntity } from '../api'

/**
 * RÉGLAGES › SOCIÉTÉS — les structures de l'ESN qui facturent (décision D9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CET ÉCRAN EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `legal_entities` était livré ENTIER côté serveur — table, entité, module,
 * quatre routes gardées, `missions.legal_entity_id` — et strictement invisible
 * côté web. Une ESN à plusieurs structures n'avait donc qu'une réponse : « un
 * espace par société », c'est-à-dire perdre l'équipe partagée, le vivier commun
 * et le cockpit du responsable pour régler une question de facturation.
 *
 * ⚠️ À ne pas confondre avec les entités du CLIENT (`account_entities`, onglet
 * « Sites & entités » d'un dossier) : celles-là REÇOIVENT la facture,
 * celles-ci l'ÉMETTENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN NE FERA PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne SUPPRIME pas. Une société a porté des missions et des mois facturés ;
 * l'effacer détacherait ses missions (`ON DELETE SET NULL`) et rendrait
 * illisible l'historique qui la nomme. Il n'y a donc aucun bouton de
 * suppression — ce n'est pas une convention, c'est l'absence de chemin.
 *
 * Il ne touche NI aux crédits, NI aux sièges, NI à l'abonnement : Bellum reste
 * facturé une fois à l'espace. C'est dit à l'écran, parce que c'est la première
 * question que pose quelqu'un qui déclare une seconde société.
 */
export function LegalEntitiesView() {
  const { t } = useTranslation('legalEntities')
  const firstName = useFirstName()
  const { team } = useTeam()
  /**
   * Le droit d'ÉCRIRE, jamais celui de lire.
   *
   * Côté serveur, la lecture est ouverte à tous les membres — « un commercial
   * doit pouvoir voir quelle société porte la mission dont il parle au client,
   * sans avoir accès à l'abonnement ». Fermer la liste ici fermerait une porte
   * que l'API laisse ouverte.
   *
   * `hasPermission` et non un test de rôle en dur : la matrice est la seule
   * source, et un test en dur oublierait le siège Finance, qui l'a.
   *
   * ⚠️ Le serveur reste l'AUTORITÉ : il refuse en 403 et le message remonte.
   * Ce test-ci décide seulement de ce qu'on PROPOSE, pour ne pas offrir un
   * geste qui finirait en erreur.
   */
  const canManage = hasPermission(team?.workspace.role ?? 'member', 'billing:manage')
  const { data, isLoading, isError } = useLegalEntities()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = (data ?? []).find(entity => entity.id === editingId) ?? null

  const entities = data ?? []

  return (
    <SettingsBlock
      title={firstName ? t('page.heading', { name: firstName }) : t('page.headingNoName')}
      description={`${t('page.subtitle')} ${t('page.notHere')}`}
      testId="legal-entities-block"
      action={
        <>
          {/* Le copilote AIDE à comprendre ; il ne crée ni n'archive une entité — aucun outil d'écriture sur ce réglage. */}
          <AskLaura question={t('page.askLaura')} label={t('page.askLauraLabel')} />
          {/* ⚠️ Un échec de lecture ne propose PAS l'ajout : ajouter sur une liste qu'on n'a pas pu lire, c'est créer
              un doublon sans le savoir. */}
          {canManage && !isLoading && !isError ? (
            <Button className="min-h-11" onClick={() => setCreating(true)}>
              {t('form.legend')}
            </Button>
          ) : null}
        </>
      }
    >
      <SettingsNote>
        <p>{t('page.why')}</p>
        <p className="mt-1">{t('page.subscriptionNote')}</p>
      </SettingsNote>

      {isLoading && (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('page.loading')}
        </Text>
      )}

      {/* ⚠️ Un échec de lecture ne rend NI la liste vide, NI le formulaire. « Cassé » et « aucune société » ne se
          ressemblent qu'à l'écran. */}
      {isError && !isLoading && (
        <Text size="sm" color="text-[var(--danger-soft-text)]">
          {t('page.loadFailed')}
        </Text>
      )}

      {!isLoading && !isError ? (
        <Box className="flex flex-col gap-4">
          {entities.length === 0 ? (
            <Box className="rounded-overlay border border-dashed border-[var(--bellum-border)] px-4 py-5">
              <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                {t('empty.title')}
              </Text>
              <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-1">
                {t('empty.description')}
              </Text>
            </Box>
          ) : (
            // Maquette `settings-espace` (onglet Sociétés) : Raison sociale · Pays / identifiant · Statut · Actions.
            <SettingsTableFrame>
              <ResponsiveTable<LegalEntity>
                rows={entities}
                rowKey={entity => entity.id}
                scrollLabel={t('page.headingNoName')}
                columns={[
                  {
                    key: 'name',
                    header: t('table.name'),
                    mobile: 'title',
                    render: entity => (
                      <Box className="min-w-0">
                        <Text element="span" size="sm" weight="semibold" className="block">
                          {entity.name}
                        </Text>
                        {/* ⚠️ Un champ absent est NOMMÉ, jamais rendu vide : la base dit qu'on ne l'a pas saisi. */}
                        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]" className="block">
                          {entity.address ?? t('row.noAddress')}
                        </Text>
                      </Box>
                    ),
                  },
                  {
                    key: 'country',
                    header: t('table.country'),
                    render: entity => (
                      <Box className="min-w-0">
                        <Text element="span" size="sm" className="block">
                          {entity.country ?? t('row.noCountry')}
                        </Text>
                        {/* #2422.3 — TVA, devise : même règle, un champ absent est NOMMÉ. */}
                        {[
                          entity.registration_number ?? t('row.noRegistration'),
                          entity.vat_number ?? t('row.noVatNumber'),
                          entity.currency ?? t('row.noCurrency'),
                        ].map(line => (
                          <Text
                            key={line}
                            element="span"
                            size="xs"
                            color="text-[var(--bellum-text-muted)]"
                            className="block"
                          >
                            {line}
                          </Text>
                        ))}
                      </Box>
                    ),
                  },
                  {
                    key: 'status',
                    header: t('table.status'),
                    // Une société archivée le DIT. La cacher ferait croire qu'elle n'a jamais existé.
                    render: entity =>
                      entity.archived ? (
                        <Badge variant="outline">{t('row.archived')}</Badge>
                      ) : (
                        <Badge variant="success">{t('row.active')}</Badge>
                      ),
                  },
                  {
                    key: 'actions',
                    header: t('table.actions'),
                    className: 'w-px whitespace-nowrap text-right',
                    mobile: canManage ? 'field' : 'hidden',
                    render: entity =>
                      canManage ? <LegalEntityActions entity={entity} onEdit={() => setEditingId(entity.id)} /> : null,
                  },
                ]}
              />
            </SettingsTableFrame>
          )}

          {canManage ? null : (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('readOnly')}
            </Text>
          )}

          <SettingsNote>{t('archiveNote')}</SettingsNote>
        </Box>
      ) : null}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent closeLabel={t('dialog.close')}>
          <DialogHeader>
            <DialogTitle>{t('form.legend')}</DialogTitle>
            <DialogDescription>{t('dialog.createDescription')}</DialogDescription>
          </DialogHeader>
          <CreateLegalEntityForm onDone={() => setCreating(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={open => (open ? null : setEditingId(null))}>
        {editing ? (
          <DialogContent closeLabel={t('dialog.close')}>
            <DialogHeader>
              <DialogTitle>{t('row.edit', { name: editing.name })}</DialogTitle>
              <DialogDescription>{t('dialog.createDescription')}</DialogDescription>
            </DialogHeader>
            <EditLegalEntityForm entity={editing} onDone={() => setEditingId(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </SettingsBlock>
  )
}

function LegalEntityActions({ entity, onEdit }: { entity: LegalEntity; onEdit: () => void }) {
  const { t } = useTranslation('legalEntities')
  const archive = useArchiveLegalEntity()
  return (
    <Box display="flex" className="items-center justify-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        className="min-h-11"
        aria-label={t('row.edit', { name: entity.name })}
        onClick={onEdit}
      >
        {t('row.editShort')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="min-h-11"
        aria-label={t(entity.archived ? 'row.restore' : 'row.archive', { name: entity.name })}
        disabled={archive.isPending}
        onClick={() => archive.mutate({ id: entity.id, archived: !entity.archived })}
      >
        {entity.archived ? t('row.restoreShort') : t('row.archiveShort')}
      </Button>
    </Box>
  )
}

type Draft = {
  name: string
  registration: string
  country: string
  vatNumber: string
  address: string
  currency: string
}

/**
 * Ce qui part au serveur.
 *
 * Un champ laissé VIDE part `null` et non `''` : le serveur stocke alors « non
 * renseigné », que l'écran sait dire, là où une chaîne vide serait un
 * identifiant légal vide — une valeur de remplissage.
 *
 * Écrit ICI, à un seul endroit, pour la création ET la correction : deux
 * conversions recopiées divergeraient dès que l'une apprend à normaliser.
 */
function toPayload(draft: Draft): {
  name: string
  registration_number: string | null
  country: string | null
  vat_number: string | null
  address: string | null
  currency: string | null
} {
  return {
    name: draft.name.trim(),
    registration_number: draft.registration.trim() || null,
    country: draft.country.trim().toUpperCase() || null,
    vat_number: draft.vatNumber.trim() || null,
    address: draft.address.trim() || null,
    currency: draft.currency.trim().toUpperCase() || null,
  }
}

const EMPTY_DRAFT: Draft = { name: '', registration: '', country: '', vatNumber: '', address: '', currency: '' }

/**
 * Un vrai `<form>` NOMMÉ, et pas une grappe de champs.
 *
 * Deux raisons, dans cet ordre : la touche Entrée valide la saisie sans
 * chercher le bouton — c'est le geste de quelqu'un qui déclare trois sociétés
 * à la suite ; et un formulaire nommé se DÉSIGNE, ce qui distingue « le
 * formulaire d'ajout » de « la correction d'Astréa Conseil » quand les deux
 * portent les mêmes libellés de champ.
 */
function CreateLegalEntityForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('legalEntities')
  const create = useCreateLegalEntity()
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)

  return (
    <>
      <form
        aria-label={t('form.legend')}
        className="space-y-3"
        onSubmit={event => {
          event.preventDefault()
          // Le nom est le SEUL champ obligatoire — une raison sociale vide ne
          // se rattrape nulle part, et le serveur la refuserait de toute façon.
          if (!draft.name.trim()) return
          create.mutate(toPayload(draft), {
            onSuccess: () => {
              setDraft(EMPTY_DRAFT)
              onDone()
            },
          })
        }}
      >
        <LegalEntityFields draft={draft} onChange={setDraft} />
        <DialogFooter>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onDone}>
            {t('row.cancel')}
          </Button>
          <Button type="submit" className="min-h-11" disabled={create.isPending}>
            {create.isPending ? t('form.saving') : t('form.submit')}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function EditLegalEntityForm({ entity, onDone }: { entity: LegalEntity; onDone: () => void }) {
  const { t } = useTranslation('legalEntities')
  const update = useUpdateLegalEntity()
  const [draft, setDraft] = useState<Draft>({
    name: entity.name,
    registration: entity.registration_number ?? '',
    country: entity.country ?? '',
    vatNumber: entity.vat_number ?? '',
    address: entity.address ?? '',
    currency: entity.currency ?? '',
  })

  return (
    <>
      <form
        aria-label={t('row.edit', { name: entity.name })}
        className="space-y-3"
        onSubmit={event => {
          event.preventDefault()
          if (!draft.name.trim()) return
          update.mutate({ id: entity.id, ...toPayload(draft) }, { onSuccess: onDone })
        }}
      >
        <LegalEntityFields draft={draft} onChange={setDraft} />
        <DialogFooter>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onDone}>
            {t('row.cancel')}
          </Button>
          <Button type="submit" className="min-h-11" disabled={update.isPending}>
            {update.isPending ? t('form.saving') : t('row.save')}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

/**
 * Les trois champs, écrits UNE fois pour la création et la correction.
 *
 * `useId` + `htmlFor` : un libellé posé à côté d'un champ sans association ne
 * se lit pas au lecteur d'écran et ne donne pas le focus au clic.
 */
function LegalEntityFields({ draft, onChange }: { draft: Draft; onChange: (next: Draft) => void }) {
  const { t } = useTranslation('legalEntities')
  const nameId = useId()
  const registrationId = useId()
  const countryId = useId()
  const vatNumberId = useId()
  const addressId = useId()
  const currencyId = useId()

  return (
    <Box className="grid gap-3 sm:grid-cols-3">
      <Box className="space-y-1">
        <Label htmlFor={nameId}>{t('form.name')}</Label>
        <Input
          id={nameId}
          value={draft.name}
          placeholder={t('form.namePlaceholder')}
          onChange={event => onChange({ ...draft, name: event.target.value })}
        />
      </Box>
      <Box className="space-y-1">
        <Label htmlFor={registrationId}>{t('form.registrationNumber')}</Label>
        <Input
          id={registrationId}
          value={draft.registration}
          placeholder={t('form.registrationPlaceholder')}
          onChange={event => onChange({ ...draft, registration: event.target.value })}
        />
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('form.registrationHint')}
        </Text>
      </Box>
      <Box className="space-y-1">
        <Label htmlFor={countryId}>{t('form.country')}</Label>
        <Input
          id={countryId}
          value={draft.country}
          maxLength={2}
          placeholder={t('form.countryPlaceholder')}
          onChange={event => onChange({ ...draft, country: event.target.value })}
        />
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('form.countryHint')}
        </Text>
      </Box>
      {/* #2422.3 — TVA, adresse, devise : mêmes conventions (optionnel, `null`
          si vide, même grille responsive). */}
      <Box className="space-y-1">
        <Label htmlFor={vatNumberId}>{t('form.vatNumber')}</Label>
        <Input
          id={vatNumberId}
          value={draft.vatNumber}
          placeholder={t('form.vatNumberPlaceholder')}
          onChange={event => onChange({ ...draft, vatNumber: event.target.value })}
        />
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('form.vatNumberHint')}
        </Text>
      </Box>
      <Box className="space-y-1">
        <Label htmlFor={addressId}>{t('form.address')}</Label>
        <Input
          id={addressId}
          value={draft.address}
          placeholder={t('form.addressPlaceholder')}
          onChange={event => onChange({ ...draft, address: event.target.value })}
        />
      </Box>
      <Box className="space-y-1">
        <Label htmlFor={currencyId}>{t('form.currency')}</Label>
        <Input
          id={currencyId}
          value={draft.currency}
          maxLength={3}
          placeholder={t('form.currencyPlaceholder')}
          onChange={event => onChange({ ...draft, currency: event.target.value })}
        />
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('form.currencyHint')}
        </Text>
      </Box>
    </Box>
  )
}
