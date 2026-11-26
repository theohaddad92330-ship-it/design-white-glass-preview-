import { describe, expect, it } from 'vitest'
import {
  campaignFromSearch,
  libraryFromSearch,
  openedSequenceIdFromSearch,
  playbookFromSearch,
  SEQUENCE_LIBRARY_SEARCH,
} from './campaign-prefill'

/**
 * #1903.10 / #1903.15 / #1903.17 / #1903.18 / #1903.19 / #1935 — LE PATRON DE
 * `discover-prefill.ts`, ÉTENDU À SÉQUENCES.
 *
 * Le chat n'exécute AUCUNE création : `prepare_campaign` prépare des critères,
 * le clic de l'utilisateur ouvre cet écran déjà cadré. Tolérant par
 * conception, comme son modèle : une valeur hors vocabulaire est IGNORÉE,
 * jamais appliquée « au mieux ».
 */
describe('campaignFromSearch', () => {
  it('rend null quand la requête ne porte ni audience ni objectif (accueil normal)', () => {
    expect(campaignFromSearch({})).toBeNull()
  })

  it('rend null quand seule une des deux moitiés obligatoires est présente', () => {
    expect(campaignFromSearch({ contact_ids: 'aaa,bbb' })).toBeNull()
    expect(campaignFromSearch({ objective: 'Relancer les DSI' })).toBeNull()
  })

  it('lit les contacts et l’objectif — le minimum exploitable', () => {
    const prefill = campaignFromSearch({ contact_ids: 'aaa,bbb', objective: 'Relancer les DSI industrie' })
    expect(prefill).toEqual({
      contactIds: ['aaa', 'bbb'],
      objective: 'Relancer les DSI industrie',
      persona: null,
      relation: null,
      channels: [],
      tone: null,
      mode: 'outreach',
      template: null,
      outputKind: 'sequence_campaign',
    })
  })

  it('lit le persona et le ton tels quels — texte libre, jamais un vocabulaire fermé', () => {
    const prefill = campaignFromSearch({
      contact_ids: 'aaa',
      objective: 'Relancer',
      persona: 'DSI',
      tone: 'direct',
    })
    expect(prefill?.persona).toBe('DSI')
    expect(prefill?.tone).toBe('direct')
  })

  it('ne garde qu’une relation connue — une valeur inventée est IGNORÉE, jamais appliquée au mieux', () => {
    expect(campaignFromSearch({ contact_ids: 'aaa', objective: 'Relancer', relation: 'cold' })?.relation).toBe('cold')
    expect(campaignFromSearch({ contact_ids: 'aaa', objective: 'Relancer', relation: 'inventee' })?.relation).toBeNull()
  })

  it('ne garde que les canaux connus, dans l’ordre canonique', () => {
    const prefill = campaignFromSearch({ contact_ids: 'aaa', objective: 'Relancer', channels: 'phone,inconnu,email' })
    expect(prefill?.channels).toEqual(['email', 'phone'])
  })

  it('retombe sur le mode outreach quand la valeur est absente ou inconnue', () => {
    expect(campaignFromSearch({ contact_ids: 'aaa', objective: 'Relancer' })?.mode).toBe('outreach')
    expect(campaignFromSearch({ contact_ids: 'aaa', objective: 'Relancer', mode: 'blitz' })?.mode).toBe('outreach')
    expect(campaignFromSearch({ contact_ids: 'aaa', objective: 'Relancer', mode: 'nurturing' })?.mode).toBe('nurturing')
  })

  it('ne garde qu’un gabarit connu du catalogue partagé', () => {
    expect(campaignFromSearch({ contact_ids: 'aaa', objective: 'Relancer', template: 'cold_email' })?.template).toBe(
      'cold_email',
    )
    expect(campaignFromSearch({ contact_ids: 'aaa', objective: 'Relancer', template: 'invente' })?.template).toBeNull()
  })

  // #1935.14 — le type de sortie calculé par `prepare_campaign` (liste d'appels
  // quand SEUL le téléphone est visé) voyageait déjà jusqu'à l'URL sans jamais
  // être LU ici : une liste d'appels s'affichait donc identique à une campagne
  // e-mail. `sequence_campaign` reste le chemin implicite, comme `mode`.
  it('retombe sur sequence_campaign quand le type de sortie est absent ou inconnu, lit call_list sinon', () => {
    expect(campaignFromSearch({ contact_ids: 'aaa', objective: 'Relancer' })?.outputKind).toBe('sequence_campaign')
    expect(campaignFromSearch({ contact_ids: 'aaa', objective: 'Relancer', output_kind: 'invente' })?.outputKind).toBe(
      'sequence_campaign',
    )
    expect(
      campaignFromSearch({ contact_ids: 'aaa', objective: 'Relancer', output_kind: 'call_list' })?.outputKind,
    ).toBe('call_list')
  })
})

