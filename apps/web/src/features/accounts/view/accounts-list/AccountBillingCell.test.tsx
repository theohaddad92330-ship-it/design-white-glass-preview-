import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountBillingCell } from './AccountBillingCell'
import type { AccountBillingLens } from './useAccountBillingLens'

const ACCOUNT = '11111111-1111-4111-8111-111111111111'

function lens(over: Partial<AccountBillingLens> = {}): AccountBillingLens {
  return { failed: false, loading: false, get: () => null, ...over }
}

afterEach(cleanup)

describe('AccountBillingCell — « peut-on facturer ce client ? »', () => {
  it('annonce « prêt à facturer » quand aucun bloqueur ne reste', async () => {
    renderWithRouter(
      <AccountBillingCell
        accountId={ACCOUNT}
        lens={lens({ get: () => ({ state: 'ready', blockers: [], profile: null }) })}
      />,
    )
    expect(await screen.findByText(/Prêt à facturer/i)).toBeTruthy()
  })

  /**
   * ⚠️ LE DÉFAUT QUE CE TEST EMPÊCHE. Une lecture en échec et un dossier complet
   * se ressemblent : ni l'un ni l'autre n'a de bloqueur à montrer. Si l'échec
   * tombait dans la branche « prêt », l'écran annoncerait en vert « ce client
   * est facturable » sur une panne — le mensonge le plus cher possible ici.
   */
  it('ne dit JAMAIS « prêt » quand la lecture a échoué', async () => {
    renderWithRouter(<AccountBillingCell accountId={ACCOUNT} lens={lens({ failed: true })} />)
    expect(await screen.findByText(/Non chargé/i)).toBeTruthy()
    expect(screen.queryByText(/Prêt à facturer/i)).toBeNull()
  })

  it('ne dit rien du tout pendant le chargement — ni prêt, ni bloqué', async () => {
    // ⚠️ Le TÉMOIN est indispensable. Le routeur rend de façon asynchrone : sans
    // lui, « rien n'est affiché » serait vrai avant même que le composant ait
    // été monté, et le test passerait sur n'importe quel rendu — y compris un
    // badge vert « prêt » affiché une seconde plus tard.
    renderWithRouter(
      <div>
        <span>témoin monté</span>
        <AccountBillingCell accountId={ACCOUNT} lens={lens({ loading: true })} />
      </div>,
    )
    const witness = await screen.findByText('témoin monté')
    expect(witness.parentElement?.textContent).toBe('témoin monté')
  })

  it('NOMME chaque bloqueur, plutôt qu’un « non facturable » muet', async () => {
    renderWithRouter(
      <AccountBillingCell
        accountId={ACCOUNT}
        lens={lens({ get: () => ({ state: 'blocked', blockers: ['missing_billing_entity'], profile: null }) })}
      />,
    )
    expect(await screen.findByText(/Aucune entité de facturation/i)).toBeTruthy()
  })

  /**
   * « Un indicateur de qualité qui ne mène nulle part ne sert à rien » : le
   * bloqueur structurel mène à la FICHE du compte, pas à la liste — y renvoyer
   * ferait recommencer la recherche.
   */
  it('mène chaque bloqueur structurel vers la fiche DU compte, et ça se tabule', async () => {
    renderWithRouter(
      <AccountBillingCell
        accountId={ACCOUNT}
        lens={lens({ get: () => ({ state: 'blocked', blockers: ['unknown_payment_terms'], profile: null }) })}
      />,
    )
    const link = await screen.findByRole('link', { name: /Conditions de règlement inconnues/i })
    expect(link.getAttribute('href')).toContain(`/accounts/${ACCOUNT}`)
  })

  it('mène le bon de commande vers les missions — c’est là qu’il se saisit', async () => {
    renderWithRouter(
      <AccountBillingCell
        accountId={ACCOUNT}
        lens={lens({ get: () => ({ state: 'blocked', blockers: ['missing_po'], profile: null }) })}
      />,
    )
    const link = await screen.findByRole('link', { name: /Bon de commande/i })
    expect(link.getAttribute('href')).toContain('/missions')
  })

  /** Une ligne de tableau qui devient un paragraphe n'est plus lue — mais le
   *  reste se COMPTE, il ne disparaît pas en silence. */
  it('borne à deux bloqueurs affichés et compte le reste', async () => {
    renderWithRouter(
      <AccountBillingCell
        accountId={ACCOUNT}
        lens={lens({
          get: () => ({
            state: 'blocked',
            blockers: ['missing_billing_contact', 'missing_po', 'expired_contract', 'unknown_payment_terms'],
            profile: null,
          }),
        })}
      />,
    )
    await screen.findByText(/Aucun contact de facturation/i)
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByText(/\+2/)).toBeTruthy()
  })
})
