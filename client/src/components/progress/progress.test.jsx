import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '../common/Badges.jsx';
import ProjectRecords from '../pacc/ProjectRecords.jsx';
import CompletionVerificationCard from './CompletionVerificationCard.jsx';
import ReferencePhotosInput from './ReferencePhotosInput.jsx';
import ReportPhotos, { SnapshotBreakdown } from './ReportPhotos.jsx';

const base = { status: 'completed', is_completed: true, is_verified: false, completed_at: '2026-11-27T00:00:00Z', completion_verified_at: null, label: 'Completed – awaiting verification', auditor: null, pacc: null, history: [] };
const buttons = (html) => [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map((m) => ({ attrs: m[1], text: m[2].replace(/<[^>]+>/g, '') }));
const noop = async () => {};

describe('StatusBadge (030)', () => {
  it('labels a Completed project by its verification when the row has completion_verified_at', () => {
    expect(renderToStaticMarkup(<StatusBadge status="completed" verifiedAt={null} />)).toContain('Completed – awaiting verification');
    expect(renderToStaticMarkup(<StatusBadge status="completed" verifiedAt="2026-11-28T00:00:00Z" />)).toContain('Completed – verified');
  });
  it('a past status (no verifiedAt) and other statuses are unchanged', () => {
    expect(renderToStaticMarkup(<StatusBadge status="completed" />)).toMatch(/>Completed<\/span>$/);
    expect(renderToStaticMarkup(<StatusBadge status="ongoing" verifiedAt={null} />)).toContain('On-going');
  });
});

describe('Completion verification card (030)', () => {
  it('read only without an actor (contractor, Personnel, Admin)', () => {
    const html = renderToStaticMarkup(<CompletionVerificationCard state={base} onDecide={noop} />);
    expect(html).toContain('Completion verification');
    expect(html).toContain('Waiting for: Auditor and PACC');
    expect(buttons(html)).toEqual([]);
  });
  it('the Auditor gets Verify completion and Not yet', () => {
    const html = renderToStaticMarkup(<CompletionVerificationCard state={base} actor="auditor" onDecide={noop} />);
    const b = buttons(html);
    expect(b.map((x) => x.text)).toEqual(['Not yet', 'Verify completion']);
    expect(b.every((x) => !/ disabled=""/.test(x.attrs))).toBe(true);
  });
  it('PACC with an open case: Verify disabled with the reason, Not yet allowed', () => {
    const html = renderToStaticMarkup(<CompletionVerificationCard state={{ ...base, pacc_case_open: true }} actor="pacc" onDecide={noop} />);
    const [notYet, verify] = buttons(html);
    expect(notYet.attrs).not.toMatch(/ disabled=""/);
    expect(verify.attrs).toMatch(/ disabled=""/);
    expect(html).toContain('Close the PACC case before verifying completion.');
  });
  it('shows both sides and the history; PACC rows say PACC', () => {
    const pacc = { id: 'v2', verifier_role: 'pacc', decision: 'not_yet', note: 'Drainage unfinished', verifier_name: 'PACC', created_at: '2026-11-28T02:00:00Z', counts: true };
    const old = { id: 'v1', verifier_role: 'auditor', decision: 'verified', note: null, verifier_name: 'Ana Auditor', created_at: '2026-11-20T02:00:00Z', counts: false };
    const html = renderToStaticMarkup(<CompletionVerificationCard state={{ ...base, pacc, history: [pacc, old] }} onDecide={noop} />);
    for (const t of ['Auditor', 'PACC', 'No decision yet', 'Not yet', 'Drainage unfinished', 'Ana Auditor', 'no longer counts']) expect(html).toContain(t);
  });
  it('verified: the lock message, no buttons', () => {
    const html = renderToStaticMarkup(<CompletionVerificationCard state={{ ...base, is_verified: true, completion_verified_at: '2026-11-28T03:00:00Z', label: 'Completed – verified' }} actor="auditor" onDecide={noop} />);
    expect(html).toContain('its progress and photos can no longer change.');
    expect(buttons(html)).toEqual([]);
  });
});

describe('reference photos (030)', () => {
  it('report photos open the signed link in a new tab', () => {
    const html = renderToStaticMarkup(<ReportPhotos photos={[{ id: 'p1', url: 'https://storage.example/p1.jpg' }, { id: 'p2', url: null }]} />);
    expect(html).toContain('href="https://storage.example/p1.jpg" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('Photo unavailable');
    expect(renderToStaticMarkup(<ReportPhotos photos={[]} />)).toBe('');
  });
  it('the picker takes JPEG, PNG or WebP, several at once, until there are 5', () => {
    const html = renderToStaticMarkup(<ReferencePhotosInput files={[]} onChange={() => {}} />);
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html).toContain('multiple');
    expect(html).toContain('0 of 5');
    const five = Array.from({ length: 5 }, (_, i) => ({ name: `p${i}.jpg`, size: 1, type: 'image/jpeg', lastModified: i }));
    expect(renderToStaticMarkup(<ReferencePhotosInput files={five} onChange={() => {}} />)).not.toContain('type="file"');
  });
  it('previews each chosen photo (an object URL) with a remove button', () => {
    const file = new File(['x'], 'site.jpg', { type: 'image/jpeg' });
    const html = renderToStaticMarkup(<ReferencePhotosInput files={[file]} onChange={() => {}} />);
    expect(html).toMatch(/<img src="blob:[^"]+" alt="Reference photo 1: site.jpg"/);
    expect(html).toContain('aria-label="Remove reference photo 1"');
    expect(html).toContain('1 of 5');
  });
  it('the breakdown lists each phase with its sub-activities at that date', () => {
    const html = renderToStaticMarkup(
      <SnapshotBreakdown
        phases={[{ phase_id: 'p1', sequence_no: 1, name: 'Earthworks', weight: 40, accomplishment: 65 }, { sequence_no: 2, name: 'Old phase', weight: 60, accomplishment: 10 }]}
        activities={[{ activity_id: 'a2', phase_id: 'p1', sequence_no: 2, name: 'Hauling', weight: 70, accomplishment: 50 }, { activity_id: 'a1', phase_id: 'p1', sequence_no: 1, name: 'Excavation', weight: 30, accomplishment: 100 }]}
      />,
    );
    expect(html.indexOf('Excavation')).toBeLessThan(html.indexOf('Hauling'));
    expect(html).toContain('100.0%');
    expect(html).toContain('Old phase');
  });
});

describe('PACC project records (030)', () => {
  it('show the description, reference photos and sub-activities, read only', () => {
    const html = renderToStaticMarkup(
      <ProjectRecords
        project={{ overall_progress: 99, planned_progress: 100 }}
        phases={[{ id: 'ph1', sequence_no: 1, name: 'Earthworks', weight: 100, accomplishment: 100, activities: [{ id: 'a1', name: 'Excavation', weight: 100, accomplishment: 100 }] }]}
        progress={[{ id: 'u1', report_date: '2026-11-01', overall_progress: 99, description: 'Finished the excavation', photos: [{ id: 'f1', url: 'https://storage.example/f1.jpg' }] }]}
        finance={{}}
        records={[]}
        images={[]}
        documents={[]}
      />,
    );
    for (const t of ['Excavation', 'Finished the excavation', 'https://storage.example/f1.jpg']) expect(html).toContain(t);
    expect(html).not.toMatch(/<form|<input|<select|<textarea|<button/);
  });
});
