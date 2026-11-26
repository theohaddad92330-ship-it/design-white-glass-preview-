import { describe, expect, it } from 'vitest'
import {
  OUTREACH_PLAYBOOK_KEYS,
  OUTREACH_PLAYBOOKS,
  OUTREACH_PLAYBOOK_NAMES,
  playbookSequenceName,
  playbookTemplateKey,
  OUTREACH_STEP_INTENTS,
  OUTREACH_STEP_INTENT_LABELS,
  OUTREACH_TEMPLATE_CATEGORY,
  OUTREACH_WIZARD_GOALS,
  OUTREACH_WIZARD_OFFERS,
  playbookSpanDays,
  recommendPlaybook,
  templatesOfCategory,
} from './outreach-playbooks.js'
import { OUTREACH_SEQUENCE_MAX_STEPS, outreachTemplateKeySchema } from './outreach-sequence.js'

/** Lot L-C (#4166, épopée #4163) — les huit modèles ESN, classés par DÉCLENCHEUR. */

const shape = (key: (typeof OUTREACH_PLAYBOOK_KEYS)[number]): string =>
  OUTREACH_PLAYBOOKS[key].steps.map(step => `J${step.offset_days}:${step.kind}`).join(' ')

describe('les huit modèles ESN', () => {
  it('lit un corpus réel : huit modèles, chacun avec des étapes', () => {
    expect(OUTREACH_PLAYBOOK_KEYS).toHaveLength(8)
    for (const key of OUTREACH_PLAYBOOK_KEYS) expect(OUTREACH_PLAYBOOKS[key].steps.length).toBeGreaterThan(0)
  })

  it('A. signal de recrutement : e-mail · invitation · message · appel · clôture', () => {
    expect(shape('hiring_signal')).toBe('J0:email J1:linkedin_invite J4:linkedin_message J8:call J12:email')
  })
  it('B. nouveau DSI nommé', () => {
    expect(shape('new_cio')).toBe('J0:linkedin_invite J3:email J8:email J14:call J20:email')
  })
  it('C. appel d’offres : finit par une tâche de vérification de la date limite', () => {
    expect(shape('tender')).toBe('J0:email J2:call J5:email J9:task')
  })
  it('D. réactivation d’un ancien client', () => {
    expect(shape('win_back')).toBe('J0:email J4:linkedin_message J9:call J15:email')
  })
  it('E. après un rendez-vous', () => {
    expect(shape('after_meeting')).toBe('J0:email J3:email J7:call J14:email')
  })
  it('F. consultant en inter-contrat', () => {
    expect(shape('bench_consultant')).toBe('J0:email J1:linkedin_invite J3:call J6:email J10:email')
  })
  it('G. passage de la régie au forfait', () => {
    expect(shape('regie_to_forfait')).toBe('J0:email J5:linkedin_message J10:email J15:call')
  })
  it('H. contact tiède', () => {
    expect(shape('warm_contact')).toBe('J0:linkedin_invite J3:email J7:call')
  })

  it('chaque étape dit son intention (liste fermée) et porte un conseil et un libellé', () => {
    for (const key of OUTREACH_PLAYBOOK_KEYS) {
      for (const step of OUTREACH_PLAYBOOKS[key].steps) {
        expect(OUTREACH_STEP_INTENTS).toContain(step.intent)
        expect(step.label.trim().length).toBeGreaterThan(0)
        expect(step.tipKey).toMatch(new RegExp(`^${key}\\.\\d+$`))
      }
    }
  })

  it('chaque intention a son libellé d’enregistrement, en français et ≤ 300 caractères', () => {
    for (const intent of OUTREACH_STEP_INTENTS) {
      const label = OUTREACH_STEP_INTENT_LABELS[intent]
      expect(label.trim().length, intent).toBeGreaterThan(0)
      expect(label.length).toBeLessThanOrEqual(300)
    }
    expect(OUTREACH_STEP_INTENT_LABELS.get_reply).toBe('Obtenir une réponse')
  })

  it('les trois intentions de l’énoncé existent', () => {
    expect(OUTREACH_STEP_INTENTS).toEqual(expect.arrayContaining(['get_reply', 'qualify_need', 'book_exchange']))
  })

  it('les délais sont croissants et tiennent dans le plafond d’étapes', () => {
    for (const key of OUTREACH_PLAYBOOK_KEYS) {
      const offsets = OUTREACH_PLAYBOOKS[key].steps.map(step => step.offset_days)
      expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
      expect(offsets.length).toBeLessThanOrEqual(OUTREACH_SEQUENCE_MAX_STEPS)
    }
    expect(playbookSpanDays('hiring_signal')).toBe(12)
  })
})

