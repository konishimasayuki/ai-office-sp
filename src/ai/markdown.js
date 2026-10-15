// 成果物（Markdown）を安全に表示するための小さな変換（HTMLはすべてエスケープしてから整形）
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s（(])(https?:\/\/[^\s<）)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');

export function mdToHtml(md) {
  const lines = String(md || '')
    .replace(/\r/g, '')
    .split('\n');
  const out = [];
  let list = '';
  let table = [];
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = '';
  };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
    const cells = (r) =>
      r
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => inline(c.trim()));
    out.push('<div class="md-table"><table>');
    rows.forEach((r, i) =>
      out.push(
        `<tr>${cells(r)
          .map((c) => (i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`))
          .join('')}</tr>`,
      ),
    );
    out.push('</table></div>');
    table = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      table.push(line);
      continue;
    }
    flushTable();
    let m = line.match(/^(#{1,4})\s+(.*)/);
    if (m) {
      closeList();
      out.push(`<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`);
      continue;
    }
    m = line.match(/^\s*[-*・]\s+(.*)/);
    if (m) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    m = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (m) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    closeList();
    if (/^-{3,}$/.test(line.trim())) out.push('<hr>');
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  flushTable();
  return out.join('\n');
}
