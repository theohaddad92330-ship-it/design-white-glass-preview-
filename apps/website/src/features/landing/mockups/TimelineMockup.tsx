const ACTIONS = [
  { date: 'Sem 1', label: 'Prise de contact DSI', done: true },
  { date: 'Sem 2', label: 'Démo solution Cloud', done: false },
  { date: 'Mois 2', label: 'Proposition commerciale', done: false },
]

export function TimelineMockup() {
  return (
    <div className="rounded-2xl p-5 bg-[#111118] border border-white/[0.06]">
      <div className="text-xs uppercase tracking-wider mb-3 text-zinc-500">Plan d'action — 3 mois</div>
      <div className="space-y-2.5">
        {ACTIONS.map(a => (
          <div key={a.date} className="flex items-center gap-3">
            <div
              className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                a.done ? 'border-green-500 bg-green-500/10' : 'border-violet-600/40 bg-transparent'
              }`}
            >
              {a.done && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
            </div>
            <div className="flex-1">
              <div className="text-xs font-medium text-white">{a.label}</div>
            </div>
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-[#1A1A24] text-zinc-500 border border-white/[0.06]">
              {a.date}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
