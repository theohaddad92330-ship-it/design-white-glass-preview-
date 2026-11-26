import { filtersFromSearch, restoredFiltersFromSearch, searchFromFilters } from './discover-prefill'
import { emptyUnifiedFilters } from './discover-filters'

/**
 * Le pré-remplissage sert la proposition `find_accounts` du Copilote : ce que la
 * carte annonçait doit être EXACTEMENT ce que le rail applique. Une valeur
 * inconnue est donc ignorée, jamais rapprochée « au mieux ».
 */
describe('filtersFromSearch', () => {
  it('rend null quand l’URL ne porte aucun critère (accueil inchangé)', () => {
    expect(filtersFromSearch({})).toBeNull()
    expect(filtersFromSearch({ headcount: '50-249' })).toBeNull()
  })

  it('applique secteurs, signaux, département, effectif et mots-clés', () => {
    const filters = filtersFromSearch({
      sectors: 'aerospace,retail_banking',
      signals: 'hiring,tender',
      department: '69',
      headcount: '250-999',
      keywords: 'migration cloud',
    })
    expect(filters).toMatchObject({
      sectors: ['aerospace', 'retail_banking'],
      signalSources: ['tender', 'hiring'],
      department: '69',
      headcount: ['250-999'],
      keywords: 'migration cloud',
    })
  })

  it('ignore une valeur hors vocabulaire plutôt que de l’approcher', () => {
    const filters = filtersFromSearch({ sectors: 'licorne,healthcare', signals: 'telepathie', headcount: 'beaucoup' })
    expect(filters?.sectors).toEqual(['healthcare'])
    expect(filters?.signalSources).toEqual([])
    expect(filters?.headcount).toEqual([])
  })

  it('n’applique pas un département qui n’en est pas un', () => {
    expect(filtersFromSearch({ sectors: 'aerospace', department: 'Rhône-Alpes' })?.department).toBe('')
    expect(filtersFromSearch({ sectors: 'aerospace', department: '2a' })?.department).toBe('2A')
  })

  it('« all » n’est pas un secteur sélectionnable', () => {
    expect(filtersFromSearch({ sectors: 'all' })).toBeNull()
  })

  /**
   * #3392 (reste, recette prod 30/09) — « la carte Découvrir n'a pas le
   * filtre région AURA ». Avant ce lot, `region` n'entrait pas dans
   * `hasNarrow` : une proposition composée d'une SEULE région (le cas exact
   * du retour bêta) retombait sur `null`, et Découvrir s'ouvrait vierge.
   */
  it('une région seule est une contrainte assez étroite pour survivre — plus « null »', () => {
    expect(filtersFromSearch({ region: '84' })?.region).toEqual(['84'])
  })

  it('plusieurs régions cochées ensemble voyagent toutes', () => {
    expect(filtersFromSearch({ sectors: 'it', region: '84,11' })?.region).toEqual(['84', '11'])
  })

  /** #3908 — même forme liste que `region` ci-dessus : plusieurs tranches
   *  cochées ensemble dans l'URL (`headcount=10-49,250-999`). */
  it('plusieurs tranches d’effectif cochées ensemble voyagent toutes', () => {
    expect(filtersFromSearch({ sectors: 'it', headcount: '10-49,250-999' })?.headcount).toEqual(['10-49', '250-999'])
  })

  it('« any » n’est jamais un élément du tableau de tranches', () => {
    expect(filtersFromSearch({ sectors: 'it', headcount: 'any,10-49' })?.headcount).toEqual(['10-49'])
  })
})

/**
 * #2165.64 — le filtre vit dans l'URL, pas dans le composant.
 *
 * `searchFromFilters` / `restoredFiltersFromSearch` sont le pendant COMPLET de
 * `filtersFromSearch` (tous les champs du rail, pas seulement les cinq que le
 * Copilote compose) : c'est ce qui permet à un rechargement de retrouver EXACTEMENT
 * la recherche lancée, alors que `filtersFromSearch` garde à dessein sa porte
 * étroite (un « headcount » seul ne vaut pas une proposition de Laura).
 */
