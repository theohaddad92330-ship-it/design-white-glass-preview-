import { describe, expect, it } from 'vitest'
import { Route } from './$id'

/**
 * #4602 — `/accounts/duplicates` rendait « Compte introuvable » : le segment était avalé par `/accounts/$id` et lu comme
 * un identifiant. Une adresse qui n'est pas un identifiant de compte dit la vérité — « Page introuvable » — au lieu
 * de lancer la recherche d'un compte qui n'existe pas. Rien ne génère cette adresse (le tri des doublons vit dans
 * `/contacts`, ancre `hygiene-doublons`).
 */
function beforeLoadOf(id: string): unknown {
  const beforeLoad = Route.options.beforeLoad as unknown as (ctx: { params: { id: string } }) => void
  try {
    beforeLoad({ params: { id } })
  } catch (thrown) {
    return thrown
  }
  return undefined
}

describe('/accounts/$id — un segment qui n’est pas un identifiant', () => {
  it.each(['duplicates', 'doublons', 'nouveau'])('« %s » est introuvable, pas « compte introuvable »', id => {
    expect(beforeLoadOf(id)).toMatchObject({ isNotFound: true })
  })

  it.each(['7c9e6679-7425-40de-944b-e07fc1f90ae7', 'acc-1', '42'])('« %s » reste un identifiant de compte', id => {
    expect(beforeLoadOf(id)).toBeUndefined()
  })
})
