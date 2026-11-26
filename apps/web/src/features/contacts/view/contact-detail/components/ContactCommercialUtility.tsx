import type { AccountStrategy5P, Contact } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { Check, Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Provenance } from '@/components/primitives/Provenance'
import { contactProvenanceKind, contactSourceLabel } from '@/features/contacts/lib/contactProvenance'
import { getRoleDescription, getRoleLabel, getRoleUtility } from '@/lib/contactRoles'
import { decisionRoleProvenance } from '../contactDerive'
import { SectionCard } from './SectionCard'

/**
 * #3401.8 (recette 30/09) — « le prochain interlocuteur à obtenir ». Aucune
 * identité ne se devine (doctrine, jamais de donnée fictive) : le rôle MEDDIC
 * encore ABSENT du circuit de décision, déjà calculé au niveau du COMPTE
 * (`deriveAccountStrategy5P`, P3 « people »), est l'honnête réponse — un nom
 * inventé ne l'aurait pas été. `not_applicable`/tableau vide → aucune ligne
 * (GA-18/19, « on n'affiche pas ce qu'on n'a pas »).
 */
function nextRoleToObtain(strategy: AccountStrategy5P | null, contact: Contact): string | null {
  const missingRoles = strategy?.people.missing_roles
  if (!missingRoles || missingRoles.status === 'not_applicable') return null
  const nextRole = (missingRoles.value ?? []).find(role => role !== contact.decision_role)
  return nextRole ?? null
}

function CapabilityRow({ yes, label }: { yes: boolean; label: string }) {
  const Icon = yes ? Check : X
  return (
    <Box display="flex" className="items-start gap-2.5">
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${yes ? 'text-[var(--success-soft-text)]' : 'text-[var(--bellum-text-muted)]'}`}
        aria-hidden
      />
      <Text element="span" size="sm" leading="relaxed" color="text-foreground/90">
        {label}
      </Text>
    </Box>
  )
}

/**
 * #3401 (retour bêta #3401) — « pour chaque contact recommandé, expliquer
 * son utilité commerciale réelle ». Le périmètre exact (seniority/scope/
 * budget) a déjà sa carte (`ContactRoleScope`, juste au-dessus sur cet
 * onglet « Rôle ») — celle-ci ne le répète pas (GA-26). Elle réunit ce qui
 * restait épars ou absent : le rôle probable EXPLIQUÉ (`roleDescriptions`,
 * réemployé — pas une seconde prose), pourquoi le contacter maintenant
 * (`why_contact`, déjà stocké), ce qu'il peut CONFIRMER / faire AVANCER / ne
 * peut probablement PAS décider seul (`getRoleUtility`, dérivé de la même
 * taxonomie MEDDIC que le badge de rôle), et ses sources — jamais un
 * fournisseur nommé à l'écran (doctrine), le libellé CLIENT existant
 * (`contactSourceLabel`) suffit.
 *
 * Un contact au rôle `unknown`/absent ne rend AUCUNE capacité devinée
 * (GA-18/19) : la ligne dit "rôle non établi", point.
 */
export function ContactCommercialUtility({
  contact,
  strategy = null,
}: {
  contact: Contact
  /** #3401.8 — optionnel : un appelant qui ne connaît pas le compte (aperçu,
   *  test) n'affiche simplement pas la ligne, jamais un manque inventé. */
  strategy?: AccountStrategy5P | null
}) {
  const { t } = useTranslation('contacts')
  const role = contact.decision_role
  const utility = getRoleUtility(role)
  const roleProvenance = decisionRoleProvenance(contact)
  const sourceKind = contact.source ? contactProvenanceKind(contact.source) : null
  const missingRole = nextRoleToObtain(strategy, contact)

  return (
    <SectionCard icon={Sparkles} iconClassName="text-[var(--bellum-text-accent)]" title={t('utility.title')}>
      <Box className="space-y-5">
        {role ? (
          <Box className="space-y-1">
            <Text element="p" size="sm" weight="medium" color="text-foreground">
              {getRoleLabel(role)}
            </Text>
            {getRoleDescription(role) ? (
              <Text element="p" size="sm" leading="relaxed" color="text-foreground/90">
                {getRoleDescription(role)}
              </Text>
            ) : null}
            {roleProvenance ? (
              <Provenance source={roleProvenance.source} observedAt={roleProvenance.observedAt} />
            ) : null}
          </Box>
        ) : (
          <Text element="p" size="sm" color="text-muted-foreground">
            {t('utility.roleUnknown')}
          </Text>
        )}

        {missingRole ? (
          <Box className="space-y-1">
            <Text element="p" size="xs" weight="medium" color="text-muted-foreground">
              {t('utility.nextRoleToObtain')}
            </Text>
            <Text element="p" size="sm" leading="relaxed" color="text-foreground/90">
              {getRoleLabel(missingRole)}
            </Text>
          </Box>
        ) : null}

        {utility ? (
          <Box className="space-y-2">
            <CapabilityRow
              yes={utility.canConfirmGroundTruth}
              label={t(utility.canConfirmGroundTruth ? 'utility.canConfirm' : 'utility.canConfirmNo')}
            />
            <CapabilityRow
              yes={utility.canAdvanceInternally}
              label={t(utility.canAdvanceInternally ? 'utility.canAdvance' : 'utility.canAdvanceNo')}
            />
            <CapabilityRow
              yes={utility.canProbablyDecideAlone}
              label={t(utility.canProbablyDecideAlone ? 'utility.canDecide' : 'utility.canDecideNo')}
            />
          </Box>
        ) : null}

        {contact.source ? (
          <Box className="space-y-1 border-t border-[var(--bellum-border)] pt-3">
            <Text element="p" size="xs" weight="medium" color="text-muted-foreground">
              {t('utility.sources')}
            </Text>
            <Text element="p" size="sm" color="text-foreground/90">
              {contactSourceLabel(contact.source)}
            </Text>
            <Provenance source={sourceKind} observedAt={contact.created_at} />
          </Box>
        ) : null}
      </Box>
    </SectionCard>
  )
}
