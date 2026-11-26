import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 16/10/2026 — `/dossier-blocks` a un plafond de sortie de 8 000 tokens et un délai
 * modèle de `_MODEL_TIMEOUT_S` (celui du brief). Le client NestJS doit attendre au
 * moins ce délai, sinon il abandonne un appel que le service IA paie encore.
 */
const BRIEF_PY = join(__dirname, '../../../../ia/app/routers/commercial_brief.py')
const IA_CLIENT = join(__dirname, 'ia.client.ts')

describe('IaClient.dossierBlocks — le délai client couvre le délai modèle', () => {
  it('timeoutMs >= _MODEL_TIMEOUT_S du service IA', () => {
    const py = readFileSync(BRIEF_PY, 'utf8').match(/^_MODEL_TIMEOUT_S\s*=\s*([0-9.]+)/m)
    expect(py).not.toBeNull()
    const src = readFileSync(IA_CLIENT, 'utf8')
    const block = src.slice(src.indexOf("template: '/dossier-blocks'"))
    const ms = block.match(/timeoutMs:\s*([0-9_]+)/)
    expect(ms).not.toBeNull()
    expect(Number((ms as RegExpMatchArray)[1].replace(/_/g, ''))).toBeGreaterThanOrEqual(
      Number((py as RegExpMatchArray)[1]) * 1000,
    )
  })
})
