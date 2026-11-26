# i18n — internationalisation de `apps/web`

Socle **react-i18next**. Deux langues : **FR** (défaut + fallback) et **EN**.
Le FR est la référence produit : ses libellés doivent rester **identiques** à ce
qu'affichait l'app avant l'i18n (aucun changement visuel).

## Architecture

```
src/i18n/
  config.ts            # langues, namespaces, clés de stockage
  resources.ts         # map statique { fr, en } → JSON bundlés (pas de backend)
  index.ts             # init i18next (import à effet de bord)
  LanguageSwitcher.tsx # sélecteur FR/EN (variantes "icon" et "inline")
  locales/
    fr/<namespace>.json
    en/<namespace>.json
```

- Les ressources sont **bundlées statiquement** : `t()` est synchrone (marche en test).
- Détection de langue (`resolveInitialLanguage`, `detect.ts`) : `localStorage`
  (clé `bellum_lang`, choix explicite — **gagne toujours**) → sinon `navigator`
  (locale francophone `fr*` → **FR**, toute autre locale → **EN**) → fallback **FR**
  (SSR / pas de navigator). Un utilisateur qui a déjà choisi une langue la garde ;
  un nouvel utilisateur obtient FR si son navigateur est francophone, EN sinon.
  `caches: ['localStorage']` persiste chaque bascule du sélecteur (elle devient
  alors le choix explicite). FR reste le `fallbackLng` pour les clés manquantes.
- Init synchrone (`initImmediate: false`, `useSuspense: false`) → pas de flash de clés.

## Utilisation dans un composant

```tsx
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t } = useTranslation('dashboard') // namespace par défaut du composant
  return <h1>{t('header.title')}</h1>
}
```

- Clé inter-namespace : `t('common:actions.save')`.
- Le namespace par défaut global est `common` (boutons, toasts, erreurs génériques).

## Convention de clés

- **Un namespace par domaine** : `common`, `nav`, `auth`, `onboarding`,
  `dashboard`, `search`, `billing`, `settings`, … (voir `NAMESPACES` dans `config.ts`).
- Structure : `namespace.section.key` (JSON imbriqué **max 3 niveaux**).
  - `section` = zone d'écran ou groupe logique (`header`, `form`, `emptyState`, `errors`, `cta`…).
  - `key` = rôle du texte en camelCase (`title`, `subtitle`, `submitLabel`, `emailPlaceholder`…).
- **Réutiliser `common`** pour tout ce qui est transverse (Enregistrer, Annuler,
  Fermer, « Bientôt disponible », erreurs génériques, toasts). Ne pas redupliquer.
- Nommer par **rôle**, pas par contenu : `t('form.submitLabel')`, pas `t('form.seConnecter')`.

### Interpolation

```json
{ "welcome": "Bonjour {{name}}" }
```

```tsx
t('welcome', { name: user.firstName })
```

### Pluriels

react-i18next gère les pluriels via les suffixes `_one` / `_other` :

```json
{ "creditsLeft_one": "{{count}} crédit restant", "creditsLeft_other": "{{count}} crédits restants" }
```

```tsx
t('creditsLeft', { count })
```

## Ajouter un namespace

1. Créer `locales/fr/<ns>.json` et `locales/en/<ns>.json`.
2. Les importer + les enregistrer dans `resources.ts`.
3. Ajouter `<ns>` à `NAMESPACES` dans `config.ts`.

## Règles de traduction

- **FR = source de vérité visuelle** : reprendre le texte exact d'origine (accents,
  ponctuation, apostrophes typographiques `'`, points de suspension `…`).
- **EN = traduction professionnelle** : ton produit SaaS B2B, concis, pas de
  charabia ni de placeholder. Respecter l'intention, pas le mot-à-mot.
- Ne jamais concaténer des fragments traduits : utiliser l'interpolation.
- Les noms de marque (BellumAI, Stripe, HubSpot…) ne se traduisent pas.

## Tests

`t()` fonctionne en test car `src/test/setup.ts` importe `@/i18n`. La langue par
défaut y est FR. Pour tester l'EN, appeler `i18n.changeLanguage('en')`.
