import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'

type BrailleTextVariant = 'orbit' | 'breathe' | 'snake' | 'pulse' | 'wave'
type GridVariant =
  | 'grid'
  | 'grid-importing'
  | 'grid-syncing'
  | 'grid-searching'
  | 'grid-spiral'
  | 'grid-columns'
  | 'grid-orbit'
  | 'grid-breathe'
  | 'grid-snake'
  | 'grid-pulse'
  | 'grid-wave'
  | 'grid-diagonal'

export type BrailleVariant = BrailleTextVariant | GridVariant

interface BrailleLoaderProps {
  variant?: BrailleVariant
  className?: string
  intervalMs?: number
  frames?: number[][]
  dotSize?: number
  dotGap?: number
}

const BRAILLE_FRAMES: Record<BrailleTextVariant, string[]> = {
  orbit: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  breathe: ['⠁', '⠉', '⠋', '⠛', '⠟', '⠿', '⠟', '⠛', '⠋', '⠉'],
  snake: ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'],
  pulse: ['⠀', '⠁', '⠋', '⠛', '⠿', '⣿', '⠿', '⠛', '⠋', '⠁'],
  wave: ['⠁', '⠂', '⠄', '⡀', '⡈', '⡐', '⡠', '⣀', '⣁', '⣂', '⣄', '⣌', '⣔', '⣤', '⣥', '⣦', '⣮', '⣶', '⣷', '⣿'],
}

const GRID = 5
const TOTAL = GRID * GRID

const buildDiagonalSweep = (): number[][] => {
  const diags: Record<number, number[]> = {}
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const d = r + c
      if (!diags[d]) diags[d] = []
      diags[d].push(r * GRID + c)
    }
  }
  const frames: number[][] = []
  let acc: number[] = []
  for (let d = 0; d <= 8; d++) {
    if (diags[d]) acc = [...acc, ...diags[d]]
    frames.push([...acc])
  }
  frames.push([])
  return frames
}

const GRID_FRAMES: Record<GridVariant, number[][]> = {
  grid: buildDiagonalSweep(),
  'grid-diagonal': buildDiagonalSweep(),
  'grid-importing': [
    [0, 4, 20, 24, 2, 6, 8, 10, 14, 16, 18, 22, 12],
    [1, 3, 5, 9, 15, 19, 21, 23, 7, 11, 13, 17],
    [2, 6, 8, 10, 14, 16, 18, 22, 12],
    [7, 11, 13, 17],
    [12],
    [7, 11, 13, 17],
    [2, 6, 8, 10, 14, 16, 18, 22, 12],
    [1, 3, 5, 9, 15, 19, 21, 23, 7, 11, 13, 17],
    [0, 4, 20, 24, 2, 6, 8, 10, 14, 16, 18, 22, 12],
  ],
  'grid-syncing': [
    [22, 17, 12, 7, 11, 13],
    [17, 12, 7, 2, 6, 8],
    [12, 7, 2, 1, 3],
    [7, 2],
    [2],
    [],
    [22],
    [22, 17, 21, 23],
    [22, 17, 12, 16, 18],
    [22, 17, 12, 7, 11, 13],
  ],
  'grid-searching': [
    [1, 5, 7, 6, 11],
    [2, 6, 8, 7, 12],
    [3, 7, 9, 8, 13],
    [8, 12, 14, 13, 18],
    [13, 17, 19, 18, 23],
    [12, 16, 18, 17, 22],
    [11, 15, 17, 16, 21],
    [6, 10, 12, 11, 16],
    [1, 5, 7, 6, 11],
  ],
  'grid-spiral': (() => {
    const order = [0, 1, 2, 3, 4, 9, 14, 19, 24, 23, 22, 21, 20, 15, 10, 5, 6, 7, 8, 13, 18, 17, 16, 11, 12]
    const frames: number[][] = []
    for (let i = 0; i < order.length; i += 2) frames.push(order.slice(0, i + 2))
    frames.push([])
    return frames
  })(),
  'grid-columns': [
    [0, 5, 10, 15, 20],
    [0, 1, 5, 6, 10, 11, 15, 16, 20, 21],
    [0, 1, 2, 5, 6, 7, 10, 11, 12, 15, 16, 17, 20, 21, 22],
    [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17, 18, 20, 21, 22, 23],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    [],
  ],
  'grid-orbit': [[0], [1], [2], [3], [4], [9], [14], [19], [24], [23], [22], [21], [20], [15], [10], [5]],
  'grid-breathe': [
    [12],
    [12, 7, 11, 13, 17],
    [12, 7, 11, 13, 17, 2, 6, 8, 10, 14, 16, 18, 22],
    [12, 7, 11, 13, 17, 2, 6, 8, 10, 14, 16, 18, 22, 1, 3, 5, 9, 15, 19, 21, 23],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    [12, 7, 11, 13, 17, 2, 6, 8, 10, 14, 16, 18, 22, 1, 3, 5, 9, 15, 19, 21, 23],
    [12, 7, 11, 13, 17, 2, 6, 8, 10, 14, 16, 18, 22],
    [12, 7, 11, 13, 17],
    [12],
    [],
  ],
  'grid-snake': [
    [0],
    [1],
    [2],
    [3],
    [4],
    [9],
    [8],
    [7],
    [6],
    [5],
    [10],
    [11],
    [12],
    [13],
    [14],
    [19],
    [18],
    [17],
    [16],
    [15],
    [20],
    [21],
    [22],
    [23],
    [24],
  ],
  'grid-pulse': [
    [],
    [12],
    [7, 11, 13, 17],
    [2, 6, 8, 10, 14, 16, 18, 22],
    [1, 3, 5, 9, 15, 19, 21, 23],
    [0, 4, 20, 24],
    [1, 3, 5, 9, 15, 19, 21, 23],
    [2, 6, 8, 10, 14, 16, 18, 22],
    [7, 11, 13, 17],
    [12],
  ],
  'grid-wave': [
    [0, 1, 2, 3, 4],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    [],
  ],
}

