import { PENDING_CHAT_ACTION_TYPES, type PendingChatAction } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { CARD_EDITABLE_FIELDS, editableFieldsOf } from './copilot-card-edit'

/**
 * #1930.11 — « BOUTON DE MODIFICATION ».
 *
 * Le serveur savait déjà modifier une carte avant lancement : le geste `modify`
 * est dans le contrat, `cardAllowedGestures` le rend sur `prepared`/`snoozed`,
 * et `POST /action-os/cards/:runId/modify` refait passer la proposition par
 * `pendingChatActionSchema`. Ce qui manquait était la surface d'édition — et
 * `CopilotCards.tsx` le disait noir sur blanc en EXCLUANT `modify` de ses
 * gestes rendus.
 *
 * Ce module est cette surface, réduite à la seule question qu'elle pose : quels
 * champs de CETTE proposition un humain a-t-il le droit de réécrire avant de
 * valider ? La table est exhaustive (`Record<action, …>`) — une quinzième forme
 * de carte ne peut pas naître sans répondre.
 */

const CONTACT = '11111111-1111-4111-8111-111111111111'

/** Les quatorze formes du contrat, typées — la liste exportée est de chaînes. */
const ACTION_TYPES = PENDING_CHAT_ACTION_TYPES as readonly PendingChatAction['action'][]

describe('#1930.11 — la table des champs modifiables', () => {
  it('répond pour CHAQUE forme de proposition — la table est exhaustive et non vide', () => {
    expect(ACTION_TYPES.length).toBeGreaterThan(0)
    for (const type of ACTION_TYPES) {
      expect(CARD_EDITABLE_FIELDS).toHaveProperty(type)
      expect(Array.isArray(CARD_EDITABLE_FIELDS[type])).toBe(true)
    }
    const total = ACTION_TYPES.reduce((sum, type) => sum + CARD_EDITABLE_FIELDS[type].length, 0)
    expect(total).toBeGreaterThan(0)
  })

  it('rend les champs d’un brouillon de mail avec leur VALEUR courante — on modifie ce qu’on lit', () => {
    const action: PendingChatAction = {
      action: 'prepare_mail_draft',
      to: 'claire@acme.example',
      subject: 'Suite à notre échange',
      body: 'Bonjour Claire,',
    }
    const fields = editableFieldsOf(action)
    expect(fields.map(field => field.key)).toEqual(['to', 'subject', 'body'])
    expect(fields.find(field => field.key === 'subject')?.value).toBe('Suite à notre échange')
    expect(fields.find(field => field.key === 'body')?.multiline).toBe(true)
    expect(fields.every(field => field.labelKey.startsWith('cards.edit.field.'))).toBe(true)
  })

  it('rend les quatre champs qu’un export CRM va ÉCRIRE, et rien d’autre', () => {
    const action: PendingChatAction = {
      action: 'export_contact_to_crm',
      contact_id: CONTACT,
      provider: 'hubspot',
      contact_name: 'Claire Dubois',
      contact_email: 'claire@acme.example',
      company: 'ACME',
    }
    const keys = editableFieldsOf(action).map(field => field.key)
    expect(keys).toEqual(['contact_name', 'contact_email', 'contact_title', 'company'])
    // Le fournisseur et l'identifiant du contact NE sont pas modifiables : ce
    // sont des cibles résolues par le serveur, pas du texte écrit par quelqu'un.
    expect(keys).not.toContain('provider')
    expect(keys).not.toContain('contact_id')
  })

  it('rend une CHAÎNE VIDE pour un champ absent — jamais « null », jamais « undefined » dans un champ de saisie', () => {
    const action: PendingChatAction = {
      action: 'export_contact_to_crm',
      contact_id: CONTACT,
      provider: 'hubspot',
      contact_name: null,
    }
    const fields = editableFieldsOf(action)
    expect(fields.find(field => field.key === 'contact_name')?.value).toBe('')
    expect(fields.find(field => field.key === 'contact_title')?.value).toBe('')
  })

  it('ne propose AUCUN champ là où rien ne s’écrit à la main — l’enrichissement et la navigation', () => {
    // Témoin du cas légitime voisin : une carte sans champ éditable ne doit pas
    // offrir « Modifier ». Un geste qu'on ne sait pas faire ne s'annonce pas.
    expect(
      editableFieldsOf({
        action: 'enrich_contact',
        contact_id: CONTACT,
        contact_name: 'Claire Dubois',
        organization_name: 'ACME',
      }),
    ).toEqual([])
    expect(editableFieldsOf({ action: 'open_screen', route: '/contacts', label: 'Contacts' })).toEqual([])
  })

  it('ne rend rien du tout quand la proposition est illisible — `null` n’ouvre pas un formulaire vide', () => {
    expect(editableFieldsOf(null)).toEqual([])
  })

  it('n’expose jamais le coût annoncé : un prix ne se réécrit pas à la main', () => {
    for (const type of ACTION_TYPES) {
      expect(CARD_EDITABLE_FIELDS[type].map(field => field.key)).not.toContain('cost_credits')
    }
  })
})
