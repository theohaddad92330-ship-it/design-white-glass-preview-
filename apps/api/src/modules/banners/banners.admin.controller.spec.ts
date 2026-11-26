/// <reference types="jest" />
import type { AdminBanner, CreateBanner, UpdateBanner } from '@bellum/contracts'
import { BannersAdminController } from './banners.admin.controller'
import type { BannersService } from './banners.service'

function makeService() {
  const list = jest.fn().mockResolvedValue([])
  const create = jest.fn().mockResolvedValue({ id: 'new' } as AdminBanner)
  const update = jest.fn().mockResolvedValue({ id: 'upd' } as AdminBanner)
  const toggle = jest.fn().mockResolvedValue({ id: 'tog' } as AdminBanner)
  const remove = jest.fn().mockResolvedValue(undefined)
  const service = { list, create, update, toggle, remove } as unknown as BannersService
  return { controller: new BannersAdminController(service), list, create, update, toggle, remove }
}

describe('BannersAdminController', () => {
  it('list wraps in a { banners } envelope', async () => {
    const { controller, list } = makeService()
    const out = await controller.list()
    expect(list).toHaveBeenCalled()
    expect(out).toEqual({ banners: [] })
  })

  it('create delegates with an operator label', async () => {
    const { controller, create } = makeService()
    const dto = { kind: 'announcement', titleFr: 'a', titleEn: 'b' } as unknown as CreateBanner
    await controller.create(dto)
    expect(create).toHaveBeenCalledWith(dto, 'dashboard-manager')
  })

  it('update delegates by id', async () => {
    const { controller, update } = makeService()
    const dto = { titleFr: 'x' } as UpdateBanner
    await controller.update('b1', dto)
    expect(update).toHaveBeenCalledWith('b1', dto)
  })

  it('toggle passes the active flag through', async () => {
    const { controller, toggle } = makeService()
    await controller.toggle('b1', { active: false })
    expect(toggle).toHaveBeenCalledWith('b1', false)
  })

  it('remove delegates and returns { removed: true }', async () => {
    const { controller, remove } = makeService()
    const out = await controller.remove('b1')
    expect(remove).toHaveBeenCalledWith('b1')
    expect(out).toEqual({ removed: true })
  })
})
