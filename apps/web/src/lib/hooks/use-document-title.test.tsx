import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useDocumentTitle } from './use-document-title'

const matches = vi.hoisted(() => ({ current: [] as Array<{ routeId: string }> }))

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) => select({ matches: matches.current }),
}))

function Harness() {
  useDocumentTitle()
  return null
}

const renderAt = (...routeIds: string[]) => {
  matches.current = routeIds.map(routeId => ({ routeId }))
  return render(<Harness />)
}

describe('useDocumentTitle', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    document.title = 'stale'
  })

  it('sets the title of the matched route', async () => {
    renderAt('/', '/contacts/$id')
    await waitFor(() => expect(document.title).toBe(i18n.t('routes:contactDetail.title')))
  })

  it('does not leave the previous screen title in place on navigation', async () => {
    renderAt('/', '/projects/')
    await waitFor(() => expect(document.title).toBe(i18n.t('routes:projects.title')))

    renderAt('/', '/contacts/$id')
    await waitFor(() => expect(document.title).toBe(i18n.t('routes:contactDetail.title')))
    expect(document.title).not.toBe(i18n.t('routes:projects.title'))
  })

  it('uses the deepest match rather than the layout route', async () => {
    renderAt('/', '/settings/profile', '/settings/profile/identity')
    await waitFor(() => expect(document.title).toBe(i18n.t('routes:settingsProfileIdentity.title')))
  })

  it('follows a language switch', async () => {
    renderAt('/', '/login')
    await waitFor(() => expect(document.title).toBe(i18n.t('routes:login.title')))

    await i18n.changeLanguage('en')
    await waitFor(() => expect(document.title).toBe(i18n.t('routes:login.title')))
    await i18n.changeLanguage('fr')
  })

  it('leaves the title untouched for an unknown route', async () => {
    renderAt('/totally-unknown')
    await waitFor(() => expect(document.title).toBe('stale'))
  })
})
