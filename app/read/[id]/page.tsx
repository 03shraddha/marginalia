import { Reader } from "@/components/reader/Reader";
import { sampleById } from "@/lib/samples";

type Props = { params: Promise<{ id: string }> };

// No metadata title here: imported texts live in the browser, so the reader renders its own <title>.
export default async function ReadPage({ params }: Props) {
  const { id } = await params;
  return <Reader id={id} initial={sampleById(id)} />;
}
