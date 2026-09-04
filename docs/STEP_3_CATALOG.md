# Step 3 — Production Medicine Catalogue & Bangladesh Data Ingestion

## Purpose

Replace demo medicine data with a production-oriented catalogue architecture. The customer application reads from the local PostgreSQL medicine master, while a controlled backend ingestion job synchronizes authorized source data.

## Primary regulatory/reference source

DGHS's Bangladesh Core FHIR Implementation Guide identifies the DGDA Drug Registry code system at `https://dgda.gov.bd/drug-registry` and states that concepts are maintained in the national OCL terminology server. The published DGDA Registered Drugs Value Set contains 39,196 finished pharmaceutical drug product concepts in the referenced implementation-guide version.

Configured source:
- OCL host: `https://tr.ocl.dghs.gov.bd`
- Collection: `/orgs/MoHFW/collections/dgda-registered-drugs-valueset/`
- Local source code: `DGDA_OCL_REGISTERED_DRUGS`

The application does not scrape MedEx or other commercial/reference sites. Any additional source must be reviewed for licensing/terms before ingestion.

## Data flow

Authorized source → OCL adapter → raw source record → normalization/validation → `drug_products` → PostgreSQL search indexes → customer search API.

The raw payload is retained for traceability, while source identity and hashes make synchronization idempotent.

## API

### Customer catalogue
- `GET /api/v1/medicines?q=...&page=1&limit=20`
- `GET /api/v1/medicines/:id`

### Admin/internal sync
- `POST /api/v1/admin/catalog/sync` — ADMIN only
- `GET /api/v1/admin/catalog/sync/jobs` — ADMIN only

### CLI

```bash
cd backend
npm run catalog:sync
```

## Important production rule

The ingestion job must be run only after confirming access permissions, usage terms, rate limits, and operational availability for the configured source. The system must not silently fabricate missing manufacturer, generic, price, or inventory data.

Retail price, pharmacy inventory, stock availability, and delivery estimates remain separate from regulatory identity data and will be implemented in later steps.