describe('searchFromFilters / restoredFiltersFromSearch (#2165.64)', () => {
  it('rend null quand l’URL ne porte aucun critère', () => {
    expect(restoredFiltersFromSearch({})).toBeNull()
  })

  it('restaure un critère que filtersFromSearch (porte étroite) ignore — un effectif seul', () => {
    expect(filtersFromSearch({ headcount: '50-249' })).toBeNull()
    expect(restoredFiltersFromSearch({ headcount: '50-249' })?.headcount).toEqual(['50-249'])
  })

  it('encode puis relit — aller-retour fidèle sur les champs du rail élargi', () => {
    const filters = {
      ...emptyUnifiedFilters(),
      sectors: ['aerospace'],
      nafCode: '6202A',
      department: '69',
      region: ['11', '76'],
      revenueMin: '1000000',
      revenueMax: '5000000',
      legalForm: '5710',
      city: 'Lyon',
      headcount: ['250-999' as const],
      age: '3to10' as const,
      freetext: 'data platform',
      excludeSectors: ['retail_banking'],
      technologiesObserved: 'java, kubernetes',
      externalRecourseObserved: true,
      groupRole: 'filiale' as const,
      contractRecourseObserved: true,
      signalSources: ['hiring' as const],
      sinceDays: 180,
      keywords: 'migration cloud',
      entityType: 'client' as const,
      remotePolicies: ['full_remote' as const],
      seniorities: ['senior' as const],
    }
    const search = searchFromFilters(filters)
    const restored = restoredFiltersFromSearch(search)
    expect(restored).toMatchObject({
      sectors: ['aerospace'],
      nafCode: '6202A',
      department: '69',
      region: ['11', '76'],
      revenueMin: '1000000',
      revenueMax: '5000000',
      legalForm: '5710',
      city: 'Lyon',
      headcount: ['250-999'],
      age: '3to10',
      freetext: 'data platform',
      excludeSectors: ['retail_banking'],
      technologiesObserved: 'java, kubernetes',
      externalRecourseObserved: true,
      groupRole: 'filiale',
      contractRecourseObserved: true,
      signalSources: ['hiring'],
      sinceDays: 180,
      keywords: 'migration cloud',
      entityType: 'client',
      remotePolicies: ['full_remote'],
      seniorities: ['senior'],
    })
  })

  /**
   * #3878 — RÉFUTÉ en recette prod le 08/10/2026 : l'URL produite portait le
   * CA entre guillemets encodés (`revenueMin=%22500000000%22`). Cause : un
   * nombre écrit en chaîne PURE (uniquement des chiffres) est aussi un JSON
   * valide — le sérialiseur de recherche par défaut du routeur (TanStack,
   * `JSON.stringify`) le re-guillemette pour préserver le TYPE string au
   * rechargement (sinon `JSON.parse` le relirait comme un NOMBRE). Préfixer
   * d'un caractère non-JSON (`v…`) rend la valeur invalide comme JSON dès le
   * premier caractère : le routeur la laisse alors TELLE QUELLE dans l'URL,
   * sans guillemets. Les anciennes URL (chiffres nus, avec ou sans guillemets
   * déjà déguillemetés par le routeur) doivent continuer à se relire.
   */
  it('#3878 — le CA s’écrit dans l’URL sans points de code qui forcent des guillemets', () => {
    const search = searchFromFilters({ ...emptyUnifiedFilters(), revenueMin: '500000000', revenueMax: '1000000' })
    // Jamais une chaîne purement numérique : le routeur la re-guillemetterait.
    expect(search.revenueMin).not.toMatch(/^\d+$/)
    expect(search.revenueMax).not.toMatch(/^\d+$/)
    expect(restoredFiltersFromSearch(search)).toMatchObject({ revenueMin: '500000000', revenueMax: '1000000' })
  })

  it('#3878 — relit une ANCIENNE URL (chiffres nus, ou déjà déguillemetée par le routeur)', () => {
    expect(restoredFiltersFromSearch({ revenueMin: '500000000' })?.revenueMin).toBe('500000000')
    // Une ancienne URL sans guillemets, lue par le parseur par défaut du
    // routeur (`JSON.parse`), arrive ici comme un NOMBRE, pas une chaîne.
    expect(restoredFiltersFromSearch({ revenueMin: 500000000 as unknown as string })?.revenueMin).toBe('500000000')
  })

  /**
   * #3096 — RÉFUTÉ en prod le 27/09 : une recherche lancée avec « Recrutement »
   * + « Full remote » cochés au rail n'écrivait que `?signals=hiring` dans
   * l'URL — le choix de politique de télétravail disparaissait au premier
   * `navigate()` (`searchFromFilters` ne le sérialisait pas), donc un lien
   * partagé ou un rechargement rouvrait l'écran SANS lui.
   */
  it('porte la politique de télétravail dans l’URL (#3096)', () => {
    const search = searchFromFilters({
      ...emptyUnifiedFilters(),
      signalSources: ['hiring'],
      remotePolicies: ['full_remote'],
    })
    expect(search.remotePolicies).toBe('full_remote')
    expect(restoredFiltersFromSearch(search)?.remotePolicies).toEqual(['full_remote'])
  })

  /** #3097 — même défaut que #3096 ci-dessus, pour la séniorité recherchée. */
  it('porte la séniorité recherchée dans l’URL (#3097)', () => {
    const search = searchFromFilters({
      ...emptyUnifiedFilters(),
      signalSources: ['hiring'],
      seniorities: ['senior'],
    })
    expect(search.seniorities).toBe('senior')
    expect(restoredFiltersFromSearch(search)?.seniorities).toEqual(['senior'])
  })

  it('porte la base siège/implantation dans l’URL (#3983.2)', () => {
    const search = searchFromFilters({ ...emptyUnifiedFilters(), department: '69', siteBasis: 'headquarters' })
    expect(search.siteBasis).toBe('headquarters')
    expect(restoredFiltersFromSearch(search)?.siteBasis).toBe('headquarters')
    // La base par défaut n'écrit rien et se relit par défaut.
    const plain = searchFromFilters({ ...emptyUnifiedFilters(), department: '69' })
    expect(plain.siteBasis).toBeUndefined()
    expect(restoredFiltersFromSearch(plain)?.siteBasis).toBe('presence')
  })

  it('un rail vierge n’écrit AUCUNE clé (URL propre — pas de "any" ni de "false" collés)', () => {
    expect(searchFromFilters(emptyUnifiedFilters())).toEqual({
      sectors: undefined,
      nafCode: undefined,
      department: undefined,
      region: undefined,
      revenueMin: undefined,
      revenueMax: undefined,
      companyCategory: undefined,
      legalForm: undefined,
      city: undefined,
      headcount: undefined,
      age: undefined,
      freetext: undefined,
      excludeSectors: undefined,
      technologiesObserved: undefined,
      externalRecourseObserved: undefined,
      groupRole: undefined,
      contractRecourse: undefined,
      signals: undefined,
      sinceDays: undefined,
      keywords: undefined,
      entityType: undefined,
      remotePolicies: undefined,
      seniorities: undefined,
    })
  })

  it('ignore une valeur hors vocabulaire, même sur les champs élargis', () => {
    const restored = restoredFiltersFromSearch({ groupRole: 'complice', entityType: 'martien', age: 'jamais' })
    expect(restored).toBeNull()
  })
})

