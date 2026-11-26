import { bannerStatus, fetchAdminBanners, type AdminBanner } from '@/lib/banners'
import { BannerCard } from './_components/banner-card'
import { BannerForm } from './_components/banner-form'

// Backoffice — admin-scheduled banners / announcements. Create + schedule +
// toggle persistent top-of-screen banners shown in the user app and/or the
// public website. Reads the cross-tenant admin endpoint (server-side, internal
// secret) and renders a create form + the live/scheduled/expired list.
export const dynamic = 'force-dynamic'

export default async function BannersPage() {
  let banners: AdminBanner[] = []
  let loadError: string | null = null
  try {
    banners = await fetchAdminBanners()
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err)
  }

  const now = new Date()

  return (
    <main className="wrap">
      <h1>Bandeaux / Annonces</h1>
      <p className="subtitle">
        Bandeaux persistants en haut d’écran (application + site public) : annonces, maintenance, offres. Programmables,
        bilingues FR/EN, activables/désactivables.
      </p>

      {loadError ? (
        <div className="error" style={{ marginBottom: 24 }}>
          Impossible de joindre l’endpoint admin de l’API.
          <br />
          {loadError}
          <br />
          Vérifie <code>API_BASE_URL</code> + <code>INTERNAL_API_SECRET</code> et que l’API tourne.
        </div>
      ) : null}

      <section className="card" style={{ marginBottom: 28 }}>
        <div className="label" style={{ marginBottom: 12 }}>
          Nouveau bandeau
        </div>
        <BannerForm mode="create" />
      </section>

      {banners.length === 0 && !loadError ? (
        <div className="empty">Aucun bandeau. Crée le premier ci-dessus.</div>
      ) : (
        <section style={{ display: 'grid', gap: 14 }}>
          {banners.map(b => (
            <BannerCard key={b.id} banner={b} status={bannerStatus(b, now)} />
          ))}
        </section>
      )}
    </main>
  )
}
