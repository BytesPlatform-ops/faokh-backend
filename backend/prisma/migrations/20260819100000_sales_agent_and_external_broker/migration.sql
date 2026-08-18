-- CreateEnum
CREATE TYPE "SalesAgentStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('DIRECT', 'BROKER', 'WEBSITE', 'PHONE', 'WHATSAPP', 'REFERRAL', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "BrokerStatus_new" AS ENUM ('ACTIVE', 'INACTIVE');
ALTER TABLE "public"."brokers" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "brokers" ALTER COLUMN "status" TYPE "BrokerStatus_new" USING ("status"::text::"BrokerStatus_new");
ALTER TYPE "BrokerStatus" RENAME TO "BrokerStatus_old";
ALTER TYPE "BrokerStatus_new" RENAME TO "BrokerStatus";
DROP TYPE "public"."BrokerStatus_old";
ALTER TABLE "brokers" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_broker_id_fkey";

-- DropForeignKey
ALTER TABLE "brokers" DROP CONSTRAINT "brokers_user_id_fkey";

-- DropIndex
DROP INDEX "brokers_user_id_key";

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "lead_source" "LeadSource" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "sales_agent_id" UUID NOT NULL,
ALTER COLUMN "broker_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "brokers" DROP COLUMN "company_name",
DROP COLUMN "license_number",
DROP COLUMN "user_id",
ADD COLUMN     "address_line" TEXT,
ADD COLUMN     "agency_name" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "created_by_sales_agent_id" UUID,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "full_name" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "ntn" TEXT,
ADD COLUMN     "whatsapp" TEXT,
ALTER COLUMN "mobile" SET NOT NULL;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "lead_source" "LeadSource" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "sales_agent_id" UUID;

-- CreateTable
CREATE TABLE "sales_agents" (
    "id" UUID NOT NULL,
    "sales_agent_code" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "mobile" TEXT,
    "status" "SalesAgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_agents_sales_agent_code_key" ON "sales_agents"("sales_agent_code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_agents_user_id_key" ON "sales_agents"("user_id");

-- CreateIndex
CREATE INDEX "sales_agents_status_is_active_idx" ON "sales_agents"("status", "is_active");

-- CreateIndex
CREATE INDEX "brokers_mobile_idx" ON "brokers"("mobile");

-- CreateIndex
CREATE INDEX "clients_sales_agent_id_idx" ON "clients"("sales_agent_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_sales_agent_id_fkey" FOREIGN KEY ("sales_agent_id") REFERENCES "sales_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_agents" ADD CONSTRAINT "sales_agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_created_by_sales_agent_id_fkey" FOREIGN KEY ("created_by_sales_agent_id") REFERENCES "sales_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_sales_agent_id_fkey" FOREIGN KEY ("sales_agent_id") REFERENCES "sales_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

