import { describe, expect, it } from 'vitest'
import { buildNeedLine, signalDiscardReason, signalNeedKind } from './watchlist'

/** #4088.11 — le TYPE structuré prime, un libellé ambigu ne classe pas (cas réels vus en prod le 13/10). */
describe('#4088.11 — classification du « pourquoi »', () => {
  const LATECOERE = 'Le chiffre d’affaires du premier semestre 2026 dépasse 430 millions d’euros, en hausse de 15 %'
  const SOCGEN = 'De Treezor à BoursoBank, SOCIETE GENERALE redessine ses priorités numériques'
  const item = (type: string, label: string) => ({ signalType: type, signalLabel: label })

  it.each([
    ['croissance', LATECOERE],
    ['investissement', LATECOERE],
    ['budget', LATECOERE],
    ['acquisition', SOCGEN],
    ['Rachat', SOCGEN],
  ])('NON : type « %s » + titre réel ambigu → aucun besoin', (type, label) => {
    expect(signalNeedKind(type, label)).toBeNull()
    expect(buildNeedLine(item(type, label))).toBeNull()
  })

  it.each([
    ['croissance', LATECOERE],
    ['investissement', LATECOERE],
    ['budget', LATECOERE],
  ])('Latécoère (type « %s ») : +15 % est un chiffre marquant → GARDÉ (#4088.11, Louis 15/10)', (type, label) => {
    expect(signalDiscardReason(item(type, label), undefined)).toBeNull()
  })

  // #4088.11 (Louis 15/10) — résultats périodiques écartés SAUF chiffre marquant ; rachat/fusion toujours gardés.
  it.each([
    ['croissance', 'Le chiffre d’affaires du premier semestre 2026 atteint 430 millions d’euros, en hausse de 4 %'],
    ['budget', 'Résultats trimestriels : un chiffre d’affaires stable à 120 M€'],
  ])('résultat périodique SANS chiffre marquant → écarté (« %s »)', (type, label) => {
    expect(signalDiscardReason(item(type, label), undefined)).toBe('general')
  })

  it.each([
    ['croissance', 'Résultats semestriels : le chiffre d’affaires recule de 12 %'],
    ['budget', 'Résultats annuels : un plan d’économies de 80 M€ annoncé'],
    ['budget', 'Résultats du T2 : avertissement sur résultats, objectifs révisés'],
    ['croissance', 'Résultats trimestriels : profit warning du groupe'],
  ])('résultat périodique AVEC chiffre marquant → gardé (« %s »)', (type, label) => {
    expect(signalDiscardReason(item(type, label), undefined)).toBeNull()
  })

  it('rachat / fusion : toujours gardés, même collés à des résultats périodiques', () => {
    expect(
      signalDiscardReason(item('acquisition', 'Résultats semestriels stables ; X rachète la société Y'), undefined),
    ).toBeNull()
    expect(signalDiscardReason(item('fusion', 'Comptes annuels 2025 : fusion avec Z annoncée'), undefined)).toBeNull()
  })

  it('SocGen : ni classé « rachat », ni écarté — reste affiché sans phrase', () => {
    expect(signalDiscardReason(item('acquisition', SOCGEN), undefined)).toBeNull()
  })

  it.each([
    ['acquisition', 'Capgemini rachète WNS pour 3,3 Md$', 'mna'],
    ['acquisition', 'X acquiert la start-up Y', 'mna'],
    ['Fusion', 'Fusion avec son concurrent annoncée', 'mna'],
    ['levee_fonds', 'Série B annoncée', 'funding'],
    ['croissance', 'Nordia lève 20 M€ auprès de fonds', 'funding'],
    ['investissement', 'Tour de table de 15 M€ bouclé', 'funding'],
    ['Recrutement', 'Recrute 12 data engineers', 'hiring'],
    ['appel_offres', 'AO SI', 'tender'],
    ['Nomination', 'Nouveau DSI', 'exec'],
  ])('positif : %s « %s » → %s', (type, label, kind) => {
    expect(signalNeedKind(type, label)).toBe(kind)
  })

  it('repli : type non mappé mais libellé explicite → classé', () => {
    expect(signalNeedKind('actualité', 'Alpha rachète Beta')).toBe('mna')
    expect(signalNeedKind('actualité', 'Alpha lève 10 M€')).toBe('funding')
  })

  // #4088.11 — cas réels de la recette du 13/10 (prod + démo) : un cas = une ligne.
  it.each([
    ['Veolia', 'acquisition', 'Veolia : résultats semestriels 2026 en progression'],
    ['Veolia', 'rachat', 'Résultats semestriels de Veolia'],
    ['Société Générale (démo)', 'acquisition', 'Résultats du deuxième trimestre 2026 en forte hausse'],
    ['Société Générale (démo)', 'Rachat', 'Résultats du T2 2026 en forte hausse'],
  ])('%s : « résultats » (type %s) n’est JAMAIS un rachat, et est écarté', (_n, type, label) => {
    expect(signalNeedKind(type, label)).toBeNull()
    expect(signalDiscardReason(item(type, label), undefined)).toBe('general')
  })

  it.each([
    ['acquisition', 'Le CH de Valenciennes attribue le marché cybersécurité'],
    ['acquisition', 'Marché cybersécurité attribué au CH de Valenciennes'],
    ['contrat', 'Consultation lancée pour la supervision SOC'],
  ])('CH de Valenciennes : marché attribué (type %s) → appel d’offres, pas rachat', (type, label) => {
    expect(signalNeedKind(type, label)).toBe('tender')
  })

  it.each([
    ['croissance', 'Aucune offre d’emploi publiée récemment'],
    ['Levée de fonds', 'Aucune offre d’emploi détectée'],
    ['recrutement', 'Aucune offre d’emploi en cours chez Capital Recrutement'],
    ['investissement', 'Aucune actualité récente trouvée'],
  ])('« Aucune offre… » (type %s) n’est pas un signal : aucun besoin, écarté', (type, label) => {
    expect(signalNeedKind(type, label)).toBeNull()
    expect(signalDiscardReason(item(type, label), undefined)).toBe('general')
  })

  it.each([
    ['projet', 'Plan Trust the Future : Orange mise sur la croissance'],
    ['projet', 'Kiabi veut doubler son chiffre d’affaires et ses effectifs'],
    ['contrat', 'Plan stratégique 2030 : cap sur la transformation'],
  ])('plan stratégique (type %s) → croissance, JAMAIS appel d’offres', (type, label) => {
    expect(signalNeedKind(type, label)).not.toBe('tender')
  })

  it('un projet sans déclencheur d’appel d’offres ne dit pas « appel d’offres »', () => {
    expect(signalNeedKind('projet', 'Refonte du SI annoncée')).toBeNull()
    expect(signalNeedKind('projet', 'Appel d’offres pour la refonte du SI')).toBe('tender')
  })

  it.each(['restructuration', 'recours_externe'])('« %s » reste affiché (ni écarté, ni classé)', type => {
    expect(signalDiscardReason(item(type, 'Plan de transformation du SI'), undefined)).toBeNull()
  })
})

