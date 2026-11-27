# SMM Avto

Единая платформа для Instagram, Facebook, TikTok и YouTube: общая статистика, публикация и планирование постов, управление рекламой (Meta, TikTok Ads) и ИИ-SMM-менеджер на Claude.

## Запуск (демо-режим, без ключей)

```bash
npm install
cp .env.example .env        # впишите TOKEN_ENCRYPTION_KEY: openssl rand -hex 32
npx prisma db push           # нужна PostgreSQL в DATABASE_URL
npm run dev                 # http://localhost:3000
```
Подключите аккаунты на странице «Аккаунты» (в демо-режиме создаются тестовые), затем `node scripts/seed-demo.mjs` заполнит 30 дней истории.

Планировщик (публикации по расписанию, сбор статистики, запуск ИИ): `node scripts/scheduler.mjs`.

## Реальные сети
1. Заполните ключи в `.env` (Meta, TikTok, TikTok Ads, Google), `DEMO_MODE="false"`.
2. Redirect URL в каждом приложении: `APP_URL/api/callback/<meta|tiktok|tiktok_ads|youtube>`.
3. Для ИИ: `ANTHROPIC_API_KEY`.
4. Пройдите App Review у Meta и аудит у TikTok, иначе доступ ограничен тестовыми аккаунтами.

## Реклама на заявки
- «Реклама»: заявки (начатые переписки и лиды), цена заявки, состояние показа, бюджет месяца против своего потолка.
- Цель «Заявки в переписку»: канал (Instagram Direct, WhatsApp, Messenger) задаётся в настройках ИИ-менеджера.
- «Идеи»: гипотеза → тест-кампания на паузе → вердикт по цене заявки. Для сферы «Страхование» есть готовые идеи с текстами.
- «Заявки»: переписки Direct и Messenger собираются каждые 5 минут (нужны разрешения `instagram_manage_messages`, `pages_messaging`, `pages_manage_metadata` и переподключение Meta), WhatsApp и звонки добавляются вручную. Статусы до продажи, заработок, привязка к идее по коду.
- Тест идеи с картинкой создаёт и объявления: по одному на каждый текст, кампания остаётся на паузе.
- «Продления»: список полисов, напоминание клиенту в WhatsApp за 30 дней до окончания.
- Сторож на дашборде и ежедневный отчёт в Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).
- Без `ANTHROPIC_API_KEY` посты и идеи ИИ не создаются, но автоправила таргетолога работают.

## Безопасность трат
ИИ сам создаёт только предложения. Новые кампании, запуск и рост бюджета ждут подтверждения и блокируются выше лимита. Сам он может только ставить неэффективную рекламу на паузу (настраивается).

## Деплой на Railway
1. New Project → Deploy from GitHub repo → этот репозиторий. Затем + New → Database → PostgreSQL.
2. В сервисе приложения: Settings → Networking → Generate Domain. Это ваш `APP_URL`.
3. Variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `APP_URL`, `APP_PASSWORD`, `TOKEN_ENCRYPTION_KEY`, `DEMO_MODE=false`, ключи сетей и `ANTHROPIC_API_KEY`.
4. `railway.json` уже задаёт сборку и запуск: `npm run start:prod` обновляет схему БД, поднимает сайт и планировщик.
5. Политика конфиденциальности для настроек приложений: `APP_URL/privacy`.
