import { Construction } from 'lucide-react';
import Button from '../../components/common/Button.jsx';
import { PageHeader } from '../../components/common/Card.jsx';
import { EmptyState } from '../../components/common/Feedback.jsx';

/** Stand-in for the PACC Cases, Members and Activity pages until they are built (next task of the PACC plan). */
export default function PaccPlaceholderPage({ title }) {
  return (
    <>
      <PageHeader eyebrow="PACC" title={title} />
      <EmptyState icon={Construction} title="This page is not available yet" description="It is being added to the PACC portal. Use the inbox in the meantime." action={<Button to="/pacc" variant="secondary">Go to the inbox</Button>} />
    </>
  );
}
