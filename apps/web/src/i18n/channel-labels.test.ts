import { REMINDER_CHANNELS, resolveChannel } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { resources } from './resources'

/**
 * Trois canaux, trois promesses, aucune ambiguïté (PDF 6 §5.3).
 *
 * Le document pose une règle qui a l'air cosmétique et ne l'est pas : « Créer
 * les brouillons » (email) et « Préparer les messages » (messagerie d'équipe)
 * ne veulent pas dire la même chose. Le premier promet qu'on relira, le second
 * qu'on ne relira PAS dans son outil. Employer le mot « brouillon » sur le
 * second laisse quelqu'un attendre un envoi qui est déjà parti.
 *
 * Cette garde vérifie trois choses que rien d'autre ne peut voir :
 *  - chaque canal a son libellé et sa confirmation, dans les deux langues ;
 *  - un canal IRRÉVERSIBLE le DIT dans sa confirmation ;
 *  - un canal irréversible n'emploie jamais le mot « brouillon ».
 */
function label(locale: 'fr' | 'en', key: string): string | undefined {
  const missions = (resources[locale] as { missions: Record<string, unknown> }).missions
  return key.split('.').reduce<unknown>((node, part) => {
    return (node as Record<string, unknown> | undefined)?.[part]
  }, missions) as string | undefined
}

describe('les libellés de canal disent ce que le canal fait vraiment', () => {
  for (const locale of ['fr', 'en'] as const) {
    it(`${locale} — chaque canal a son libellé de bouton et sa confirmation`, () => {
      const missing: string[] = []
      for (const channel of REMINDER_CHANNELS) {
        const resolved = resolveChannel(
          {
            mailboxDraft: channel === 'mail_draft',
            teamChat: channel === 'chat_message',
            crmTask: channel === 'crm_task',
          },
          channel,
        )
        if (!label(locale, resolved.actionLabelKey)) missing.push(resolved.actionLabelKey)
        if (!label(locale, resolved.confirmationKey)) missing.push(resolved.confirmationKey)
      }
      expect(missing).toEqual([])
    })

    it(`${locale} — un canal irréversible le DIT dans sa confirmation`, () => {
      const chat = resolveChannel({ mailboxDraft: false, teamChat: true, crmTask: false })
      expect(chat.irreversible).toBe(true)
      const confirmation = label(locale, chat.confirmationKey) ?? ''
      // Le mot doit y être : c'est la seule phrase que l'utilisateur lit avant
      // un geste qui ne se rattrape pas.
      expect(confirmation.toLowerCase()).toMatch(/irréversible|irreversible/)
    })

    it(`${locale} — un canal irréversible n'emploie JAMAIS le mot « brouillon »`, () => {
      const chat = resolveChannel({ mailboxDraft: false, teamChat: true, crmTask: false })
      const texts = [label(locale, chat.actionLabelKey) ?? '', label(locale, chat.confirmationKey) ?? '']
      for (const text of texts) {
        // « n'a pas de brouillon » est la seule occurrence tolérée : elle NIE
        // l'existence du brouillon au lieu de la promettre.
        const promises = text.toLowerCase().replace(/n['’]a pas de brouillon|has no draft/g, '')
        expect(promises).not.toMatch(/brouillon|draft/)
      }
    })

    it(`${locale} — le canal qui prépare un brouillon dit que rien ne part`, () => {
      const mail = resolveChannel({ mailboxDraft: true, teamChat: false, crmTask: false })
      expect(mail.irreversible).toBe(false)
      const confirmation = (label(locale, mail.confirmationKey) ?? '').toLowerCase()
      expect(confirmation).toMatch(/rien ne part|nothing is sent/)
    })
  }
})
