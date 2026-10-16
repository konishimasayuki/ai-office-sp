import { mdToHtml } from './markdown.js';

// 成果物をファイルとして保存する（Markdown・Word・HTML・PDF）
const safeName = (s) =>
  String(s || '成果物')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 60);

export function download(name, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const DOC_CSS =
  'body{font-family:"Hiragino Sans","Yu Gothic","Meiryo",sans-serif;color:#161a22;line-height:1.8;font-size:11pt;margin:24px}h1{font-size:18pt;border-bottom:2px solid #c9a45c;padding-bottom:6px}h2{font-size:14pt;margin-top:22px}h3{font-size:12pt}table{border-collapse:collapse;width:100%;margin:10px 0}th,td{border:1px solid #bbb;padding:5px 8px;font-size:10pt;vertical-align:top}th{background:#f3f0e8}code{background:#f3f4f6;padding:1px 4px}a{color:#1e5bb8}.foot{margin-top:28px;font-size:9pt;color:#888}@page{size:A4;margin:16mm}';

// 文書（Markdown）を、Wordや印刷で使えるHTMLにする（中身はエスケープ済み）
export function docHtml(o, footer = '') {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(o.title)}</title><style>${DOC_CSS}</style></head><body>${mdToHtml(o.content)}${footer ? `<p class="foot">${esc(footer)}</p>` : ''}</body></html>`;
}

export function saveMarkdown(o) {
  download(`${safeName(o.title)}.md`, o.content, 'text/markdown');
}
export function saveWord(o, footer) {
  // WordはHTMLをそのまま開けるため、.doc として保存する
  download(`${safeName(o.title)}.doc`, `\ufeff${docHtml(o, footer)}`, 'application/msword');
}
export function saveHtml(o) {
  download(`${safeName(o.title)}.html`, o.content, 'text/html');
}

// 印刷画面を出す（「PDFとして保存」を選べばPDFになる）
// AIが作ったHTMLはスクリプトを動かさない枠（sandbox）の中で印刷する
export function printOut(o, footer) {
  const html = o.kind === 'html' ? o.content : docHtml(o, footer);
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-same-origin allow-modals');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  f.srcdoc = html;
  f.onload = () => {
    try {
      f.contentWindow.focus();
      f.contentWindow.print();
    } finally {
      window.setTimeout(() => f.remove(), 60000);
    }
  };
  document.body.appendChild(f);
}
