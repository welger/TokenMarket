# API Server

Local development environment names and placeholder values come from the
repository root `.env.example`. Keep actual local values in an ignored `.env`
or export them in the shell; never commit `.env`.

`prisma generate` and `prisma validate` use the same non-secret local
PostgreSQL placeholder when `DATABASE_URL` is absent. Migration commands must
receive `DATABASE_URL` explicitly so they cannot silently target a database.
