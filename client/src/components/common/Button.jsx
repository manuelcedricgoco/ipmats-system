import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from './Feedback.jsx';

const VARIANTS = {
  primary: 'bg-brand-800 text-white shadow-sm hover:bg-brand-900 hover:shadow-md focus-visible:outline-brand-700 disabled:bg-brand-800/50 disabled:shadow-none',
  secondary: 'bg-white text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:ring-slate-400 focus-visible:outline-brand-600 disabled:text-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 focus-visible:outline-brand-600 disabled:text-slate-400',
  danger: 'bg-red-700 text-white shadow-sm hover:bg-red-800 hover:shadow-md focus-visible:outline-red-700 disabled:bg-red-700/50',
  'danger-outline': 'bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50 hover:ring-red-300 focus-visible:outline-red-700 disabled:text-red-300',
  warning: 'bg-amber-500 text-amber-950 shadow-sm hover:bg-amber-400 hover:shadow-md focus-visible:outline-amber-600 disabled:bg-amber-500/50',
  'warning-outline': 'bg-white text-amber-800 ring-1 ring-inset ring-amber-300 hover:bg-amber-50 hover:ring-amber-400 focus-visible:outline-amber-600 disabled:text-amber-300',
  accent: 'bg-accent-400 text-brand-950 shadow-sm hover:bg-accent-300 hover:shadow-md focus-visible:outline-accent-600 disabled:bg-accent-400/50',
};
const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
  icon: 'h-9 w-9 justify-center',
};

const buttonClass = (variant = 'primary', size = 'md', extra = '') =>
  `inline-flex items-center justify-center whitespace-nowrap rounded-lg font-semibold transition-all duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.97] disabled:hover:translate-y-0 disabled:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;

const Button = forwardRef(function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, children, className = '', to, type = 'button', ...props }, ref) {
  const content = (
    <>
      {loading ? <Spinner className="h-4 w-4" /> : Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
      {children}
    </>
  );
  if (to) {
    return (
      <Link ref={ref} to={to} className={buttonClass(variant, size, className)} {...props}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={loading || props.disabled} aria-busy={loading || undefined} {...props}>
      {content}
    </button>
  );
});

export default Button;