describe('openedSequenceIdFromSearch — #3700, la fiche renvoie à la campagne EXACTE', () => {
  const ID = '0125b778-807b-4025-a363-b31bfc819af1'

  it('lit l’identifiant de la séquence à ouvrir', () => {
    expect(openedSequenceIdFromSearch({ sequence: ID })).toBe(ID)
  })

  it('ignore une valeur absente ou qui n’est pas un identifiant — jamais appliquée « au mieux »', () => {
    expect(openedSequenceIdFromSearch({})).toBeNull()
    expect(openedSequenceIdFromSearch({ sequence: 'abc' })).toBeNull()
    expect(openedSequenceIdFromSearch({ sequence: 42 })).toBeNull()
  })
})

describe('playbookFromSearch — lot L-C (#4166), l’assistant ouvert depuis un compte ou un signal', () => {
  const ID = '11111111-1111-4111-8111-111111111111'

  it('rien dans l’URL : pas d’assistant', () => {
    expect(playbookFromSearch({})).toBeNull()
    expect(playbookFromSearch({ contact_ids: ID })).toBeNull()
  })

  it('un contact seul ouvre l’assistant, sans signal', () => {
    expect(playbookFromSearch({ playbook_contact: ID })).toEqual({ contactId: ID, trigger: null })
  })

  it('un type de signal connu pré-remplit « pourquoi maintenant »', () => {
    expect(playbookFromSearch({ playbook_contact: ID, signal: 'hiring' })).toEqual({
      contactId: ID,
      trigger: 'hiring_signal',
    })
    expect(playbookFromSearch({ playbook_contact: ID, signal: 'tender' })).toEqual({ contactId: ID, trigger: 'tender' })
  })

  it('un modèle nommé pré-remplit le signal', () => {
    expect(playbookFromSearch({ playbook_contact: ID, playbook: 'new_cio' })).toEqual({
      contactId: ID,
      trigger: 'new_cio',
    })
  })

  it('un signal ou un modèle inconnu est IGNORÉ, jamais deviné', () => {
    expect(playbookFromSearch({ playbook_contact: ID, signal: 'astrologie', playbook: 'nope' })).toEqual({
      contactId: ID,
      trigger: null,
    })
  })

  it('un identifiant illisible n’ouvre rien', () => {
    expect(playbookFromSearch({ playbook_contact: 'abc', signal: 'hiring' })).toBeNull()
  })
})

describe('libraryFromSearch — #4492, « Modèles de séquence » joignable par l’URL de la page Séquences', () => {
  it('`?vue=modeles` désigne la bibliothèque', () => {
    expect(libraryFromSearch({ vue: 'modeles' })).toBe(true)
  })

  it('l’absence, ou une autre valeur, laisse la liste — jamais une vue devinée', () => {
    expect(libraryFromSearch({})).toBe(false)
    expect(libraryFromSearch({ vue: 'liste' })).toBe(false)
    expect(libraryFromSearch({ vue: ['modeles'] })).toBe(false)
  })

  it('le lien que d’autres écrans posent est CELUI que la page lit (une seule source)', () => {
    expect(libraryFromSearch({ ...SEQUENCE_LIBRARY_SEARCH })).toBe(true)
  })
})
