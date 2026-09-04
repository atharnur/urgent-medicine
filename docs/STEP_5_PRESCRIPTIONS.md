# Step 5 — Prescription & Compliance Workflow

## Scope
Step 4 (pharmacy network/live inventory) is intentionally skipped and is **not included** in this implementation.

This step adds a B2C prescription workflow without inventing pharmacy inventory or prescription data.

## Implemented
- Customer prescription records with lifecycle: `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `EXPIRED`, `REVOKED`.
- Private prescription-file storage outside PostgreSQL row data.
- Accepted upload types: JPEG, PNG and PDF; maximum 10 MB per file.
- SHA-256 file hash stored for integrity/provenance.
- Prescription items can optionally reference a catalog medicine.
- Prescription review history and prescription-access audit logging.
- Admin review endpoint with explicit approve/reject decision.
- Order creation checks `drug_products.prescription_required` and requires an owned, approved, unexpired prescription when needed.
- Prescription is linked to the order and remains visible in order history.
- Customer file access is authenticated and ownership-scoped; private files are not exposed as public URLs.

## API
- `GET /api/v1/prescriptions`
- `POST /api/v1/prescriptions`
- `POST /api/v1/prescriptions/:id/files` (multipart/form-data)
- `GET /api/v1/prescriptions/:id/files/:fileId`
- `GET /api/v1/admin/prescriptions`
- `POST /api/v1/admin/prescriptions/:id/review`
- `POST /api/v1/orders` accepts optional `prescriptionId` and performs server-side validation.

## Storage note
The development implementation uses a private filesystem adapter under `PRIVATE_UPLOAD_DIR`. Production deployment should replace this adapter with encrypted private object storage (for example S3-compatible storage), retain server-side authorization, and issue short-lived access only through authenticated backend control.

## Compliance boundary
This software does not diagnose, prescribe, substitute medicines, or auto-approve prescriptions. Human/regulatory review remains an explicit workflow requirement.
