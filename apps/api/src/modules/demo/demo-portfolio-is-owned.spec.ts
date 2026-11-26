import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * LA SALLE DE DÉMONSTRATION DOIT REMPLIR LE COCKPIT — #1408.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE GARDE EMPÊCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 04/09/2026, « mon portefeuille » a cessé de vouloir dire « les comptes que
 * j'ai créés » (`accounts.user_id`) pour vouloir dire « les comptes dont je suis
 * responsable » (`accounts.assigned_to`) — parce que `/comptes` disait déjà la
 * seconde phrase et que le même mot désignait deux populations.
 *
 * Le semis de la salle, lui, ne posait que `user_id`. La bascule aurait donc
 * ouvert le cockpit sur du VIDE devant un prospect, sans qu'aucun test existant
 * ne rougisse : les données étaient là, la lecture était juste, et les deux ne
 * se croisaient plus. C'est la famille « le semis doit lire comme l'écran », et
 * elle ne se voit pas en relisant l'un OU l'autre.
 *
 * Cette garde tient les deux bouts ENSEMBLE. Elle échoue si l'écran change de
 * colonne sans que le semis suive, et si le semis cesse de la poser.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE RETIRE LES COMMENTAIRES AVANT DE CHERCHER
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux fichiers PARLENT abondamment de `assigned_to` dans leur prose — cette
 * garde elle-même en est la preuve. Une recherche naïve trouverait la phrase qui
 * en parle et se croirait verte pendant que le code dit autre chose : c'est le
 * défaut exact que `normaliseSql` corrige côté prédicats d'hygiène, et il se
 * repaie à chaque garde qui lit du code source.
 */

const API_SRC = join(__dirname, '..', '..')

/** Le code, débarrassé de ce qui n'est pas du code. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/\s+/g, ' ')
}

describe('le portefeuille de la salle de démonstration a un responsable', () => {
  const cockpitScope = codeOnly(readFileSync(join(API_SRC, 'modules/accounts/accounts.service.ts'), 'utf8'))
  const demoSeed = codeOnly(readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8'))

  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    expect(cockpitScope.length).toBeGreaterThan(10_000)
    expect(demoSeed.length).toBeGreaterThan(10_000)
    // Et elle lit bien le bon fichier : la fonction qu'elle surveille existe.
    expect(cockpitScope).toContain('personalAccountsScope')
  })

  it('le cockpit lit le RESPONSABLE, pas le créateur', () => {
    const scope = cockpitScope.slice(cockpitScope.indexOf('personalAccountsScope'))
    const body = scope.slice(0, scope.indexOf('async countPersonalAccounts'))
    expect(body).toContain('account.assigned_to = :userId')
    // Si cette ligne rougit, ce n'est pas le test qu'il faut corriger : c'est
    // que « mes comptes » vient de redevenir deux populations.
    expect(body).not.toContain('account.user_id = :userId')
  })

  it('le semis de la salle POSE ce responsable sur ses dossiers', () => {
    const create = demoSeed.slice(demoSeed.indexOf('this.accounts.create({'))
    const accountBlock = create.slice(0, create.indexOf('company_name:') + 200)
    expect(accountBlock).toContain('assigned_to: ownerUserId')
  })

  // #2160.9 — LA FICHE CONTACT lit désormais le même porteur en tête (voir
  // `ContactHeader.tsx`, badge « Porté par »). Même défaut possible que pour
  // le portefeuille : la colonne existait, l'écran la lit, et sans cette ligne
  // le semis aurait ouvert la fiche sur « aucun porteur » à côté d'un compte
  // qui, lui, en montre un.
  it('le semis de la salle POSE aussi ce responsable sur SES CONTACTS', () => {
    const create = demoSeed.slice(demoSeed.indexOf('private demoContactRow('))
    const contactBlock = create.slice(
      create.indexOf('this.contacts.create({'),
      create.indexOf('workspace_id: workspaceId,'),
    )
    expect(contactBlock).toContain('assigned_to: ownerUserId')
  })
})
