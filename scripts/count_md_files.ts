import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';

function countMarkdownFiles(dir: string): number {
  let count = 0;
  function walk(d: string) {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (f.endsWith('.md')) {
        count++;
      }
    }
  }
  walk(dir);
  return count;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: node --experimental-strip-types scripts/count_md_files.ts <directory>');
    process.exit(1);
  }
  const target = path.resolve(args[0]);
  if (!fs.existsSync(target)) {
    console.error(`error: directory does not exist: ${target}`);
    process.exit(1);
  }
  if (!fs.statSync(target).isDirectory()) {
    console.error(`error: path is not a directory: ${target}`);
    process.exit(1);
  }
  console.log(countMarkdownFiles(target));
  process.exit(0);
}

main();
