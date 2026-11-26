import { render, screen } from '@testing-library/react'
import { StructuredReply } from './StructuredReply'

/**
 * #3763 (BEL-LAU-1007) — dense au niveau 1, dépliable au niveau 2, sans jamais
 * cacher une information critique.
 */
const REPLY = [
  '## Verdict',
  'Commence par Alpha.',
  '',
  '## Pourquoi',
  'Un appel d’offres est ouvert.',
  '',
  'Preuve détaillée : deux sources concordent.',
  '',
  '## Ce qui manque',
  'Le budget n’est pas confirmé.',
  '',
  '## Prochaine action',
  'Appeler le DSI.',
  '',
  '## Sources',
  'Annonce publique du 12/09.',
  '',
  '## Limites de cette analyse',
  'Périmètre : département 34 uniquement.',
  '',
  '## Cartographie Montpellier',
  'Neuf comptes retenus.',
].join('\n')

describe('StructuredReply — progressive disclosure (#3763)', () => {
  it('niveau 1 : verdict, raison courte, réserves, prochaine action et contenu inconnu sont visibles', () => {
    render(<StructuredReply text={REPLY} />)
    expect(screen.getByText('Commence par Alpha.')).toBeVisible()
    expect(screen.getByText('Un appel d’offres est ouvert.')).toBeVisible()
    expect(screen.getByText('Le budget n’est pas confirmé.')).toBeVisible()
    expect(screen.getByText('Appeler le DSI.')).toBeVisible()
    expect(screen.getByText('Neuf comptes retenus.')).toBeVisible()
  })

  it('#5044 — aucun repli dans le corps : ni bouton, ni sources, ni limites, ni preuve du Pourquoi', () => {
    render(<StructuredReply text={REPLY} />)
    expect(screen.queryByText('Preuve détaillée : deux sources concordent.')).toBeNull()
    expect(screen.queryByText('Annonce publique du 12/09.')).toBeNull()
    expect(screen.queryByText('Périmètre : département 34 uniquement.')).toBeNull()
    expect(screen.queryByRole('button', { name: /Voir/ })).toBeNull()
    expect(screen.queryByText('Sources')).toBeNull()
  })

  it('une réponse sans détail n’ajoute aucun bouton', () => {
    render(<StructuredReply text={'## Verdict\nGo.\n\n## Pourquoi\nUne raison.'} />)
    expect(screen.queryByRole('button', { name: /Voir/ })).toBeNull()
  })

  /**
   * #3763.5 (reste du lot J19) — LE CAS DE LA CAPTURE : une réponse
   * EXPLICATIVE (ni carte, ni conseil, ni plan) qu'aucune section connue ne
   * couvrait avant ce lot. « Résumé » et « Réserves » restent au NIVEAU 1
   * (jamais une information critique cachée) ; « Sources » se plie — il n'a
   * besoin d'aucune entrée dédiée : `detailKindOf` le reconnaissait déjà, il
   * lui manquait seulement une section SŒUR reconnue pour déclencher le mode
   * carte.
   */
  it('niveau 1 / niveau 2 pour une réponse EXPLICATIVE : résumé et réserves visibles, sources hors du corps (#3763.5, #5044)', () => {
    const explicative = [
      '**Résumé :** La cartographie est partielle.',
      "**Pourquoi :** Elle couvre les comptes enregistrés dans l'espace sur le département 34.",
      '**Réserves :** Les comptes hors de ce périmètre ne sont pas mesurés.',
      '**Sources :** Registre public des entreprises, consulté ce jour.',
    ].join('\n')
    render(<StructuredReply text={explicative} />)
    expect(screen.getByText('La cartographie est partielle.')).toBeVisible()
    expect(screen.getByText('Les comptes hors de ce périmètre ne sont pas mesurés.')).toBeVisible()
    expect(screen.queryByText('Registre public des entreprises, consulté ce jour.')).toBeNull()
    expect(screen.queryByRole('button', { name: /Voir/ })).toBeNull()
  })
})
