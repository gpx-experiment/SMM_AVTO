import { PLAYBOOK } from "@/lib/playbook";
import { Card, PageHeader, Badge } from "@/components/ui";

export default function Playbook() {
  return (
    <div className="space-y-6">
      <PageHeader title="Приёмы SMM и таргетинга" subtitle="Всё, что ИИ-менеджер применяет при анализе, планировании и продвижении. Только белые методы: без накруток и ботов." />
      {PLAYBOOK.map((g) => (
        <Card key={g.id} title={g.title} action={<Badge tone="mint">{g.tactics.length} приёмов</Badge>}>
          <div className="grid gap-3 md:grid-cols-2">
            {g.tactics.map((t) => (
              <div key={t.title} className="rounded-2xl bg-paper p-4">
                <div className="font-semibold">{t.title}</div>
                <p className="mt-1 text-sm text-mute">{t.how}</p>
                <p className="mt-2 text-xs font-semibold text-ink"><span className="mr-1 rounded-full bg-mint px-2 py-0.5">в платформе</span>{t.auto}</p>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
