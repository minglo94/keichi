// ============================================================
// PUT /api/submissions/[subId]/review
// Teacher reviews a submission: APPROVED or REJECTED
// On approval: award points + Pusher broadcast
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  broadcastMissionApproved,
  sendSubmissionFeedback,
} from '@/lib/pusher'

type RouteParams = { params: { subId: string } }

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { action, feedback } = body as {
    action: 'APPROVE' | 'REJECT'
    feedback?: string
  }

  if (!['APPROVE', 'REJECT'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Fetch submission with mission + class info
  const submission = await prisma.missionSubmission.findUnique({
    where: { id: params.subId },
    include: {
      mission: {
        include: {
          class: true,
          dependents: { select: { id: true } }, // Missions unlocked after this one
        },
      },
      student: { select: { id: true, name: true } },
    },
  })

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  // Verify teacher owns this class
  if (submission.mission.class.teacherId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (submission.status !== 'PENDING') {
    return NextResponse.json(
      { error: 'Submission already reviewed' },
      { status: 409 }
    )
  }

  // ── APPROVE PATH ──
  if (action === 'APPROVE') {
    const [updatedSub, pointTx] = await prisma.$transaction([
      prisma.missionSubmission.update({
        where: { id: params.subId },
        data: {
          status: 'APPROVED',
          feedback,
          reviewedAt: new Date(),
        },
      }),
      prisma.pointTransaction.create({
        data: {
          userId: submission.studentId,
          classId: submission.mission.classId,
          amount: submission.mission.pointsReward,
          reason: 'MISSION',
          awardedBy: session.user.id,
          note: `完成任務：${submission.mission.title}`,
        },
      }),
    ])

    // Get student's new total points for this class
    const totalPoints = await prisma.pointTransaction.aggregate({
      where: { userId: submission.studentId, classId: submission.mission.classId },
      _sum: { amount: true },
    })

    // Determine which missions are now unlocked for this student
    const unlockedMissionIds = submission.mission.dependents.map((m) => m.id)

    // Pusher: broadcast to class channel
    await broadcastMissionApproved(submission.mission.classId, {
      studentId: submission.studentId,
      missionId: submission.missionId,
      missionTitle: submission.mission.title,
      pointsAwarded: submission.mission.pointsReward,
      unlockedMissionIds,
    })

    return NextResponse.json({
      submission: updatedSub,
      pointTransaction: pointTx,
      newTotal: totalPoints._sum.amount ?? 0,
    })
  }

  // ── REJECT PATH ──
  const updatedSub = await prisma.missionSubmission.update({
    where: { id: params.subId },
    data: {
      status: 'REJECTED',
      feedback,
      reviewedAt: new Date(),
    },
  })

  // Pusher: private notification to student
  if (feedback) {
    await sendSubmissionFeedback(submission.studentId, {
      missionTitle: submission.mission.title,
      status: 'REJECTED',
      feedback,
    })
  }

  return NextResponse.json({ submission: updatedSub })
}
