# Baseline-Migration `0_init`

Dieses Projekt wurde bis Juni 2026 per `prisma db push` (ohne Migrationshistorie) betrieben. `0_init` ist die Baseline des damaligen Schemas.

**Rollout auf eine BESTEHENDE Datenbank (z. B. Produktiv-Pi):** `prisma migrate deploy` bricht dort mit `P3005` ab, solange die Baseline nicht als bereits angewendet markiert ist. Einmalig vorab ausführen:

```bash
npx prisma migrate resolve --applied 0_init
npx prisma migrate deploy   # spielt nur die Delta-Migrationen ein (alle additiv)
```

Achtung: Das Dockerfile startet mit `npx prisma migrate deploy && node server.js` — ohne den `resolve`-Schritt crash-loopt der Container beim ersten Rollout auf eine Bestands-DB.

Frische Datenbanken brauchen nichts davon: `migrate deploy` spielt `0_init` + Deltas normal ein.

**Lokale Dev-DB (`npx prisma dev`):** Der Proxy ignoriert den DB-Namen in der URL (alles landet in `template1`), dadurch funktioniert `prisma migrate dev` (Shadow-DB) nicht. Neue Migrationen stattdessen:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
  > prisma/migrations/$(date +%Y%m%d%H%M%S)_name/migration.sql
npx prisma migrate deploy && npx prisma generate
```
