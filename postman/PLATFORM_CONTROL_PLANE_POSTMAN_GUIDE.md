# Platform Control Plane Postman Guide

Files:

- `postman/platform-control-plane.postman_collection.json`
- `postman/platform-control-plane.local.postman_environment.json`

## Local preparation

```bash
npm run seed:dev
npm run platform:create-owner -- --email owner@example.test
npm start
```

The owner command is trusted setup, not an HTTP endpoint. If it reports that the PlatformAdmin already exists, continue normally.

Import both Postman files, select **Edu SaaS Platform Control Plane Local**, and run the collection in folder order.

The local environment is filled from `scripts/seed-output/frontend-demo-data.json`:

- platform owner: `owner@example.test` / `Password123!`
- tenant-admin negative case: `admin@example.test` / `Password123!`
- Demo University: `6a35032f57f19ce9e8503216`
- Demo School: `6a35033057f19ce9e850326a`

Login requests populate tokens automatically. Institution, webhook, and audit requests save useful returned identifiers when records exist.

Failed webhook lists may legitimately be empty after a clean seed. To obtain real failure rows, use the existing Stripe CLI/manual webhook testing flow; this collection intentionally provides no replay or webhook mutation request.

If the seed is rerun and IDs change, replace `institutionId` and `schoolInstitutionId` from the newly generated `scripts/seed-output/frontend-demo-data.json`.
