import { CHANGELOG_IDS, LATEST_CHANGELOG_ID, changelogFr } from '@bellum/contracts'
import type { ConfigService } from '@nestjs/config'
import type { Repository } from 'typeorm'
import type { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import type { MailerService } from '../mailer/mailer.service'
import type { SuppressionService } from '../mailer/suppression.service'
import { ChangelogNewsletterService } from './changelog-newsletter.service'

/**
 * `describeDelivery()` — l'état de diffusion LU, jamais envoyé.
 *
 * Il existe pour l'écran « Changelog » du back-office (demande de Louis du
 * 06/09/2026 : « pouvoir suivre les changelog sur le dashboard manager »). Le
 * point qui compte : il réutilise `fetchCandidates()`, la MÊME requête que
 * l'envoi. Une seconde requête écrite à côté aurait sa propre définition de
 * « lecteur », et les deux auraient divergé au premier changement — c'est le
 * défaut « deux lectures du même objet qui divergent », déjà payé ici.
 */

type Row = {
  user_id: string
  email: string | null
  first_name: string | null
  newsletter_changelog: boolean | null
  newsletter_last_entry_id: string | null
  email_language: string | null
}

const IDS = CHANGELOG_IDS.map(entry => entry.id)

function row(overrides: Partial<Row> = {}): Row {
  return {
    user_id: `user-${Math.random().toString(36).slice(2, 8)}`,
    email: 'rep@esn.fr',
    first_name: 'Alice',
    newsletter_changelog: true,
    newsletter_last_entry_id: LATEST_CHANGELOG_ID,
    email_language: 'fr',
    ...overrides,
  }
}

/** Le repository `profiles` réduit à ce que `fetchCandidates()` en appelle. */
function build(rows: Row[]) {
  const getRawMany = jest.fn(async () => rows)
  const builder = {
    leftJoin: jest.fn(() => builder),
    select: jest.fn(() => builder),
    where: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    getRawMany,
  }
  const profiles = { createQueryBuilder: jest.fn(() => builder) } as unknown as Repository<ProfileEntity>

  const service = new ChangelogNewsletterService(
    profiles,
    {} as unknown as Repository<NotificationPreferenceEntity>,
    {} as unknown as Repository<WorkspaceMemberEntity>,
    {} as unknown as MailerService,
    {} as unknown as SuppressionService,
    { get: jest.fn(() => undefined) } as unknown as ConfigService,
  )
  return { service, builder, getRawMany }
}

describe('ChangelogNewsletterService.describeDelivery', () => {
  it('LIT quelque chose — le catalogue partagé n’est pas vide', () => {
    // Contrôle positif : sans lui, toutes les assertions ci-dessous passeraient
    // sur un catalogue à zéro entrée, et la garde serait borgne.
    expect(IDS.length).toBeGreaterThan(5)
    expect(LATEST_CHANGELOG_ID).toBe(IDS[0])
  })

  it('classe chaque lecteur dans la MÊME famille que l’envoi, suppression exclue', async () => {
    const { service } = build([
      row({ newsletter_last_entry_id: LATEST_CHANGELOG_ID }),
      row({ newsletter_last_entry_id: LATEST_CHANGELOG_ID }),
      row({ newsletter_last_entry_id: IDS[3] as string }),
      row({ newsletter_last_entry_id: null }),
      row({ newsletter_last_entry_id: 'entree-retiree-du-catalogue' }),
      row({ newsletter_changelog: false }),
      row({ email: null }),
      row({ email: '   ' }),
    ])

    const snapshot = await service.describeDelivery()

    expect(snapshot.readers).toBe(8)
    expect(snapshot.upToDate).toBe(2)
    expect(snapshot.behind).toBe(1)
    expect(snapshot.neverServed).toBe(1)
    expect(snapshot.markerRetired).toBe(1)
    expect(snapshot.optedOut).toBe(1)
    expect(snapshot.noEmail).toBe(2)
    // Les six familles s'additionnent : un lecteur est dans une et une seule.
    const total =
      snapshot.upToDate +
      snapshot.behind +
      snapshot.neverServed +
      snapshot.markerRetired +
      snapshot.optedOut +
      snapshot.noEmail
    expect(total).toBe(snapshot.readers)
  })

  it('ordonne les repères du plus en retard au plus à jour, avec leur libellé', async () => {
    const { service } = build([
      row({ newsletter_last_entry_id: IDS[1] as string }),
      row({ newsletter_last_entry_id: IDS[4] as string }),
      row({ newsletter_last_entry_id: IDS[4] as string }),
    ])

    const snapshot = await service.describeDelivery()

    expect(snapshot.markers.map(marker => marker.entryId)).toEqual([IDS[4], IDS[1]])
    expect(snapshot.markers.map(marker => marker.readers)).toEqual([2, 1])
    expect(snapshot.markers[0]?.title).toBe(changelogFr.entries[IDS[4] as string]?.['title'])
    // Ce que ce lecteur n'a pas encore reçu — le chiffre qui dit l'écart.
    expect(snapshot.markers[0]?.pendingEntries).toBe(4)
  })

  it('n’ENVOIE rien et n’ÉCRIT rien — c’est une lecture', async () => {
    const sendChangelogNewsletterEmail = jest.fn()
    const update = jest.fn()
    const insert = jest.fn()
    const getRawMany = jest.fn(async () => [row({ newsletter_last_entry_id: IDS[2] as string })])
    const builder = {
      leftJoin: jest.fn(() => builder),
      select: jest.fn(() => builder),
      where: jest.fn(() => builder),
      andWhere: jest.fn(() => builder),
      getRawMany,
    }
    const service = new ChangelogNewsletterService(
      { createQueryBuilder: jest.fn(() => builder) } as unknown as Repository<ProfileEntity>,
      { findOne: jest.fn(), update, insert } as unknown as Repository<NotificationPreferenceEntity>,
      {} as unknown as Repository<WorkspaceMemberEntity>,
      { sendChangelogNewsletterEmail } as unknown as MailerService,
      {} as unknown as SuppressionService,
      { get: jest.fn(() => undefined) } as unknown as ConfigService,
    )

    await service.describeDelivery()

    expect(sendChangelogNewsletterEmail).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('sur zéro lecteur, ne prétend pas que tout le monde est à jour', async () => {
    const { service } = build([])

    const snapshot = await service.describeDelivery()

    expect(snapshot.readers).toBe(0)
    expect(snapshot.markers).toEqual([])
    // Pas de « 100 % à jour » dérivé d'une division par zéro.
    expect(snapshot.upToDateShare).toBeNull()
  })

  it('rend une part à jour mesurée quand il y a des lecteurs', async () => {
    const { service } = build([
      row({ newsletter_last_entry_id: LATEST_CHANGELOG_ID }),
      row({ newsletter_last_entry_id: LATEST_CHANGELOG_ID }),
      row({ newsletter_last_entry_id: LATEST_CHANGELOG_ID }),
      row({ newsletter_last_entry_id: IDS[2] as string }),
    ])

    const snapshot = await service.describeDelivery()

    expect(snapshot.upToDateShare).toBe(75)
  })
})
