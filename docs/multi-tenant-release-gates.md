# Multi-tenant migration gate

This branch is a development branch, not production-ready. Do not deploy against the existing Airfriend database.

## Contract
- Tenant identity is an immutable UUID resolved server-side from a verified hostname or selected membership.
- Every business record and storage object must be tenant-scoped. Never trust a tenant ID supplied by a client without checking membership.
- Preserve existing paths /admin, /technician, /billflow, /customer, /request-service.
- Platform administrators approve store applications; store owners manage only their own store.
- Keep BillFlow financial access separate from general staff access.
- Public service requests must be routed to the resolved tenant; do not expose private customer records.
- Use a staging database with synthetic records only; no production credentials or customer data in preview.

## Release gates
1. Inventory all database tables, functions, policies, storage buckets and every data access path across both repositories.
2. Add tenant keys, composite foreign keys, tenant-local unique constraints, and role-aware RLS on all business tables.
3. Migrate singleton shop/settings rows and numbering to per-tenant records.
4. Implement verified email onboarding, approval, membership and session handling.
5. Validate cross-tenant read/write/delete, RPC, storage, and direct API access using two ordinary test accounts.
6. Verify financial access, suspension, anonymous service requests, routing and rollback.
7. Run build and existing regression tests in staging before any production migration.
