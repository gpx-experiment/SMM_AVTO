// Простой планировщик для своего сервера: дёргает /api/cron раз в минуту.
const url = process.env.CRON_URL ?? `${process.env.APP_URL ?? "http://localhost:3000"}/api/cron`;
const headers = process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {};
async function tick() {
  try { const r = await fetch(url, { headers }); console.log(new Date().toISOString(), r.status, await r.text()); }
  catch (e) { console.error(new Date().toISOString(), e.message); }
}

setTimeout(() => { tick(); setInterval(tick, 60_000); }, 15_000); // ждём, пока поднимется сайт