// #4283.1 — un TYPE « nomination / dirigeant » ne vaut « Nouveau dirigeant » que si le libellé porte un changement de dirigeant.
describe('#4283.1 — garde-fou « Nouveau dirigeant »', () => {
  it.each([
    "Nvidia et Doctolib s'associent",
    'Une commande de 12 avions pour Airbus',
    'Un nouveau câble sous-marin pour Orange',
  ])('type « Nomination » + « %s » → aucun besoin, écarté (jamais supprimé)', label => {
    expect(signalNeedKind('Nomination', label)).toBeNull()
    expect(signalDiscardReason({ signalType: 'Nomination', signalLabel: label }, undefined)).toBe('general')
  })

  it.each([
    ['Nomination', 'Nouveau DSI chez X'],
    ['dirigeant', 'Marie Durand rejoint Thales comme directrice des systèmes d’information'],
    ['nomination', 'Jean Martin succède à Paul Roux à la tête du groupe'],
  ])('sait dire NON : « %s » + « %s » reste exec', (type, label) => {
    expect(signalNeedKind(type, label)).toBe('exec')
    expect(signalDiscardReason({ signalType: type, signalLabel: label }, undefined)).toBeNull()
  })

  it('sans libellé, le type seul garde sa lecture', () => {
    expect(signalNeedKind('Nomination')).toBe('exec')
  })
})
