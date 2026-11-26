import { Card, Text } from '@bellum/ui'
import { Kicker } from './Kicker'

type Testimonial = {
  quote: string
  name: string
  role: string
  company: string
  initials: string
}

/**
 * ⚠️ REAL quotes only — never fabricate testimonials (misleading + violates project rule
 * "JAMAIS de données fictives"). Section renders nothing until this array has real,
 * attributable quotes. Fill with actual customer/beta feedback, then it appears automatically.
 */
const TESTIMONIALS: Testimonial[] = []

export function Testimonials() {
  if (TESTIMONIALS.length === 0) return null

  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <Kicker center>Témoignages</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
          >
            Ce que disent les <span className="text-gradient-em">équipes commerciales</span>.
          </Text>
        </div>

        <div className="mt-12 grid animate-fade-up gap-4 md:grid-cols-3">
          {TESTIMONIALS.map(testimonial => (
            <Card
              key={testimonial.name}
              className="flex flex-col rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-7 backdrop-blur-[16px]"
            >
              <Text element="p" size="lg" color="text-zinc-200" className="flex-1 leading-relaxed">
                “{testimonial.quote}”
              </Text>
              <div className="mt-6 flex items-center gap-3">
                <span className="inline-flex size-11 items-center justify-center rounded-full border border-violet-500/25 bg-[linear-gradient(160deg,rgba(123,97,255,0.35),rgba(123,97,255,0.08))] text-sm font-semibold text-white">
                  {testimonial.initials}
                </span>
                <div>
                  <Text element="p" weight="medium" color="text-white" className="text-sm">
                    {testimonial.name}
                  </Text>
                  <Text element="p" size="sm" color="text-zinc-500">
                    {testimonial.role} · {testimonial.company}
                  </Text>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
