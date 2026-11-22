import { useNavigate } from 'react-router-dom';
import ProjectCardGrid from '../../components/public/ProjectCardGrid.jsx';

/**
 * PUBLIC PORTAL — every project as a card: search, status and municipality filters. The project
 * drawer belongs to the map, so a card opens the Project Map with that project selected.
 */
export default function PublicProjectsPage() {
  const navigate = useNavigate();
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Projects</h1>
      <p className="mb-5 mt-1 text-sm text-slate-600">DPWH infrastructure projects in Occidental Mindoro.</p>
      <ProjectCardGrid onOpen={(id) => navigate(`/map?project=${encodeURIComponent(id)}`)} showSearch />
    </>
  );
}
