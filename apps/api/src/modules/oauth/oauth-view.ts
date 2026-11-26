import { DEFAULT_BRAND_NAME } from '@bellum/contracts'
import { parseScope } from './oauth-consent.service'

/** Minimal HTML escaping for values interpolated into the consent page. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * ⚠️ Les libellés PORTENT la marque — marque blanche, 01/09/2026.
 *
 * Cette page est servie à l'utilisateur au moment où il autorise une
 * application tierce : c'est un écran de CONFIANCE. Y lire le nom d'un
 * fournisseur qu'il ne connaît pas est précisément ce qui fait renoncer.
 *
 * C'est une fonction et non une constante pour cette seule raison : une
 * `Record` figée ne peut pas porter une valeur qui change par espace.
 */
const scopeLabels = (brandName: string): Record<string, string> => ({
  'mcp:read': `Lire vos comptes, contacts et plans d’action ${brandName}, et poser des questions sur vos dossiers`,
  'mcp:analysis': 'Lancer des analyses et des enrichissements de contact (consomme vos crédits, avec confirmation)',
  'mcp:act':
    'Agir en votre nom : envoyer un email de contact, exporter un contact vers votre CRM, ajouter une action au plan',
})

type ConsentPageParams = {
  clientName: string
  scope: string
  consentToken: string
  hidden: Record<string, string>
  userEmail: string
  /** La marque de l'espace de l'utilisateur qui autorise. */
  brandName: string
}

/** A self-contained, framework-free consent page served from the API origin. */
export function renderConsentPage(params: ConsentPageParams): string {
  const scopes = parseScope(params.scope)
  const scopeItems = scopes
    .map(s => `<li><strong>${esc(scopeLabels(params.brandName)[s] ?? s)}</strong> <code>${esc(s)}</code></li>`)
    .join('')
  const hiddenFields = Object.entries(params.hidden)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}" />`)
    .join('')

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Autoriser l’accès — ${esc(params.brandName)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; display: grid; min-height: 100vh; place-items: center; background: #0b0f19; color: #e5e7eb; }
  .card { width: min(440px, 92vw); background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 32px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { color: #9ca3af; margin: 0 0 20px; font-size: 14px; }
  .app { font-weight: 600; }
  ul { list-style: none; padding: 0; margin: 0 0 24px; display: grid; gap: 10px; }
  li { background: #0b0f19; border: 1px solid #1f2937; border-radius: 10px; padding: 12px 14px; font-size: 14px; }
  li code { color: #6b7280; font-size: 12px; }
  .row { display: flex; gap: 12px; }
  button { flex: 1; padding: 12px; border-radius: 10px; border: 0; font-size: 15px; font-weight: 600; cursor: pointer; }
  button.approve { background: #6366f1; color: white; }
  button.deny { background: transparent; color: #9ca3af; border: 1px solid #374151; }
  .who { color: #6b7280; font-size: 12px; margin-top: 16px; text-align: center; }
  .warn { color: #fbbf24; font-size: 12px; line-height: 1.4; background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.25); border-radius: 8px; padding: 10px 12px; margin: 12px 0; }
</style>
</head>
<body>
  <div class="card">
    <h1>Autoriser <span class="app">${esc(params.clientName)}</span> ?</h1>
    <p class="sub">Cette application demande l’accès à votre compte ${esc(params.brandName)} pour :</p>
    <ul>${scopeItems}</ul>
    <p class="warn">⚠️ Ce nom est déclaré par l’application elle-même et n’est pas vérifié par ${esc(params.brandName)}. N’autorisez que si vous faites confiance à sa source.</p>
    <form method="post" action="/oauth/authorize/decision">
      ${hiddenFields}
      <input type="hidden" name="consent_token" value="${esc(params.consentToken)}" />
      <div class="row">
        <button class="deny" type="submit" name="decision" value="deny">Refuser</button>
        <button class="approve" type="submit" name="decision" value="approve">Autoriser</button>
      </div>
    </form>
    <p class="who">Connecté en tant que ${esc(params.userEmail)}</p>
  </div>
</body>
</html>`
}

/**
 * A terminal error page shown when we must NOT redirect (untrusted client).
 *
 * ⚠️ `brandName` a un REPLI, contrairement à la page de consentement : cette
 * page se sert justement quand quelque chose a échoué — parfois avant qu'on
 * ait pu résoudre l'espace de l'utilisateur. Un titre vide serait pire qu'un
 * titre générique, et on ne devine jamais une marque.
 */
export function renderErrorPage(title: string, detail: string, brandName = DEFAULT_BRAND_NAME): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /><title>Erreur — ${esc(brandName)}</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0f19;color:#e5e7eb;display:grid;min-height:100vh;place-items:center;margin:0}
.card{width:min(440px,92vw);background:#111827;border:1px solid #1f2937;border-radius:16px;padding:32px}
h1{font-size:18px;margin:0 0 8px}p{color:#9ca3af;font-size:14px;margin:0}</style></head>
<body><div class="card"><h1>${esc(title)}</h1><p>${esc(detail)}</p></div></body></html>`
}
