import type { Contact, ContactStatus } from '@bellum/contracts'
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@bellum/ui'
import { Check, Flag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUpdateContactStatus } from '@/features/contacts/hooks/useUpdateContactStatus'

/**
 * L'ordre suit le parcours réel d'une approche : on contacte, il répond, on
 * décroche un rendez-vous — puis les deux fins de non-recevoir.
 *
 * `new` n'y est pas : c'est l'état de départ, pas une issue qu'on déclare.
 */
const OUTCOMES: ContactStatus[] = ['contacted', 'replied', 'meeting', 'refused', 'silence']

/**
 * « Où en est ce contact ? » — le geste qui manquait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SOUS-MENU EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La ligne de contact AFFICHAIT déjà son statut (`statusBadge`) sans offrir
 * aucun moyen de le changer : elle lisait une valeur que rien ne pouvait écrire.
 * Le sous-menu se pose donc là, sur la ligne qui porte déjà le badge — lire et
 * écrire au même endroit, plutôt que de renvoyer le commercial ailleurs.
 *
 * Ce que ce geste alimente, en une seule écriture serveur : le statut du contact
 * (entonnoir du tableau de bord, pilotage), la mise en pause des séquences de
 * relance, le repère de replanification du compte, et la trace au journal
 * d'activité d'où sortent « réponses » et « rendez-vous » de la semaine.
 *
 * Accessibilité : chaque entrée est un item de menu Radix — donc un vrai bouton
 * tabulable, activable au clavier et annoncé (GA-35). L'item courant est
 * `disabled` et coché : re-déclarer l'état déjà porté n'est pas un événement.
 */
export function ContactOutcomeSubmenu({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const updateStatus = useUpdateContactStatus()

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Flag className="mr-2 size-4 text-[var(--bellum-text-accent)]" />
        {t('status.declareOutcome')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {OUTCOMES.map(outcome => {
          const isCurrent = contact.user_status === outcome
          return (
            <DropdownMenuItem
              key={outcome}
              disabled={isCurrent || updateStatus.isPending}
              onClick={() =>
                updateStatus.mutate({
                  id: contact.id,
                  account_id: contact.account_id,
                  full_name: contact.full_name,
                  status: outcome,
                })
              }
            >
              {isCurrent ? (
                <Check className="mr-2 size-4 text-[var(--bellum-text-accent)]" />
              ) : (
                <span className="mr-2 size-4" />
              )}
              {/* i18n keys: status.value.contacted | .replied | .meeting | .refused | .silence */}
              {t(`status.value.${outcome}`)}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