describe('le nom d’enregistrement', () => {
  it('chaque modèle a un nom français, et la séquence nomme son contact', () => {
    for (const key of OUTREACH_PLAYBOOK_KEYS) expect(OUTREACH_PLAYBOOK_NAMES[key].trim().length).toBeGreaterThan(0)
    expect(playbookSequenceName('hiring_signal', 'Marie Dubois')).toBe('Signal de recrutement — Marie Dubois')
  })
})

describe('les gabarits existants sont RANGÉS, jamais supprimés', () => {
  it('chaque gabarit du contrat a une catégorie (modèle ou « autres »)', () => {
    for (const key of outreachTemplateKeySchema.options) {
      const category = OUTREACH_TEMPLATE_CATEGORY[key]
      expect(category === 'other' || OUTREACH_PLAYBOOK_KEYS.includes(category), key).toBe(true)
    }
    expect(Object.keys(OUTREACH_TEMPLATE_CATEGORY)).toHaveLength(outreachTemplateKeySchema.options.length)
  })

  it('la somme des catégories redonne tous les gabarits, sans doublon ni perte', () => {
    const grouped = [...OUTREACH_PLAYBOOK_KEYS, 'other' as const].flatMap(category => templatesOfCategory(category))
    expect([...grouped].sort()).toEqual([...outreachTemplateKeySchema.options].sort())
  })

  it('« Autres » n’est pas vide', () => {
    expect(templatesOfCategory('other').length).toBeGreaterThan(0)
  })
})

describe('le gabarit d’origine d’un modèle (référence gardée, comme #2378.6)', () => {
  it('est le gabarit rangé sous ce déclencheur, ou null quand il n’y en a pas', () => {
    expect(playbookTemplateKey('hiring_signal')).toBe('fresh_signal')
    expect(playbookTemplateKey('after_meeting')).toBe('post_meeting_followup')
    expect(playbookTemplateKey('tender')).toBeNull()
    expect(playbookTemplateKey('new_cio')).toBeNull()
  })
})

describe('l’assistant en 4 questions', () => {
  it('un signal de recrutement propose le modèle A', () => {
    expect(recommendPlaybook({ trigger: 'hiring_signal', offer: 'regie', goal: 'reply' })).toBe('hiring_signal')
  })

  it('le trigger prime sur l’offre : un DSI nommé reste B même en forfait', () => {
    expect(recommendPlaybook({ trigger: 'new_cio', offer: 'forfait', goal: 'exchange' })).toBe('new_cio')
  })

  it('« passer de la régie au forfait » est le modèle G quand l’offre est le forfait sur un client en régie', () => {
    expect(recommendPlaybook({ trigger: 'regie_to_forfait', offer: 'forfait', goal: 'exchange' })).toBe(
      'regie_to_forfait',
    )
  })

  it('sans signal connu, l’offre profil oriente vers le consultant en inter-contrat', () => {
    expect(recommendPlaybook({ trigger: null, offer: 'profil', goal: 'reply' })).toBe('bench_consultant')
  })

  it('sans signal connu, l’objectif « fixer un échange » ne devine pas : contact tiède (le plus simple)', () => {
    expect(recommendPlaybook({ trigger: null, offer: 'regie', goal: 'exchange' })).toBe('warm_contact')
  })

  it('les listes de réponses sont fermées', () => {
    expect(OUTREACH_WIZARD_OFFERS).toEqual(['regie', 'forfait', 'profil'])
    expect(OUTREACH_WIZARD_GOALS).toEqual(['reply', 'qualify', 'exchange', 'reactivate'])
  })
})
