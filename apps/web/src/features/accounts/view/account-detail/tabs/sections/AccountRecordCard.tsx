import type { Account, InternalClientMode } from '@bellum/contracts'
import { INTERNAL_CLIENT_MODES, joinSubsidiaryNames } from '@bellum/contracts'
import { Box, Button, Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import { History, IdCard, StickyNote } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { displayRecordedRevenue } from './apolloRegistryConflict'
import { EditableField } from '@/features/crm-core/view/EditableField'
import { NotesPanel } from '@/features/crm-core/view/NotesPanel'
import { RecordHistory } from '@/features/crm-core/view/RecordHistory'
import { usePatchAccount } from '@/features/crm-core/hooks/useRecordEdit'
import { useCurrentUserStore } from '@/stores/currentUserStore'

// #219.6 (#3231, lot X50) — CLIENT INTERNE : « Non renseigné » = `null`, jamais
// une structure devinée. Même geste que les sélecteurs de la fiche contact.
const ACCOUNT_INTERNAL_CLIENT_UNSET = '__unset__'

/**
 * La fiche du compte, corrigeable, avec ses notes et son journal.
 *
 * Le dossier savait tout dire d'un compte et ne laissait rien corriger : une
 * raison sociale mal résolue (« Groupe TF1 » là où le commercial travaille avec
 * « TF1 PUB ») restait affichée run après run. Corriger ici pose la provenance
 * « saisi à la main » — c'est elle qui empêche l'analyse suivante de revenir
 * dessus.
 *
 * Remplace `sections/GeneralInfo.tsx` (supprimé 31/08/2026, code mort — zéro
 * appelant) : ce dernier affichait secteur/effectif/CA/siège/site en LECTURE
 * SEULE avec un `'—'` brut sur absence. Ce composant-ci couvre les quatre
 * premiers champs, EN MIEUX (corrigibles) ; le site web n'a pas d'équivalent
 * ici mais reste lisible via l'enrichissement Apollo/Pappers du compte.
 */
export function AccountRecordCard({ account }: { account: Account }) {
  const { t, i18n } = useTranslation('crm')
  const patch = usePatchAccount(account.id)
  const currentUser = useCurrentUserStore(state => state.currentUser)
  const [showHistory, setShowHistory] = useState(false)
  const [completing, setCompleting] = useState(false)

  /*
    `revenue` et `nafCode` : les deux derniers champs arbitrables, qui
    n'avaient pas de porte (`ACCOUNT_FIELD_COLUMNS` en déclare dix). Un NAF faux
    ne dort pas dans une colonne : `listSimilarCompaniesToExplore` en tire la
    division NAF (accounts.service.ts) et l'API publique la sert telle quelle —
    le dossier ROCHE est resté en 70.10Z après un rafraîchissement.
    `tradeName` (#2117.9), `phone`, `address` : saisis à la main seulement.
  */
  const fields: {
    key: string
    label: string
    value: string | null
    displayValue?: string | null
    type?: 'url' | 'tel'
    onSave: (next: string | null) => void
  }[] = [
    {
      key: 'companyName',
      label: t('fields.companyName'),
      value: account.company_name,
      onSave: next => {
        if (next) patch.mutate({ companyName: next })
      },
    },
    {
      key: 'tradeName',
      label: t('fields.tradeName'),
      value: account.trade_name ?? null,
      onSave: next => patch.mutate({ tradeName: next }),
    },
    { key: 'sector', label: t('fields.sector'), value: account.sector, onSave: next => patch.mutate({ sector: next }) },
    {
      key: 'employees',
      label: t('fields.employees'),
      value: account.employees,
      onSave: next => patch.mutate({ employees: next }),
    },
    {
      key: 'headquarters',
      label: t('fields.headquarters'),
      value: account.headquarters,
      onSave: next => patch.mutate({ headquarters: next }),
    },
    {
      key: 'website',
      label: t('fields.website'),
      value: account.website,
      type: 'url',
      onSave: next => patch.mutate({ website: next }),
    },
    {
      key: 'phone',
      label: t('fields.phone'),
      value: account.phone ?? null,
      type: 'tel',
      onSave: next => patch.mutate({ phone: next }),
    },
    {
      key: 'address',
      label: t('fields.address'),
      value: account.address ?? null,
      onSave: next => patch.mutate({ address: next }),
    },
    {
      key: 'siren',
      label: t('fields.siren'),
      value: account.siren ?? null,
      onSave: next => patch.mutate({ siren: next }),
    },
    {
      key: 'revenue',
      label: t('fields.revenue'),
      value: account.revenue,
      displayValue: displayRecordedRevenue(account.revenue, i18n.language === 'fr' ? 'fr-FR' : 'en-GB'),
      onSave: next => patch.mutate({ revenue: next }),
    },
    {
      key: 'nafCode',
      label: t('fields.nafCode'),
      value: account.naf_code ?? null,
      onSave: next => patch.mutate({ nafCode: next }),
    },
    // #219.6 (#3231, lot X50) — les filiales DÉCLARÉES : noms séparés par une virgule.
    {
      key: 'subsidiaries',
      label: t('fields.subsidiaries'),
      value: joinSubsidiaryNames(account.subsidiaries),
      onSave: next => patch.mutate({ subsidiaries: next }),
    },
  ]
  // #219.6 (J05) — les QUATRE rôles d'une direction interne, nommés à la main. Ils n'ont de
  // sens que pour une direction interne déclarée : ni pour un client direct, ni sans déclaration.
  if (account.declared_internal_client_mode === 'internal_service') {
    fields.push(
      {
        key: 'declaredInternalSponsor',
        label: t('fields.declaredInternalSponsor'),
        value: account.declared_internal_sponsor ?? null,
        onSave: next => patch.mutate({ declaredInternalSponsor: next }),
      },
      {
        key: 'declaredInternalUsers',
        label: t('fields.declaredInternalUsers'),
        value: account.declared_internal_users ?? null,
        onSave: next => patch.mutate({ declaredInternalUsers: next }),
      },
      {
        key: 'declaredLegalEntity',
        label: t('fields.declaredLegalEntity'),
        value: account.declared_legal_entity ?? null,
        onSave: next => patch.mutate({ declaredLegalEntity: next }),
      },
      {
        key: 'declaredEndClient',
        label: t('fields.declaredEndClient'),
        value: account.declared_end_client ?? null,
        onSave: next => patch.mutate({ declaredEndClient: next }),
      },
    )
  }
  // #3278.2 (lot M11) — les six critères de la route commerciale sans source structurée, déclarés à
  // la main pour TOUT compte. Laura les cite tels quels ; vide = aucune ligne, Laura le nomme « non évalué ».
  fields.push(
    {
      key: 'declaredRouteScope',
      label: t('fields.declaredRouteScope'),
      value: account.declared_route_scope ?? null,
      onSave: next => patch.mutate({ declaredRouteScope: next }),
    },
    {
      key: 'declaredRouteObjectives',
      label: t('fields.declaredRouteObjectives'),
      value: account.declared_route_objectives ?? null,
      onSave: next => patch.mutate({ declaredRouteObjectives: next }),
    },
    {
      key: 'declaredRouteAvailableRoles',
      label: t('fields.declaredRouteAvailableRoles'),
      value: account.declared_route_available_roles ?? null,
      onSave: next => patch.mutate({ declaredRouteAvailableRoles: next }),
    },
    {
      key: 'declaredRoutePartners',
      label: t('fields.declaredRoutePartners'),
      value: account.declared_route_partners ?? null,
      onSave: next => patch.mutate({ declaredRoutePartners: next }),
    },
    {
      key: 'declaredRouteHistory',
      label: t('fields.declaredRouteHistory'),
      value: account.declared_route_history ?? null,
      onSave: next => patch.mutate({ declaredRouteHistory: next }),
    },
    {
      key: 'declaredRouteTiming',
      label: t('fields.declaredRouteTiming'),
      value: account.declared_route_timing ?? null,
      onSave: next => patch.mutate({ declaredRouteTiming: next }),
    },
    // #3278.2b (Louis 15/10) — budget, disponibilité, réseau existant : saisis par le commercial.
    // Vide = aucune ligne en lecture ; le critère reste « non renseigné » côté Laura.
    {
      key: 'declaredRouteBudget',
      label: t('fields.declaredRouteBudget'),
      value: account.declared_route_budget ?? null,
      onSave: next => patch.mutate({ declaredRouteBudget: next }),
    },
    {
      key: 'declaredRouteAvailability',
      label: t('fields.declaredRouteAvailability'),
      value: account.declared_route_availability ?? null,
      onSave: next => patch.mutate({ declaredRouteAvailability: next }),
    },
    {
      key: 'declaredRouteNetwork',
      label: t('fields.declaredRouteNetwork'),
      value: account.declared_route_network ?? null,
      onSave: next => patch.mutate({ declaredRouteNetwork: next }),
    },
    // #3278.1 (décision Louis 11/10/2026) — les faits qui portent les routes « événement ou communauté »
    // et « inbound / contenu » : déclarés à la main, cités tels quels par Laura. Vide = aucune ligne.
    {
      key: 'declaredRouteEvent',
      label: t('fields.declaredRouteEvent'),
      value: account.declared_route_event ?? null,
      onSave: next => patch.mutate({ declaredRouteEvent: next }),
    },
    {
      key: 'declaredRouteInbound',
      label: t('fields.declaredRouteInbound'),
      value: account.declared_route_inbound ?? null,
      onSave: next => patch.mutate({ declaredRouteInbound: next }),
    },
  )
  const isFilled = (value: string | null) => (value ?? '').trim().length > 0
  // #4994.1 — le code NAF brut n'est jamais LU à l'écran (jargon sans valeur pour le commercial) ;
  // il reste corrigeable derrière « Compléter la fiche ».
  const visibleFields = completing ? fields : fields.filter(field => field.key !== 'nafCode' && isFilled(field.value))
  // #219.6 — la déclaration suit la même règle que les champs texte : une ligne
  // en lecture seulement quand elle est posée, corrigeable derrière « Compléter ».
  const internalClientMode = account.declared_internal_client_mode ?? null
  const showInternalClient = completing || internalClientMode !== null
  const hasDeclaredRoles =
    internalClientMode !== null ||
    [
      account.declared_internal_sponsor,
      account.declared_internal_users,
      account.declared_legal_entity,
      account.declared_end_client,
    ].some(role => isFilled(role ?? null))
  const emptyCount = fields.filter(field => !isFilled(field.value)).length + (internalClientMode === null ? 1 : 0)

  return (
    <Card className="space-y-5 p-5">
      <Box display="flex" className="items-center gap-2">
        <IdCard className="size-4 text-muted-foreground" aria-hidden />
        <Text element="h3" size="sm" weight="medium">
          {t('fields.companyName')}
        </Text>
      </Box>

      {/* #3499 — EN LECTURE, SEULS LES CHAMPS REMPLIS (Théo, salle démo BPCE,
          01/10/2026 : « des dizaines de champs Non renseigné avec un crayon »).
          Les champs vides restent CORRIGEABLES, mais seulement en mode
          « Compléter la fiche » — jamais affichés vides en lecture. */}
      {visibleFields.length > 0 || showInternalClient ? (
        <Box className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleFields.map(field => (
            <EditableField
              key={field.key}
              label={field.label}
              value={field.value}
              displayValue={field.displayValue}
              type={field.type}
              isSaving={patch.isPending}
              onSave={field.onSave}
            />
          ))}
          {/* #219.6 (#3231) — DIRECTION INTERNE ou CLIENT DIRECT : Laura et le plan
              lisent cette déclaration pour ne pas appeler « client externe » un
              métier qui est un commanditaire interne. */}
          {showInternalClient ? (
            <Box className="space-y-1">
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('fields.declaredInternalClientMode')}
              </Text>
              <Select
                value={internalClientMode ?? ACCOUNT_INTERNAL_CLIENT_UNSET}
                onValueChange={next =>
                  patch.mutate({
                    declaredInternalClientMode:
                      next === ACCOUNT_INTERNAL_CLIENT_UNSET ? null : (next as InternalClientMode),
                  })
                }
                disabled={patch.isPending}
              >
                <SelectTrigger aria-label={t('fields.declaredInternalClientMode')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ACCOUNT_INTERNAL_CLIENT_UNSET}>{t('field.empty')}</SelectItem>
                  {INTERNAL_CLIENT_MODES.map(mode => (
                    <SelectItem key={mode} value={mode}>
                      {t(`internalClientModes.${mode}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>
          ) : null}
        </Box>
      ) : null}
      {/* #3231 (décision Louis 10/10) — aucun rôle déclaré : on ne pose pas quatre lignes vides, on dit
          ce que « Compléter la fiche » apporte. */}
      {!completing && !hasDeclaredRoles ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('record.completeBenefit')}
        </Text>
      ) : null}
      {emptyCount > 0 ? (
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => setCompleting(current => !current)}>
          {completing ? t('record.completeDone') : t('record.complete')}
        </Button>
      ) : null}

      <Text element="p" size="xs" color="text-muted-foreground">
        {t('record.editHint')}
      </Text>

      <Box className="border-t border-border pt-4">
        <Box display="flex" className="mb-3 items-center gap-2">
          <StickyNote className="size-4 text-muted-foreground" aria-hidden />
          <Text element="h4" size="sm" weight="medium">
            {t('notes.title')}
          </Text>
        </Box>
        <NotesPanel entityType="account" entityId={account.id} currentUserId={currentUser?.id} />
      </Box>

      <Box className="border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(current => !current)}>
          <History className="mr-1.5 size-3.5" aria-hidden />
          {t('history.title')}
        </Button>
        {showHistory ? (
          <Box className="mt-3">
            <RecordHistory entityType="account" entityId={account.id} />
          </Box>
        ) : null}
      </Box>
    </Card>
  )
}
