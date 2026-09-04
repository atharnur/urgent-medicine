# Step 7 — Delivery Management & Order Fulfillment/Tracking

## Scope
Step 4 (pharmacy network/live inventory) is intentionally excluded. Step 7 implements the delivery and fulfillment state layer without inventing pharmacy or inventory data.

## Flow
Confirmed order (COD) / paid online order → delivery task → assignment → pickup ready → picked up → out for delivery → delivered.

A delivery task is created only after the order is eligible for fulfillment. Online payments trigger delivery creation after server-side payment validation; COD orders trigger it immediately after order creation.

## Backend
- `delivery_agents`
- `delivery_orders`
- `delivery_events`
- `delivery_locations`
- `orders.fulfillment_status`
- Customer tracking endpoint with object-level authorization
- Delivery-agent task/status/location endpoints
- Admin delivery listing, agent listing, agent onboarding and assignment
- Explicit server-side state-transition validation
- Delivery tracking number generation

## Security
- Customer can only track deliveries belonging to their own order.
- Delivery agents can only update tasks assigned to themselves.
- State transitions are enforced on the server, not by the frontend.
- Location coordinates are accepted only from an authenticated assigned delivery agent.
- Admin delivery operations require explicit permissions.
- Sensitive operational data is not exposed to customers.

The implementation follows OWASP guidance to enforce workflow state transitions on the server and treat client state as untrusted. See the OWASP Business Logic Security guidance and REST Security guidance.

## Frontend
- Customer order detail now displays delivery tracking timeline and tracking number.
- Customer tracking refreshes periodically while the order is open.
- `/delivery` provides a mobile-oriented delivery-agent task view.
- `/admin/delivery` provides a basic operational assignment view.

## Deliberate limitation
Because pharmacy/live-inventory was skipped, this step does not claim to know a real pharmacy pickup location or stock state. Pickup fields remain optional until a later fulfillment-source decision is implemented.
