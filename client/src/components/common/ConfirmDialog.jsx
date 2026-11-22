import { useEffect, useId, useState } from 'react';
import Button from './Button.jsx';
import { Alert } from './Feedback.jsx';
import Modal from './Modal.jsx';

/**
 * Confirmation dialog for destructive or important actions (delete, suspend…).
 * `onConfirm` may be async; if it throws, the error message is shown inside the dialog
 * (e.g. a 409 "this contractor is still assigned to projects") and the dialog stays open.
 * `errorActions(err)` can add buttons under the error (e.g. "Suspend instead").
 */
export default function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  confirmVariant = 'danger',
  confirmIcon,
  confirmDisabled = false,
  onConfirm,
  errorActions,
  children,
}) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (open) {
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (confirmDisabled || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onConfirm();
    } catch (e2) {
      setErr(e2);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant={confirmVariant} icon={confirmIcon} loading={busy} disabled={busy || confirmDisabled}>{confirmLabel}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-3 text-sm text-slate-700">
        {err && (
          <Alert tone="error">
            <p className="break-words">{err.message}</p>
            {errorActions?.(err)}
          </Alert>
        )}
        {children}
      </form>
    </Modal>
  );
}
