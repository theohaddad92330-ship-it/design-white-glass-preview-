import { guardDeclaredPeople } from './org-declare-guard'

/**
 * #1103 — la porte « décris ton organigramme » a DEUX verrous, et celui-ci ne
 * fait pas confiance au premier. Une personne inventée envoie un commercial
 * préparer un message pour un interlocuteur qui n'existe pas.
 */

const TEXT = "Chez UNEO, Caroline Jaouen est la DSI. Marc Petit, le DG, est son N+1. L'équipe infra suit."

describe("la garde anti-invention de l'organigramme déclaré (#1103)", () => {
  it('garde une personne que le texte nomme', () => {
    const out = guardDeclaredPeople([{ fullName: 'Caroline Jaouen', title: 'DSI' }], TEXT)

    expect(out.people).toHaveLength(1)
    expect(out.dropped).toEqual([])
  })

  it('RETIRE une personne que le texte ne nomme pas, et la NOMME', () => {
    // Un retrait silencieux se lirait « le modèle n'a rien trouvé ».
    const out = guardDeclaredPeople(
      [{ fullName: 'Caroline Jaouen' }, { fullName: 'Sophie Durand', title: 'DAF' }],
      TEXT,
    )

    expect(out.people.map(p => p.fullName)).toEqual(['Caroline Jaouen'])
    expect(out.dropped).toEqual(['Sophie Durand'])
  })

  it('accepte un nom écrit dans l’autre ordre', () => {
    // Refuser « JAOUEN Caroline » apprendrait à l'utilisateur que la porte ne
    // marche pas.
    const out = guardDeclaredPeople([{ fullName: 'JAOUEN Caroline' }], TEXT)

    expect(out.people).toHaveLength(1)
  })

  it('ne se laisse pas convaincre par un prénom seul commun au texte', () => {
    const out = guardDeclaredPeople([{ fullName: 'Caroline Lefèvre' }], TEXT)

    expect(out.people).toHaveLength(0)
    expect(out.dropped).toEqual(['Caroline Lefèvre'])
  })

  it('garde la personne mais retire un N+1 que le texte ne nomme pas', () => {
    // La personne existe ; c'est son rattachement qui a été deviné, et un
    // mauvais N+1 oriente toute une approche.
    const out = guardDeclaredPeople([{ fullName: 'Caroline Jaouen', managerName: 'Paul Martin' }], TEXT)

    expect(out.people).toHaveLength(1)
    expect(out.people[0]!.managerName).toBeUndefined()
  })

  it('garde un N+1 que le texte nomme', () => {
    const out = guardDeclaredPeople([{ fullName: 'Caroline Jaouen', managerName: 'Marc Petit' }], TEXT)

    expect(out.people[0]!.managerName).toBe('Marc Petit')
  })

  it('ne vérifie PAS la fonction — « dirige la DSI » n’est pas « Directrice SI »', () => {
    // Exiger la citation là rendrait la porte inutilisable, et ce n'est pas le
    // champ qui fait perdre un rendez-vous.
    const out = guardDeclaredPeople(
      [{ fullName: 'Caroline Jaouen', title: 'Directrice des systèmes d’information' }],
      TEXT,
    )

    expect(out.people[0]!.title).toBe('Directrice des systèmes d’information')
  })

  it('rend une liste vide sans broncher', () => {
    expect(guardDeclaredPeople([], TEXT)).toEqual({ people: [], dropped: [] })
  })
})
