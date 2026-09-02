/**
 * Sparse TrueType subsetting: keeps every table and every glyph ID exactly as in the source
 * font, but strips the outline data of glyphs that are not needed. Because nothing is
 * renumbered, the result is a valid font for any renderer; pdf-lib then embeds it as-is
 * (`subset: false`). fontkit's own subsetter renumbers glyphs and produces fonts that macOS
 * Preview/QuickLook render as garbage for large CJK fonts, which is why this exists.
 */

interface Table {
  tag: string;
  offset: number;
  length: number;
}

const DROP_TABLES = new Set(['GSUB', 'GPOS', 'GDEF', 'BASE', 'DSIG', 'vhea', 'vmtx', 'VORG', 'JSTF', 'MATH', 'kern', 'gasp', 'hdmx', 'LTSH', 'VDMX', 'meta']);

function readTables(buf: DataView): Table[] {
  const numTables = buf.getUint16(4);
  const tables: Table[] = [];
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    const tag = String.fromCharCode(buf.getUint8(p), buf.getUint8(p + 1), buf.getUint8(p + 2), buf.getUint8(p + 3));
    tables.push({ tag, offset: buf.getUint32(p + 8), length: buf.getUint32(p + 12) });
  }
  return tables;
}

/** Maps code points to glyph IDs using the cmap format 4 / 12 subtables. */
function readCmap(buf: DataView, cmap: Table): Map<number, number> {
  const map = new Map<number, number>();
  const n = buf.getUint16(cmap.offset + 2);
  for (let i = 0; i < n; i++) {
    const rec = cmap.offset + 4 + i * 8;
    const platform = buf.getUint16(rec);
    const encoding = buf.getUint16(rec + 2);
    const off = cmap.offset + buf.getUint32(rec + 4);
    const format = buf.getUint16(off);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 4) {
      const segX2 = buf.getUint16(off + 6);
      const ends = off + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const rangeOffs = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = buf.getUint16(ends + s * 2);
        const start = buf.getUint16(starts + s * 2);
        const delta = buf.getInt16(deltas + s * 2);
        const ro = buf.getUint16(rangeOffs + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let g: number;
          if (ro === 0) g = (c + delta) & 0xffff;
          else {
            const gp = rangeOffs + s * 2 + ro + (c - start) * 2;
            g = buf.getUint16(gp);
            if (g !== 0) g = (g + delta) & 0xffff;
          }
          if (g !== 0 && !map.has(c)) map.set(c, g);
        }
      }
    } else if (format === 12) {
      const groups = buf.getUint32(off + 12);
      for (let gI = 0; gI < groups; gI++) {
        const gp = off + 16 + gI * 12;
        const start = buf.getUint32(gp);
        const end = buf.getUint32(gp + 4);
        const startGid = buf.getUint32(gp + 8);
        for (let c = start; c <= end; c++) if (!map.has(c)) map.set(c, startGid + (c - start));
      }
    }
  }
  return map;
}

function checksum(bytes: Uint8Array): number {
  let sum = 0;
  const padded = (bytes.length + 3) & ~3;
  for (let i = 0; i < padded; i += 4) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const b3 = bytes[i + 3] ?? 0;
    sum = (sum + ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3)) >>> 0;
  }
  return sum;
}

/**
 * Returns a TrueType font containing outlines only for the glyphs needed to render `text`
 * (plus .notdef and any composite components). Throws for CFF-based OpenType fonts.
 */