function isGridVariant(variant: BrailleVariant): variant is GridVariant {
  return variant === 'grid' || variant.startsWith('grid-')
}

interface CyclingBrailleLoaderProps extends Omit<BrailleLoaderProps, 'variant'> {
  variants: BrailleVariant[]
  cycleMs?: number
}

export function CyclingBrailleLoader({ variants, cycleMs = 3000, ...props }: CyclingBrailleLoaderProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (variants.length <= 1) return
    const id = setInterval(() => {
      setIndex(i => (i + 1) % variants.length)
    }, cycleMs)
    return () => clearInterval(id)
  }, [variants.length, cycleMs])

  return <BrailleLoader {...props} variant={variants[index]} />
}

export function BrailleLoader({
  variant = 'orbit',
  className,
  intervalMs,
  frames,
  dotSize = 2,
  dotGap = 1,
}: BrailleLoaderProps) {
  const [frame, setFrame] = useState(0)

  const grid = isGridVariant(variant)
  const gridFrames = grid ? (frames ?? GRID_FRAMES[variant]) : []
  // #3082 — jamais `!` collé à `grid` : Tailwind scanne ce fichier et en tirait
  // une variante `!important` du reset global `:where(.flex, .grid…) > *`.
  const brailleFrames = grid ? [] : BRAILLE_FRAMES[variant]
  const length = grid ? gridFrames.length : brailleFrames.length
  const ms = intervalMs ?? (grid ? 120 : 80)

  useEffect(() => {
    setFrame(0)
  }, [variant, frames])

  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % length), ms)
    return () => clearInterval(id)
  }, [length, ms])

  if (grid) {
    const lit = new Set(gridFrames[frame] ?? [])
    return (
      <span
        className={cn('inline-grid', className)}
        style={{ gridTemplateColumns: `repeat(${GRID}, ${dotSize}px)`, gap: dotGap }}
        role="status"
        aria-label="Loading"
      >
        {Array.from({ length: TOTAL }).map((_, i) => (
          <span
            key={i}
            className="rounded-full bg-current transition-opacity duration-100 ease-out"
            style={{ width: dotSize, height: dotSize, opacity: lit.has(i) ? 1 : 0.2 }}
          />
        ))}
      </span>
    )
  }

  return (
    <span className={cn('font-mono inline-block leading-none', className)} aria-label="Loading" role="status">
      {brailleFrames[frame]}
    </span>
  )
}
