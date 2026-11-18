export const STATUS_META = {
  not_started: { label: 'Not started', cls: 'bg-slate-100 text-slate-700' },
  ongoing: { label: 'Ongoing', cls: 'bg-brand-50 text-brand-700' },
  delayed: { label: 'Delayed', cls: 'bg-orange-50 text-orange-800' },
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-800' },
  suspended: { label: 'Suspended', cls: 'bg-slate-200 text-slate-800' },
  terminated: { label: 'Terminated', cls: 'bg-red-50 text-red-800' },
};
// Week 1: status is chosen manually ('Delayed' is detected automatically in a later week)
export const MANUAL_STATUSES = ['not_started', 'ongoing', 'completed', 'suspended', 'terminated'];

export const PROJECT_TYPES = {
  road: 'Road',
  bridge: 'Bridge',
  flood_control: 'Flood control',
  building: 'Building',
  water_supply: 'Water supply',
  other: 'Other',
};

export const ROLE_LABELS = {
  admin: 'System Administrator',
  dpwh_personnel: 'DPWH Personnel',
  auditor: 'Auditor',
  public: 'Public Viewer',
};

export const OFFICE_TYPES = {
  regional_office: 'Regional Office',
  district_engineering_office: 'District Engineering Office',
  lgu: 'Local Government Unit',
  other: 'Other',
};

export const STAFF_ROLES = ['admin', 'dpwh_personnel', 'auditor'];
