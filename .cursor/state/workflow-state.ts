import * as process from 'node:process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as api from '../../src/oh_my_cursor/workflow_state/api.ts';
import { fileLock } from '../../src/oh_my_cursor/workflow_state/locking.ts';
import { main as cliMain } from '../../src/oh_my_cursor/workflow_state/cli.ts';

export const DEFAULT_HISTORY_CAP = api.DEFAULT_HISTORY_CAP;
export const PHASES = api.PHASES;
export const STATUSES = api.STATUSES;
export const ROLES = api.ROLES;
export const AC_STATUSES = api.AC_STATUSES;
export const FAILURE_TYPES = api.FAILURE_TYPES;

export const read_state = api.readState;
export const init_state = api.initState;
export const set_state = api.setState;
export const update_acceptance_criterion = api.updateAcceptanceCriterion;
export const record_failure = api.recordFailure;
export const append_history = api.appendHistory;
export const file_lock = fileLock;
export const main = cliMain;

const currentFile = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile);
if (isDirectRun) {
  cliMain();
}
