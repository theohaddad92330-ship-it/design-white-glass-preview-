import { esnSuggestNeedle, rankEsnSuggestions, type EsnSuggestRow } from './esn-name-suggest'
import { normalizeEsnName } from './esn-normalize'

/**
 * #1887 — « je mets cap… ça nous met Capgemini ».
 *
 * Le classement est une fonction PURE, testée sans base : c'est lui qui décide
 * ce qu'un commercial voit en premier, et le vérifier à travers un SGBD ferait
 * dépendre la preuve d'un jeu de données de test.
 */
const row = (inputName: string, extra: Partial<EsnSuggestRow> = {}): EsnSuggestRow => ({
  inputName,
  normalizedName: normalizeEsnName(inputName),
  siren: null,
  headquartersCity: null,
  headcountRange: null,
  parentName: null,
  ...extra,
})

describe('#1887 — la suggestion de nom d’ESN', () => {
  describe('esnSuggestNeedle', () => {
    it('plie les accents ET la casse, comme la clé du référentiel', () => {
      // ⚠️ La leçon qui a coûté « aucune entreprise ne ressort » sur une
      // question qui en avait 19 : `ILIKE` plie la casse, JAMAIS les accents.
      // Les deux côtés passent donc par la MÊME normalisation.
      expect(esnSuggestNeedle('SOGÉTI')).toBe('sogeti')
      expect(esnSuggestNeedle('  Cap ')).toBe('cap')
      expect(esnSuggestNeedle('Sud-Ouest')).toBe('sud ouest')
    })

    it('rend une chaîne vide sous le minimum, pour qu’aucune requête ne parte', () => {
      expect(esnSuggestNeedle('c')).toBe('')
      expect(esnSuggestNeedle('   ')).toBe('')
      // Une frappe qui ne contient AUCUN caractère indexable ne suggère rien —
      // « -- » se normalise en chaîne vide, pas en « tout le référentiel ».
      expect(esnSuggestNeedle('--')).toBe('')
    })
  })

  describe('rankEsnSuggestions', () => {
    const referential = [
      row('Capgemini'),
      row('Capgemini Invent'),
      row('Capgemini Engineering'),
      row('Altran (Capgemini Engineering)'),
      row('Devoteam'),
    ]

    it('propose les noms du référentiel qui contiennent la frappe, le plus court d’abord', () => {
      const names = rankEsnSuggestions(referential, 'cap', 6).map(suggestion => suggestion.name)
      expect(names).toEqual([
        'Capgemini',
        'Capgemini Invent',
        'Capgemini Engineering',
        'Altran (Capgemini Engineering)',
      ])
    })

    it('fait passer le nom EXACT devant, puis le plus court — jamais l’ordre de la table', () => {
      // « Open » est le nom exact : il passe devant deux entrées qui COMMENCENT
      // pourtant par la frappe, quelle que soit sa place dans la liste reçue.
      // À rang égal, c'est la longueur qui départage — sans elle, l'ordre de
      // `esn_directory` déciderait de ce qu'on voit en premier.
      const names = rankEsnSuggestions([row('Open Groupe'), row('Open'), row('Openium')], 'open', 6).map(
        suggestion => suggestion.name,
      )
      expect(names).toEqual(['Open', 'Openium', 'Open Groupe'])
    })

    it('fait passer une TÊTE DE GROUPE devant un nom plus court sans déclinaison', () => {
      // Mesuré sur la vraie graine : « cap » rendait « Capco » (5 lettres) en
      // premier et « Capgemini » (9) en troisième — l'inverse exact de ce que
      // le retour demandait. « Capco » ne porte aucune déclinaison dans le
      // référentiel, « Capgemini » en porte quatre : c'est un fait DU
      // référentiel, pas une popularité inventée.
      const names = rankEsnSuggestions(
        [row('Capco'), row('Capgemini'), row('Capgemini Invent'), row('Capgemini France')],
        'cap',
        6,
      ).map(suggestion => suggestion.name)
      expect(names[0]).toBe('Capgemini')
      expect(names).toContain('Capco')
    })

    it('fait passer un début de MOT devant un fragment au milieu d’un mot', () => {
      // « SII Sud-Ouest » commence un mot par « sud » ; « Assudia » porte les
      // mêmes lettres au milieu d’un mot, et ne se lit pas comme une réponse.
      const names = rankEsnSuggestions([row('Assudia'), row('SII Sud-Ouest')], 'sud', 6).map(
        suggestion => suggestion.name,
      )
      expect(names).toEqual(['SII Sud-Ouest', 'Assudia'])
    })

    it('ne rend RIEN quand rien ne correspond — jamais l’entreprise tapée', () => {
      expect(rankEsnSuggestions(referential, 'zzzz', 6)).toEqual([])
      // Une frappe vide n’ouvre pas le référentiel entier.
      expect(rankEsnSuggestions(referential, '', 6)).toEqual([])
    })

    it('borne la liste au nombre demandé', () => {
      expect(rankEsnSuggestions(referential, 'cap', 2).map(suggestion => suggestion.name)).toEqual([
        'Capgemini',
        'Capgemini Invent',
      ])
    })

    it('porte les faits qui DÉPARTAGENT deux entrées proches, et rien d’autre', () => {
      const [suggestion] = rankEsnSuggestions(
        [
          row('Capgemini', {
            siren: '330703844',
            headquartersCity: 'Paris',
            headcountRange: '5000 et plus',
            parentName: null,
          }),
        ],
        'cap',
        6,
      )
      expect(suggestion).toEqual({
        name: 'Capgemini',
        normalizedName: 'capgemini',
        siren: '330703844',
        city: 'Paris',
        headcountRange: '5000 et plus',
        parentName: null,
      })
    })

    it('propose une entrée NON RÉSOLUE avec son seul nom, sans inventer ses faits', () => {
      // 477 noms ont été semés sans SIREN ni ville. Les écarter ferait
      // disparaître des ESN réelles de la suggestion ; les compléter serait
      // une donnée fictive. Elles se proposent nues.
      const [suggestion] = rankEsnSuggestions([row('Karytis')], 'kary', 6)
      expect(suggestion).toEqual({
        name: 'Karytis',
        normalizedName: 'karytis',
        siren: null,
        city: null,
        headcountRange: null,
        parentName: null,
      })
    })
  })
})