describe('#4362.1 — un seul filtre de taille', () => {
  it('un ancien lien portant `companyCategory` garde son intention : des tranches, plus de catégorie', () => {
    const restored = restoredFiltersFromSearch({ companyCategory: 'ETI', headcount: '10-49' })
    expect(restored?.companyCategory).toEqual([])
    expect(restored?.headcount).toEqual(['10-49', '250-999', '1000+'])
  })
})

describe('R22-DV5 — le lien profond /discover?sectors=… pose le filtre secteur', () => {
  it('le code sans casse, le libellé français et le libellé anglais valent le code', () => {
    expect(filtersFromSearch({ sectors: 'Nuclear' })?.sectors).toEqual(['nuclear'])
    expect(filtersFromSearch({ sectors: 'nucléaire' })?.sectors).toEqual(['nuclear'])
    expect(restoredFiltersFromSearch({ sectors: 'Software_Tech,nuclear' })?.sectors).toEqual([
      'software_tech',
      'nuclear',
    ])
  })

  it('sait dire NON : un mot inconnu ne pose aucun secteur', () => {
    expect(filtersFromSearch({ sectors: 'zzz-inconnu' })).toBeNull()
  })
})

describe('#4307.3 — la taille et la région de l’URL gagnent sur le profil', () => {
  it('relit `headcount=5000-plus` comme la tranche ouverte qui le contient (1000+), jamais vidée', () => {
    const restored = restoredFiltersFromSearch({ sectors: 'aerospace', headcount: '5000-plus' })
    expect(restored?.headcount).toEqual(['1000+'])
  })

  it('relit les autres écritures d’un seuil ouvert ou d’un intervalle hors vocabulaire', () => {
    expect(restoredFiltersFromSearch({ headcount: '1000+' })?.headcount).toEqual(['1000+'])
    expect(restoredFiltersFromSearch({ headcount: '250plus' })?.headcount).toEqual(['250-999', '1000+'])
    expect(restoredFiltersFromSearch({ headcount: '100-499' })?.headcount).toEqual(['50-249', '250-999'])
    expect(restoredFiltersFromSearch({ headcount: 'n-importe' })).toBeNull()
  })

  it('une taille de l’URL n’est jamais remplacée par celle du profil', async () => {
    const { proposeProfileSize } = await import('./discover-profile-size')
    const restored = restoredFiltersFromSearch({ sectors: 'aerospace', headcount: '5000-plus' })
    expect(restored).not.toBeNull()
    // #4516.7 — une taille posée par l'utilisateur : le profil n'en propose même pas d'autre.
    expect(proposeProfileSize(restored!, { size: 'eti' }, false)).toBeNull()
    expect(restored!.headcount).toEqual(['1000+'])
  })

  it('pose `region=Occitanie` (libellé, casse et accents libres) comme le code INSEE du rail', () => {
    expect(restoredFiltersFromSearch({ sectors: 'aerospace', region: 'Occitanie' })?.region).toEqual(['76'])
    expect(restoredFiltersFromSearch({ region: 'ile-de-france,76' })?.region).toEqual(['11', '76'])
    expect(restoredFiltersFromSearch({ region: 'OCC,idf' })?.region).toEqual(['76', '11'])
    expect(restoredFiltersFromSearch({ region: 'Atlantide' })).toBeNull()
    expect(filtersFromSearch({ region: 'hauts de france' })?.region).toEqual(['32'])
  })
})

