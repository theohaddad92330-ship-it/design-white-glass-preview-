# @bellum/email

Package dédié aux templates transactionnels avec `react-email`.

## Structure

- `src/layouts` : layouts globaux des emails.
- `src/components` : composants réutilisables.
- `src/templates` : templates métiers.
- `src/render.ts` : helpers pour générer `html/text/subject` côté backend.

## Développement local

Depuis la racine du monorepo :

```bash
pnpm --filter @bellum/email dev
```

Puis ouvrir la preview React Email (par défaut <http://localhost:3000>) pour voir les templates.

## Ajouter un nouveau template

1. Créer `src/templates/<nom>-email.tsx` avec un composant exporté + `PreviewProps`.
2. Réutiliser `BaseLayout` + composants de `src/components`.
3. Ajouter les exports dans `src/index.ts`.
4. Si nécessaire pour l'envoi backend, créer un helper de rendu dans `src/render.ts`.
