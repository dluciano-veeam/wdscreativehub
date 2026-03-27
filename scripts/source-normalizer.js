import { promises as fs } from 'fs';
import path from 'path';

const ATTRIBUTION_KEYWORDS = [
  'codepen',
  'codrops',
  'tympanus',
  'creative house',
  'caploom',
  'github.com'
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shouldPrefixToken(token) {
  return (
    /^[A-Za-z_][A-Za-z0-9_-]*$/.test(token) &&
    !token.startsWith('wdslabs-')
  );
}

function stripAttributionComments(text) {
  const blockComment = /\/\*[\s\S]*?\*\//g;
  const lineComment = /(^|\n)\s*\/\/[^\n]*/g;
  const htmlComment = /<!--[\s\S]*?-->/g;

  const containsKeyword = (value) => {
    const lower = value.toLowerCase();
    return ATTRIBUTION_KEYWORDS.some((keyword) => lower.includes(keyword));
  };

  return text
    .replace(blockComment, (match) => (containsKeyword(match) ? '' : match))
    .replace(lineComment, (match) => (containsKeyword(match) ? '' : match))
    .replace(htmlComment, (match) => (containsKeyword(match) ? '' : match));
}

function stripAttributionLines(text) {
  return text
    .split('\n')
    .filter((line) => {
      const lower = line.toLowerCase();
      return !ATTRIBUTION_KEYWORDS.some((keyword) => lower.includes(keyword));
    })
    .join('\n');
}

function collectHtmlClasses(html) {
  const tokens = new Set();
  const regex = /class\s*=\s*["']([^"']+)["']/gi;
  let match = regex.exec(html);
  while (match) {
    const raw = match[1] || '';
    raw.split(/\s+/).forEach((token) => {
      if (shouldPrefixToken(token)) tokens.add(token);
    });
    match = regex.exec(html);
  }
  return tokens;
}

function buildClassMap(classTokens) {
  const map = new Map();
  classTokens.forEach((token) => {
    map.set(token, `wdslabs-${token}`);
  });
  return map;
}

function replaceHtmlClassAttributes(html, classMap) {
  return html.replace(/class\s*=\s*["']([^"']+)["']/gi, (full, classValue) => {
    const next = classValue
      .split(/\s+/)
      .map((token) => classMap.get(token) || token)
      .join(' ');
    return full.replace(classValue, next);
  });
}

function replaceClassSelectors(text, classMap) {
  let next = text;
  for (const [fromName, toName] of classMap.entries()) {
    const escapedFrom = escapeRegExp(fromName);
    next = next.replace(
      new RegExp(`\\.${escapedFrom}(?![A-Za-z0-9_-])`, 'g'),
      `.${toName}`
    );
    next = next.replace(
      new RegExp(`(?<!wdslabs-)\\b${escapedFrom}\\b`, 'g'),
      (match, offset, source) => {
        const left = source[offset - 1] || '';
        const right = source[offset + match.length] || '';
        const likelyClassToken =
          left === ' ' ||
          left === '"' ||
          left === "'" ||
          left === '`' ||
          left === '[' ||
          left === '(' ||
          left === ',' ||
          right === ' ' ||
          right === '"' ||
          right === "'" ||
          right === '`' ||
          right === ']' ||
          right === ')' ||
          right === ',' ||
          right === '.';
        return likelyClassToken ? toName : match;
      }
    );
  }
  return next;
}

function collectCssVars(text) {
  const vars = new Set();
  const regex = /--([A-Za-z0-9_-]+)/g;
  let match = regex.exec(text);
  while (match) {
    const name = match[1];
    if (name && !name.startsWith('wdslabs-')) {
      vars.add(name);
    }
    match = regex.exec(text);
  }
  return vars;
}

function buildCssVarMap(varTokens) {
  const map = new Map();
  varTokens.forEach((token) => {
    map.set(token, `wdslabs-${token}`);
  });
  return map;
}

function replaceCssVars(text, varMap) {
  let next = text;
  for (const [fromName, toName] of varMap.entries()) {
    const escapedFrom = escapeRegExp(fromName);
    next = next.replace(
      new RegExp(`--${escapedFrom}(?![A-Za-z0-9_-])`, 'g'),
      `--${toName}`
    );
  }
  return next;
}

function collapseRepeatedPrefix(text) {
  return text.replace(/(?:wdslabs-){2,}/g, 'wdslabs-');
}

export function normalizeHtmlSource(htmlSource, options = {}) {
  const { prefixIdentifiers = false } = options;
  if (!htmlSource || typeof htmlSource !== 'string') return htmlSource || '';

  const stripped = stripAttributionComments(htmlSource);
  const lineStripped = stripAttributionLines(stripped);
  if (!prefixIdentifiers) {
    return lineStripped;
  }
  const classMap = buildClassMap(collectHtmlClasses(lineStripped));
  const varMap = buildCssVarMap(collectCssVars(lineStripped));

  let next = replaceHtmlClassAttributes(lineStripped, classMap);
  next = replaceClassSelectors(next, classMap);
  next = replaceCssVars(next, varMap);
  next = collapseRepeatedPrefix(next);
  return next;
}

async function collectTextFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('._')) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.html' || ext === '.css' || ext === '.js' || ext === '.md') {
        out.push(fullPath);
      }
    }
  }
  return out;
}

export async function normalizeProjectDirectory(rootDir) {
  const files = await collectTextFiles(rootDir);
  if (!files.length) return { changedFiles: 0 };

  let changedFiles = 0;
  for (const file of files) {
    const original = await fs.readFile(file, 'utf-8');
    let next = stripAttributionLines(stripAttributionComments(original));
    if (next !== original) {
      await fs.writeFile(file, next, 'utf-8');
      changedFiles += 1;
    }
  }

  return { changedFiles };
}
