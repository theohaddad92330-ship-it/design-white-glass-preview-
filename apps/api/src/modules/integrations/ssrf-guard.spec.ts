import { assertSafeOutboundUrl, ipIsBlocked } from './ssrf-guard'

describe('ssrf-guard', () => {
  describe('ipIsBlocked', () => {
    it.each([
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.9',
      '172.31.255.255',
      '192.168.1.20',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '224.0.0.1', // multicast
      '::1',
      'fe80::1',
      'fc00::1',
      'fd12::1',
      '::ffff:10.0.0.1', // IPv4-mapped private
    ])('blocks internal address %s', ip => {
      expect(ipIsBlocked(ip)).toBe(true)
    })

    it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])('allows public address %s', ip => {
      expect(ipIsBlocked(ip)).toBe(false)
    })
  })

  describe('assertSafeOutboundUrl', () => {
    it('rejects non-https', async () => {
      await expect(assertSafeOutboundUrl('http://8.8.8.8/hook')).rejects.toThrow('https')
    })

    it.each([
      'https://127.0.0.1/hook',
      'https://169.254.169.254/latest/meta-data/',
      'https://10.0.0.1/hooks/abc',
      'https://[::1]/hook',
      'https://localhost/hook',
    ])('rejects internal target %s', async url => {
      await expect(assertSafeOutboundUrl(url)).rejects.toThrow('interne')
    })

    it.each(['https://8.8.8.8/hook', 'https://1.1.1.1/hooks/abc'])('allows public IP literal %s', async url => {
      await expect(assertSafeOutboundUrl(url)).resolves.toBeUndefined()
    })

    it('rejects an unparseable URL', async () => {
      await expect(assertSafeOutboundUrl('not-a-url')).rejects.toThrow()
    })
    // #4406.1 — le tunnel DÉCLARÉ (Beeper Desktop) peut parler http ; il ne rouvre JAMAIS une IP privée.
    it('allowHttp: accepts http on a public host, still refuses localhost and private IPs', async () => {
      await expect(assertSafeOutboundUrl('http://93.184.216.34/x', { allowHttp: true })).resolves.toBeUndefined()
      await expect(assertSafeOutboundUrl('http://93.184.216.34/x')).rejects.toThrow('https')
      await expect(assertSafeOutboundUrl('http://localhost:23373', { allowHttp: true })).rejects.toThrow('interne')
      await expect(assertSafeOutboundUrl('http://127.0.0.1:23373', { allowHttp: true })).rejects.toThrow('interne')
      await expect(assertSafeOutboundUrl('http://192.168.1.5:23373', { allowHttp: true })).rejects.toThrow('interne')
      await expect(assertSafeOutboundUrl('ftp://93.184.216.34', { allowHttp: true })).rejects.toThrow()
    })
  })
})
