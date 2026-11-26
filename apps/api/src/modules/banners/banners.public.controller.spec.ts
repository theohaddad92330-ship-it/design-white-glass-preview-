/// <reference types="jest" />
import type { PublicBanner } from '@bellum/contracts'
import { BannersPublicController } from './banners.public.controller'
import type { BannersService } from './banners.service'

function makeService(active: PublicBanner[] = []) {
  const getActive = jest.fn().mockResolvedValue(active)
  const service = { getActive } as unknown as BannersService
  return { service, getActive }
}

describe('BannersPublicController', () => {
  it('defaults to the app placement and anonymous audience', async () => {
    const { service, getActive } = makeService()
    await new BannersPublicController(service).getActive(undefined, undefined)
    expect(getActive).toHaveBeenCalledWith({ placement: 'app', authenticated: false })
  })

  it('maps placement=website and audience=authenticated', async () => {
    const { service, getActive } = makeService()
    await new BannersPublicController(service).getActive('website', 'authenticated')
    expect(getActive).toHaveBeenCalledWith({ placement: 'website', authenticated: true })
  })

  it('treats an unknown placement as app (never leaks website-only content)', async () => {
    const { service, getActive } = makeService()
    await new BannersPublicController(service).getActive('garbage', 'all')
    expect(getActive).toHaveBeenCalledWith({ placement: 'app', authenticated: false })
  })

  it('wraps the active banners in a { banners } envelope', async () => {
    const banner = { id: 'x', kind: 'offer' } as unknown as PublicBanner
    const { service } = makeService([banner])
    const out = await new BannersPublicController(service).getActive('app', 'authenticated')
    expect(out).toEqual({ banners: [banner] })
  })
})
