// Flag history and activity log must not fill up with identical rows each time the API restarts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldRecordHistory } from '../services/projectEvaluation.js';
import { shouldLogSystemCheck } from '../jobs/dailyFlagCheck.js';

describe('shouldRecordHistory', () => {
  it('the start-up check records nothing when the flag and status are unchanged', () => {
    assert.equal(shouldRecordHistory({ trigger: 'startup', flagChanged: false, statusChanged: false }), false);
  });
  it('the start-up check records a change of flag or status', () => {
    assert.equal(shouldRecordHistory({ trigger: 'startup', flagChanged: true, statusChanged: false }), true);
    assert.equal(shouldRecordHistory({ trigger: 'startup', flagChanged: false, statusChanged: true }), true);
  });
  it('the daily check keeps recording only changes', () => {
    assert.equal(shouldRecordHistory({ trigger: 'daily_check', flagChanged: false, statusChanged: false }), false);
    assert.equal(shouldRecordHistory({ trigger: 'daily_check', flagChanged: true, statusChanged: false }), true);
  });
  it('every evaluation a person caused is still recorded, changed or not', () => {
    for (const trigger of ['project_updated', 'progress_update', 'image_upload', 'manual_recheck', 'rules_changed', 'manual_cli']) {
      assert.equal(shouldRecordHistory({ trigger, flagChanged: false, statusChanged: false }), true, trigger);
    }
  });
});

describe('shouldLogSystemCheck', () => {
  it('a start-up check that changed nothing is not logged', () => {
    assert.equal(shouldLogSystemCheck({ trigger: 'startup', changed: 0, failed: 0 }), false);
  });
  it('a start-up check that changed a flag or had a failure is logged', () => {
    assert.equal(shouldLogSystemCheck({ trigger: 'startup', changed: 2, failed: 0 }), true);
    assert.equal(shouldLogSystemCheck({ trigger: 'startup', changed: 0, failed: 1 }), true);
  });
  it('the daily check is always logged, once a day', () => {
    assert.equal(shouldLogSystemCheck({ trigger: 'daily_check', changed: 0, failed: 0 }), true);
  });
});
