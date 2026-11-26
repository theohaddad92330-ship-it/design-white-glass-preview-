import { describe, expect, it } from 'vitest'
import { decrireConsequenceSuspension } from './suspend-consequence'

const espace = (name: string, role: string): { id: string; name: string; role: string } => ({ id: name, name, role })

describe('la confirmation de suspension NOMME la conséquence (#1664)', () => {
  it('n’est pas une question — le titre porte le geste et sa cible', () => {
    // « Êtes-vous sûr ? » est exactement ce que l'issue refuse.
    const c = decrireConsequenceSuspension('Marc Dupont', [], false)
    expect(c.titre).toBe('Suspendre Marc Dupont.')
    expect(c.titre).not.toContain('?')
  })

  it('dit ce qui s’ARRÊTE et ce qui SURVIT — les deux moitiés, pas une', () => {
    const c = decrireConsequenceSuspension('Marc Dupont', [espace('Skaizen', 'owner')], false)
    expect(c.arrete.length).toBeGreaterThan(0)
    expect(c.survit.length).toBeGreaterThan(0)
    expect(c.survit.join(' ')).toContain('Ses actions restent attribuées à lui')
  })

  it('dit que l’espace d’un PROPRIÉTAIRE survit — c’est ce qui distingue la suspension de la suppression', () => {
    // ⚠️ Le seul vrai risque de cet écran : confondre les deux gestes. Supprimer
    // le propriétaire d'un espace emporte l'espace ENTIER par cascade
    // (`delete-user-consequence.ts`) ; le suspendre n'emporte rien.
    const c = decrireConsequenceSuspension('Marc Dupont', [espace('Skaizen', 'owner')], false)
    const survit = c.survit.join(' ')
    expect(survit).toContain('Skaizen')
    expect(survit).toContain('propriétaire')
    expect(survit).toContain('SUPPRESSION')
  })

  it('nomme plusieurs espaces possédés avec un « et », et accorde le verbe', () => {
    const c = decrireConsequenceSuspension('Marc', [espace('Skaizen', 'owner'), espace('Alterway', 'owner')], false)
    const survit = c.survit.join(' ')
    expect(survit).toContain('Skaizen et Alterway')
    expect(survit).toContain('continuent')
  })

  it('distingue une adhésion simple d’une propriété', () => {
    const c = decrireConsequenceSuspension('Marc', [espace('Neovance', 'member')], false)
    const survit = c.survit.join(' ')
    expect(survit).toContain('Son adhésion à Neovance reste')
    expect(survit).not.toContain('propriétaire')
  })

  it('une personne SANS espace ne fait pas apparaître de phrase vide', () => {
    const c = decrireConsequenceSuspension('Marc', [], false)
    expect(c.survit.every(phrase => phrase.trim().length > 0)).toBe(true)
    expect(c.survit.join(' ')).not.toContain('propriétaire')
  })

  it('la RÉVERSIBILITÉ est dite — c’est le mot qui la sépare de la suppression', () => {
    const c = decrireConsequenceSuspension('Marc', [], false)
    expect(c.reversibilite).toContain('Réversible')
  })

  it('la réactivation a sa propre phrase, et elle ne parle pas de suspendre', () => {
    const c = decrireConsequenceSuspension('Marc Dupont', [espace('Skaizen', 'owner')], true)
    expect(c.titre).toBe('Réactiver Marc Dupont.')
    expect(c.arrete.join(' ')).toContain('blocage de connexion est levé')
    expect(c.survit.join(' ')).toContain('Rien d’autre ne change')
  })
})
