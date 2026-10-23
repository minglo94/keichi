import type { z } from "zod";
import type {
  cardInputSchema,
  layoutInputSchema,
  timetableInputSchema,
  slotSchema,
  timetableRowSchema,
} from "./validation";
export type BoardCardInput = z.infer<typeof cardInputSchema>;
export type BoardLayoutInput = z.infer<typeof layoutInputSchema>;
export type BoardTimetableInput = z.infer<typeof timetableInputSchema>;
export type GridItem = BoardLayoutInput["items"][number];
export type TimetableRow = z.infer<typeof timetableRowSchema>;
export type SchoolSlot = z.infer<typeof slotSchema>;
export type PublicCard = BoardCardInput & { id: string; version: number };
export type BoardSnapshot = {
  classId: string;
  className: string;
  generatedAt: string;
  cards: PublicCard[];
  layout: { items: GridItem[]; version: number };
  homework: {
    id: string;
    subject: string | null;
    title: string;
    detail: string | null;
    dueDate: string | null;
  }[];
  missing: {
    homework: string;
    subject: string | null;
    number: string;
    date: string;
    absent: boolean;
  }[];
  timetable: {
    source: "AUTO" | "MANUAL";
    rows: TimetableRow[];
    slots: SchoolSlot[];
    version: number;
    warning: string | null;
  };
};
export type TeacherBoard = {
  snapshot: BoardSnapshot;
  cards: (PublicCard & {
    authorId: string;
    archivedAt: string | null;
    targetClassIds: string[];
  })[];
  userId: string;
  isManager: boolean;
  isAdmin: boolean;
  subjects: string[];
  access: { enabled: boolean; version: number };
  scheduleVersion: number;
  classes: { id: string; name: string }[];
};
