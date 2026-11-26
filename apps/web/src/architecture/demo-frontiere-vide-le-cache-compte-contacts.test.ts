/**
 * #3788.6 — LA FRONTIÈRE DÉMO ↔ RÉEL VIDE LE SCROLL INFINI DES COMPTES ET DES
 * CONTACTS, DANS LES DEUX SENS.
 *
 * Recette prod du 08/10 (91b246b671) : un navigateur portant une session
 * RÉELLE (cookie), puis « Lancer la démo » — sous le personnage démo, /accounts
 * listait les comptes RÉELS (« Responsable : Louis Schlegel »), un clic rendait
 * « Compte introuvable », /contacts disait « Aucun contact » alors que l'accueil
 * en annonçait 38. Cause : `useAccountsStore`/`useContactsStore`
 * (`features/accounts/store`, `features/contacts/store`) persistent leur page
 * courante en **localStorage**, partagé par TOUT l'origine — contrairement au
 * cache react-query, qui est scopé par l'identité d'onglet
 * (`tanstack-persister.ts`, `query-client:${readTabIdentity()}`). Les DEUX
 * entrées en démo (`DemoEntryPage.enterDemo`, `useDemoAccessForm.onSubmit`)
 * vidaient SEULEMENT l'instantané IndexedDB scopé (`clearPersistedQueryCache`),
 * jamais ce cache-là ; les DEUX sorties (`useExitDemo`, `useCloseDemoOnLogin`)
 * ne vidaient que react-query (`qc.clear()`). Le même mécanisme que le
 * changement d'espace (`useWorkspaces.ts`, GA-43) répare les deux sens :
 * `clearVolatileUserState` (GA-26 : un réglage vit à un seul endroit).
 *
 * La garde tient un fait, sur le code (commentaires retirés) : CHACUN des
 * quatre franchissements de frontière appelle `clearVolatileUserState`. Elle
 * SAIT DIRE NON (un appel qui l'omet est refusé) et LIT quelque chose (les
 * quatre fichiers, en entier).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

const COMMENTAIRE_BLOC = /\/\*[\s\S]*?\*\//g
const COMMENTAIRE_LIGNE = /(^|[^:'"`])\/\/.*$/gm
const sansCommentaires = (source: string) =>
  source.replace(COMMENTAIRE_BLOC, ' ').replace(COMMENTAIRE_LIGNE, (_tout, avant: string) => avant)

/** Les quatre endroits où un onglet change d'identité entre démo et réel. */
const FRONTIERES = [
  { label: 'entrée — lien direct (lead connu)', path: 'features/demo/view/DemoEntryPage.tsx' },
  { label: 'entrée — formulaire obligatoire', path: 'features/demo/hooks/useDemoAccessForm.ts' },
  { label: 'sortie — bandeau « Quitter »', path: 'features/auth/hooks/useExitDemo.ts' },
  { label: 'sortie — /login ferme la démo', path: 'features/auth/hooks/useCloseDemoOnLogin.ts' },
]

const APPELLE_LE_VIDAGE = /\bclearVolatileUserState\s*\(/

describe('démo — la frontière vide le scroll infini des comptes/contacts (#3788.6)', () => {
  it('LIT les quatre fichiers de frontière, en entier', () => {
    for (const { path } of FRONTIERES) {
      const source = readFileSync(join(SRC, path), 'utf8')
      expect(source.length).toBeGreaterThan(200)
    }
  })

  it.each(FRONTIERES)('$label ($path) appelle clearVolatileUserState()', ({ path }) => {
    const source = sansCommentaires(readFileSync(join(SRC, path), 'utf8'))
    expect(APPELLE_LE_VIDAGE.test(source)).toBe(true)
  })

  it('SAIT DIRE NON : un franchissement qui ne vide que react-query est refusé', () => {
    const fautif = `
      export function useExitDemo() {
        const qc = useQueryClient()
        const exit = async () => {
          await sessionManager.logout()
          qc.clear()
          window.location.assign('/login')
        }
        return { exit }
      }
    `
    expect(APPELLE_LE_VIDAGE.test(fautif)).toBe(false)
  })

  it('n’attrape pas ce qu’elle ne vise pas : un commentaire qui cite l’appel ne compte pas', () => {
    const horsSujet = sansCommentaires(`
      // Voir clearVolatileUserState() dans auth/clear-client-user-state.ts
      export function noop() {}
    `)
    expect(APPELLE_LE_VIDAGE.test(horsSujet)).toBe(false)
  })
})
