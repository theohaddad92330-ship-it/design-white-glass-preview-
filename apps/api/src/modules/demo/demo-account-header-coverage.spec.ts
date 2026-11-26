import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ANALYSED_ACCOUNT_FILES } from './demo-analysed-accounts'

/**
 * #4507 (refonte V22 de l'en-tête de la fiche compte) — craft rule n°9 : « en-tête rempli sur
 * Airbus / EDF / Renault / Thales, propriétaire compris ».
 *
 * L'en-tête lit, sur le compte : le secteur (sur-titre), l'effectif et le CA (taille), le siège (ville), le
 * statut commercial (pastille) et le responsable (`assigned_to` → `owner`, avatar + prénom). Cette suite relit
 * le JEU, pas `demo-coverage.ts` sur parole : chacun des quatre dossiers porte chaque champ, et le semis pose
 * un responsable sur tout compte inséré sans porteur (`seedCompanionEffort`, X80 #3407).
 */
const HEADER_ACCOUNTS = ['Airbus', 'EDF', 'Renault', 'Thales'] as const

function filled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

describe('#4507 — l’en-tête de la fiche est rempli sur les quatre dossiers analysés de la démo', () => {
  it.each(HEADER_ACCOUNTS)('%s : secteur, effectif, CA, siège et statut commercial sont semés', company => {
    const entry = ANALYSED_ACCOUNT_FILES.find(item => item.company_name === company)
    expect(entry).toBeDefined()
    const account = entry?.file.account as unknown as Record<string, unknown>
    for (const field of ['sector', 'employees', 'revenue', 'headquarters', 'commercial_status']) {
      expect({ company, field, filled: filled(account[field]) }).toEqual({ company, field, filled: true })
    }
  })

  it('le semis pose un RESPONSABLE sur tout compte inséré sans porteur — l’avatar n’est jamais vide en démo', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    const body = source.slice(source.indexOf('private async seedCompanionEffort'))
    expect(body).toMatch(/UPDATE accounts SET assigned_to = \$2 WHERE workspace_id = \$1 AND assigned_to IS NULL/)
    // …et la méthode est APPELÉE par le semis (un correctif que personne n'appelle ne remplit rien).
    expect(source.match(/this\.seedCompanionEffort\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
  })

  it('sait dire NON : un champ vide se voit', () => {
    expect(filled('')).toBe(false)
    expect(filled(null)).toBe(false)
    expect(filled('Plus de 10 000 salariés')).toBe(true)
  })
})
