# Backend CRM «Инженерная школа» — MVP-каркас

Django 5.2 + DRF. Заменяет localStorage демо-фронта серверным хранилищем
(ТЗ `ТЗ_backend_CRM_МГТ.md`). Бизнес-правила портированы «до копейки»
из `src/lib/calc.ts` / `selectors.ts` фронта и проверены 16 контрольными
примерами + тестами прав.

## Быстрый старт (локально, SQLite)

```bash
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # Windows
# source .venv/bin/activate                                            # Linux
python manage.py migrate
python manage.py seed_demo      # демо-данные, идентичные фронту
python manage.py runserver
```

API: `http://localhost:8000/api/v1/` · OpenAPI: `/api/v1/schema/` · Swagger: `/api/v1/docs/`

Демо-логины: `admin/admin123`, `teacher/teacher123` (Козловский, scope — его группы),
`accountant/account123`.

## Тесты

```bash
python manage.py test apps.core   # 28 тестов: 16 портов calc.ts + права по ролям
```

## Что реализовано

- **Auth**: session-cookie login/logout/csrf/me (права, роль, scope, серверная дата,
  текущий учебный год, закрытые месяцы). django-axes — локаут после 5 попыток.
- **Роли**: admin / teacher / accountant (+ director) — через Django Group +
  `role_permission`; scope преподавателя (свои группы + замены) фильтруется на сервере.
- **Аудит**: каждая мутация — в `audit_log` (who/when/what/before/after) в той же
  транзакции.
- **Деньги — копейки**: леджер (open → pay → adj → charge), monthly rows,
  ведомости по листам (филиал/IT-класс), формула `нач + сдано − израсх = конец`,
  `splitEven`, `similarity` (опечатки ФИО), `rubWords`, `normContractNo` (03Э=03э).
- **Журнал**: занятия (uniq group+date), генерация по будням, отметки идемпотентные
  bulk, замены/отмены, `lessonEditCheck` (закрытый месяц 423, scope преподавателя,
  accountant read-only), агрегат `/journal`, unmarked.
- **Финансы**: платежи + CSV-импорт BePaid (дедуп по ext_id, точный/нечёткий
  матчинг, очередь pending), confirm/split/reject/requeue, корректировки,
  закрытие/переоткрытие месяца + снимки `month_balance`.
- **Преподаватели**: паспорт/банк/адрес — зашифрованные поля (Fernet, `FERNET_KEY`),
  преподаватель не видит чужие чувствительные поля. Акты — из журнала (эффективный
  преподаватель = замена ?? основной), ставка по дате, налоги half-up, sign/unsign.
- **Документы**: доп.соглашения с плейсхолдерами + preview, print-data для акта/
  доп.соглашения/журнала/ведомости/реестра, XLSX-экспорты.
- **Интеграции**: bePaid webhook (идемпотентно по ext_id, IP-whitelist из env),
  ERIP verification и Reports-sync — каркас с 501 до prod-ключей; `integration_event`.
- **Ошибки** — единый формат `{"error":{code,message,details}}`; 409 дубли,
  423 закрытый месяц.

## Закрытые месяцы

`month_close` (+ `month_balance` снимки). Закрытый месяц блокирует правки журнала,
платежей, корректировок — 423 для всех. Переоткрытие — только с правом
`month.close` и обязательной причиной (`reopen_reason` + аудит).

## Prod (docker-compose)

```bash
cp .env.example .env   # заполнить SECRET_KEY, FERNET_KEY, DB_*, при наличии — BEPAID_*
docker compose up -d
docker compose exec app python manage.py migrate
docker compose exec app python manage.py seed_demo   # опционально
```

Стек: `app` (gunicorn) + `db` (postgres 16) + `nginx` + `backup` (pg_dump раз в сутки,
хранит 30 дней). Docker локально не проверялся (нет Docker на машине разработки).

## Структура

```
backend/
  config/               settings (env-driven), urls
  apps/
    core/               User, RolePermission, AuditLog, ImportBatch, IntegrationEvent,
                        calc.py (порт calc.ts), audit, errors, permissions, auth/me,
                        dashboard, search, seed_demo
    dictionaries/       филиалы, направления, годы, подписанты, листы ведомостей,
                        ставки/политики/налоги (с дат), SystemSetting, шаблоны
    students/           ученики + договоры (number_norm, unique по году, 409)
    groups/             группы + цены с дат, зачисления, переводы (атомарные)
    journal/            занятия + отметки, права правки, агрегат журнала
    finance/            платежи/сплиты/корректировки, леджер+ведомости (services.py),
                        CSV-импорт, месяцы, bePaid-адаптеры
    staff/              преподаватели (Fernet-поля), акты
    documents/          доп.соглашения, print-data, XLSX
```

## Осознанные упрощения MVP

- Аутентификация — сессии + CSRF (SPA-friendly); JWT — при необходимости
  отдельным этапом.
- bePaid: webhook принимает и разбирает события; Reports-sync и ERIP —
  каркас до prod-ключей.
- Исключения по ТЗ: 1C 7.7, родительский кабинет, ЭДО/ЭЦП, нативное мобильное
  приложение, аттестация СЗИ — вне MVP.
- Миграция реальных данных — отдельная задача (нужны исходники Excel).
