-- CreateEnum
CREATE TYPE "ResidenceCategory" AS ENUM ('APARTMENT', 'DUPLEX_PENTHOUSE');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "snap_attached_bathrooms" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "snap_residence_category" "ResidenceCategory" NOT NULL DEFAULT 'APARTMENT',
ADD COLUMN     "snap_residence_category_name" TEXT NOT NULL DEFAULT 'Apartment';

-- AlterTable
ALTER TABLE "unit_types" ADD COLUMN     "attached_bathrooms" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "floor_span_label" TEXT,
ADD COLUMN     "parking_purchasable_separately" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "residence_category" "ResidenceCategory" NOT NULL DEFAULT 'APARTMENT';

