import { type Contact, isContactIdentityComplete } from '@bellum/contracts'
import { Box, Button, Input, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { UserX, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { EnrichConfirmDialog, type EnrichmentScope } from '@/features/contacts/components/EnrichConfirmDialog'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import type { EnrichContactResponse } from '@/features/contacts/api'
import { useResumeEnrichment } from '@/features/contacts/hooks/useResumeEnrichment'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'
import { contactDisplayIdentity } from '@/features/contacts/lib/contactDisplayIdentity'

/** ≥ 2 tokens = a first + last name Apollo can match on. */
function hasFullName(value: string): boolean {
  return value.trim().split(/\s+/).filter(Boolean).length >= 2
}

type ContactEnrichButtonProps = {
  contact: Contact
  variant?: 'black' | 'outline' | 'light'
  size?: 'sm' | 'lg' | 'default'
  fullWidth?: boolean
  label?: string
}

/**
 * #4331.2 — LA logique d'« Enrichir » (coût, garde crédit, identité, portée,
 * confirmation), sortie du bouton pour que la fiche contact puisse la poser
 * dans son menu « Autres actions » sans la recopier (GA-26) : le bouton plein
 * et l'item de menu lisent le MÊME état, le même prix, la même porte.
 * `resume: false` quand un autre montage de la fiche porte déjà la reprise
 * d'un job en vol (#4063.1) — jamais deux sondes pour un contact.
 */
export function useContactEnrich(
  contact: Contact,
  {
    resume = true,
    onEnriched,
  }: {
    resume?: boolean
    /** #4981.1 — appelé quand l'enrichissement confirmé SE TERMINE avec succès (« Enrichir puis préparer »). */
    onEnriched?: (result: EnrichContactResponse) => void
  } = {},
) {
  const { t } = useTranslation('contacts')
  const enrichMutation = useEnrichContact()
  // Un enrichissement DÉBITE : sans crédit, le bouton est grisé et dit pourquoi,
  // au lieu de laisser cliquer pour répondre par une erreur 409 opaque.
  const gate = useCreditGate()
  const [nameOverride, setNameOverride] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [scope, setScope] = useState<EnrichmentScope>('both')
  // Repart de zéro à chaque contact — sans ça, une saisie laissée sur une
  // fiche fuiterait sur la suivante ouverte dans le même composant monté.
  useEffect(() => {
    setNameOverride('')
    setScope('both')
  }, [contact.id])
  const needsOrgFallback = !contact.entity
  // #1473 — un contact À QUALIFIER n'a pas de compte d'où tirer le nom de
  // société. On ne lance pas la requête : elle rendrait 404 à chaque ouverture
  // de fiche, et un journal réseau plein de faux problèmes fait rater les vrais.
  const accountId = contact.account_id
  const { data: account } = useQuery({
    queryKey: accountKeys.detail(accountId ?? 'none'),
    queryFn: () => accountsApi.getOne(accountId ?? ''),
    enabled: needsOrgFallback && Boolean(accountId),
  })
  const enriching = enrichMutation.isPending && enrichMutation.variables?.contact.id === contact.id
  const orgName = contact.entity || account?.company_name || ''
  // #4063.1 — retour sur la fiche : un job encore en vol est retrouvé, jamais relancé.
  useResumeEnrichment({ contact, orgName, mutation: enrichMutation, enabled: resume })
  // Le nom de société est une clé de recherche OBLIGATOIRE du fournisseur. Sans
  // elle, le clic ne partait pas — un bouton mort, qui se lit comme une panne.
  // Il est désormais grisé et DIT ce qui manque : renseigne l'entreprise.
  const orgUnknown = !contact.entity && !accountId
  const identityComplete = isContactIdentityComplete({
    fullName: contact.full_name,
    title: contact.title,
    entity: contact.entity,
    role: contact.decision_role,
    email: contact.email,
    phone: contact.phone,
    linkedinUrl: contact.linkedin_url,
  })
  // Anti catch-22 (#3021) : un contact à identité incomplète peut quand même
  // être cherché PAR RÔLE — `contact.title`, jamais envoyé au serveur, sert
  // uniquement à expliquer la recherche ici. Sans rôle, le nom complet devient
  // la seule ancre possible : requis.
  const canSearchByRole = Boolean(contact.title?.trim())
  const nameOverrideValid = hasFullName(nameOverride)
  const identityBlocked = !identityComplete && !canSearchByRole && !nameOverrideValid

  const enrich = () => {
    // Org is a required Apollo match key. When the contact has no `entity`,
    // wait for the account name to load before firing (avoids a doomed request
    // in the sub-second window before the query resolves).
    // #4504.2 — une identité à résoudre ne bloque plus le CLIC : la modale l'explique et porte le champ du nom ;
    // c'est sa confirmation qui reste grisée tant qu'aucune ancre n'existe (`identityBlocked`).
    if (!orgName) return
    setScope('both')
    setConfirmOpen(true)
  }

  const confirmEnrich = () => {
    if (identityBlocked) return
    const input = {
      contact,
      accountCompanyName: orgName,
      ...(nameOverride.trim() ? { fullNameOverride: nameOverride.trim() } : {}),
      ...(scope !== 'both' ? { only: scope } : {}),
    }
    // #4981.1 — sans `onEnriched`, l'appel reste EXACTEMENT celui d'avant (un seul argument).
    if (onEnriched) enrichMutation.mutate(input, { onSuccess: onEnriched })
    else enrichMutation.mutate(input)
  }

  const disabled = !gate.canEnrich || orgUnknown
  const hint = orgUnknown
    ? t('enrich.noCompanyHint')
    : identityBlocked
      ? t('enrich.resolve.nameRequiredHint')
      : gate.canEnrich
        ? t('enrich.actionHint') // #4365.1 — dire ce que fait « Enrichir »
        : gate.locked
          ? t('enrich.lockedHint')
          : t('common:softBrake.title') // #4464 — frein doux, jamais un solde
  // #4463 — plus de coût sur le bouton : le libellé seul.
  const buttonLabel = (label?: string) => label ?? t('enrich.button')
  return {
    identityComplete,
    identityBlocked,
    canSearchByRole,
    nameOverride,
    setNameOverride,
    orgName,
    enriching,
    disabled,
    hint,
    buttonLabel,
    enrich,
    confirmOpen,
    setConfirmOpen,
    scope,
    setScope,
    confirmEnrich,
  }
}

export type ContactEnrichState = ReturnType<typeof useContactEnrich>

/**
 * Anti catch-22 (#3021, second retour) : le rôle s'affiche et le nom s'édite, sans seconde modale.
 * #4504.2 (contrat Louis 24/10) — RENVERSEMENT de l'« en ligne » de #3021 : l'explication et le champ quittent
 * l'en-tête de la fiche pour la modale qu'ouvre « Enrichir » (une seule modale : la confirmation). « Nom à
 * révéler » / « Rôle à identifier » / « Identité incomplète » y sont DITS (#4504.3), plus en étiquette d'en-tête.
 */
export function ContactEnrichResolveFields({ contact, state }: { contact: Contact; state: ContactEnrichState }) {
  const { t } = useTranslation('contacts')
  const identity = contactDisplayIdentity(contact)
  const notice = identity.roleToIdentify
    ? t('header.roleToIdentify')
    : identity.nameToReveal
      ? t('header.nameToReveal')
      : !state.identityComplete
        ? t('header.identityIncomplete')
        : null
  if (!notice) return null
  return (
    <Box className="space-y-2 rounded-md border border-[var(--bellum-warning)] p-3" data-testid="enrich-identity">
      <Text size="sm" weight="semibold" className="flex items-center gap-1.5 text-[var(--warning-soft-text)]">
        <UserX className="size-4 shrink-0" aria-hidden /> {notice}
      </Text>
      {identity.nameToReveal && state.identityComplete ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('enrich.resolve.nameToRevealExplain')}
        </Text>
      ) : null}
      {state.identityComplete ? null : (
        <>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {state.canSearchByRole
              ? t('enrich.resolve.searchExplain', { role: (contact.title ?? '').trim(), company: state.orgName })
              : t('enrich.resolve.searchExplainNoRole')}
          </Text>
          <Input
            value={state.nameOverride}
            onChange={event => state.setNameOverride(event.target.value)}
            placeholder={contact.full_name || t('enrich.resolve.namePlaceholder')}
            aria-label={t('enrich.resolve.nameLabel')}
          />
        </>
      )}
    </Box>
  )
}

