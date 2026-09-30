// Local, one-time source release preparation. No Git operations, network,
// secret reading, existing-directory overwrites or production changes.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--output') {
  throw new Error('Usage: node scripts/export-community-source.mjs --output <new-directory>');
}
const output = path.resolve(args[1]);
const relative = path.relative(root, output);
if (!relative.startsWith(`..${path.sep}`) || existsSync(output)) {
  throw new Error('Output must be a new directory outside the source repository. Nothing overwritten.');
}

const scriptNames = new Set([
  'bootstrap-admin.mjs', 'scan-server.mjs', 'cloud-server.mjs',
  'cloud-http-handler.mjs', 'cloud-memory.mjs', 'cloud-runtime-policy.mjs',
]);
const privateTests = new Set([
  'cloud-backup.test.ts', 'cloud-backup-retention.test.ts',
  'cloud-image-memory-rehearsal.test.ts', 'cloud-boundary-fixtures.test.ts',
  'cloud-export-rehearsal.test.ts', 'cloud-positive-export-fixtures.test.ts',
  'cloud-rejection-fixtures.test.ts', 'cloud-scan-smoke.test.ts',
  'transloadit-probe.test.ts', 'verify-cloud-promotion-download.test.ts',
  'compose-ps.test.ts', 'e2e-upload-state.test.ts', 'local-preview-state.test.ts',
]);
const rootFiles = new Set([
  '.gitignore', 'package.json', 'package-lock.json', 'next.config.ts',
  'tsconfig.json', 'eslint.config.mjs', 'postcss.config.mjs', 'drizzle.config.ts',
  'schema.sql', 'beta-mod-hub-spec.md', 'ACCOUNT-SETUP.md',
]);
const preparedFiles = [
  'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'GOVERNANCE.md',
  'docs/ARCHITECTURE.md', 'docs/DEPLOYMENT.md',
  '.github/workflows/ci.yml', '.github/CODEOWNERS',
  '.github/PULL_REQUEST_TEMPLATE.md', '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml', '.github/ISSUE_TEMPLATE/config.yml',
  'tests/ci-policy.test.ts',
];
if (existsSync(path.join(root, 'LICENSE'))) preparedFiles.push('LICENSE');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const files = new Set(tracked.filter((name) =>
  rootFiles.has(name) || name.startsWith('lib/') || name.startsWith('db/') ||
  (name.startsWith('src/') && name !== 'src/app/favicon.ico') ||
  (name.startsWith('scripts/') && scriptNames.has(name.slice(8))) ||
  (name.startsWith('tests/') && !name.slice(6).includes('/') && !privateTests.has(name.slice(6)))
));
for (const name of preparedFiles) files.add(name);
const overlays = new Map([
  ['community/AGENTS.md', 'AGENTS.md'], ['community/ASSETS.md', 'ASSETS.md'],
  ['community/env.example', 'env.example'],
  ['community/community-hero.svg', 'public/images/community-hero.svg'],
  ['community/icon.svg', 'src/app/icon.svg'],
]);
for (const name of [...files, ...overlays.keys()]) {
  const permittedExtensions = new Set(['.ts', '.tsx', '.css', '.sql', '.json', '.mjs', '.md', '.yml', '.svg', '.example']);
  if (path.isAbsolute(name) || name.split(/[\\/]/).some((part) => part === '..' || part === '.git') ||
      (/\.(?:pem|key|p12|pfx|bmbak|zip|dump|bak)$/i).test(name) ||
      (path.basename(name).startsWith('.env') && !name.endsWith('.example')) ||
      (!permittedExtensions.has(path.extname(name)) && !['.gitignore', 'LICENSE', '.github/CODEOWNERS'].includes(name))) {
    throw new Error(`Unexpected public-source file type: ${name}`);
  }
  const source = path.join(root, name);
  if (!existsSync(source) || !lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) {
    throw new Error(`Expected regular reviewed source file: ${name}`);
  }
}
mkdirSync(output); // Fails if the destination appeared after the initial check.
function copy(source, destination) {
  const target = path.join(output, destination);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(path.join(root, source), target, 1); // COPYFILE_EXCL
}
for (const name of [...files].sort()) copy(name, name);
for (const [source, destination] of overlays) copy(source, destination);

// Mechanical public-edition transformations only. The source repository and
// running service retain their original scripts and artwork.
const pkgPath = path.join(output, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.name = 'betamods';
pkg.engines = { node: '>=22 <23' };
pkg.scripts = Object.fromEntries(Object.entries(pkg.scripts).filter(([name]) =>
  ['dev', 'build', 'start', 'start:cloud', 'lint', 'typecheck', 'test'].includes(name)));
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
const lockPath = path.join(output, 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
lock.name = pkg.name;
lock.packages[''].name = pkg.name;
lock.packages[''].engines = pkg.engines;
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
const pagePath = path.join(output, 'src/app/page.tsx');
const page = readFileSync(pagePath, 'utf8');
if (page.split('/images/dragon-hero.png').length !== 2) throw new Error('Review updated hero markup before exporting.');
writeFileSync(pagePath, page.replace('/images/dragon-hero.png', '/images/community-hero.svg'));
console.log(`Prepared ${files.size + overlays.size} reviewed source files in ${output}.`);
console.log('No Git history, private environment files, operational workflows, uploaded mods or backup artifacts copied.');
console.log('This is local preparation only. Review, license, scan and validate the exact snapshot before publication.');
