-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('CCAG_TRAVAUX', 'FIDIC_YB_1999', 'FIDIC_YB_2017', 'EPC_GENERIC');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('CONTRACTOR', 'EMPLOYER', 'ENGINEER', 'PROJECT_MANAGER', 'EITHER', 'OTHER');

-- CreateEnum
CREATE TYPE "DocKind" AS ENUM ('GENERAL_CONDITIONS', 'PARTICULAR_CONDITIONS', 'AGREEMENT', 'ANNEX', 'SPECIFICATION', 'OCR_TEXT', 'OTHER');

-- CreateEnum
CREATE TYPE "TextStatus" AS ENUM ('PENDING', 'EXTRACTED', 'NEEDS_OCR', 'FAILED');

-- CreateEnum
CREATE TYPE "ObligationCategory" AS ENUM ('NOTICE', 'SUBMISSION', 'PAYMENT', 'APPROVAL', 'PROGRAMME', 'INSURANCE', 'SECURITY', 'TESTING', 'COMPLETION', 'DEFECTS', 'VARIATION', 'CLAIM', 'DISPUTE', 'OTHER');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('FIXED_DATE', 'EVENT', 'PERIODIC', 'ON_DEMAND');

-- CreateEnum
CREATE TYPE "DayBasis" AS ENUM ('CALENDAR_DAYS', 'WORKING_DAYS', 'MONTHS');

-- CreateEnum
CREATE TYPE "PeriodDirection" AS ENUM ('AFTER', 'BEFORE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EDITED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "DeadlineStatus" AS ENUM ('OPEN', 'MET', 'MISSED', 'WAIVED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "CorrDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CorrRelation" AS ENUM ('SATISFIES', 'REFERS_TO', 'RESPONDS_TO', 'DISPUTES');

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "language" CHAR(2) NOT NULL,
    "employer" TEXT,
    "contractor" TEXT,
    "engineer" TEXT,
    "commencementDate" DATE,
    "timeForCompletionDays" INTEGER,
    "currency" CHAR(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "DocKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "language" CHAR(2),
    "pageCount" INTEGER,
    "isScanned" BOOLEAN,
    "textStatus" "TextStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clause" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "clauseRef" TEXT NOT NULL,
    "heading" TEXT,
    "body" TEXT NOT NULL,
    "pageFrom" INTEGER,
    "pageTo" INTEGER,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "Clause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionRun" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "clauseRefs" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "rawOutput" JSONB,
    "error" TEXT,

    CONSTRAINT "ExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "clauseId" TEXT,
    "clauseRef" TEXT NOT NULL,
    "obligor" "PartyRole" NOT NULL,
    "counterparty" "PartyRole",
    "category" "ObligationCategory" NOT NULL,
    "title" VARCHAR(90) NOT NULL,
    "description" TEXT NOT NULL,
    "triggerType" "TriggerType" NOT NULL,
    "triggerEvent" TEXT,
    "periodValue" INTEGER,
    "periodBasis" "DayBasis",
    "periodDirection" "PeriodDirection" NOT NULL DEFAULT 'AFTER',
    "recurrenceDays" INTEGER,
    "isTimeBar" BOOLEAN NOT NULL DEFAULT false,
    "consequence" TEXT,
    "sourceQuote" VARCHAR(400) NOT NULL,
    "confidence" DECIMAL(3,2),
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObligationRevision" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "note" TEXT,

    CONSTRAINT "ObligationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deadline" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "eventId" TEXT,
    "dueOn" DATE NOT NULL,
    "computedRule" TEXT NOT NULL,
    "status" "DeadlineStatus" NOT NULL DEFAULT 'OPEN',
    "metById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correspondence" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "direction" "CorrDirection" NOT NULL,
    "sentOn" DATE NOT NULL,
    "receivedOn" DATE,
    "referenceNo" TEXT,
    "fromParty" "PartyRole" NOT NULL,
    "toParty" "PartyRole" NOT NULL,
    "subject" TEXT NOT NULL,
    "summary" TEXT,
    "storagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correspondence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrespondenceObligation" (
    "correspondenceId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "deadlineId" TEXT,
    "relation" "CorrRelation" NOT NULL,

    CONSTRAINT "CorrespondenceObligation_pkey" PRIMARY KEY ("correspondenceId","obligationId")
);

-- CreateIndex
CREATE INDEX "Clause_documentId_orderIndex_idx" ON "Clause"("documentId", "orderIndex");

-- CreateIndex
CREATE INDEX "ExtractionRun_documentId_status_idx" ON "ExtractionRun"("documentId", "status");

-- CreateIndex
CREATE INDEX "Obligation_contractId_reviewStatus_idx" ON "Obligation"("contractId", "reviewStatus");

-- CreateIndex
CREATE INDEX "Deadline_obligationId_dueOn_idx" ON "Deadline"("obligationId", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_contractId_date_key" ON "Holiday"("contractId", "date");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clause" ADD CONSTRAINT "Clause_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionRun" ADD CONSTRAINT "ExtractionRun_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "Clause"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ExtractionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationRevision" ADD CONSTRAINT "ObligationRevision_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_metById_fkey" FOREIGN KEY ("metById") REFERENCES "Correspondence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrespondenceObligation" ADD CONSTRAINT "CorrespondenceObligation_correspondenceId_fkey" FOREIGN KEY ("correspondenceId") REFERENCES "Correspondence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrespondenceObligation" ADD CONSTRAINT "CorrespondenceObligation_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrespondenceObligation" ADD CONSTRAINT "CorrespondenceObligation_deadlineId_fkey" FOREIGN KEY ("deadlineId") REFERENCES "Deadline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
