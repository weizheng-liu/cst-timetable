/**
 * 学校の「履修届確認表」（RisyuDisp.aspx）の文字から時間割CDだけを取り出す。
 * 1 コマの表記は「(前期)J31D:電磁気学Ⅰ及び演習<教員>③【船】」の形。
 * 取り出すのは「(前期|後期|年間)」の直後にある 4 文字のコードだけで、
 * 氏名・学生番号など他の文字は読まない・残さない。
 */
const CODE_RE = /[(（]\s*(?:前期|後期|年間|通年)\s*[)）]\s*([A-Z][0-9]{2}[0-9A-Z])\s*[:：]/g;

export function parseCodes(text: string): string[] {
  const out: string[] = [];
  for (const m of (text || "").normalize("NFKC").matchAll(CODE_RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** URL の #import=J31D,J42C から読む（ハッシュはサーバーに送られない） */
export function codesFromHash(hash: string): string[] | null {
  const m = /(?:^#|&)import=([0-9A-Za-z,]*)/.exec(hash || "");
  if (!m) return null;
  return [...new Set(m[1].split(",").filter((c) => /^[A-Z][0-9]{2}[0-9A-Z]$/.test(c)))];
}

/**
 * ブックマークレット本体。確認表のページで実行すると、コードだけを集めて
 * このサイトを新しいタブで開く（#import=...）。ページの他の情報は送らない。
 */
export function bookmarklet(siteUrl: string): string {
  const js = `(()=>{var t=document.body.innerText.normalize('NFKC'),r=/[(（]\\s*(?:前期|後期|年間|通年)\\s*[)）]\\s*([A-Z][0-9]{2}[0-9A-Z])\\s*[:：]/g,s=[],m;while(m=r.exec(t))s.indexOf(m[1])<0&&s.push(m[1]);if(!s.length){alert('時間割CDが見つかりません。履修届確認表のページで実行してください。');return}var u='${siteUrl}#import='+s.join(',');window.open(u,'_blank')||(location.href=u)})()`;
  return "javascript:" + encodeURIComponent(js);
}