describe('#4632 — le lien de Bienvenue / Profil ESN (`mc_*`) pose ses critères DANS LE RAIL', () => {
  it('compétence, zone nommée et recours externe deviennent les champs du rail', () => {
    const restored = restoredFiltersFromSearch({
      mc_technology: 'Java',
      mc_location: 'Île-de-France',
      mc_esnOnly: 'true',
    })
    expect(restored).toEqual(
      expect.objectContaining({
        technologiesObserved: 'Java',
        keywords: 'Java',
        region: ['11'],
        externalRecourseObserved: true,
      }),
    )
  })

  it('une zone qui n’est pas une région du référentiel se pose comme une VILLE, jamais devinée en région', () => {
    expect(restoredFiltersFromSearch({ mc_location: 'Lyon' })).toEqual(
      expect.objectContaining({ city: 'Lyon', region: [] }),
    )
  })

  it('famille de rôles et écosystème ont désormais leur champ dans le rail', () => {
    expect(restoredFiltersFromSearch({ mc_roleFamily: 'Data', mc_esn: 'Capgemini' })).toEqual(
      expect.objectContaining({ roleFamilyObserved: 'Data', ecosystemObserved: 'Capgemini' }),
    )
  })

  it('un effectif minimum devient les tranches qui le couvrent — jamais une borne inventée', () => {
    expect(restoredFiltersFromSearch({ mc_technology: 'Java', mc_employeeMin: '1000' })).toEqual(
      expect.objectContaining({ headcount: ['1000+'] }),
    )
    expect(restoredFiltersFromSearch({ mc_technology: 'Java', mc_employeeMin: '250' })).toEqual(
      expect.objectContaining({ headcount: ['250-999', '1000+'] }),
    )
  })

  it('toute autre valeur que `"true"` laisse le recours externe décoché — jamais un booléen deviné', () => {
    expect(restoredFiltersFromSearch({ mc_location: 'Lyon', mc_esnOnly: 'yes' })).toEqual(
      expect.objectContaining({ externalRecourseObserved: false }),
    )
  })

  it('une clé native du rail gagne sur son ancienne jumelle `mc_*`', () => {
    expect(restoredFiltersFromSearch({ technologiesObserved: 'Python', mc_technology: 'Java' })).toEqual(
      expect.objectContaining({ technologiesObserved: 'Python' }),
    )
  })

  it('les deux champs neufs font l’aller-retour par l’URL', () => {
    const filters = { ...emptyUnifiedFilters(), roleFamilyObserved: 'Data', ecosystemObserved: 'Sopra' }
    expect(restoredFiltersFromSearch(searchFromFilters(filters))).toEqual(
      expect.objectContaining({ roleFamilyObserved: 'Data', ecosystemObserved: 'Sopra' }),
    )
  })
})
