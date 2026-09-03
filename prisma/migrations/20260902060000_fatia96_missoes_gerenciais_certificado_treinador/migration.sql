-- AlterEnum
ALTER TYPE "CategoriaMissao" ADD VALUE 'MANAGEMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CriterioMissao" ADD VALUE 'RECOGNITION_CREATED';
ALTER TYPE "CriterioMissao" ADD VALUE 'ONE_ON_ONE_COMPLETED';
ALTER TYPE "CriterioMissao" ADD VALUE 'PDI_REVIEWED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ModoTreinador" ADD VALUE 'LIDERANCA';
ALTER TYPE "ModoTreinador" ADD VALUE 'FEEDBACK';
ALTER TYPE "ModoTreinador" ADD VALUE 'REUNIAO_1A1';
ALTER TYPE "ModoTreinador" ADD VALUE 'GESTAO_DE_CONFLITOS';
ALTER TYPE "ModoTreinador" ADD VALUE 'DESENVOLVIMENTO_DE_EQUIPE';

-- AlterEnum
ALTER TYPE "TipoAcaoMissao" ADD VALUE 'MANAGER_ACTION';

-- AlterTable
ALTER TABLE "certification_definition" ADD COLUMN     "signatureName" TEXT,
ADD COLUMN     "signatureRole" TEXT,
ADD COLUMN     "templateBody" TEXT,
ADD COLUMN     "templateTitle" TEXT;

-- AlterTable
ALTER TABLE "mission_definition" ADD COLUMN     "targetPapel" "Papel" NOT NULL DEFAULT 'VENDEDOR';

