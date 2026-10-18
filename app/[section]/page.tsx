import WorkspaceApp from "@/components/workspace-app";
import { sections,type Section } from "@/lib/domain";
import { notFound } from "next/navigation";
export function generateStaticParams() {
  return sections
    .filter((s) => s !== "dashboard")
    .map((section) => ({ section }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section as Section)) notFound();
  return <WorkspaceApp section={section as Section} />;
}
