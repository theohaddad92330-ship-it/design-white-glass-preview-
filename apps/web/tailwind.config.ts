import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'
import tailwindcssAnimate from 'tailwindcss-animate'
import { theoTheme } from '@bellum/ui/tailwind.config'

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    // Scan @bellum/ui sources so Tailwind picks up classes used by shared
    // components — without this, JIT would purge them in prod builds.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      /**
       * L'échelle d'empilement — les seules valeurs autorisées au-dessus de
       * `z-50` (décision de design du 23/08).
       *
       * Le dépôt avait `z-[9997]`, `z-[9998]` et `z-[9999]` : trois nombres
       * choisis pour « passer au-dessus de tout », qui se comparent entre eux
       * par hasard. Un quatrième composant aurait écrit 10000, et le premier
       * qui aurait voulu passer devant le suivant n'aurait eu aucun moyen de
       * savoir contre quoi il se bat.
       *
       * Nommer l'intention rend l'ordre lisible : un sélecteur d'élément passe
       * devant la bulle qui l'a ouvert, et la barre de développement passe
       * devant tout parce qu'elle sert justement à regarder ce qu'il y a
       * dessous.
       */
      zIndex: {
        nav: '40',
        overlay: '60',
        /**
         * #2212.2 — le spotlight du guide, AU-DESSUS d'une modale (60) et en
         * dessous des notifications (70).
         *
         * Au-dessus d'une modale parce qu'un pas de guide peut désigner une
         * cible DANS un tiroir ou une modale (#2212.25) : à 60 ou moins, le
         * halo passerait derrière ce qu'il désigne. En dessous d'une
         * notification parce qu'une alerte doit rester lisible — un guide ne
         * passe jamais devant ce qui prévient.
         */
        guide: '65',
        toast: '70',
        widget: '80',
        picker: '90',
        devtools: '100',
      },
      // Coque Théo — la pile système de la maquette, lue dans `@bellum/ui/tailwind.config` (GA-26).
      fontFamily: { ...theoTheme.fontFamily },
      colors: {
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
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // Théo DS §1.5 — `rounded-card|overlay|control|badge`, nommés dans
        // `@bellum/ui/tailwind.config` (un réglage, un endroit : GA-26).
        ...theoTheme.borderRadius,
      },
      /**
       * `xs` seule : Tailwind 3.4 (la version installée) n'étend `boxShadow`
       * avec aucun autre palier — `sm`/`md`/`lg` viennent de son thème par
       * défaut. `xs` est un nom de Tailwind 4 ; sans cette entrée, la classe
       * ne génère AUCUNE CSS et l'ombre écrite dans le JSX ne se peint jamais
       * (mesuré en production, GA-328 `laura-surface-finish.test.ts`).
       * Valeur reprise telle quelle du thème par défaut de Tailwind 4.
       */
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        // Théo DS §1.2 — `shadow-card`, `shadow-overlay`.
        ...theoTheme.boxShadow,
      },
      // Théo DS §3.2 — `duration-immediate|perceptible|narrative`, `ease-bellum-out` (motion.ts).
      transitionDuration: { ...theoTheme.transitionDuration },
      transitionTimingFunction: { ...theoTheme.transitionTimingFunction },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    /**
     * `pointer-coarse:` — le doigt, et non la largeur d'écran.
     *
     * La règle des 44 px de cible tactile ne dépend PAS de la taille de la
     * fenêtre : une tablette avec une souris n'en a pas besoin, un petit
     * portable tactile si. `(pointer: coarse)` pose la question qui compte —
     * « avec quoi cette personne pointe-t-elle ? » — là où `md:` répond à une
     * autre.
     *
     * Utilisé pour agrandir la ZONE tactile sans changer la taille visible :
     * une croix de fermeture reste une croix, sa cible passe de 24 à 44 px.
     */
    plugin(({ addVariant }) => {
      addVariant('pointer-coarse', '@media (pointer: coarse)')
      addVariant('pointer-fine', '@media (pointer: fine)')
    }),
  ],
}

export default config
