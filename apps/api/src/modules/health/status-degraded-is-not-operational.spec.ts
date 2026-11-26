import type { ConfigService } from '@nestjs/config'
import type { DataSource } from 'typeorm'
import { StatusService } from './status.service'

/**
 * Un moteur qui RÉPOND « je suis dégradé » n'est pas « opérationnel ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ LE 29/08/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/ia/app/main.py` rend **HTTP 200** avec `{"status": "degraded",
 * "missing_env": [...]}` quand une variable critique manque, et son docstring
 * dit pourquoi : « reste 200 même mal configuré (sinon Railway ne promeut
 * jamais le déploiement qui corrigerait la config), **mais DIT ce qui
 * manque** ».
 *
 * `probeIaEngine` ne lisait que `res.ok`. Le corps — la seule moitié qui porte
 * l'information — était jeté. Résultat : un moteur d'IA sans `SUPABASE_URL`,
 * dont huit routeurs répondent 500 un par un, était compté **`operational`** sur
 * la page d'état publique. Le docstring Python nomme lui-même cette panne :
 * « C'est ce qui rend la panne INVISIBLE — le produit a l'air debout. »
 *
 * C'est « un verdict ne se conclut pas d'un silence » à l'envers : ici, le
 * distant PARLE, et personne ne l'écoute. Un `200` n'est pas un « tout va
 * bien » ; c'est « j'ai répondu ».
 */

class TestStatusService extends StatusService {
  protected override readonly checkTimeoutMs: number = 100
  protected override readonly cacheTtlMs: number = 0
  /** Ce que `GET /health` du moteur rend vraiment : un statut ET un corps. */
  iaResponse: { ok: boolean; body: unknown } = { ok: true, body: { status: 'ok' } }

  protected override probeRedis(): Promise<void> {
    return Promise.resolve()
  }

  protected override async fetchIaHealth(): Promise<{ ok: boolean; status: number; body: unknown }> {
    if (!this.iaResponse.ok) throw new Error('ECONNREFUSED')
    return { ok: true, status: 200, body: this.iaResponse.body }
  }
}

const dataSource = () => ({ query: jest.fn().mockResolvedValue([{ ok: 1 }]) }) as unknown as DataSource
const config = () => ({ get: (_key: string, def?: string) => def }) as unknown as ConfigService

describe('un moteur qui dit « dégradé » n’est pas « opérationnel »', () => {
  it('LIT le corps, pas seulement le code HTTP', async () => {
    const service = new TestStatusService(dataSource(), config())
    service.iaResponse = { ok: true, body: { status: 'degraded', missing_env: ['SUPABASE_URL'] } }
    const report = await service.getStatus()

    expect(report.components.ia_engine.status).toBe('degraded')
    // Et le verdict d'ensemble suit : c'est LUI que la page d'état affiche en
    // gros, et il annonçait « opérationnel » sur un moteur à moitié mort.
    expect(report.status).toBe('degraded')
  })

  it('« ok » reste « opérationnel » — le chemin normal ne change pas', async () => {
    const service = new TestStatusService(dataSource(), config())
    service.iaResponse = { ok: true, body: { status: 'ok' } }
    const report = await service.getStatus()
    expect(report.components.ia_engine.status).toBe('operational')
    expect(report.status).toBe('operational')
  })

  it('un corps ILLISIBLE ne se lit pas « dégradé » — on ne conclut rien d’un silence', async () => {
    // Le distant a répondu 200 et son corps ne se lit pas (déploiement plus
    // ancien, proxy qui réécrit). Inventer « dégradé » ferait crier au loup
    // toutes les 15 secondes ; inventer « en panne » serait pire encore. Le
    // seul fait dont on soit sûr est qu'il a RÉPONDU.
    const service = new TestStatusService(dataSource(), config())
    service.iaResponse = { ok: true, body: 'pong' }
    const report = await service.getStatus()
    expect(report.components.ia_engine.status).toBe('operational')
  })

  it('injoignable reste « en panne » — les deux ne se confondent pas', async () => {
    // « Dégradé » = il répond et se sait diminué. « En panne » = il ne répond
    // pas. Les fusionner ferait perdre la seule information qui dit s'il faut
    // redéployer une config ou réveiller un service.
    const service = new TestStatusService(dataSource(), config())
    service.iaResponse = { ok: false, body: null }
    const report = await service.getStatus()
    expect(report.components.ia_engine.status).toBe('down')
    expect(report.status).toBe('degraded')
  })
})
