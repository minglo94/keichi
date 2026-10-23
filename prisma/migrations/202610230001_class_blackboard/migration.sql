-- CreateTable
CREATE TABLE "BlackboardAccess" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BlackboardAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlackboardSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "accessId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sessionVersion" INTEGER NOT NULL,

    CONSTRAINT "BlackboardSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlackboardCard" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "subject" TEXT,
    "payload" JSONB NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'amber',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlackboardCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlackboardCardTarget" (
    "cardId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "BlackboardCardTarget_pkey" PRIMARY KEY ("cardId","classId")
);

-- CreateTable
CREATE TABLE "BlackboardLayout" (
    "classId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BlackboardLayout_pkey" PRIMARY KEY ("classId")
);

-- CreateTable
CREATE TABLE "BlackboardTimetable" (
    "classId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "rows" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BlackboardTimetable_pkey" PRIMARY KEY ("classId")
);

-- CreateTable
CREATE TABLE "BlackboardSchedule" (
    "key" TEXT NOT NULL DEFAULT 'school',
    "slots" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BlackboardSchedule_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlackboardAccess_classId_key" ON "BlackboardAccess"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "BlackboardSession_tokenHash_key" ON "BlackboardSession"("tokenHash");

-- CreateIndex
CREATE INDEX "BlackboardSession_accessId_idx" ON "BlackboardSession"("accessId");

-- CreateIndex
CREATE INDEX "BlackboardSession_expiresAt_idx" ON "BlackboardSession"("expiresAt");

-- CreateIndex
CREATE INDEX "BlackboardCard_authorId_idx" ON "BlackboardCard"("authorId");

-- CreateIndex
CREATE INDEX "BlackboardCard_archivedAt_startsAt_endsAt_idx" ON "BlackboardCard"("archivedAt", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "BlackboardCardTarget_classId_idx" ON "BlackboardCardTarget"("classId");

-- AddForeignKey
ALTER TABLE "BlackboardAccess" ADD CONSTRAINT "BlackboardAccess_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackboardSession" ADD CONSTRAINT "BlackboardSession_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "BlackboardAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackboardCard" ADD CONSTRAINT "BlackboardCard_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackboardCardTarget" ADD CONSTRAINT "BlackboardCardTarget_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BlackboardCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackboardCardTarget" ADD CONSTRAINT "BlackboardCardTarget_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackboardLayout" ADD CONSTRAINT "BlackboardLayout_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackboardTimetable" ADD CONSTRAINT "BlackboardTimetable_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

