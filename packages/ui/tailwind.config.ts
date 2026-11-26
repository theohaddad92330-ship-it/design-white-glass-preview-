import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

// Tailwind preset for @bellum/ui. Apps consume it by either:
//   - extending `content` with `../../packages/ui/src/<<all-tsx>>`, OR
//   - using this file as a `presets:` entry in their own tailwind.config.
//
// Theme tokens map to CSS variables (--background, --foreground, …) declared
// by the consuming app's globals so each app can theme independently while
// sharing the component shape.

/**
 * Théo DS — les RÔLES de forme, d'ombre et de mouvement de la maquette V22
 * (relevé `docs/maquettes/theo-v22/_ds/releve.md` §1.2, §1.5, §3.2).
 *
 * Chaque nom pointe sur un jeton `--bellum-*` de `apps/web/src/styles/tokens.css` :
 * la valeur vit LÀ, ce thème ne fait que la nommer. Exporté pour que
 * `apps/web/tailwind.config.ts` le consomme au lieu de le recopier (GA-26).
 */
export const theoTheme = {
  // Théo DS §1.5 — carte 18, surcouche 12, contrôle 8, badge 6 (`rounded-card`…).
  borderRadius: {
    card: 'var(--bellum-radius-card)',
    overlay: 'var(--bellum-radius-overlay)',
    control: 'var(--bellum-radius-control)',
    badge: 'var(--bellum-radius-badge)',
  },
  // Théo DS §1.2 — `--shadow` et `--v22-shadow` (`shadow-card`, `shadow-overlay`).
  boxShadow: {
    card: 'var(--bellum-shadow-card)',
    overlay: 'var(--bellum-shadow-overlay)',
  },
  // Théo DS §3.2 — les paliers de `motion.ts` en CSS (`duration-immediate`, `ease-bellum-out`).
  transitionDuration: {
    immediate: 'var(--bellum-motion-immediate)',
    perceptible: 'var(--bellum-motion-perceptible)',
    narrative: 'var(--bellum-motion-narrative)',
  },
  transitionTimingFunction: {
    'bellum-out': 'var(--bellum-ease-out)',
  },
  // Coque Théo — la pile système de la maquette, écrite UNE fois dans `tokens.css` (`--bellum-font-*`).
  fontFamily: {
    sans: ['var(--bellum-font-sans)'],
    mono: ['var(--bellum-font-mono)'],
  },
} as const

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* shadcn semantic tokens (mapped to --bellum-* in each app's index.css) */
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        /* Bellum design tokens — direct CSS var references.
         * Use these when you need brand-specific colors, e.g.:
         *   bg-bellum-surface-1   border-bellum-border   text-bellum-success */
        bellum: {
          /* Théo DS §1.1 — remplissage primaire thématisé, aplat et trait d'accent */
          primary: 'var(--bellum-primary)',
          'primary-hover': 'var(--bellum-primary-hover)',
          'accent-bg': 'var(--bellum-accent-bg)',
          'accent-line': 'var(--bellum-accent-line)',
          'text-accent': 'var(--bellum-text-accent)',
          'border-strong': 'var(--bellum-border-strong)',
          'row-hover': 'var(--bellum-row-hover)',
          /* Primary scale */
          'primary-50': 'var(--bellum-primary-50)',
          'primary-100': 'var(--bellum-primary-100)',
          'primary-200': 'var(--bellum-primary-200)',
          'primary-300': 'var(--bellum-primary-300)',
          'primary-400': 'var(--bellum-primary-400)',
          'primary-500': 'var(--bellum-primary-500)',
          'primary-600': 'var(--bellum-primary-600)',
          'primary-700': 'var(--bellum-primary-700)',
          'primary-800': 'var(--bellum-primary-800)',
          'primary-900': 'var(--bellum-primary-900)',
          /* Surfaces */
          bg: 'var(--bellum-bg)',
          'bg-lighter': 'var(--bellum-bg-lighter)',
          'bg-darker': 'var(--bellum-bg-darker)',
          sidebar: 'var(--bellum-sidebar)',
          'surface-1': 'var(--bellum-surface-1)',
          'surface-2': 'var(--bellum-surface-2)',
          border: 'var(--bellum-border)',
          /* Text */
          'text-primary': 'var(--bellum-text-primary)',
          'text-secondary': 'var(--bellum-text-secondary)',
          'text-muted': 'var(--bellum-text-muted)',
          /* Semantic */
          success: 'var(--bellum-success)',
          warning: 'var(--bellum-warning)',
          danger: 'var(--bellum-danger)',
          info: 'var(--bellum-info)',
        },
      },
      fontFamily: { ...theoTheme.fontFamily },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        ...theoTheme.borderRadius,
      },
      boxShadow: { ...theoTheme.boxShadow },
      transitionDuration: { ...theoTheme.transitionDuration },
      transitionTimingFunction: { ...theoTheme.transitionTimingFunction },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
