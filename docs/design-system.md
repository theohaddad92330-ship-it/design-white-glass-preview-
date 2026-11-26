# Bellum AI — Design System

## Philosophie : Qonto-style

Le violet (`--bellum-primary-*`) est une **couleur d'accentuation**, pas une couleur de marque envahissante.
Il apparaît **uniquement sur** :

- Bouton CTA primaire (`<Button variant="default">`)
- État actif / sélectionné (sidebar item, onglet actif)
- Focus ring (`:focus-visible`)
- Badge `primary` (compteur, "nouveau")

Partout ailleurs : neutre chaud, surfaces lisibles, typographie sans fioriture.

---

## Palette

### Primaire — Violet (#5B3EE8)

| Token                      | Hex           | Usage                               |
| -------------------------- | ------------- | ----------------------------------- |
| `--bellum-primary-50`      | `#F4F2FF`     | Fond subtil hover (light mode)      |
| `--bellum-primary-100`     | `#E0D9FF`     | Fond subtle sélectionné             |
| `--bellum-primary-200`     | `#C4B8FF`     | —                                   |
| `--bellum-primary-300`     | `#9E87FF`     | —                                   |
| `--bellum-primary-400`     | `#7B5FFF`     | Texte accent dark mode              |
| **`--bellum-primary-500`** | **`#5B3EE8`** | **CTA button, active state, focus** |
| `--bellum-primary-600`     | `#3A26A0`     | Hover / pressed du CTA              |
| `--bellum-primary-700`     | `#271B6E`     | Active pressed                      |
| `--bellum-primary-800`     | `#1A1140`     | —                                   |
| `--bellum-primary-900`     | `#0E0A22`     | —                                   |

### Surfaces — Dark mode (défaut)

| Token                 | Hex       | Usage                                            |
| --------------------- | --------- | ------------------------------------------------ |
| `--bellum-bg-lighter` | `#171714` | Fond interactif discret, footer/sidebar controls |
| `--bellum-bg`         | `#0F0F0D` | Background app                                   |
| `--bellum-bg-darker`  | `#090907` | Fond très bas, zones compactes                   |
| `--bellum-sidebar`    | `#141412` | Sidebar                                          |
| `--bellum-surface-1`  | `#1C1C19` | Cards, panneaux                                  |
| `--bellum-surface-2`  | `#252522` | Input fill, hover state                          |
| `--bellum-border`     | `#3A3A32` | Bordures                                         |

### Surfaces — Light mode

| Token                 | Hex       | Usage                                            |
| --------------------- | --------- | ------------------------------------------------ |
| `--bellum-bg-lighter` | `#FAF9F6` | Fond interactif discret, footer/sidebar controls |
| `--bellum-bg`         | `#F5F4F0` | Background app                                   |
| `--bellum-bg-darker`  | `#E8E6DF` | Fond légèrement encaissé                         |
| `--bellum-sidebar`    | `#FFFFFF` | Sidebar                                          |
| `--bellum-surface-1`  | `#FFFFFF` | Cards                                            |
| `--bellum-surface-2`  | `#EDECEA` | Input fill, sections                             |
| `--bellum-border`     | `#DDDCD6` | Bordures                                         |

### Texte — Dark mode

| Token                     | Hex       |
| ------------------------- | --------- |
| `--bellum-text-primary`   | `#F0EEE8` |
| `--bellum-text-secondary` | `#A8A69E` |
| `--bellum-text-muted`     | `#6A6A62` |

### Texte — Light mode

| Token                     | Hex       |
| ------------------------- | --------- |
| `--bellum-text-primary`   | `#1A1A18` |
| `--bellum-text-secondary` | `#6A6A62` |
| `--bellum-text-muted`     | `#AEADA6` |

### Sémantiques (identiques dans les deux modes)

| Token              | Hex       | Usage                  |
| ------------------ | --------- | ---------------------- |
| `--bellum-success` | `#1ECFA0` | Succès, online, validé |
| `--bellum-warning` | `#F5A623` | Avertissement          |
| `--bellum-danger`  | `#FF5E57` | Erreur, destruction    |
| `--bellum-info`    | `#3B8BD4` | Information            |

---

## Typographie

**Famille** : Geist (sans) + Geist Mono (code/numbers)
**Justification** : Geist est la typographie de Vercel/Linear, clean, dense, optimale en dark mode. Pas "Inter par défaut".

