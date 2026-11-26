import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CORRELATION_ID_HEADER } from './correlation-id.store'

/**
 * #3717.7 / #3777 (DEC-4036 Q10) — contrat api ↔ ia : UN identifiant de
 * corrélation traverse l'analyse de compte et Laura. Ce test lit le middleware
 * du service IA : si l'un des deux côtés renomme l'en-tête, l'IA génère un
 * second identifiant et les deux chaînes ne se recollent plus (journaux,
 * coûts, Sentry). Le pendant côté IA : `tests/test_correlation_contract_4036.py`.
 */
const IA_MIDDLEWARE = join(__dirname, '..', '..', '..', 'ia', 'app', 'middleware', 'correlation_id.py')

function iaHeaderName(source: string): string | null {
  return /^CORRELATION_ID_HEADER\s*=\s*"([^"]+)"/m.exec(source)?.[1] ?? null
}

describe('contrat de corrélation api ↔ ia (#3717.7)', () => {
  it('l’API envoie l’en-tête que le service IA lit', () => {
    expect(iaHeaderName(readFileSync(IA_MIDDLEWARE, 'utf8'))).toBe(CORRELATION_ID_HEADER)
  })

  it('sait dire NON — un nom divergent ou absent ne passe pas', () => {
    expect(iaHeaderName('CORRELATION_ID_HEADER = "x-trace-id"\n')).not.toBe(CORRELATION_ID_HEADER)
    expect(iaHeaderName('# rien ici\n')).toBeNull()
  })
})
