import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-402 — LE RESPONSABLE D'UN COMPTE ET SON NIVEAU D'EFFORT SE LISENT, ILS NE
 * SE RECALCULENT JAMAIS PAR SURFACE (#3423.2, retour bêta du 30/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * #3423 demande que « le même compte possède le même responsable et le même
 * niveau d'effort partout ». Le « responsable compte » (le nom affiché pour
 * `assigned_to`) a UNE dérivation dans tout le dépôt — `resolveOwnerNames`
 * (`apps/api/src/modules/accounts/account-owner.util.ts`), extraite depuis
 * `AccountsService` (#3257.7a) précisément pour que le board d'effort
 * (`SprintsController`, qui affiche le NIVEAU D'EFFORT — le champ `sprint` de
 * `AccountEntity`, 6 paliers, doctrine c75) pose la MÊME étiquette « prénom +
 * nom, à défaut l'email » que la liste et le dossier de compte, sans reculer
 * sur un second calcul local.
 *
 * Le motif que cette garde empêche de revenir : `AccountsService` portait
 * cette dérivation en méthode PRIVÉE avant #3257.7a — la duplication n'a été
 * fermée qu'une fois, jamais vérifiée par la CI depuis.
 *
 * ⚠️ Elle retire les commentaires avant de lire — sinon ce docblock, qui cite
 * le motif de dérivation qu'elle surveille, la ferait échouer elle-même.
 */

const UTIL_FILE = join(__dirname, '..', 'modules', 'accounts', 'account-owner.util.ts')
const ACCOUNTS_SERVICE_FILE = join(__dirname, '..', 'modules', 'accounts', 'accounts.service.ts')
const SPRINTS_CONTROLLER_FILE = join(__dirname, '..', 'modules', 'sprints', 'sprints.controller.ts')

const READER_FILES = [ACCOUNTS_SERVICE_FILE, SPRINTS_CONTROLLER_FILE]

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function read(file: string): string {
  return stripComments(readFileSync(file, 'utf8'))
}

/**
 * Un second moteur ressemblerait à une reconstruction locale du même gabarit
 * de nom — `firstName`/`lastName` joints puis repliés sur l'email — plutôt
 * qu'à un IMPORT de `resolveOwnerNames`.
 */
const LOCAL_NAME_BUILD_PATTERN = /\[.{0,40}first[A-Za-z]*.{0,10}last[A-Za-z]*.{0,40}\]\s*\.filter\(Boolean\)\s*\.join/i

describe('GA-402 — la garde LIT vraiment quelque chose', () => {
  it('les trois fichiers surveillés existent et ne sont pas vides', () => {
    for (const file of [UTIL_FILE, ...READER_FILES]) {
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(200)
    }
  })

  it('savoir dire NON : le motif détecte bien un texte empoisonné qui reconstruit le nom localement', () => {
    const poisoned = `
      const name = [row.firstName, row.lastName].filter(Boolean).join(' ') || row.email
    `
    expect(LOCAL_NAME_BUILD_PATTERN.test(poisoned)).toBe(true)
  })
})

describe('GA-402 — le responsable de compte se LIT sur la dérivation partagée, jamais recalculé par surface', () => {
  it('`account-owner.util.ts` porte bien `resolveOwnerNames`, la dérivation canonique', () => {
    const source = read(UTIL_FILE)
    expect(source).toMatch(/export\s+(async\s+)?function\s+resolveOwnerNames/)
  })

  it('la liste/le dossier de compte (AccountsService) délègue à la dérivation partagée', () => {
    const source = read(ACCOUNTS_SERVICE_FILE)
    expect(source).toMatch(/resolveOwnerNamesShared/)
    expect(source).not.toMatch(LOCAL_NAME_BUILD_PATTERN)
  })

  it("le board d'effort (SprintsController) lit le MÊME utilitaire, jamais un second calcul de nom", () => {
    const source = read(SPRINTS_CONTROLLER_FILE)
    expect(source).toMatch(/from ['"]\.\.\/accounts\/account-owner\.util['"]/)
    expect(source).toMatch(/resolveOwnerNames/)
    expect(source).not.toMatch(LOCAL_NAME_BUILD_PATTERN)
  })

  it('aucun des deux lecteurs ne reconstruit le nom du responsable localement', () => {
    for (const file of READER_FILES) {
      const source = read(file)
      // Jest n'accepte pas de message en 2e argument de `expect` : le diff
      // nomme le fichier fautif.
      expect({ file, rebuilt: LOCAL_NAME_BUILD_PATTERN.test(source) }).toEqual({ file, rebuilt: false })
    }
  })
})
