-- CreateTable
CREATE TABLE "AfterSchoolConfig" (
    "key" TEXT NOT NULL DEFAULT 'school',
    "spreadsheetId" TEXT NOT NULL,
    "sheetTitle" TEXT NOT NULL DEFAULT '工作表1',
    "schoolYearStart" INTEGER NOT NULL DEFAULT 2026,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "approverId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AfterSchoolConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AfterSchoolRun" (
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FAILED',
    "sourceHash" TEXT,
    "participants" JSONB NOT NULL,
    "announcementId" TEXT,
    "actorId" TEXT NOT NULL,
    "lastError" TEXT,
    "preparedAt" TIMESTAMP(3),
    "automaticPreparedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AfterSchoolRun_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "AfterSchoolGroup" (
    "id" TEXT NOT NULL,
    "runDate" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,

    CONSTRAINT "AfterSchoolGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfterSchoolReminder" (
    "id" TEXT NOT NULL,
    "runDate" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AfterSchoolReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfterSchoolPushAttempt" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "endpointHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AfterSchoolPushAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfterSchoolLease" (
    "key" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AfterSchoolLease_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "AfterSchoolRun_announcementId_key" ON "AfterSchoolRun"("announcementId");

-- CreateIndex
CREATE UNIQUE INDEX "AfterSchoolGroup_activityId_key" ON "AfterSchoolGroup"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "AfterSchoolGroup_runDate_type_key" ON "AfterSchoolGroup"("runDate", "type");

-- CreateIndex
CREATE UNIQUE INDEX "AfterSchoolReminder_notificationId_key" ON "AfterSchoolReminder"("notificationId");

-- CreateIndex
CREATE INDEX "AfterSchoolReminder_runDate_stage_status_idx" ON "AfterSchoolReminder"("runDate", "stage", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AfterSchoolReminder_runDate_stage_studentId_key" ON "AfterSchoolReminder"("runDate", "stage", "studentId");

-- CreateIndex
CREATE INDEX "AfterSchoolPushAttempt_status_updatedAt_idx" ON "AfterSchoolPushAttempt"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AfterSchoolPushAttempt_reminderId_endpointHash_key" ON "AfterSchoolPushAttempt"("reminderId", "endpointHash");

-- AddForeignKey
ALTER TABLE "AfterSchoolConfig" ADD CONSTRAINT "AfterSchoolConfig_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSchoolRun" ADD CONSTRAINT "AfterSchoolRun_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSchoolRun" ADD CONSTRAINT "AfterSchoolRun_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSchoolGroup" ADD CONSTRAINT "AfterSchoolGroup_runDate_fkey" FOREIGN KEY ("runDate") REFERENCES "AfterSchoolRun"("date") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSchoolGroup" ADD CONSTRAINT "AfterSchoolGroup_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSchoolReminder" ADD CONSTRAINT "AfterSchoolReminder_runDate_fkey" FOREIGN KEY ("runDate") REFERENCES "AfterSchoolRun"("date") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSchoolReminder" ADD CONSTRAINT "AfterSchoolReminder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSchoolReminder" ADD CONSTRAINT "AfterSchoolReminder_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSchoolPushAttempt" ADD CONSTRAINT "AfterSchoolPushAttempt_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "AfterSchoolReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
