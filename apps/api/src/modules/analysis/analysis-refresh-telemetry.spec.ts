import { isSuccess, success, failure } from '@bellum/utils'
import { REFRESH_DIMENSION_CREDIT_COST } from '@bellum/contracts'
import { AnalysisRefreshService } from './analysis-refresh.service'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { CreditsService } from '../credits/credits.service'
import type { PaidVerificationTelemetry } from './paid-verification-telemetry.port'

/**
 * « VÉRIFIER AUJOURD'HUI » SE COMPTE — ET SEULEMENT QUAND ON A VRAIMENT PAYÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le rafraîchissement d'un axe est la contrepartie exacte de la lecture
 * gratuite : la mémoire marché dit ce qu'elle sait sans rien débiter, et ce
 * geste-ci va demander au web ce qui est vrai AUJOURD'HUI, ce qui coûte de
 * l'argent réel à chaque fois. C'est la moitié payante de la paire que
 * l'écran annonce (« incluse » / « X crédits »).
 *
 * ⚠️ Le compteur suit le DÉBIT, jamais l'intention. Un refus faute de crédits,
 * une phase qui échoue, une course perdue sur le décrément atomique : dans les
 * trois cas rien n'a été payé, donc rien n'est compté. Compter l'intention
 * gonflerait la mesure exactement du côté flatteur — le même biais que
 * `paid_calls_avoided`, que ce lot a refusé de livrer.
 */

type Ports = {
  service: AnalysisRefreshService
  telemetry: { paidVerificationTriggered: jest.Mock }
}

function buildService(opts: {
  hasCredit?: boolean
  consumeOk?: boolean
  underlying?: ReturnType<typeof success> | ReturnType<typeof failure>
  withTelemetry?: boolean
}): Ports {
  const underlying = opts.underlying ?? success({ refreshed: true })

  const onDemand = {
    refreshResearch: jest.fn().mockResolvedValue(underlying),
    enrichContacts: jest.fn().mockResolvedValue(underlying),
    enrichOrganigram: jest.fn().mockResolvedValue(underlying),
    replan: jest.fn().mockResolvedValue(underlying),
  }

  const credits = {
    hasEnrichmentCredit: jest.fn().mockResolvedValue(opts.hasCredit ?? true),
    consumeEnrichmentCredit: jest.fn().mockResolvedValue({ ok: opts.consumeOk ?? true, remaining: 9 }),
  }

  const accounts = {
    findOne: jest.fn().mockResolvedValue({ id: 'acc-1' }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  }

  const telemetry = { paidVerificationTriggered: jest.fn() }

  // ⚠️ Le port est le DERNIER paramètre, et le service se construit
  // positionnellement dans une poignée de specs : un optionnel inséré au
  // milieu décalerait les trois autres sans que rien ne jette.
  const service = new AnalysisRefreshService(
    onDemand as unknown as AnalysisOnDemandService,
    credits as unknown as CreditsService,
    accounts as never,
    opts.withTelemetry === false ? undefined : (telemetry as PaidVerificationTelemetry),
  )
  return { service, telemetry }
}

describe('la vérification payante se compte', () => {
  it('compte le geste, le compte visé et les crédits RÉELLEMENT débités', async () => {
    const { service, telemetry } = buildService({})

    const result = await service.refresh('acc-1', 'u-1', 'signals')

    expect(isSuccess(result)).toBe(true)
    expect(telemetry.paidVerificationTriggered).toHaveBeenCalledWith({
      userId: 'u-1',
      accountId: 'acc-1',
      gesture: 'refresh:signals',
      // Le nombre vient de la MÊME table que le débit et que l'écran — jamais
      // un chiffre écrit à la main dans l'émetteur (GA-26).
      creditsDebited: REFRESH_DIMENSION_CREDIT_COST.signals,
    })
  })

  it('ne compte RIEN quand le solde est vide — aucune vérification n’a eu lieu', async () => {
    const { service, telemetry } = buildService({ hasCredit: false })

    await service.refresh('acc-1', 'u-1', 'signals')

    expect(telemetry.paidVerificationTriggered).not.toHaveBeenCalled()
  })

  it('ne compte RIEN quand la phase échoue — rien n’a été débité', async () => {
    const { service, telemetry } = buildService({
      underlying: failure({ code: 'ia_failed', message: 'la phase est tombée' }),
    })

    await service.refresh('acc-1', 'u-1', 'contacts')

    expect(telemetry.paidVerificationTriggered).not.toHaveBeenCalled()
  })

  it('ne compte RIEN quand le débit perd sa course — le travail est fait, mais pas payé', async () => {
    // Le cas le plus subtil : la phase a tourné, et pourtant le décrément
    // atomique a rendu 0 ligne affectée. Compter ici ferait apparaître un
    // crédit qui n'a jamais quitté le pool.
    const { service, telemetry } = buildService({ consumeOk: false })

    await service.refresh('acc-1', 'u-1', 'entities')

    expect(telemetry.paidVerificationTriggered).not.toHaveBeenCalled()
  })

  it('un port ABSENT ne casse pas le rafraîchissement — la mesure est best-effort', async () => {
    const { service } = buildService({ withTelemetry: false })

    const result = await service.refresh('acc-1', 'u-1', 'strategy')

    expect(isSuccess(result)).toBe(true)
  })

  it('une télémétrie qui JETTE ne défait pas un rafraîchissement déjà payé', async () => {
    // Le déséquilibre penche du bon côté, comme partout ailleurs dans ce
    // service : on perd une ligne de journal, jamais un travail acquis.
    const { service, telemetry } = buildService({})
    telemetry.paidVerificationTriggered.mockImplementation(() => {
      throw new Error('traceur indisponible')
    })

    const result = await service.refresh('acc-1', 'u-1', 'signals')

    expect(isSuccess(result)).toBe(true)
  })
})
