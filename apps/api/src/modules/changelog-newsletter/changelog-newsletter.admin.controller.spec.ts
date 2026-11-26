import { CHANGELOG_IDS, LATEST_CHANGELOG_ID } from '@bellum/contracts'
import { ChangelogNewsletterAdminController } from './changelog-newsletter.admin.controller'
import type { ChangelogNewsletterService, ChangelogDeliverySnapshot } from './changelog-newsletter.service'

function snapshot(): ChangelogDeliverySnapshot {
  return {
    latestEntryId: LATEST_CHANGELOG_ID,
    readers: 3,
    upToDate: 2,
    behind: 1,
    neverServed: 0,
    markerRetired: 0,
    optedOut: 0,
    noEmail: 0,
    upToDateShare: 67,
    markers: [],
    suppressionEvaluated: false,
    computedAt: '2026-09-06T20:00:00.000Z',
  }
}

describe('ChangelogNewsletterAdminController', () => {
  it('rend le catalogue RÉEL, la plus récente entrée d’abord', async () => {
    const describeDelivery = jest.fn(async () => snapshot())
    const controller = new ChangelogNewsletterAdminController({
      describeDelivery,
    } as unknown as ChangelogNewsletterService)

    const report = await controller.getReport()

    // Contrôle positif : la réponse porte le VRAI catalogue, pas un tableau vide
    // qui rendrait toutes les assertions suivantes creuses.
    expect(report.entries.length).toBe(CHANGELOG_IDS.length)
    expect(report.entries[0]?.id).toBe(LATEST_CHANGELOG_ID)
    expect(report.entries[0]?.title).toBeTruthy()
    expect(report.entries[0]?.items.length).toBeGreaterThan(0)
  })

  it('délègue l’état de diffusion au service qui l’ENVOIE, sans le recalculer', async () => {
    const describeDelivery = jest.fn(async () => snapshot())
    const controller = new ChangelogNewsletterAdminController({
      describeDelivery,
    } as unknown as ChangelogNewsletterService)

    const report = await controller.getReport()

    expect(describeDelivery).toHaveBeenCalledTimes(1)
    expect(report.delivery.latestEntryId).toBe(LATEST_CHANGELOG_ID)
    expect(report.delivery.suppressionEvaluated).toBe(false)
  })
})
