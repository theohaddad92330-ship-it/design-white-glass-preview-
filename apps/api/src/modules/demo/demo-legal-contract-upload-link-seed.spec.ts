import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — LE LIEN DE DÉMONSTRATION EST
 * RÉVOQUÉ, ET IL S'ÉCRIT APRÈS LA MISSION QU'IL NOMME.
 *
 * Même raison, même limite de mock, que `demo-legal-entity-write-order.spec.ts`
 * (lot V5, 28/09/2026) : `manager.query` mocké par défaut ne rejoue pas l'ordre
 * réel d'une écriture SQL, donc une régression d'ordre (lire `missionIds`
 * avant qu'il soit rempli) ne ferait tomber AUCUN test qui appellerait
 * `seedWorkspace`. Ce qui est vérifiable sans base de données, c'est l'ORDRE
 * ÉCRIT dans le fichier.
 */
const SOURCE = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

function indexOfUploadLinkBlock(source: string): number {
  const index = source.indexOf('INSERT INTO legal_contract_upload_links')
  if (index < 0) throw new Error('repère introuvable — la garde ne lit plus rien')
  return index
}

describe('#2422.6 — le lien de démonstration est semé RÉVOQUÉ, après la mission qu’il nomme', () => {
  it('le bloc du lien existe UNE fois, après le remplissage de `missionIds`', () => {
    expect(SOURCE.split('INSERT INTO legal_contract_upload_links')).toHaveLength(2)
    const missionIdsSet = SOURCE.indexOf('missionIds.set(mission.label, row.id)')
    expect(missionIdsSet).toBeGreaterThan(0)
    expect(indexOfUploadLinkBlock(SOURCE)).toBeGreaterThan(missionIdsSet)
  })

  it('le lien est écrit RÉVOQUÉ dès sa création — jamais un lien actif en salle partagée', () => {
    const block = SOURCE.slice(indexOfUploadLinkBlock(SOURCE) - 400, indexOfUploadLinkBlock(SOURCE) + 1200)
    expect(block).toContain('revoked_at')
    // La colonne `revoked_at` est posée avec la MÊME valeur que `created_at`
    // ($6 réutilisé) — jamais `NULL`, qui laisserait le lien actif.
    expect(block).toMatch(/VALUES \([^)]*\$6::timestamptz\)/)
  })

  it('le dépôt ne lit jamais un `missionId` d’un AUTRE compte — un second contrat est posé sur le dossier porteur', () => {
    const block = SOURCE.slice(indexOfUploadLinkBlock(SOURCE) - 1500, indexOfUploadLinkBlock(SOURCE))
    // Le contrat-cadre Société Générale (vedette) n'a AUCUNE mission sur son
    // compte : ce bloc pose donc un second contrat sur `account.id` lui-même
    // (le dossier porteur, qui PORTE les missions), jamais sur `flagshipAccountId`.
    expect(block).toContain('INSERT INTO legal_contracts')
    expect(block).toContain('account.id')
    expect(block).not.toContain('flagshipAccountId')
  })

  it('sait dire NON : un lien JAMAIS révoqué (`revoked_at` à `NULL`) est le défaut que ce test refuse', () => {
    const avecLienActif = `
      await this.accounts.manager.query(
        \`INSERT INTO legal_contract_upload_links
           (workspace_id, contract_id, mission_id, token_hash, created_by, created_at, expires_at, revoked_at)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, NULL)\`,
      )
    `
    expect(avecLienActif).not.toMatch(/VALUES \([^)]*\$6::timestamptz\)/)
  })
})
