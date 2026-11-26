import { WebsiteBannerBar, type WebsitePublicBanner } from './WebsiteBannerBar'

// Server component: fetches the currently-active website-placement banners from
// the public API and renders them. `API_URL` is server-only (no NEXT_PUBLIC_):
// the browser never calls the API directly, so there is no CORS dependency —
// mirrors the /api/status proxy. Fails gracefully to nothing (never invents
// content) and revalidates on a short window to stay cheap.
const API_URL = process.env.API_URL ?? 'https://api.bellum-ai.com'

export async function WebsiteBanners({ locale }: { locale: string }) {
  let banners: WebsitePublicBanner[] = []
  try {
    const res = await fetch(new URL('/banners?placement=website&audience=all', API_URL), {
      next: { revalidate: 30 },
    })
    if (res.ok) {
      const data = (await res.json()) as { banners?: WebsitePublicBanner[] }
      banners = data.banners ?? []
    }
  } catch {
    banners = []
  }

  if (banners.length === 0) return null
  return <WebsiteBannerBar banners={banners} locale={locale} />
}
