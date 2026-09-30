// Run from workspace root: node nested-backend-implementation/verification/page-history-check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const roots = [
  'pages/PageTrackingPage.tsx', 'components/tracking/PageHistoryOptionFilter.tsx',
  'hooks/usePageHistoryQuery.ts', 'services/analyticsService.ts',
  'services/pageHistoryUtils.ts', 'types/audit.ts',
].map(file => `original-project-snippet/src/${file}`);
const program = ts.createProgram(roots, {
  target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX,
  strict: true, noEmit: true, skipLibCheck: true, esModuleInterop: true,
});
const diagnostics = ts.getPreEmitDiagnostics(program);
const own = diagnostics.filter(d => d.file && roots.some(root => d.file.fileName.replaceAll('\\', '/').endsWith(root)));
if (own.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(own, {
    getCurrentDirectory: () => process.cwd(), getCanonicalFileName: name => name, getNewLine: () => '\n',
  }));
  process.exitCode = 1;
}
console.log(`Changed-file TypeScript diagnostics: ${own.length}; existing/dependency diagnostics: ${diagnostics.length - own.length}`);

const { outputText } = ts.transpileModule(fs.readFileSync('original-project-snippet/src/services/pageHistoryUtils.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
});
const utils = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
assert.deepEqual(utils.defaultHistoryFilters(new Date('2026-09-22T21:15:00Z')), { from: '2026-09-17', to: '2026-09-23' });
assert.deepEqual(utils.defaultHistoryFilters(new Date('2026-01-01T00:00:00Z')), { from: '2025-12-26', to: '2026-01-01' });
assert.equal(utils.historyRangeError({ from: '2024-01-01', to: '2024-12-31' }), null);
assert.ok(utils.historyRangeError({ from: '2024-01-01', to: '2025-01-01' }));
assert.ok(utils.historyRangeError({ from: '2026-02-30', to: '2026-03-01' }));
assert.ok(utils.historyRangeError({ from: '2026-09-24', to: '2026-09-23' }));
assert.ok(utils.historyRangeError({ from: '', to: '2026-09-23' }));
assert.equal(utils.historyRangeError({ from: '2026-09-23', to: '2026-09-23' }), null);
const query = new URLSearchParams(utils.serializeHistoryParams({
  roleCodeIn: ['ADMIN', 'ANALYTICS'], userId: 'ca09319c-55c3-4d18-a2e0-84824cf7dacf',
  pagePathExact: '/transactions/a?x=1&y=2', page: 0, sort: 'visitTimestamp,desc', absent: undefined, blank: '',
}));
assert.deepEqual(query.getAll('roleCodeIn'), ['ADMIN', 'ANALYTICS']);
assert.equal(query.get('userId'), 'ca09319c-55c3-4d18-a2e0-84824cf7dacf');
assert.equal(query.get('pagePathExact'), '/transactions/a?x=1&y=2');
assert.equal(query.get('page'), '0');
assert.equal(query.get('sort'), 'visitTimestamp,desc');
assert.equal(query.has('absent'), false);
assert.equal(query.has('blank'), false);
assert.match(utils.formatHistoryTimestamp('2026-09-22T21:15:00Z'), /23 Sept 2026.*00:15:00/);
console.log('Passed date-boundary, date-validation, timestamp-display, and query-contract checks.');
