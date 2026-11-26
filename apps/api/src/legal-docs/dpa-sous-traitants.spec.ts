import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #4472.4-.7 — l'Annexe 2 du DPA (la pièce remise au client) liste les sous-traitants que le CODE appelle
 * réellement, et n'y laisse aucun « à confirmer ». La liste ne se recopie pas : elle se LIT dans le code
 * (`enrichment-providers.ts`, `source_registry.py`, `job_aggregators.py`, les URL par défaut des clients de
 * modèle, d'OCR, de transcription et de traces). Un fournisseur ajouté au code sans ligne dans l'annexe fait
 * échouer ce test.
 */
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8')

function annexe2(): string {
  const dpa = read('agent_docs/legal/dpa.md')
  const start = dpa.indexOf('## Annexe 2')
  const end = dpa.indexOf('## Annexe 3')
  return start >= 0 && end > start ? dpa.slice(start, end) : ''
}

/** La ligne de tableau de l'annexe qui nomme `nom` (insensible à la casse). */
function ligne(nom: string): string | undefined {
  const motif = new RegExp(nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  return annexe2()
    .split('\n')
    .find(l => l.startsWith('|') && motif.test(l))
}

describe("#4472 — l'Annexe 2 du DPA suit le code", () => {
  it("l'annexe 2 se lit (sinon chaque test ci-dessous passerait à vide)", () => {
    expect(annexe2().length).toBeGreaterThan(500)
    expect(ligne('Supabase')).toBeDefined()
  })

  it('#4472.5 — aucun « à confirmer » ni « à compléter » dans le DPA remis au client', () => {
    expect(read('agent_docs/legal/dpa.md')).not.toMatch(/à confirmer|à compléter|⟦/i)
  })

  it('#4472.7 — chaque fournisseur de la cascade d’enrichissement (`enrichment-providers.ts`) est listé', () => {
    const source = read('apps/api/src/modules/contacts/enrichment-providers.ts')
    const union = /provider: ('[a-z]+'(?: \| '[a-z]+')+)/.exec(source)?.[1] ?? ''
    const noms = [...union.matchAll(/'([a-z]+)'/g)].map(m => m[1] ?? '')
    expect(noms.length).toBeGreaterThanOrEqual(4)
    for (const nom of noms) expect([nom, ligne(nom)]).toEqual([nom, expect.any(String)])
  })

  it.each([
    ['Apollo', 'apps/api/src/modules/external-sourcing/external-sourcing-provider.ts', 'APOLLO_API_KEY'],
    ['SalesQL', 'apps/ia/app/services/salesql.py', 'SALESQL_API_KEY'],
    ['Dropcontact', 'apps/api/src/modules/contacts/dropcontact.client.ts', 'DROPCONTACT_API_KEY'],
    ['Serper', 'apps/ia/app/services/data_gateway.py', 'SERPER_API_KEY'],
    ['Tavily', 'apps/ia/app/services/data_gateway.py', 'TAVILY_API_KEY'],
    ['MessageBird', 'apps/api/src/modules/notifications/sms/sms-sender.ts', 'SMS_PROVIDER_API_KEY'],
    ['Reflag', 'apps/api/src/modules/reflag/reflag.service.ts', 'REFLAG_SECRET_KEY'],
    ['GitHub', 'apps/api/src/modules/feedback/github-issue.service.ts', 'FEEDBACK_GITHUB_TOKEN'],
  ])('%s — appelé par le code (%s lit %s), donc listé', (nom, fichier, cle) => {
    expect(read(fichier)).toContain(cle)
    expect(ligne(nom)).toBeDefined()
  })

  it('#4472.6 — chaque agrégateur d’offres payant (`job_aggregators.py`) est listé', () => {
    const source = read('apps/ia/app/services/data_sources/job_aggregators.py').toLowerCase()
    for (const nom of ['Adzuna', 'Jooble', 'TheirStack', 'Mantiks', 'Fantastic.jobs']) {
      expect(source).toContain(nom.toLowerCase())
      expect([nom, ligne(nom)]).toEqual([nom, expect.any(String)])
    }
  })

  it('#4472.6 — Mistral AI (OCR et transcription vocale : `api.mistral.ai` par défaut) est listé, en UE', () => {
    expect(read('apps/ia/app/services/ocr.py')).toContain('https://api.mistral.ai')
    expect(read('apps/api/src/modules/transcription/voxtral.client.ts')).toContain('https://api.mistral.ai')
    expect(ligne('Mistral')).toMatch(/OCR/)
    expect(ligne('Mistral')).toMatch(/transcription/i)
  })

  it('#4472.6 — OpenAI (transcription et embeddings par défaut, modèle routé) est listé', () => {
    expect(read('apps/api/src/modules/transcription/transcription.client.ts')).toContain('https://api.openai.com')
    expect(read('apps/ia/app/services/rag_service.py')).toContain('https://api.openai.com/v1/embeddings')
    expect(ligne('OpenAI')).toMatch(/transcription/i)
    expect(ligne('OpenAI')).toMatch(/embeddings/i)
  })

  it('#4472.6 — Langfuse est listé, et sa localisation suit l’hôte par défaut du code', () => {
    const client = read('apps/ia/app/services/langfuse_client.py')
    const hote = /_DEFAULT_HOST = "([^"]+)"/.exec(client)?.[1]
    // cloud.langfuse.com = région UE de Langfuse ; us.cloud.langfuse.com = États-Unis.
    expect(hote).toBe('https://cloud.langfuse.com')
    expect(ligne('Langfuse')).toContain('UE')
    expect(ligne('Langfuse')).toContain('LANGFUSE_HOST')
  })

  it('#4472.4 — la pièce envoyée sur demande est l’Annexe 2 du DPA, pas le suivi interne des signatures', () => {
    const suivi = read('agent_docs/legal/dpa-a-signer.md')
    expect(suivi).not.toMatch(/c'est ce fichier qu'on envoie/)
    expect(suivi).toMatch(/Annexe 2/)
  })

  it('#4472.4 — Mistral et Langfuse disent la même localisation dans les deux pièces', () => {
    const suivi = read('agent_docs/legal/dpa-a-signer.md').split('\n')
    const ligneSuivi = (nom: string): string => suivi.find(l => l.startsWith('|') && l.includes(nom)) ?? ''
    expect(ligneSuivi('Mistral')).toContain('UE')
    expect(ligneSuivi('Langfuse')).toContain('UE')
    expect(ligneSuivi('Langfuse')).not.toMatch(/à confirmer/i)
  })
})
