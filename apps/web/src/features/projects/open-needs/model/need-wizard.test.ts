import type { CompiledNeed } from '@bellum/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyCompiledNeedToDraft,
  clearNeedWizardDraft,
  duplicateNeedIntoDraft,
  emptyNeedWizardDraft,
  loadNeedWizardDraft,
  needWizardBlockingUnknowns,
  needWizardDraftToCreateInput,
  needWizardReformulationSegments,
  needWizardStepValid,
  parseCompiledSkills,
  saveNeedWizardDraft,
  updateSkill,
  type NeedWizardDraft,
} from './need-wizard'

/**
 * L'assistant de création d'un besoin — le brouillon (08-creer-un-besoin.png).
 *
 * Ce qui se teste : le brouillon PERSISTE (« on quitte, on revient, on
 * retrouve ») sans jamais planter sur un stockage illisible ; seule l'étape 1
 * bloque ; et la conversion vers `CreateProjectNeed` ne pose que ce qui a été
 * SAISI, jamais un défaut inventé pour un champ vide.
 */
beforeEach(() => {
  window.localStorage.clear()
})

describe('need-wizard — le brouillon PERSISTE', () => {
  it('rend null quand rien n’a été sauvegardé', () => {
    expect(loadNeedWizardDraft()).toBeNull()
  })

  it('relit exactement ce qui a été sauvegardé', () => {
    const draft: NeedWizardDraft = { ...emptyNeedWizardDraft(), title: 'Architecte cloud', projectId: 'p-1' }
    saveNeedWizardDraft(draft)
    expect(loadNeedWizardDraft()).toEqual(draft)
  })

  it('efface bien ce qui a été sauvegardé', () => {
    saveNeedWizardDraft({ ...emptyNeedWizardDraft(), title: 'X' })
    clearNeedWizardDraft()
    expect(loadNeedWizardDraft()).toBeNull()
  })

  it('ne PLANTE pas sur un JSON illisible — un brouillon cassé n’est pas un besoin', () => {
    window.localStorage.setItem('bellum:need-wizard-draft:v1', '{ ceci n’est pas du JSON')
    expect(loadNeedWizardDraft()).toBeNull()
  })

  it('fusionne sur un brouillon VIDE — un champ manquant ne fait pas planter la lecture', () => {
    window.localStorage.setItem('bellum:need-wizard-draft:v1', JSON.stringify({ title: 'Ancien format' }))
    const draft = loadNeedWizardDraft()
    expect(draft?.title).toBe('Ancien format')
    expect(draft?.skills).toEqual([])
  })
})

describe('need-wizard — seule l’ÉTAPE 1 bloque', () => {
  // #2558.1 — ce qui BLOQUE est le titre et le CLIENT. Le projet ne bloque
  // plus : la majorité des missions d'ESN n'en ont pas, et l'exiger revenait à
  // en faire inventer un par mission de régie.
  it('bloque tant que le titre ou le CLIENT manquent', () => {
    expect(needWizardStepValid(1, emptyNeedWizardDraft())).toBe(false)
    expect(needWizardStepValid(1, { ...emptyNeedWizardDraft(), title: 'X' })).toBe(false)
    expect(needWizardStepValid(1, { ...emptyNeedWizardDraft(), accountId: 'a-1' })).toBe(false)
    // Un projet SANS client ne suffit toujours pas : c'est le client qu'on exige.
    expect(needWizardStepValid(1, { ...emptyNeedWizardDraft(), title: 'X', projectId: 'p-1' })).toBe(false)
    expect(needWizardStepValid(1, { ...emptyNeedWizardDraft(), title: 'X', accountId: 'a-1' })).toBe(true)
  })

  it('les étapes 2, 3 et 4 ne bloquent JAMAIS — tout le reste est optionnel côté serveur', () => {
    const empty = emptyNeedWizardDraft()
    expect(needWizardStepValid(2, empty)).toBe(true)
    expect(needWizardStepValid(3, empty)).toBe(true)
    expect(needWizardStepValid(4, empty)).toBe(true)
  })
})