export function ContactEnrichConfirm({ contact, state }: { contact: Contact; state: ContactEnrichState }) {
  return (
    <EnrichConfirmDialog
      open={state.confirmOpen}
      onOpenChange={state.setConfirmOpen}
      count={1}
      coordinateScope={state.scope}
      onCoordinateScopeChange={state.setScope}
      onConfirm={state.confirmEnrich}
      confirmDisabled={state.identityBlocked}
    >
      <ContactEnrichResolveFields contact={contact} state={state} />
    </EnrichConfirmDialog>
  )
}

/**
 * Apollo enrichment trigger for a single contact — shared by the header actions
 * and the empty-tab CTAs (Théo P0 « Fiche contact » : les onglets vides doivent
 * proposer d'enrichir). Resolves Apollo's required `organization_name` from the
 * contact's `entity`, falling back to the account's `company_name` (shared
 * cache key — no extra request when the account is already loaded).
 *
 * Transparence billing (addendum Théo p.11, révisé #3021 le 25/09/2026) : le
 * coût réel (`CREDIT_WEIGHTS.contact_enrichment`, jamais codé en dur) est
 * annoncé SUR le bouton. Un contact à identité INCOMPLÈTE n'a pas de modale
 * pour ÇA (#3021, second retour du 25/09 : « ça ouvre toujours la modale ») —
 * le rôle (lu sur `contact.title`, jamais envoyé au serveur : il ne sert
 * qu'à expliquer la recherche) et le nom s'éditent EN LIGNE, à côté du
 * bouton. Sans rôle ET sans nom saisi, la recherche n'a aucune ancre : le
 * bouton reste désactivé et dit pourquoi, au lieu d'ouvrir une porte qui ne
 * mène nulle part.
 *
 * #2988 (recette écran 28/09/2026) — RENVERSEMENT ASSUMÉ ET DATÉ de la partie
 * « le clic débite directement » de #3021 : la recette a montré qu'un crédit
 * partait sans jamais proposer le choix Email + téléphone / Email seul /
 * Téléphone seul que #2988.1 a posé côté pipeline serveur (`only`, 25/09).
 * Le clic ARME désormais la même confirmation que les autres appelants
 * (`EnrichConfirmDialog`, GA-26) au lieu d'enrichir directement ; le reste de
 * #3021 (prix sur le bouton, résolution d'identité EN LIGNE) ne change pas.
 */
export function ContactEnrichButton({
  contact,
  variant = 'black',
  size = 'sm',
  fullWidth = true,
  label,
}: ContactEnrichButtonProps) {
  const { t } = useTranslation('contacts')
  const state = useContactEnrich(contact)
  return (
    <Box className="space-y-1.5">
      <Button
        fullWidth={fullWidth}
        variant={variant}
        size={size}
        icon={Zap}
        isLoading={state.enriching}
        loadingText={t('enrich.loading')}
        disabled={state.disabled}
        title={state.hint}
        onClick={state.enrich}
      >
        {state.buttonLabel(label)}
      </Button>
      <ContactEnrichConfirm contact={contact} state={state} />
    </Box>
  )
}