export function sparseSubsetTtf(font: Uint8Array, text: string): Uint8Array {
  const buf = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables = readTables(buf);
  const byTag = new Map(tables.map((t) => [t.tag, t]));
  const glyf = byTag.get('glyf');
  const loca = byTag.get('loca');
  const head = byTag.get('head');
  const maxp = byTag.get('maxp');
  const cmap = byTag.get('cmap');
  if (!glyf || !loca || !head || !maxp || !cmap) throw new Error('僅支援 TrueType (glyf) 字型');

  const longLoca = buf.getInt16(head.offset + 50) === 1;
  const numGlyphs = buf.getUint16(maxp.offset + 4);
  const locaAt = (i: number) => (longLoca ? buf.getUint32(loca.offset + i * 4) : buf.getUint16(loca.offset + i * 2) * 2);

  const unicodeMap = readCmap(buf, cmap);
  const keep = new Set<number>([0]);
  for (const ch of text) {
    const g = unicodeMap.get(ch.codePointAt(0)!);
    if (g !== undefined) keep.add(g);
  }
  // Composite glyphs reference other glyphs; pull those in too (transitively).
  const stack = [...keep];
  while (stack.length) {
    const g = stack.pop()!;
    const start = locaAt(g);
    const end = locaAt(g + 1);
    if (end - start < 10) continue;
    const p = glyf.offset + start;
    if (buf.getInt16(p) >= 0) continue; // simple glyph
    let q = p + 10;
    for (;;) {
      const flags = buf.getUint16(q);
      const idx = buf.getUint16(q + 2);
      if (!keep.has(idx)) {
        keep.add(idx);
        stack.push(idx);
      }
      q += 4;
      q += flags & 0x0001 ? 4 : 2; // ARG_1_AND_2_ARE_WORDS
      if (flags & 0x0008) q += 2; // WE_HAVE_A_SCALE
      else if (flags & 0x0040) q += 4; // WE_HAVE_AN_X_AND_Y_SCALE
      else if (flags & 0x0080) q += 8; // WE_HAVE_A_TWO_BY_TWO
      if (!(flags & 0x0020)) break; // MORE_COMPONENTS
    }
  }

  // Rebuild glyf/loca: kept glyphs copied verbatim, others become empty (zero length).
  const newLoca = new Uint8Array((numGlyphs + 1) * 4);
  const newLocaView = new DataView(newLoca.buffer);
  const chunks: Uint8Array[] = [];
  let pos = 0;
  for (let g = 0; g < numGlyphs; g++) {
    newLocaView.setUint32(g * 4, pos);
    if (!keep.has(g)) continue;
    const start = locaAt(g);
    const end = locaAt(g + 1);
    if (end > start) {
      const len = (end - start + 3) & ~3;
      const chunk = new Uint8Array(len);
      chunk.set(font.subarray(glyf.offset + start, glyf.offset + end));
      chunks.push(chunk);
      pos += len;
    }
  }
  newLocaView.setUint32(numGlyphs * 4, pos);
  const newGlyf = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) {
    newGlyf.set(c, o);
    o += c.length;
  }

  // head: force long loca offsets (indexToLocFormat = 1) and clear the checksum adjustment.
  const newHead = font.slice(head.offset, head.offset + head.length);
  new DataView(newHead.buffer).setInt16(50, 1);
  new DataView(newHead.buffer).setUint32(8, 0);

  const out: { tag: string; data: Uint8Array }[] = [];
  for (const t of tables) {
    if (DROP_TABLES.has(t.tag)) continue;
    if (t.tag === 'glyf') out.push({ tag: t.tag, data: newGlyf });
    else if (t.tag === 'loca') out.push({ tag: t.tag, data: newLoca });
    else if (t.tag === 'head') out.push({ tag: t.tag, data: newHead });
    else out.push({ tag: t.tag, data: font.subarray(t.offset, t.offset + t.length) });
  }
  out.sort((a, b) => (a.tag < b.tag ? -1 : 1));

  const dirSize = 12 + out.length * 16;
  let total = dirSize;
  for (const t of out) total += (t.data.length + 3) & ~3;
  const result = new Uint8Array(total);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, 0x00010000);
  rv.setUint16(4, out.length);
  let maxPow = 1;
  let log = 0;
  while (maxPow * 2 <= out.length) {
    maxPow *= 2;
    log++;
  }
  rv.setUint16(6, maxPow * 16);
  rv.setUint16(8, log);
  rv.setUint16(10, out.length * 16 - maxPow * 16);
  let offset = dirSize;
  out.forEach((t, i) => {
    const p = 12 + i * 16;
    for (let k = 0; k < 4; k++) result[p + k] = t.tag.charCodeAt(k);
    rv.setUint32(p + 4, checksum(t.data));
    rv.setUint32(p + 8, offset);
    rv.setUint32(p + 12, t.data.length);
    result.set(t.data, offset);
    offset += (t.data.length + 3) & ~3;
  });
  const headEntry = out.findIndex((t) => t.tag === 'head');
  if (headEntry >= 0) {
    const headOffset = rv.getUint32(12 + headEntry * 16 + 8);
    rv.setUint32(headOffset + 8, (0xb1b0afba - checksum(result)) >>> 0);
  }
  return result;
}
