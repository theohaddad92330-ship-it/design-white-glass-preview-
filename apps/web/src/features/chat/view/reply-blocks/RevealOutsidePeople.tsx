import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MailSearch } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  OUTSIDE_PERSON_REVEAL_PERMISSIONS,
  type OutsidePersonRevealRequest,
  type OutsidePersonRevealResponse,
} from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { apiFetch } from '@/lib/api'
import { ApiError } from '@/lib/api-error'
import { parseApiStatus } from '@/lib/rate-limit-toast'
import { hasPermissions, useUserPermissions } from '@/lib/permissions'
import { contactKeys, pollEnrichment } from '@/features/contacts/api'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { DEMO_REVEALED_PEOPLE } from '@/features/demo/demo-chat-script'
import type { BlockOf } from './ReplyCard'

type Reveal = NonNullable<BlockOf<'account_ranking'>['items'][number]['reveal']>
type Person = Reveal['people'][number]
type Outcome =
  | { state: 'running' }
  | { state: 'found'; fullName: string; email: string }
  | { state: 'not_found' }
  | { state: 'paused' }
  | { state: 'error' }

/**
 * #4421.15 / #4421.16 / #4421.17 (décision Louis 25/10) — sous chaque personne que Laura a trouvée HORS de
 * l'espace (nom masqué, sans adresse), « Obtenir l'e-mail » : au CLIC seulement, une personne à la fois. Un appel
 * (`POST outside-people/reveal` : compte retrouvé ou ajouté au portefeuille, contact créé, enrichissement EXISTANT
 * en file), puis le suivi du job comme partout ailleurs (`pollEnrichment`). L'adresse révélée remplit le
 * destinataire du mail PRÉPARÉ — qui reste préparé : le commercial l'envoie.
 *
 * Sans `contacts:enrich` ET `records:write` : bouton ABSENT (jamais grisé). Aucun chiffre de crédit (#4468), un
 * solde épuisé est un frein doux (#4464). En démo (#4421.18) : AUCUN appel, la personne vient du jeu fictif.
 */
export function RevealOutsidePeople({ companyName, reveal }: { companyName: string; reveal: Reveal }) {
  const { t } = useTranslation('chat')
  const access = useUserPermissions()
  const isDemo = useIsDemo()
  const queryClient = useQueryClient()
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})
  // Le compte retrouvé par un premier clic sert aux suivants : jamais un second compte pour la même carte.
  const [accountId, setAccountId] = useState<string | null>(null)
  const allowed = access.status === 'known' && hasPermissions(OUTSIDE_PERSON_REVEAL_PERMISSIONS, access.permissions)

  const settle = (ref: string, outcome: Outcome) => setOutcomes(current => ({ ...current, [ref]: outcome }))

  const onReveal = async (person: Person) => {
    settle(person.person_ref, { state: 'running' })
    if (isDemo) {
      const fictive = DEMO_REVEALED_PEOPLE[person.person_ref]
      settle(person.person_ref, fictive ? { state: 'found', ...fictive } : { state: 'not_found' })
      return
    }
    try {
      const body: OutsidePersonRevealRequest = {
        ...(accountId ? { account_id: accountId } : {}),
        company_name: companyName,
        ...(reveal.siren ? { siren: reveal.siren } : {}),
        person_ref: person.person_ref,
        name: person.name,
        ...(person.title ? { title: person.title } : {}),
      }
      const accepted = await apiFetch<OutsidePersonRevealResponse>({
        path: '/outside-people/reveal',
        method: 'POST',
        body,
      })
      setAccountId(accepted.account_id)
      const contact = await pollEnrichment(accepted.contact_id)
      // La personne est désormais un contact du compte : les listes qui la montrent se relisent.
      void queryClient.invalidateQueries({ queryKey: contactKeys.list })
      void queryClient.invalidateQueries({ queryKey: contactKeys.byAccount(accepted.account_id) })
      const email = contact.email?.trim()
      settle(
        person.person_ref,
        email ? { state: 'found', fullName: contact.full_name?.trim() || person.name, email } : { state: 'not_found' },
      )
    } catch (err) {
      const status = err instanceof ApiError ? err.status : parseApiStatus(err)
      settle(person.person_ref, { state: status === 402 ? 'paused' : 'error' })
    }
  }

  return (
    <div role="group" aria-label={t('blocks.reveal.groupAria')} className="space-y-2 pt-1">
      {reveal.people.map(person => {
        const outcome = outcomes[person.person_ref]
        return (
          <div key={person.person_ref} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 text-sm text-[var(--bellum-text-primary)]">
              {outcome?.state === 'found' ? outcome.fullName : person.name}
              {person.title ? <span className="text-[var(--bellum-text-muted)]"> · {person.title}</span> : null}
            </span>
            {outcome?.state === 'found' ? (
              <span className="text-sm font-medium text-[var(--bellum-text-primary)]">{outcome.email}</span>
            ) : null}
            {allowed && (!outcome || outcome.state === 'error') ? (
              <button
                type="button"
                onClick={() => void onReveal(person)}
                aria-label={t('blocks.reveal.buttonAria', { name: person.name })}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
              >
                <MailSearch aria-hidden className="size-4" />
                {t('blocks.reveal.button')}
              </button>
            ) : null}
            {outcome?.state === 'running' ? (
              <Text size="xs" color="text-[var(--bellum-text-muted)]" role="status">
                {t('blocks.reveal.running')}
              </Text>
            ) : null}
            {outcome && outcome.state !== 'running' && outcome.state !== 'found' ? (
              <Text size="xs" color="text-[var(--bellum-text-muted)]" role="status">
                {t(`blocks.reveal.${outcome.state === 'not_found' ? 'notFound' : outcome.state}`)}
              </Text>
            ) : null}
            {outcome?.state === 'found' && person.mail_to ? (
              <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="basis-full">
                {t('blocks.reveal.mailTo', { email: outcome.email })}
              </Text>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