describe('need-wizard — la conversion ne pose QUE ce qui a été saisi', () => {
  it('un brouillon minimal ne produit que le titre — rien d’autre n’est inventé', () => {
    const draft: NeedWizardDraft = { ...emptyNeedWizardDraft(), title: '  Architecte cloud  ', projectId: 'p-1' }
    const input = needWizardDraftToCreateInput(draft)
    // `headcount: 1` est le SEUL champ posé au-delà du titre : c'est le défaut
    // du brouillon lui-même (« un poste, jamais zéro »), pas une valeur
    // devinée par la conversion — le serveur choisirait d'ailleurs le même
    // défaut si le champ était omis (`project-pipeline.service.ts`).
    expect(input).toEqual({ title: 'Architecte cloud', headcount: 1 })
  })

  describe('#3547 — le forfait encadré, sans consultants', () => {
    const base = (): NeedWizardDraft => ({
      ...emptyNeedWizardDraft(),
      title: 'Cadrage du forfait paiement',
      projectId: 'p-1',
      contract_kind: 'forfait',
    })

    it('pose le mode, le rôle tenu et les NOMS de l’équipe client, parsés proprement', () => {
      const input = needWizardDraftToCreateInput({
        ...base(),
        supervised: true,
        supervision_role: 'both',
        client_team_names: 'Marie Dupont, Paul Martin\n  ,  Léa Roux ',
      })
      expect(input.delivery_mode).toBe('supervised')
      expect(input.supervision_role).toBe('both')
      expect(input.client_team_names).toEqual(['Marie Dupont', 'Paul Martin', 'Léa Roux'])
      expect(input.client_team_size).toBeUndefined()
    })

    it('porte le NOMBRE quand il n’y a pas de noms, et rien quand rien n’est saisi', () => {
      const withSize = needWizardDraftToCreateInput({ ...base(), supervised: true, client_team_size: 12 })
      expect(withSize.client_team_size).toBe(12)
      expect(withSize.client_team_names).toBeUndefined()
      const nothing = needWizardDraftToCreateInput({ ...base(), supervised: true })
      expect(nothing.supervision_role).toBeUndefined()
      expect(nothing.client_team_size).toBeUndefined()
      expect(nothing.client_team_names).toBeUndefined()
    })

    it('n’envoie RIEN si la nature n’est pas le forfait — le mode ne survit pas au changement de nature', () => {
      const input = needWizardDraftToCreateInput({
        ...base(),
        contract_kind: 'regie',
        supervised: true,
        supervision_role: 'framing',
        client_team_size: 5,
      })
      expect(input.delivery_mode).toBeUndefined()
      expect(input.supervision_role).toBeUndefined()
      expect(input.client_team_size).toBeUndefined()
    })

    it('un brouillon enregistré avant ce lot se relit sans mode encadré', () => {
      window.localStorage.setItem('bellum:need-wizard-draft:v1', JSON.stringify({ title: 'Ancien' }))
      expect(loadNeedWizardDraft()?.supervised).toBe(false)
    })

    it('dupliquer un besoin encadré garde le mode, le rôle et l’équipe', () => {
      const draft = duplicateNeedIntoDraft({
        title: 'Cadrage',
        account_id: 'a-1',
        skills: [],
        headcount: 1,
        target_tjm_cents: null,
        contract_kind: 'forfait',
        delivery_mode: 'supervised',
        supervision_role: 'supervision',
        client_team_size: 6,
        client_team_names: ['Marie'],
      })
      expect(draft.supervised).toBe(true)
      expect(draft.supervision_role).toBe('supervision')
      expect(draft.client_team_size).toBe(6)
      expect(draft.client_team_names).toBe('Marie')
    })
  })

  it('porte l’origine ET le canal — deux champs distincts', () => {
    const draft: NeedWizardDraft = {
      ...emptyNeedWizardDraft(),
      title: 'X',
      projectId: 'p-1',
      origin: 'appel_offres',
      channel: 'partenaire',
    }
    const input = needWizardDraftToCreateInput(draft)
    expect(input.origin).toBe('appel_offres')
    expect(input.channel).toBe('partenaire')
  })

  it('porte l’interlocuteur ET le porteur, saisis à l’étape 1 (#2174.11/.12)', () => {
    const draft: NeedWizardDraft = {
      ...emptyNeedWizardDraft(),
      title: 'X',
      projectId: 'p-1',
      contactId: 'c-1',
      ownerId: 'u-1',
    }
    const input = needWizardDraftToCreateInput(draft)
    expect(input.contact_id).toBe('c-1')
    expect(input.owner_id).toBe('u-1')
  })

  it('sans interlocuteur ni porteur choisis, aucun des deux n’est posé — jamais deviné', () => {
    const draft: NeedWizardDraft = { ...emptyNeedWizardDraft(), title: 'X', projectId: 'p-1' }
    const input = needWizardDraftToCreateInput(draft)
    expect(input.contact_id).toBeUndefined()
    expect(input.owner_id).toBeUndefined()
  })

  it('porte les certifications obligatoires', () => {
    const draft: NeedWizardDraft = {
      ...emptyNeedWizardDraft(),
      title: 'X',
      projectId: 'p-1',
      required_certifications: ['AWS Certified', 'PRINCE2'],
    }
    expect(needWizardDraftToCreateInput(draft).required_certifications).toEqual(['AWS Certified', 'PRINCE2'])
  })

  it('le TJM saisi voyage en CENTIMES, tel quel', () => {
    const draft: NeedWizardDraft = { ...emptyNeedWizardDraft(), title: 'X', projectId: 'p-1', target_tjm_cents: 65000 }
    expect(needWizardDraftToCreateInput(draft).target_tjm_cents).toBe(65000)
  })

  it('#2173.29 — porte le télétravail choisi', () => {
    const draft: NeedWizardDraft = { ...emptyNeedWizardDraft(), title: 'X', projectId: 'p-1', remote: 'hybride' }
    expect(needWizardDraftToCreateInput(draft).remote).toBe('hybride')
  })

  it('#2173.29 — un brouillon sans télétravail ne pose rien — jamais un `sur_site` deviné', () => {
    const draft: NeedWizardDraft = { ...emptyNeedWizardDraft(), title: 'X', projectId: 'p-1' }
    expect(needWizardDraftToCreateInput(draft).remote).toBeUndefined()
  })

  it('#2939 (#2174.16) — porte la capacité recherchée (`expertise`), colonne déjà lue par la fiche', () => {
    const draft: NeedWizardDraft = {
      ...emptyNeedWizardDraft(),
      title: 'X',
      projectId: 'p-1',
      expertise: '  Architecture cloud AWS  ',
    }
    expect(needWizardDraftToCreateInput(draft).expertise).toBe('Architecture cloud AWS')
  })

  it('#2939 (#2174.16) — une capacité recherchée vide n’est jamais posée', () => {
    const draft: NeedWizardDraft = { ...emptyNeedWizardDraft(), title: 'X', projectId: 'p-1' }
    expect(needWizardDraftToCreateInput(draft).expertise).toBeUndefined()
  })

  it('#2939 (#2174.31) — porte les contraintes administratives, colonne déjà lue par la fiche', () => {
    const draft: NeedWizardDraft = {
      ...emptyNeedWizardDraft(),
      title: 'X',
      projectId: 'p-1',
      constraints: '  Astreinte un week-end sur trois  ',
    }
    expect(needWizardDraftToCreateInput(draft).constraints).toBe('Astreinte un week-end sur trois')
  })

  it('#2939 (#2174.31) — des contraintes vides ne sont jamais posées', () => {
    const draft: NeedWizardDraft = { ...emptyNeedWizardDraft(), title: 'X', projectId: 'p-1' }
    expect(needWizardDraftToCreateInput(draft).constraints).toBeUndefined()
  })
})

