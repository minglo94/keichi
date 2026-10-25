import {
  boardApi,
  requireSameOrigin,
  readBody,
  BoardError,
} from "@/lib/blackboard/request";
import { requireBoardTeacher, teacherSubjects } from "@/lib/blackboard/access";
import { prisma } from "@/lib/prisma";
import { layoutInputSchema } from "@/lib/blackboard/validation";
import { saveBoardLayout } from "@/lib/blackboard/layout";
type Ctx = { params: Promise<{ classId: string }> };
export async function PUT(req: Request, props: Ctx) {
  const params = await props.params;
  return boardApi(async () => {
    requireSameOrigin(req);
    await requireBoardTeacher(params.classId, "manage");
    return saveBoardLayout(
      params.classId,
      await readBody(req, layoutInputSchema),
    );
  });
}
