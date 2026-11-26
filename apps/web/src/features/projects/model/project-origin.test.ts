import { describe, expect, it } from 'vitest'
import type { ProjectRow } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { describeOrigin } from './project-provenance'

// #4336.1 — UNE règle, UN libellé : la carte, la table et la fiche lisent cette fonction.
const row = (source: string | null): ProjectRow => ({ id: 'p', source }) as unknown as ProjectRow

describe('describeOrigin', () => {
  it.each([
    ['fr', 'manual', 'Saisi à la main'],
    ['en', 'manual', 'Entered by hand'],
    ['fr', 'BOAMP', "Appel d'offres public"],
    ['fr', 'import', 'Fichier importé'],
  ])('%s : « %s » se lit « %s »', async (language, source, expected) => {
    await i18n.loadNamespaces('projects')
    expect(describeOrigin(row(source), i18n.getFixedT(language, 'projects'))).toBe(expected)
  })

  it('une source stockée hors nomenclature est rendue telle quelle', async () => {
    await i18n.loadNamespaces('projects')
    expect(describeOrigin(row('Les Échos'), i18n.getFixedT('fr', 'projects'))).toBe('Les Échos')
  })

  it.each([null, '', '   '])('source absente (%j) : AUCUNE valeur, jamais « inconnue »', async source => {
    await i18n.loadNamespaces('projects')
    expect(describeOrigin(row(source), i18n.getFixedT('fr', 'projects'))).toBeNull()
  })
})
