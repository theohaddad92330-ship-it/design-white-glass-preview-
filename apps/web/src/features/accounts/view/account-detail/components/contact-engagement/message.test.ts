import type { Contact } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildContactMessage } from './message'

const contact = (over: Partial<Contact> = {}): Contact =>
  ({
    id: 'c1',
    account_id: 'a1',
    user_id: '00000000-0000-0000-0000-000000000000',
    full_name: 'Claire Dubois',
    title: 'DSI',
    entity: null,
    decision_role: 'sponsor',
    priority: 1,
    email: null,
    email_verified: false,
    phone: null,
    linkedin_url: null,
    profile_summary: null,
    why_contact: null,
    email_message: null,
    linkedin_message: null,
    phone_script: null,
    followup_message: null,
    user_status: null,
    source: null,
    raw_data: null,
    created_at: '',
    updated_at: '',
    ...over,
  }) as Contact

describe('buildContactMessage — repêchage depuis le blob d’analyse', () => {
  it('lit les messages là où le pipeline les écrit vraiment : plan.contactMessages en camelCase', () => {
    const message = buildContactMessage(contact(), {
      plan: {
        contactMessages: [
          {
            contactName: 'Claire Dubois',
            linkedinMessage: 'Bonjour Claire, votre migration cloud…',
            emailSubject: 'Migration cloud — retour d’expérience',
            emailBody: 'Bonjour Claire,\n\nVotre programme de migration…',
            phoneOpener: 'Claire ? Je vous appelle au sujet de…',
          },
        ],
      },
    })

    expect(message.linkedinMessage).toBe('Bonjour Claire, votre migration cloud…')
    expect(message.emailSubject).toBe('Migration cloud — retour d’expérience')
    expect(message.emailBody).toBe('Bonjour Claire,\n\nVotre programme de migration…')
    expect(message.phoneScript).toBe('Claire ? Je vous appelle au sujet de…')
  })

  it('laisse la ligne contact gagner sur le blob — c’est elle que l’enrichissement met à jour', () => {
    const message = buildContactMessage(contact({ linkedin_message: 'Version enrichie' }), {
      plan: { contactMessages: [{ contactName: 'Claire Dubois', linkedinMessage: 'Version du run' }] },
    })

    expect(message.linkedinMessage).toBe('Version enrichie')
  })

  it('n’invente rien quand le contact n’a pas de bloc de messages', () => {
    const message = buildContactMessage(contact(), {
      plan: { contactMessages: [{ contactName: 'Marc Petit', linkedinMessage: 'Pas pour Claire' }] },
    })

    expect(message).toEqual({
      linkedinMessage: '',
      linkedinSequence: [],
      emailSubject: '',
      emailBody: '',
      phoneScript: '',
    })
  })

  /**
   * p10 — la séquence LinkedIn a TROIS temps, et s'arrête après le troisième.
   * Le produit s'arrêtait à M1 : un commercial sans réponse au premier message
   * n'avait plus rien à envoyer, alors que la méthode décrit M2 (apport de
   * valeur) et M3 (proposition de 15 min).
   */
  it('remonte M2 et M3 dans l’ordre d’envoi', () => {
    const message = buildContactMessage(contact(), {
      plan: {
        contactMessages: [
          {
            contactName: 'Claire Dubois',
            linkedinMessage: 'M1',
            linkedinMessageM2: 'M2 — le benchmark',
            linkedinMessageM3: 'M3 — 15 minutes ?',
          },
        ],
      },
    })

    expect(message.linkedinMessage).toBe('M1')
    expect(message.linkedinSequence).toEqual(['M2 — le benchmark', 'M3 — 15 minutes ?'])
  })

  it('ne laisse pas de trou quand seul M2 a été produit', () => {
    const message = buildContactMessage(contact(), {
      plan: { contactMessages: [{ contactName: 'Claire Dubois', linkedinMessageM2: 'M2 seul' }] },
    })

    expect(message.linkedinSequence).toEqual(['M2 seul'])
  })

  it('rend une séquence vide pour un dossier antérieur', () => {
    // RÉTRO-COMPAT : le fil n'affiche alors que M1, exactement comme avant.
    const message = buildContactMessage(contact(), {
      plan: { contactMessages: [{ contactName: 'Claire Dubois', linkedinMessage: 'M1 seul' }] },
    })

    expect(message.linkedinSequence).toEqual([])
  })
})