describe('need-wizard — updateSkill règle UN critère, pas tous (#2939, #2174.20/.22/.24)', () => {
  const skills = [
    { term: 'Kubernetes', required: true, level: null },
    { term: 'Terraform', required: true, level: null },
  ]

  it('bascule Indispensable/Souhaitable pour la compétence visée seulement', () => {
    const next = updateSkill(skills, 1, { required: false })
    expect(next[0]).toEqual(skills[0])
    expect(next[1]).toEqual({ term: 'Terraform', required: false, level: null })
  })

  it('règle le niveau sans toucher au caractère bloquant', () => {
    const next = updateSkill(skills, 0, { level: 'confirmé' })
    expect(next[0]).toEqual({ term: 'Kubernetes', required: true, level: 'confirmé' })
    expect(next[1]).toEqual(skills[1])
  })

  it('#2939 (#2174.23) — règle la preuve attendue sans toucher aux autres critères', () => {
    const next = updateSkill(skills, 0, { proof: 'certification à jour' })
    expect(next[0]).toEqual({ term: 'Kubernetes', required: true, level: null, proof: 'certification à jour' })
    expect(next[1]).toEqual(skills[1])
  })
})

describe('need-wizard — parseCompiledSkills (#2942, reste du 26/09)', () => {
  it('rend un tableau vide quand Laura n’a rien compilé', () => {
    expect(parseCompiledSkills(undefined)).toEqual([])
    expect(parseCompiledSkills('')).toEqual([])
  })

  it('sépare la liste jointe par virgules, un terme non bloquant chacun', () => {
    expect(parseCompiledSkills('Kubernetes, Terraform,  Java ')).toEqual([
      { term: 'Kubernetes', required: true, level: null },
      { term: 'Terraform', required: true, level: null },
      { term: 'Java', required: true, level: null },
    ])
  })

  it('ignore les virgules parasites sans fabriquer de terme vide', () => {
    expect(parseCompiledSkills('Kubernetes,, ,Terraform')).toEqual([
      { term: 'Kubernetes', required: true, level: null },
      { term: 'Terraform', required: true, level: null },
    ])
  })
})

