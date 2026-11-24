import { Hammer } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, Empty, Page } from "../ui";

/** A screen that is planned but not built yet */
export default function Later({ title, text, step }: { title: string; text: string; step?: string }) {
  return (
    <Page title={title}>
      <Card pad={false}>
        <Empty icon={<Hammer size={22} />} title={step ? `Komt in ${step}` : title} text={text}
          action={<Link to="/stijl" className="text-sm font-semibold text-accent-ink underline underline-offset-4">Bekijk de stijl en de bouwstenen</Link>} />
      </Card>
    </Page>
  );
}
