import {
  buildEnrichmentInput,
  demoSearchPeopleByName,
  demoTalentEnrichmentPatch,
  enrichmentPatchFrom,
  type TalentEnrichmentPatch,
} from './talent-enrichment'

describe('#2570 — buildEnrichmentInput', () => {
  it("refuse une fiche SANS NOM — jamais de recherche à l'aveugle", () => {
    const result = buildEnrichmentInput({
      full_name: null,
      public_profile_url: 'https://linkedin.com/in/x',
      title: null,
    })
    expect(result).toEqual({ ok: false, reason: 'no_identity' })
  })

  it('refuse une fiche sans profil LinkedIn ET sans compte — un rapprochement par le seul nom serait deviné', () => {
    const result = buildEnrichmentInput({ full_name: 'Yanis Berthier', public_profile_url: null, title: 'DevOps' })
    expect(result).toEqual({ ok: false, reason: 'no_match_key' })
  })

  // #3831.1 — l'homonyme CHOISI par l'utilisateur (après `GET search-by-name`,
  // tier gratuit, poste/entreprise/ville affichés) porte une clé Apollo aussi
  // forte qu'un profil LinkedIn : jamais un rapprochement sur le seul nom.
  it("accepte l'apolloId d'un homonyme choisi par l'utilisateur même SANS profil LinkedIn", () => {
    const result = buildEnrichmentInput(
      { full_name: 'Yanis Berthier', public_profile_url: null, title: 'DevOps' },
      { apolloId: 'apollo-123' },
    )
    expect(result).toEqual({
      ok: true,
      input: { firstName: 'Yanis', lastName: 'Berthier', apolloId: 'apollo-123', title: 'DevOps' },
    })
  })

  it('un apolloId vide/blanc ne compte pas comme une clé — retombe sur le refus habituel', () => {
    const result = buildEnrichmentInput(
      { full_name: 'Yanis Berthier', public_profile_url: null, title: 'DevOps' },
      { apolloId: '   ' },
    )
    expect(result).toEqual({ ok: false, reason: 'no_match_key' })
  })

  it('construit la requête avec le profil LinkedIn comme clé forte', () => {
    const result = buildEnrichmentInput({
      full_name: 'Yanis Berthier',
      public_profile_url: 'https://linkedin.com/in/yanis-berthier',
      title: 'Ingénieur plateforme',
    })
    expect(result).toEqual({
      ok: true,
      input: {
        firstName: 'Yanis',
        lastName: 'Berthier',
        linkedinUrl: 'https://linkedin.com/in/yanis-berthier',
        title: 'Ingénieur plateforme',
      },
    })
  })
})

describe('#2570 — enrichmentPatchFrom', () => {
  const base = {
    matched: true,
    email: null,
    email_status: null,
    phone: null,
    linkedin_url: null,
    title: null,
    organization_name: null,
  }

  it('ne récupère que les champs RÉELLEMENT présents dans la réponse — jamais un champ deviné', () => {
    const patch = enrichmentPatchFrom({ ...base, title: 'Lead DevOps' })
    expect(patch).toEqual<TalentEnrichmentPatch>({ title: 'Lead DevOps' })
  })

  it('un champ vide/blanc de la réponse ne produit PAS un patch — un fournisseur muet ne doit rien écraser', () => {
    const patch = enrichmentPatchFrom({ ...base, title: '   ', email: '' })
    expect(patch).toEqual({})
  })

  it('récupère les quatre champs quand ils sont tous présents', () => {
    const patch = enrichmentPatchFrom({
      ...base,
      title: 'Lead DevOps',
      email: 'yanis@example.com',
      phone: '+33612345678',
      linkedin_url: 'https://linkedin.com/in/yanis-berthier',
    })
    expect(patch).toEqual({
      title: 'Lead DevOps',
      email: 'yanis@example.com',
      phone: '+33612345678',
      public_profile_url: 'https://linkedin.com/in/yanis-berthier',
    })
  })
})

describe('#2570 — demoTalentEnrichmentPatch (parité démo, zéro appel réseau)', () => {
  it('sans titre sur la fiche, ne fabrique rien', () => {
    expect(demoTalentEnrichmentPatch({ title: null })).toEqual({})
  })

  it('confirme le titre existant — jamais une entreprise ou une coordonnée inventée', () => {
    expect(demoTalentEnrichmentPatch({ title: 'Ingénieure plateforme' })).toEqual({
      title: 'Ingénieure plateforme (poste confirmé)',
    })
  })

  it('est idempotent — un second clic ne réempile pas le suffixe', () => {
    expect(demoTalentEnrichmentPatch({ title: 'Ingénieure plateforme (poste confirmé)' })).toEqual({
      title: 'Ingénieure plateforme (poste confirmé)',
    })
  })
})

describe('#3831.1 — demoSearchPeopleByName (parité démo, zéro appel réseau)', () => {
  it('nom vide/blanc — aucun homonyme, jamais un résultat deviné', () => {
    expect(demoSearchPeopleByName('   ')).toEqual({ status: 'empty', hits: [] })
  })

  it('rend un homonyme FICTIF dérivé du nom tapé, jamais une coordonnée', () => {
    const result = demoSearchPeopleByName('Yanis Berthier', 'Nordia')
    expect(result.status).toBe('ok')
    expect(result.hits).toEqual([
      {
        id: 'demo-apollo-1',
        firstName: 'Yanis',
        lastNameObfuscated: 'B***',
        title: 'Poste actuel inconnu',
        organizationName: 'Nordia',
        city: 'Paris',
        country: 'France',
        hasEmail: true,
        hasPhone: false,
      },
    ])
  })
})