/**
 * #2939 (#2174.32/.33/.34) — DÉCISION : les trois nouvelles colonnes voyagent
 * jusqu'au corps de la création, jamais une chaîne vide posée.
 */
describe('need-wizard — needWizardDraftToCreateInput (décision)', () => {
  it('ne pose rien quand la décision n’a pas été renseignée', () => {
    const input = needWizardDraftToCreateInput({ ...emptyNeedWizardDraft(), title: 'X' })
    expect(input.decision_process).toBeUndefined()
    expect(input.decision_maker_contact_id).toBeUndefined()
    expect(input.procurement_involvement).toBeUndefined()
  })

  it('pose les trois champs de décision quand ils sont renseignés', () => {
    const input = needWizardDraftToCreateInput({
      ...emptyNeedWizardDraft(),
      title: 'X',
      decisionProcess: '  Comité technique puis DSI  ',
      decisionMakerContactId: 'c-1',
      procurementInvolvement: 'implique',
    })
    expect(input.decision_process).toBe('Comité technique puis DSI')
    expect(input.decision_maker_contact_id).toBe('c-1')
    expect(input.procurement_involvement).toBe('implique')
  })
})

/**
 * #2939 (#2174.3/.5) — APPLIQUER UNE COMPILATION : chaque champ compilé
 * s'écrit dans le brouillon, avec sa citation transportée pour l'étape 5.
 */
describe('need-wizard — applyCompiledNeedToDraft', () => {
  function compiled(overrides: Partial<CompiledNeed> = {}): CompiledNeed {
    return {
      source: { kind: 'free_brief', locator: null, stated_at: null },
      account_id: null,
      company_hint: 'Decathlon',
      fields: [],
      proposed_contacts: [],
      unknowns: [],
      contradictions: [],
      confirmation_level: 'rapporte',
      clarification: null,
      not_understood: [],
      status: 'proposition',
      ...overrides,
    }
  }

  it('applique le titre, les compétences et le TJM compilés', () => {
    const result = applyCompiledNeedToDraft(
      emptyNeedWizardDraft(),
      compiled({
        fields: [
          {
            field: 'title',
            value: 'Développeur backend',
            provenance: {
              source_kind: 'free_brief',
              excerpt: 'x',
              locator: null,
              stated_at: null,
              confidence: 'explicite',
            },
          },
          {
            field: 'skills',
            value: [{ term: 'Python', required: true }],
            provenance: {
              source_kind: 'free_brief',
              excerpt: 'x',
              locator: null,
              stated_at: null,
              confidence: 'explicite',
            },
          },
          {
            field: 'target_tjm_cents',
            value: 55000,
            provenance: {
              source_kind: 'free_brief',
              excerpt: 'x',
              locator: null,
              stated_at: null,
              confidence: 'explicite',
            },
          },
        ],
      }),
    )
    expect(result.title).toBe('Développeur backend')
    expect(result.skills).toEqual([{ term: 'Python', required: true, level: null }])
    expect(result.target_tjm_cents).toBe(55000)
    expect(result.compiled).not.toBeNull()
  })

  it('n’applique JAMAIS un champ que le brouillon ne porte pas (work_to_do, expected_outcome)', () => {
    const before = emptyNeedWizardDraft()
    const result = applyCompiledNeedToDraft(
      before,
      compiled({
        fields: [
          {
            field: 'work_to_do',
            value: 'reprendre la supervision',
            provenance: {
              source_kind: 'free_brief',
              excerpt: 'x',
              locator: null,
              stated_at: null,
              confidence: 'explicite',
            },
          },
        ],
      }),
    )
    // Rien de nouveau à côté de `compiled` : `work_to_do` n'a pas de colonne
    // sur le besoin enregistré, donc pas de champ de brouillon à remplir.
    expect({ ...result, compiled: null }).toEqual({ ...before, compiled: null })
  })
})

