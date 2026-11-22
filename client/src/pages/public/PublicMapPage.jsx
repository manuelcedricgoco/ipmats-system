import { useOpenProject } from '../../components/public/ProjectDrawer.jsx';
import PublicProjectMap from '../../components/public/PublicProjectMap.jsx';

/** PUBLIC PORTAL — full-height project map. A pin opens the drawer; the map stays usable behind it. */
export default function PublicMapPage() {
  const { openId, open, close } = useOpenProject();
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Project map</h1>
      <p className="mb-4 mt-1 text-sm text-slate-600">Every project with a recorded location. Click a pin to see the project and its 360° site photo.</p>
      <PublicProjectMap openId={openId} onOpen={open} onClose={close} className="h-[calc(100vh-15rem)] min-h-[420px]" />
    </>
  );
}
