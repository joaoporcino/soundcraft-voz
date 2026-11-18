import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(target) : entry.isFile() && entry.name.endsWith('.md') ? [target] : [];
  }));
  return files.flat();
}

function withoutCode(content) {
  let fence = null;
  return content.split(/\r?\n/).map(line => {
    const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (match) {
      if (!fence) fence = { char: match[1][0], length: match[1].length };
      else if (match[1][0] === fence.char && match[1].length >= fence.length) fence = null;
      return '';
    }
    return fence ? '' : line.replace(/`+[^`\n]*`+/g, '');
  }).join('\n');
}

/** Checks a deliberate subset of Markdown: inline links and required spec fields. */
export async function checkDocumentation(root) {
  const files = [path.join(root, 'README.md'), path.join(root, 'AGENTS.md'), ...await markdownFiles(path.join(root, 'docs'))];
  const errors = [];
  for (const file of files) {
    const display = path.relative(root, file).split(path.sep).join('/');
    const content = await readFile(file, 'utf8');
    const body = withoutCode(content);
    if (display.startsWith('docs/especificacoes/') && display !== 'docs/especificacoes/modelo.md') {
      const section = /^## Situação atual\s*\r?\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m.exec(body)?.[1] ?? '';
      for (const field of ['Estado', 'Integração', 'Validação']) {
        if (!new RegExp(`^- ${field}:[^\\S\\r\\n]*\\S`, 'm').test(section)) errors.push(`${display}: campo ${field} ausente ou vazio em Situação atual`);
      }
    }
    const links = /!?\[[^\]\n]*\]\((<[^>\n]+>|[^\s)]+)(?:\s+["'][^\n)]*["'])?\)/g;
    for (const match of body.matchAll(links)) {
      const target = match[1].replace(/^<|>$/g, '');
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)) continue;
      const pathname = target.split(/[?#]/, 1)[0];
      if (!pathname) continue;
      let decoded;
      try { decoded = decodeURIComponent(pathname); } catch { errors.push(`${display}: link local com codificação inválida: ${target}`); continue; }
      try { await stat(path.resolve(path.dirname(file), decoded)); } catch { errors.push(`${display}: destino local não encontrado: ${target}`); }
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const errors = await checkDocumentation(process.cwd());
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else console.log('Documentação: campos e destinos locais verificados.');
}
