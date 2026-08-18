-- AlterEnum
BEGIN;
CREATE TYPE "RoleName_new" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE', 'SALES_AGENT');
ALTER TABLE "roles" ALTER COLUMN "name" TYPE "RoleName_new" USING ("name"::text::"RoleName_new");
ALTER TYPE "RoleName" RENAME TO "RoleName_old";
ALTER TYPE "RoleName_new" RENAME TO "RoleName";
DROP TYPE "public"."RoleName_old";
COMMIT;

