import type { PageSpec } from '../../types'

/**
 * /verify-email — saisie du code à 6 chiffres envoyé par email après
 * inscription. Écran centré, sans chrome autre que la marque : inspiré d’Orus,
 * délibérément sans autre affordance pour concentrer l’attention sur le code.
 *
 * Lu dans : `apps/web/src/routes/verify-email.tsx` → `VerifyEmailPage.tsx` →
 * `VerifyEmailCard.tsx` / `VerifyEmailForm.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/auth.json` (clé `verifyEmail`).
 */
export const verifyEmailPage: PageSpec = {
  id: 'app/verify-email',
  surface: 'app',
  domain: 'auth',
  route: 'apps/web/src/routes/verify-email.tsx',
  title: 'Code de vérification',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    brand: [{ type: 'component', component: 'BrandMark', props: { size: 'md' } }],
    primary: [
      { type: 'text', text: 'Code de vérification', style: 'title' },
      { type: 'text', text: 'Renseigne le code envoyé à l’adresse email', style: 'body', color: 'text/secondary' },
      { type: 'component', component: 'Badge', props: { content: { label: 'tu@entreprise.com' } } },
      { type: 'component', component: 'InputOTP', props: { content: { value: '' } } },
      { type: 'text', text: 'Expiration du code après un délai de 10 minutes.', style: 'caption', color: 'text/muted' },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Renvoyer le code' } },
      },
      {
        type: 'text',
        text: 'Conseil : vérifie ta boîte de réception et le dossier des courriers indésirables.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', size: 'sm', content: { label: 'Mauvais email ? Recommencer' } },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'InputOTP', props: { state: 'default', content: { value: '' } } }],
    error: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: { variant: 'danger', content: { title: 'Impossible d’envoyer un nouveau code.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'L’écran n’offre AUCUNE autre affordance que le code à saisir — délibérément, pour concentrer l’attention (inspiré d’Orus) : pas de menu, pas de navigation annexe.',
      source: 'apps/web/src/features/auth/components/VerifyEmailCard.tsx:13',
    },
    {
      kind: 'decision',
      text: 'Responsive : la carte (`max-w-md`) et le champ à 6 chiffres (deux groupes de 3, séparateur central) sont identiques de 360 à 1920 px. Au-delà (2560, 3440), on n’étire jamais le champ OTP ni la carte : la maquette cible un espace neutre plus large autour, jamais des cases de code démesurément agrandies.',
      source: 'apps/web/src/features/auth/components/VerifyEmailForm.tsx:81',
    },
  ],
}
