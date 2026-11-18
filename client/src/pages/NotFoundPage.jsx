import Button from '../components/common/Button.jsx';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">The page you are looking for does not exist or was moved.</p>
      <Button to="/app" className="mt-6">Go to the dashboard</Button>
    </div>
  );
}
