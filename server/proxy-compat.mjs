import { parse, tokenizer } from '../src/vendor/acorn.mjs';

export function rewriteLocations(source, rewriteUrl, sourceUrl) {
  if (!/\blocation\b/.test(source) && (!rewriteUrl || !/\b(?:import|export)\b/.test(source))) return source;
  const edits = [],
    recent = [],
    globals = new Set(['window', 'self', 'document', 'globalThis']);
  try {
    for (const token of tokenizer(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true })) {
      const before = recent.at(-1),
        object = recent.at(-2),
        prefix = recent.at(-3);
      if (
        ['.', '?.'].includes(token.type.label) &&
        before?.value === 'location' &&
        ['.', '?.'].includes(object?.type.label) &&
        prefix?.type.label === 'name' &&
        globals.has(prefix.value) &&
        !['.', '?.'].includes(recent.at(-4)?.type.label)
      ) {
        const edit = edits.at(-1);
        if (edit?.start === before.start && edit.text === '__atlasLocation') {
          edit.start = prefix.start;
          edit.text =
            '(' +
            prefix.value +
            object.type.label +
            '__atlasLocation || ' +
            prefix.value +
            object.type.label +
            'location)';
        }
      }
      if (rewriteUrl && token.type.label === 'string' && /^(?:\.{0,2}\/|https?:)/.test(token.value)) {
        const moduleSpecifier =
          before?.type.label === 'import' ||
          before?.value === 'from' ||
          (!sourceUrl &&
            before?.type.label === '(' &&
            object?.type.label === 'import' &&
            !['.', '?.'].includes(prefix?.type.label));
        if (moduleSpecifier)
          edits.push({ start: token.start, end: token.end, text: JSON.stringify(rewriteUrl(token.value)) });
      }
      if (
        sourceUrl &&
        token.type.label === '(' &&
        before?.type.label === 'import' &&
        !['.', '?.'].includes(object?.type.label)
      )
        edits.push({
          start: before.start,
          end: before.end,
          text: 'globalThis.__atlasImport.bind(null,' + JSON.stringify(sourceUrl) + ')',
        });
      if (
        sourceUrl &&
        token.value === 'url' &&
        before?.type.label === '.' &&
        object?.value === 'meta' &&
        prefix?.type.label === '.' &&
        recent.at(-4)?.type.label === 'import'
      )
        edits.push({ start: recent.at(-4).start, end: token.end, text: JSON.stringify(sourceUrl) });
      if (object?.type.label === 'name' && globals.has(object.value) && !['.', '?.'].includes(prefix?.type.label)) {
        if (token.type.label === 'name' && token.value === 'location' && ['.', '?.'].includes(before?.type.label))
          edits.push({ start: token.start, end: token.end, text: '__atlasLocation' });
        if (token.type.label === 'string' && token.value === 'location' && before?.type.label === '[')
          edits.push({ start: token.start, end: token.end, text: '"__atlasLocation"' });
      }
      recent.push(token);
      if (recent.length > 4) recent.shift();
    }
  } catch {
    return source;
  }
  try {
    const root = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowHashBang: true,
      allowReturnOutsideFunction: true,
    });
    const pending = [{ node: root, parent: null }];
    while (pending.length) {
      const { node, parent } = pending.pop();
      if (
        node.type === 'MemberExpression' &&
        !node.optional &&
        node.object.type === 'Identifier' &&
        !globals.has(node.object.name) &&
        (node.computed
          ? node.property.type === 'Literal' && node.property.value === 'location'
          : node.property.name === 'location') &&
        !(parent?.type === 'AssignmentExpression' && parent.left === node) &&
        !(
          parent?.type === 'UpdateExpression' ||
          (parent?.type === 'UnaryExpression' && parent.operator === 'delete')
        ) &&
        !(['ForInStatement', 'ForOfStatement'].includes(parent?.type) && parent.left === node)
      ) {
        const object = node.object.name;
        edits.push({
          start: node.start,
          end: node.end,
          text:
            '(globalThis.__atlasLocationFor?globalThis.__atlasLocationFor(' +
            object +
            '):' +
            source.slice(node.start, node.end) +
            ')',
        });
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child?.type) pending.push({ node: child, parent: node });
          }
        } else if (value?.type) pending.push({ node: value, parent: node });
      }
    }
  } catch {}
  edits.sort((a, b) => a.start - b.start);
  const pieces = [];
  let cursor = 0;
  edits.forEach(edit => {
    pieces.push(source.slice(cursor, edit.start), edit.text);
    cursor = edit.end;
  });
  pieces.push(source.slice(cursor));
  return pieces.join('');
}

export function rewriteCss(source, rewriteUrl) {
  const url = value => (!value || /^(?:data:|blob:|#)/i.test(value) ? value : rewriteUrl(value));
  return source
    .replace(
      /url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s)]*))\s*\)/gi,
      (_match, double, single, bare) => 'url(' + JSON.stringify(url(double ?? single ?? bare)) + ')'
    )
    .replace(/(@import\s+)(["'])([^"']+)\2/gi, (_match, prefix, _quote, value) => prefix + JSON.stringify(url(value)));
}
