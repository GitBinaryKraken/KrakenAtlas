# Feature Flow Fixture

This fixture traces a public persona request across a WebUI, HTTP connector, API, logic service,
data service, and the PostgreSQL `public.personas` table. Documentation text must not create code
or database relations.

The `Tests` project provides an attributed xUnit-shaped test case for the logic
service so change-surface queries can prove test selection and focused command
projection without relying on documentation or naming alone.
