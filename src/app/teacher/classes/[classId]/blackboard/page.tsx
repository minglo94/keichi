import BoardEditor from "@/components/blackboard/BoardEditor";
export default function Page({ params }: { params: { classId: string } }) {
  return <BoardEditor classId={params.classId} />;
}
