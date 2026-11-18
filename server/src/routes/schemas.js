/**
 * WEEK 1 — request validation (zod). Invalid input never reaches the database:
 * the API answers 400 with the field and the reason.
 */
import { z } from 'zod';

const empty = (v) => (v === '' || v === 'null' || v === undefined ? undefined : v);
const opt = (schema) => z.preprocess(empty, schema.optional());
const nullable = (schema) => z.preprocess((v) => (v === '' || v === 'null' ? null : v), schema.nullable().optional());

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const money = z.coerce.number().finite().min(0).max(1e13);
const text = (max) => z.string().trim().max(max);

export const uuidParam = z.string().uuid();
export const ROLES = ['admin', 'dpwh_personnel', 'auditor', 'public'];
export const PROJECT_TYPES = ['road', 'bridge', 'flood_control', 'building', 'water_supply', 'other'];
// Week 1: personnel set the status manually ('delayed' is detected automatically in a later week)
export const MANUAL_STATUSES = ['not_started', 'ongoing', 'completed', 'suspended', 'terminated'];

const projectFields = {
  project_code: text(40).min(3).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and dashes only'),
  name: text(300).min(5),
  description: nullable(text(4000)),
  project_type: z.enum(PROJECT_TYPES),
  agency_id: z.coerce.number().int().positive(),
  contractor_id: nullable(z.string().uuid()),
  contract_ref_no: nullable(text(80)),
  municipality_id: z.coerce.number().int().positive(),
  barangay_id: nullable(z.coerce.number().int().positive()),
  latitude: z.coerce.number().min(12).max(14, 'Must be within Occidental Mindoro'),
  longitude: z.coerce.number().min(119.9).max(121.4, 'Must be within Occidental Mindoro'),
  approved_budget: money,
  contract_amount: nullable(money),
  notice_to_proceed: nullable(isoDate),
  duration_days: nullable(z.coerce.number().int().positive().max(3650)),
  target_completion_date: nullable(isoDate),
  actual_completion_date: nullable(isoDate),
  fund_source: nullable(text(200)),
  status: z.enum(MANUAL_STATUSES).optional(),
};

const contractWithinBudget = (p) => p.contract_amount == null || p.approved_budget == null || p.contract_amount <= p.approved_budget;

export const projectCreate = z
  .object(projectFields)
  .refine(contractWithinBudget, { message: 'Contract amount cannot exceed the approved budget (ABC)', path: ['contract_amount'] });

export const projectUpdate = z
  .object(Object.fromEntries(Object.entries(projectFields).map(([k, v]) => [k, v.optional()])))
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update')
  .refine(contractWithinBudget, { message: 'Contract amount cannot exceed the approved budget (ABC)', path: ['contract_amount'] });

const contractorFields = {
  name: text(200).min(3),
  pcab_license_no: nullable(text(60)),
  classification: nullable(text(20)),
  address: nullable(text(300)),
  contact_person: nullable(text(120)),
  contact_number: nullable(text(40)),
  email: nullable(z.string().trim().email().max(200)),
  is_active: z.boolean().optional(),
};
export const contractorCreate = z.object(contractorFields);
export const contractorUpdate = z
  .object(Object.fromEntries(Object.entries(contractorFields).map(([k, v]) => [k, v.optional()])))
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

export const agencyCreate = z.object({
  code: text(30).min(2).regex(/^[A-Za-z0-9-]+$/),
  name: text(200).min(3),
  office_type: z.enum(['regional_office', 'district_engineering_office', 'lgu', 'other']),
  address: nullable(text(300)),
});
export const agencyUpdate = agencyCreate.partial().refine((o) => Object.keys(o).length > 0, 'Nothing to update');

export const userCreate = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'At least 8 characters').max(72),
  full_name: text(120).min(2),
  role: z.enum(ROLES),
  agency_id: nullable(z.coerce.number().int().positive()),
  position: nullable(text(120)),
});
export const userUpdate = z
  .object({
    full_name: text(120).min(2).optional(),
    role: z.enum(ROLES).optional(),
    agency_id: nullable(z.coerce.number().int().positive()),
    position: nullable(text(120)),
    is_active: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

export const userApprove = z.object({
  role: z.enum(['admin', 'dpwh_personnel', 'auditor']),
  agency_id: nullable(z.coerce.number().int().positive()),
  position: nullable(text(120)),
});
export const userReject = z.object({ note: nullable(text(500)) });

export const meUpdate = z.object({ full_name: text(120).min(2), position: nullable(text(120)) });

export { opt };