/**
 * #2939 (#2174.36) — LES INCONNUES BLOQUANTES : vides sans compilation,
 * nommées quand `needUnderstandingGaps` en trouve.
 */
describe('need-wizard — needWizardBlockingUnknowns', () => {
  it('rend une liste VIDE quand aucune compilation n’a eu lieu — on n’affiche pas ce qu’on n’a pas', () => {
    expect(needWizardBlockingUnknowns(emptyNeedWizardDraft())).toEqual([])
  })

  it('nomme ce qui manque quand une compilation a eu lieu', () => {
    const draft: NeedWizardDraft = {
      ...emptyNeedWizardDraft(),
      compiled: {
        source: { kind: 'email', locator: null, stated_at: null },
        account_id: null,
        company_hint: null,
        fields: [],
        proposed_contacts: [],
        unknowns: [],
        contradictions: [],
        confirmation_level: 'hypothese',
        clarification: null,
        not_understood: [],
        status: 'proposition',
      },
    }
    expect(needWizardBlockingUnknowns(draft)).toEqual(['work_to_do', 'expected_outcome', 'skills'])
  })
})

describe('need-wizard — needWizardReformulationSegments (#2174.35)', () => {
  it('dit qu’il ne sait rien plutôt que d’inventer un titre ou un client', () => {
    const segments = needWizardReformulationSegments(emptyNeedWizardDraft(), null)
    expect(segments).toEqual([{ kind: 'title', title: null, accountLabel: null }])
  })

  it('sépare indispensable et souhaitable, et n’ajoute que ce qui est saisi', () => {
    const draft: NeedWizardDraft = {
      ...emptyNeedWizardDraft(),
      title: 'Développeur backend',
      skills: [
        { term: 'Python', required: true, level: null },
        { term: 'Docker', required: false, level: null },
      ],
      target_tjm_cents: 55000,
    }
    const segments = needWizardReformulationSegments(draft, 'Decathlon')
    expect(segments).toEqual([
      { kind: 'title', title: 'Développeur backend', accountLabel: 'Decathlon' },
      { kind: 'skillsRequired', terms: ['Python'] },
      { kind: 'skillsOptional', terms: ['Docker'] },
      { kind: 'tjm', amount: 550 },
    ])
  })
})

describe('need-wizard — duplicateNeedIntoDraft (#2174.6)', () => {
  it('reprend chaque champ du besoin existant, avec un titre distinct', () => {
    const draft = duplicateNeedIntoDraft({
      title: 'Développeur backend',
      account_id: 'a-1',
      project_id: 'p-1',
      contact_id: 'ct-1',
      owner_id: 'o-1',
      origin: 'entrant',
      channel: null,
      skills: [{ term: 'Python', required: true, level: null }],
      seniority: 'confirme',
      headcount: 2,
      target_tjm_cents: 55000,
      location: 'Lyon',
      remote: 'hybride',
      duration_months: 6,
      start_on: '2026-11-01',
      contract_kind: 'regie',
      urgency: 'haute',
      required_certifications: ['AWS'],
      context: 'Contexte',
      expertise: 'Expertise',
      constraints: 'Contraintes',
      decision_process: 'Comité technique',
      decision_maker_contact_id: 'ct-2',
      procurement_involvement: 'implique',
    })
    expect(draft.title).toBe('Développeur backend (copie)')
    expect(draft.accountId).toBe('a-1')
    expect(draft.skills).toEqual([{ term: 'Python', required: true, level: null }])
    expect(draft.decisionProcess).toBe('Comité technique')
    expect(draft.decisionMakerContactId).toBe('ct-2')
    expect(draft.procurementInvolvement).toBe('implique')
  })

  it('ne fabrique aucune valeur pour ce que le besoin d’origine ne portait pas', () => {
    const draft = duplicateNeedIntoDraft({
      title: 'Sans rien',
      account_id: 'a-1',
      skills: [],
      headcount: 1,
      target_tjm_cents: null,
      contract_kind: 'inconnu',
    })
    expect(draft.projectId).toBe('')
    expect(draft.decisionMakerContactId).toBe('')
    expect(draft.procurementInvolvement).toBeNull()
    expect(draft.contract_kind).toBe('')
  })
})
