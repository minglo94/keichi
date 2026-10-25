import BoardEditor from "@/components/blackboard/BoardEditor";
export default async function Page(props: { params: Promise<{ classId: string }> }) {
  const params = await props.params;
  return <BoardEditor classId={params.classId} />;
}
