-- BL-076: History page — outgoing Bartender API call log.
CREATE TABLE "ApiCallLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "requestHeaders" JSONB,
    "requestBody" TEXT,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCallLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiCallLog_userId_createdAt_idx" ON "ApiCallLog"("userId", "createdAt");

ALTER TABLE "ApiCallLog" ADD CONSTRAINT "ApiCallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
