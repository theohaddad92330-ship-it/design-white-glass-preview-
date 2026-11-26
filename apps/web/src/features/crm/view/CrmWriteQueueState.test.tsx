import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
// L'état « aucun CRM branché » porte un lien vers Intégrations : sans routeur,
// `<Link>` lève avant même que la phrase soit rendue. Les états qui ne rendent
// AUCUN lien se montent, eux, sans routeur — et c'est délibéré : le routeur
// monte son arbre de façon asynchrone, si bien qu'un `container.textContent`
// lu juste après `renderWithRouter` est vide QUOI QU'IL ARRIVE. Trois
// assertions « ne rend rien » écrites ainsi seraient borgnes.
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CrmWriteQueueState } from './CrmWriteQueueState'

/**
 * #2201.51 — ce que la redirection de `/actions/ecritures` a dû EMPORTER.
 *
 * L'écran retiré disait trois états. Les assertions ci-dessous sont celles de
 * `CrmWriteRequestsPage.test.tsx` (supprimé avec l'écran) : la redirection ne
 * vaut que si la capacité entière a déménagé — « ne pas retirer une capacité
 * en croyant la déplacer » (#1508).
 */
describe('CrmWriteQueueState — « aucun CRM branché » ne se lit PAS comme « rien à valider »', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('NOMME le connecteur absent, et propose de le brancher', async () => {
    renderWithRouter(<CrmWriteQueueState status="not_connected" unread={false} />)

    expect(await screen.findByText('Aucun CRM branché')).toBeInTheDocument()
    expect(screen.getByText('Brancher mon CRM')).toBeInTheDocument()
    expect(screen.queryByText('Rien n’attend ta validation')).not.toBeInTheDocument()
  })

  it('distingue « capacité fermée » de « connecteur absent »', () => {
    // TÉMOIN du harnais : ce cas ne porte aucun lien, donc il se monte sans
    // routeur — et il PROUVE que `container.textContent` sait être non vide
    // ici. Les trois assertions « ne rend rien » qui suivent ne mesureraient
    // rien sans lui.
    const { container } = render(<CrmWriteQueueState status="not_configured" unread={false} />)

    expect(container.textContent).toContain('Écriture CRM indisponible')
    expect(container.textContent).not.toContain('Aucun CRM branché')
    // Rien à brancher : l'environnement n'ouvre pas la capacité.
    expect(container.textContent).not.toContain('Brancher mon CRM')
  })

  it('n’affirme RIEN tant que la file n’a pas été lue — ni file vide, ni CRM absent', () => {
    const { container } = render(<CrmWriteQueueState status={undefined} unread />)

    expect(container.textContent).toBe('')
  })

  it('n’affirme RIEN non plus quand la lecture a ÉCHOUÉ alors qu’un statut traînait', () => {
    // `unread` porte AUSSI l'erreur : un verdict tiré d'une lecture qui n'a pas
    // abouti est pire que pas de verdict.
    const { container } = render(<CrmWriteQueueState status="not_connected" unread />)

    expect(container.textContent).toBe('')
  })

  // #4714.4 — l'écran DIT ce qui part sans clic (garde #4714.2 / c147 : la synchro remplit un champ VIDE).
  it('file lisible et branchée : dit ce qui part SANS clic et ce qui attend une prévisualisation (fr)', () => {
    const { container } = render(<CrmWriteQueueState status="ready" unread={false} />)

    expect(container.textContent).toContain('sans clic')
    expect(container.textContent).toContain('e-mail')
    expect(container.textContent).toContain('téléphone')
    expect(container.textContent).toContain('vides')
    expect(container.textContent).toContain('prévisualisation')
  })

  it('le même texte existe en anglais, distinct du français', async () => {
    await i18n.changeLanguage('en')
    const { container } = render(<CrmWriteQueueState status="ready" unread={false} />)

    expect(container.textContent).toContain('without a click')
    expect(container.textContent).toContain('empty')
    expect(container.textContent).not.toContain('sans clic')
  })

  it('ne l’affirme pas quand la file n’a pas été lue', () => {
    const { container } = render(<CrmWriteQueueState status="ready" unread />)

    expect(container.textContent).toBe('')
  })
})
