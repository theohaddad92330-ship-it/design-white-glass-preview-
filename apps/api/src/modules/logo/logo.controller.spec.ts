/**
 * logo.controller.spec.ts — end-to-end over HTTP, because the whole point of
 * this endpoint is the RESPONSE HEADERS (a stable, disk-cacheable same-origin
 * URL). Asserting them through a real Nest app is the only way to know the
 * `@Header` decorator and the failure-path override actually land on the wire.
 */
/// <reference types="jest" />
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { LogoController } from './logo.controller'
import { LogoService } from './logo.service'

const APOLLO = 'https://zenprospect-production.s3.amazonaws.com/uploads/pictures/abc/original_logo.png'

describe('LogoController (e2e)', () => {
  let app: INestApplication
  let fetchLogo: jest.Mock

  beforeEach(async () => {
    fetchLogo = jest.fn()
    const moduleRef = await Test.createTestingModule({
      controllers: [LogoController],
      providers: [{ provide: LogoService, useValue: { fetchLogo } }],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('on a resolved logo', () => {
    beforeEach(() => {
      fetchLogo.mockResolvedValue({ body: Buffer.from([137, 80, 78, 71]), contentType: 'image/png' })
    })

    it('serves the bytes with the upstream content type', async () => {
      const res = await request(app.getHttpServer()).get('/logo').query({ src: APOLLO }).expect(200)
      expect(res.headers['content-type']).toContain('image/png')
      expect(Buffer.from(res.body)).toEqual(Buffer.from([137, 80, 78, 71]))
    })

    it('marks the response immutable for a month — the reason this endpoint exists', async () => {
      const res = await request(app.getHttpServer()).get('/logo').query({ src: APOLLO }).expect(200)
      expect(res.headers['cache-control']).toBe('public, max-age=2592000, immutable')
    })

    it('passes both query params through to the resolver', async () => {
      await request(app.getHttpServer()).get('/logo').query({ src: APOLLO, domain: 'vinci.com' }).expect(200)
      expect(fetchLogo).toHaveBeenCalledWith({ src: APOLLO, domain: 'vinci.com' })
    })
  })

  describe('when nothing resolves', () => {
    beforeEach(() => fetchLogo.mockResolvedValue(null))

    it('404s so the avatar falls back to initials', async () => {
      await request(app.getHttpServer()).get('/logo').query({ domain: 'vinci.com' }).expect(404)
    })

    it('does NOT cache the miss for a month — a blip must not stick for 30 days', async () => {
      const res = await request(app.getHttpServer()).get('/logo').query({ domain: 'vinci.com' }).expect(404)
      expect(res.headers['cache-control']).not.toContain('immutable')
      expect(res.headers['cache-control']).toBe('public, max-age=300')
    })

    it('404s (never 500s) when the service itself blows up', async () => {
      fetchLogo.mockRejectedValue(new Error('boom'))
      await request(app.getHttpServer()).get('/logo').query({ domain: 'vinci.com' }).expect(404)
    })

    it('404s on a bare call with no params at all', async () => {
      await request(app.getHttpServer()).get('/logo').expect(404)
    })
  })
})
