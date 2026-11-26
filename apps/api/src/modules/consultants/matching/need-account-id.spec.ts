import { MatchingService } from './matching.service'

/**
 * #2551.1 — un besoin matché doit désigner son compte par un ID VÉRIFIABLE,
 * pas par un nom en texte libre.
 *
 * `loadNeed` lisait déjà `a.id AS account_id` en SQL (la jointure existait pour
 * calculer `account_name`) mais ne le rendait jamais dans l'objet `MatchNeed` :
 * le seul lien vers le compte, côté écran, était `accountName` — une chaîne
 * qui peut désigner un homonyme. La prospection inversée (#2551, « comptes
 * compatibles ») a besoin d'un ID pour aller chercher les INTERLOCUTEURS du
 * compte (`GET /contacts/account/:id`) sans deviner lequel des comptes qui
 * portent ce nom est le bon.
 *
 * Optionnel dans le contrat (`accountId?: string | null`) pour ne pas casser
 * les dizaines de littéraux `MatchNeed` déjà écrits dans les tests du moteur
 * (engine.spec.ts, explanation.spec.ts, etc.) qui n'ont pas à connaître ce
 * champ pour vérifier un score.
 */
describe('MatchingService.loadNeed — #2551.1 accountId', () => {
  const needRow = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Développeur Java',
    skills: [],
    seniority: null,
    start_on: null,
    target_tjm_cents: null,
    location: null,
    contract_kind: null,
    languages: [],
    clearances: [],
    stack: [],
    status: 'to_match',
    account_id: '22222222-2222-4222-8222-222222222222',
    account_name: 'ACME',
    account_sector: null,
    project_sectors: null,
  }

  function service() {
    const query = jest.fn(async () => [needRow])
    const runs = { manager: { query }, save: jest.fn(), create: (x: unknown) => x }
    const entries = { save: jest.fn(), create: (x: unknown) => x }
    const weightVersions = {
      createQueryBuilder: () => {
        throw new Error('pas de version de pondération dans ce test')
      },
    }
    const feedback = { manager: { query } }
    return new MatchingService(runs as never, entries as never, weightVersions as never, feedback as never)
  }

  it("rend l'id du compte, pas seulement son nom", async () => {
    const need = await service().loadNeed(needRow.id, null)
    expect(need?.accountId).toBe(needRow.account_id)
    expect(need?.accountName).toBe(needRow.account_name)
  })

  it("rend `null` quand le besoin n'a aucun compte rattaché — jamais deviné", async () => {
    const orphanRow = { ...needRow, account_id: null, account_name: null }
    const query = jest.fn(async () => [orphanRow])
    const runs = { manager: { query }, save: jest.fn(), create: (x: unknown) => x }
    const entries = { save: jest.fn(), create: (x: unknown) => x }
    const weightVersions = {
      createQueryBuilder: () => {
        throw new Error('pas de version de pondération dans ce test')
      },
    }
    const feedback = { manager: { query } }
    const svc = new MatchingService(runs as never, entries as never, weightVersions as never, feedback as never)
    const need = await svc.loadNeed(needRow.id, null)
    expect(need?.accountId).toBeNull()
  })
})
