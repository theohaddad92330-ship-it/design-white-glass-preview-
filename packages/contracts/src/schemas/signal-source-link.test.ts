import { describe, expect, it } from 'vitest'
import { resolveSignalSourceLink } from './signal-source-link.js'

/**
 * #3922 (lot Q02, recette prod 09/10 soir) — un lien de PRESSE (frenchweb) était libellé
 * « Voir la page officielle » : la veille portait `source_kind: 'official'` sur un article.
 * Le libellé suit ce que l'URL est RÉELLEMENT : « page officielle » ne s'écrit que sur un
 * domaine officiel connu ; ailleurs, le libellé neutre « Voir la source » (jamais une
 * qualité que l'on ne sait pas).
 */
describe('#3922 — le type de source du lien suit l’URL', () => {
  it('un article de presse marqué « officiel » n’est PAS une page officielle', () => {
    const link = resolveSignalSourceLink({
      url: 'https://www.frenchweb.fr/societe-generale-lance-un-programme/456789',
      source_kind: 'official',
    })
    expect(link).toEqual({
      kind: 'link',
      url: 'https://www.frenchweb.fr/societe-generale-lance-un-programme/456789',
      sourceKind: 'other',
    })
  })

  it('sait dire OUI : un domaine officiel garde « page officielle »', () => {
    for (const url of [
      'https://annuaire-entreprises.data.gouv.fr/entreprise/552120222',
      'https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:A202600001',
      'https://www.insee.fr/fr/statistiques/1234',
      'https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=x',
    ]) {
      expect(resolveSignalSourceLink({ url, source_kind: 'official' })).toMatchObject({ sourceKind: 'official' })
    }
  })

  it('la salle de démo (hôte réservé example.org) garde le genre déclaré', () => {
    expect(
      resolveSignalSourceLink({ url: 'https://example.org/demo/official/sg-registre', source_kind: 'official' }),
    ).toMatchObject({ sourceKind: 'official' })
  })

  it('un domaine qui TERMINE comme un officiel sans l’être (gouv.fr.evil.com) n’est pas officiel', () => {
    expect(
      resolveSignalSourceLink({ url: 'https://www.gouv.fr.evil.example/x', source_kind: 'official' }),
    ).toMatchObject({ sourceKind: 'other' })
  })

  it('les autres types ne bougent pas : presse, offre, annonce, appel d’offres', () => {
    for (const kind of ['press', 'job', 'bodacc', 'tender'] as const) {
      expect(resolveSignalSourceLink({ url: 'https://www.frenchweb.fr/a', source_kind: kind })).toMatchObject({
        sourceKind: kind,
      })
    }
  })

  it('sans URL http(s), aucun lien ; type inconnu = « other »', () => {
    expect(resolveSignalSourceLink({ url: 'ftp://x', source_kind: 'press' })).toEqual({ kind: 'none' })
    expect(resolveSignalSourceLink({ url: 'https://a.fr/x', source_kind: 'zzz' })).toMatchObject({
      sourceKind: 'other',
    })
  })
})
