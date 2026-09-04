# Step 6 — Payment & Transaction Processing

## Scope
Step 4 (pharmacy network/live inventory) remains intentionally skipped. Step 6 implements provider-agnostic payment infrastructure for the existing B2C order flow.

## Implemented
- Payment transaction ledger in PostgreSQL.
- Separate order payment status from order fulfillment status.
- Online payment initiation endpoint owned by the authenticated customer.
- SSLCOMMERZ V4 hosted-payment adapter using server-to-server initiation.
- Sandbox/live endpoint selection via environment configuration.
- Success/failure/cancel callbacks and server-side IPN listener.
- Provider Order Validation API call before marking a payment paid.
- Server-side amount and BDT currency matching against the persisted order total.
- Idempotent handling of repeated validation notifications.
- Payment event audit records with a minimized provider payload; sensitive payment details are not stored as raw card data.
- COD orders are confirmed without an online gateway transaction and retain the same persisted BDT 220 delivery charge.
- Refund ledger and SSLCOMMERZ refund adapter for admin-initiated refunds.
- Customer payment-status endpoint.
- Checkout UI for Online Payment vs Cash on Delivery.
- Payment result page.
- Payment provider credentials remain server-side in environment variables.

## Security boundary
The application does not collect or store card PAN/CVV. Online customers are redirected to the provider-hosted payment page. PCI Security Standards Council guidance notes that fully hosted third-party payment pages can reduce the merchant's card-data exposure when implemented correctly, while the merchant still has security and third-party responsibilities.

## SSLCOMMERZ integration
The implementation follows SSLCOMMERZ's documented flow: initiate a session, redirect to `GatewayPageURL`, receive IPN/callback, then validate the transaction with the Order Validation API before treating it as successful. SSLCOMMERZ documents separate sandbox/live environments and requires server-side validation of transaction amount/status.

Production prerequisites:
1. Merchant account/store credentials.
2. Public HTTPS backend URL reachable by SSLCOMMERZ.
3. Configure IPN URL in the merchant panel.
4. Confirm production callback URLs and gateway permissions.
5. Complete merchant/compliance onboarding and payment-provider testing.

## APIs
- `POST /api/v1/payments/orders/:orderId/initiate`
- `GET /api/v1/payments/orders/:orderId`
- `POST /api/v1/payments/sslcommerz/ipn`
- `POST|GET /api/v1/payments/sslcommerz/success`
- `POST|GET /api/v1/payments/sslcommerz/fail`
- `POST|GET /api/v1/payments/sslcommerz/cancel`
- `POST /api/v1/payments/admin/refunds`

## Amount authority
The frontend never supplies the payable amount to the gateway. The backend reads the persisted order total, which already contains the mandatory BDT 220 delivery charge, and sends that server-calculated amount to the provider.

## Important testing note
The source code has been updated and syntax/type-level structure should be reviewed with dependencies installed. Full `npm install`, database migration, gateway sandbox execution, callback/IPN testing, and end-to-end payment testing require a real configured environment and were not performed in this build environment.
