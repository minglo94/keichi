import { boardApi, BoardError } from "@/lib/blackboard/request";
import { requireBoardSession } from "@/lib/blackboard/session";
import { dateWindow } from "@/lib/blackboard/daily";
import { getClassDayActivities } from "@/lib/blackboard/daily-activities";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return boardApi(async () => {
    const session = await requireBoardSession();
    const dates = new URL(req.url).searchParams.getAll("date");
    if (dates.length !== 1) throw new BoardError(400, "請提供一個日期");
    try {
      dateWindow(dates[0]);
    } catch {
      throw new BoardError(400, "日期格式無效");
    }
    return getClassDayActivities(session.classId, dates[0]);
  });
}