| Classe          | Taille | Poids | Usage                   |
| --------------- | ------ | ----- | ----------------------- |
| `.text-display` | 36px   | 700   | Hero, onboarding        |
| `.text-title`   | 24px   | 700   | Titres de page          |
| `.text-heading` | 18px   | 600   | Sous-titres de section  |
| `.text-body`    | 14px   | 400   | Corps de texte          |
| `.text-caption` | 12px   | 500   | Légendes, metadata      |
| `.text-label`   | 11px   | 500   | Labels de champs        |
| `.text-mono`    | 14px   | 500   | IDs, valeurs numériques |

**Règle** : `letter-spacing` léger uniquement (0.03–0.04em). Jamais `uppercase tracking-wider`.

---

## Espacement (8px grid)

```
4px  → gap-1  — icônes adjacentes
8px  → gap-2  — éléments inline
12px → gap-3  — éléments dans une row
16px → gap-4  — espacement standard
24px → gap-6  — entre sections d'un panel
32px → gap-8  — entre blocs
48px → gap-12 — entre sections de page
```

---

## Border radius

| Token               | Valeur             | Usage                        |
| ------------------- | ------------------ | ---------------------------- |
| `--radius-sm`       | `6px`              | Tags, badges                 |
| `--radius-md`       | `10px`             | Inputs, boutons              |
| `--radius-lg`       | `14px`             | Cards                        |
| `--radius-xl`       | `20px`             | Modals, overlays             |
| `--radius` (shadcn) | `0.625rem` (≈10px) | Défaut Tailwind `rounded-lg` |

---

## Ombres

```
--shadow-card     → contour discret + 1px border
--shadow-elevated → relief pour dropdowns/modals
--shadow-glow-violet → halo primary (usage RARE : KPI scores uniquement)
```

---

## Breakpoints

```
sm:  640px
md:  768px
lg:  1024px
xl:  1280px
2xl: 1536px
```

---

## Règles d'usage du violet — DO / DON'T

### ✓ DO

- `<Button>` principal d'une page (un seul par vue)
- Indicateur actif sur la sidebar (`border-l-2 border-[var(--bellum-primary-500)]`)
- Focus ring (`:focus-visible`)
- `<Badge variant="primary">` pour un compteur ou état "actif"
- Lien inline (`text-[var(--bellum-primary-400)]`)

### ✗ DON'T

- Background de card, section, header
- Gradient violet sur le hero ou le fond d'écran
- Texte de titre en violet
- Icônes en violet par défaut (utiliser `text-muted-foreground`)
- Plus d'un élément violet par section

---

## Composants @bellum/ui

| Composant     | Fichier                 | Notes                                                                                           |
| ------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `Button`      | `components/button.tsx` | `default`/`violet` = CTA primaire plat, `black` = CTA contrasté, `light` = action claire/neutre |
| `Badge`       | `components/badge.tsx`  | `primary`, `success`, `warning`, `danger`, `info`, `outline`                                    |
| `Switch`      | `components/switch.tsx` | Checked = `--bellum-primary-500`                                                                |
| `variants.ts` | `atoms/variants.ts`     | Palette sémantique réutilisable                                                                 |

---

## Références

- **Qonto** — couleur de marque verte uniquement sur CTA + active states, UI ultra-propre

---

## Pattern — Veille portefeuille

- Hiérarchie : KPI compacts, liste opérationnelle dominante, détail contextuel en sidebar.
- Densité : lignes de 72–88 px, séparateurs simples, aucune card imbriquée.
- Sélection : fond `--bellum-surface-2` et liseré primaire de 3 px.
- Motion : uniquement le changement de panneau (`opacity` + `translate3d`, 180 ms, ease-out).
- Responsive : le détail passe sous la liste avant `xl`; les métadonnées secondaires se replient sur mobile.
- États requis : chargement, erreur, liste vide, filtre sans résultat, sélection et focus clavier.

---

## Pattern — Historique d'actions

- Produit : audit trail opérationnel pour équipes sales/ops B2B, priorité à la lecture rapide et à la confiance.
- Palette : surfaces neutres `--bellum-bg` / `--bellum-surface-1`, violet réservé aux onglets actifs et liens de sécurité.
- Typo : titre de page 36px, headers de table 14px medium, contenu 14-16px; chiffres et dates restent sobres.
- Layout : table dominante + panneau contextuel à droite dès `xl`; sur mobile, les lignes deviennent des blocs empilés.
- Espacement : grille 8px, lignes 72-80px, contrôles min-height 44px pour touch targets.
- Motion : transitions limitées aux couleurs, opacité et press feedback sous 180ms; pas d'animation de table répétitive.
- États requis : filtre actif, période, menu de ligne, pagination désactivée, focus visible, responsive sans overlap.
