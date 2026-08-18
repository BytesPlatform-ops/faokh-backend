-- =============================================================================
-- Business invariants the Prisma schema language cannot express.
--
-- These are the last line of defence. Service code can be refactored into a
-- bug; a CHECK constraint cannot be argued out of rejecting a bad row.
-- =============================================================================

-- ------------------------------------------------------------------ inventory

-- THE double-booking guard: a unit can have at most one CONFIRMED booking.
--
-- A partial unique index rather than a unique column, because cancelled
-- bookings must remain in the table (they are the audit trail of who reserved
-- the unit first) while releasing the unit for someone else.
CREATE UNIQUE INDEX "bookings_one_confirmed_per_unit"
  ON "bookings" ("unit_id")
  WHERE "status" IN ('CONFIRMED', 'COMPLETED');

ALTER TABLE "unit_types"
  ADD CONSTRAINT "unit_types_area_positive" CHECK ("area_sq_ft" > 0);

ALTER TABLE "unit_types"
  ADD CONSTRAINT "unit_types_rooms_sane"
  CHECK ("bedrooms" >= 0 AND "bathrooms" >= 0 AND "included_parking_spaces" >= 0);

ALTER TABLE "unit_types"
  ADD CONSTRAINT "unit_types_spans_floors_positive" CHECK ("spans_floors" >= 1);

-- -------------------------------------------------------------------- pricing

ALTER TABLE "pricing_configurations"
  ADD CONSTRAINT "pricing_price_positive" CHECK ("price" > 0);

ALTER TABLE "pricing_configurations"
  ADD CONSTRAINT "pricing_per_sqft_positive" CHECK ("price_per_sq_ft" > 0);

-- One live price per (type, class). A second open-ended row would make
-- "today's price" ambiguous, and the booking engine would pick arbitrarily.
CREATE UNIQUE INDEX "pricing_one_current_per_type_class"
  ON "pricing_configurations" ("unit_type_id", "class_id")
  WHERE "effective_to" IS NULL;

-- --------------------------------------------------------------------- people

-- CNIC is stored digits-only, exactly 13. Storing the dashed form would make
-- "35202-1234567-1" and "3520212345671" two different clients.
ALTER TABLE "clients"
  ADD CONSTRAINT "clients_cnic_digits" CHECK ("cnic" ~ '^[0-9]{13}$');

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_co_applicant_cnic_digits"
  CHECK ("co_applicant_cnic" IS NULL OR "co_applicant_cnic" ~ '^[0-9]{13}$');

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_nominee_cnic_digits"
  CHECK ("nominee_cnic" IS NULL OR "nominee_cnic" ~ '^[0-9]{13}$');

ALTER TABLE "brokers"
  ADD CONSTRAINT "brokers_commission_rate_range"
  CHECK ("commission_rate_pct" >= 0 AND "commission_rate_pct" <= 100);

-- ------------------------------------------------------------------- bookings

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_snapshot_positive"
  CHECK ("snap_total_price" > 0 AND "snap_area_sq_ft" > 0 AND "snap_price_per_sq_ft" > 0);

-- Reversing an attribution is an admin act that must be explained.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_cancellation_has_reason"
  CHECK ("status" <> 'CANCELLED' OR "cancellation_reason" IS NOT NULL);

-- --------------------------------------------------------------- payment plan

-- The five configured tranches must describe exactly 100% of the sale.
-- 10 + 10 + 10 + 60 + 10. Anything else silently under- or over-collects.
ALTER TABLE "payment_plans"
  ADD CONSTRAINT "payment_plans_percentages_total_100"
  CHECK (
    "down_payment_pct" + "second_pct" + "third_pct" + "monthly_pool_pct" + "completion_pct" = 100
  );

ALTER TABLE "payment_plans"
  ADD CONSTRAINT "payment_plans_monthly_count_positive" CHECK ("monthly_count" > 0);

ALTER TABLE "payment_plans"
  ADD CONSTRAINT "payment_plans_total_positive" CHECK ("total_amount" > 0);

ALTER TABLE "installments"
  ADD CONSTRAINT "installments_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "installments"
  ADD CONSTRAINT "installments_paid_within_amount"
  CHECK ("paid_amount" >= 0 AND "paid_amount" <= "amount");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);

-- ------------------------------------------------------------------ commission

ALTER TABLE "commission_plans"
  ADD CONSTRAINT "commission_plans_rate_range"
  CHECK ("rate_pct" >= 0 AND "rate_pct" <= 100);

ALTER TABLE "commission_plans"
  ADD CONSTRAINT "commission_plans_amounts_positive"
  CHECK ("basis_amount" > 0 AND "total_amount" >= 0);

-- A commission can never exceed the sale it was calculated from. Catches a
-- misplaced decimal before it reaches a payout run.
ALTER TABLE "commission_plans"
  ADD CONSTRAINT "commission_plans_within_basis"
  CHECK ("total_amount" <= "basis_amount");

ALTER TABLE "commission_milestones"
  ADD CONSTRAINT "commission_milestones_amount_non_negative" CHECK ("amount" >= 0);

-- A held milestone must say why it is held, or nobody can unblock it.
ALTER TABLE "commission_milestones"
  ADD CONSTRAINT "commission_milestones_held_has_reason"
  CHECK ("status" <> 'HELD' OR "held_reason" IS NOT NULL);

-- --------------------------------------------------------- operational indexes

-- The finance arrears screen.
CREATE INDEX "installments_outstanding_idx"
  ON "installments" ("due_date")
  WHERE "status" IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE');

-- The commission payout run: approved and owed, not yet sent.
CREATE INDEX "commission_milestones_payable_idx"
  ON "commission_milestones" ("broker_id", "expected_date")
  WHERE "status" IN ('ELIGIBLE', 'APPROVED');

-- Inventory availability, the single most-run query in the booking wizard.
CREATE INDEX "units_available_idx"
  ON "units" ("building_id", "floor_id")
  WHERE "status" = 'AVAILABLE';
