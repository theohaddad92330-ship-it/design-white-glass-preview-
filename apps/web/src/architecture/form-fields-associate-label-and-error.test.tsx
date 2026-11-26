import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FormField, FormTextareaField } from '@bellum/ui'

/**
 * GA-374 — un champ de formulaire garde son label et son erreur PARLANTS
 * (#2436.5, #2436.15).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ
 * ─────────────────────────────────────────────────────────────────────────
 * `FormField`/`FormTextareaField` (`packages/ui/src/components/form-field.tsx`)
 * sont le SEUL appelant partagé de tous les formulaires du produit — connexion,
 * inscription, mot de passe oublié (`LoginForm.tsx`, `SignupForm.tsx`,
 * `ForgotPasswordPage.tsx`, `EmailCodeLoginForm.tsx`…). Avant ce lot :
 *
 *   1. `<Label>` rendait le texte du libellé, `<Component>` (l'`<Input>`)
 *      était son FRÈRE, jamais son enfant, et aucun des deux ne portait
 *      `htmlFor`/`id`. Un clic sur le libellé ne donnait pas le focus au
 *      champ, et un lecteur d'écran qui atterrit sur l'input n'annonce AUCUN
 *      nom — juste « champ de saisie ». `getByLabelText` échouait sur les
 *      DOUZE appelants du dépôt, silencieusement : le texte était bien à
 *      l'écran, jamais RELIÉ.
 *   2. `aria-invalid={!!error}` était posé, mais le message d'erreur n'avait
 *      ni `id` ni `role`, et l'input ne portait aucun `aria-describedby` : un
 *      lecteur d'écran annonce « invalide », jamais LA RAISON. Une erreur non
 *      dite au clavier n'est pas une erreur précise (#2436.15) — c'est un état
 *      qui ne raconte rien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle ne rejoue pas une vraie saisie clavier (Tab, frappe) : ce niveau-là
 * reste un test humain (#2436.17). Elle prouve seulement que le DOM produit
 * porte l'association et l'annonce — ce qu'un lecteur d'écran lit dépend
 * ensuite de lui, pas de nous.
 */
describe('GA-374 — FormField associe label et erreur au champ', () => {
  it('le libellé retrouve le champ par `getByLabelText` — association programmatique, pas seulement visuelle', () => {
    render(<FormField label="Adresse e-mail" inputProps={{ value: '', onChange: vi.fn(), name: 'email' }} />)

    const field = screen.getByLabelText('Adresse e-mail')
    expect(field).toBeInstanceOf(HTMLInputElement)
  })

  it('la même association tient pour `FormTextareaField`', () => {
    render(<FormTextareaField label="Message" inputProps={{ value: '', onChange: vi.fn(), name: 'message' }} />)

    expect(screen.getByLabelText('Message')).toBeInstanceOf(HTMLTextAreaElement)
  })

  it('une erreur est ANNONCÉE (`role="alert"`) ET reliée au champ par `aria-describedby`', () => {
    render(
      <FormField
        label="Adresse e-mail"
        error="Cette adresse n'est pas valide"
        inputProps={{ value: 'x', onChange: vi.fn(), name: 'email' }}
      />,
    )

    const field = screen.getByLabelText('Adresse e-mail')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Cette adresse n'est pas valide")
    // #2436.15 — le lien est vérifié par ID, pas par proximité visuelle : deux
    // paragraphes côte à côte à l'écran ne prouvent rien à un lecteur d'écran.
    expect(field.getAttribute('aria-describedby')).toBe(alert.id)
    expect(alert.id).toBeTruthy()
  })

  it('sans erreur, la description reste reliée de la même façon (aucune régression sur le cas nominal)', () => {
    render(
      <FormField
        label="Adresse e-mail"
        description="Utilisée pour la facturation"
        inputProps={{ value: '', onChange: vi.fn(), name: 'email' }}
      />,
    )

    const field = screen.getByLabelText('Adresse e-mail')
    const description = screen.getByText('Utilisée pour la facturation')
    expect(field.getAttribute('aria-describedby')).toBe(description.id)
  })
})
