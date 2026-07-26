-- AlterTable
ALTER TABLE "idempotency_keys" ALTER COLUMN "response_code" DROP NOT NULL,
ALTER COLUMN "response_body" DROP NOT NULL;
