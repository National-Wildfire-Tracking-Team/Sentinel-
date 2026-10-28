// Copied unchanged from the web app (src/app/utils/bzip2.js); keep the two in sync.
/**
 * bzip2.js
 * Minimal bzip2 decompressor on Uint8Array, for NEXRAD Level 3 products
 * whose symbology block is bzip2-compressed (e.g. N0B, TZ0). The npm
 * decoders (seek-bzip) depend on Node's Buffer, so this keeps radar decoding
 * dependency-free in the browser. Block CRCs are not verified.
 */

const MAX_GROUPS = 6;
const MAX_ALPHA = 258;
const MAX_CODE_LEN = 20;

class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0; // byte position
    this.bit = 0; // bits consumed in current byte
  }

  read(n) {
    let v = 0;
    while (n > 0) {
      if (this.pos >= this.bytes.length) throw new Error('bzip2: unexpected end of data');
      const avail = 8 - this.bit;
      const take = Math.min(n, avail);
      const byte = this.bytes[this.pos];
      v = (v << take) | ((byte >> (avail - take)) & ((1 << take) - 1));
      this.bit += take;
      if (this.bit === 8) { this.bit = 0; this.pos += 1; }
      n -= take;
    }
    return v >>> 0;
  }
}

/** Canonical Huffman table → { limit, base, perm, minLen } for fast decoding. */
function buildTable(lengths, alphaSize) {
  let minLen = MAX_CODE_LEN;
  let maxLen = 0;
  for (let i = 0; i < alphaSize; i++) {
    if (lengths[i] > maxLen) maxLen = lengths[i];
    if (lengths[i] < minLen) minLen = lengths[i];
  }
  const perm = new Int32Array(MAX_ALPHA);
  let pp = 0;
  for (let len = minLen; len <= maxLen; len++) {
    for (let s = 0; s < alphaSize; s++) if (lengths[s] === len) perm[pp++] = s;
  }
  const count = new Int32Array(MAX_CODE_LEN + 2);
  for (let i = 0; i < alphaSize; i++) count[lengths[i]] += 1;
  const limit = new Int32Array(MAX_CODE_LEN + 2).fill(-1);
  const base = new Int32Array(MAX_CODE_LEN + 2);
  let code = 0;
  let idx = 0;
  for (let len = minLen; len <= maxLen; len++) {
    base[len] = idx - code; // perm index = code + base[len]
    code += count[len];
    idx += count[len];
    limit[len] = code - 1;
    code <<= 1;
  }
  return { limit, base, perm, minLen, maxLen };
}

function decodeSymbol(br, t) {
  let len = t.minLen;
  let code = br.read(len);
  while (len <= t.maxLen) {
    if (code <= t.limit[len]) return t.perm[code + t.base[len]];
    code = (code << 1) | br.read(1);
    len += 1;
  }
  throw new Error('bzip2: bad Huffman code');
}

function decodeBlock(br, blockSizeMax, out) {
  br.read(32); // block CRC
  if (br.read(1)) throw new Error('bzip2: randomised blocks are not supported');
  const origPtr = br.read(24);

  // Symbol map: which byte values are used
  const used = br.read(16);
  const seqToUnseq = [];
  for (let i = 0; i < 16; i++) {
    if (used & (0x8000 >> i)) {
      const bits = br.read(16);
      for (let j = 0; j < 16; j++) if (bits & (0x8000 >> j)) seqToUnseq.push(i * 16 + j);
    }
  }
  if (!seqToUnseq.length) throw new Error('bzip2: empty symbol map');
  const alphaSize = seqToUnseq.length + 2;

  const nGroups = br.read(3);
  if (nGroups < 2 || nGroups > MAX_GROUPS) throw new Error('bzip2: bad group count');
  const nSelectors = br.read(15);
  if (!nSelectors) throw new Error('bzip2: no selectors');

  // Selectors are MTF-coded unary values
  const mtfGroups = [0, 1, 2, 3, 4, 5].slice(0, nGroups);
  const selectors = new Uint8Array(nSelectors);
  for (let i = 0; i < nSelectors; i++) {
    let j = 0;
    while (br.read(1)) {
      j += 1;
      if (j >= nGroups) throw new Error('bzip2: bad selector');
    }
    const v = mtfGroups[j];
    mtfGroups.splice(j, 1);
    mtfGroups.unshift(v);
    selectors[i] = v;
  }

  // Delta-coded code lengths per group
  const tables = [];
  for (let g = 0; g < nGroups; g++) {
    const lengths = new Uint8Array(MAX_ALPHA);
    let len = br.read(5);
    for (let s = 0; s < alphaSize; s++) {
      for (;;) {
        if (len < 1 || len > MAX_CODE_LEN) throw new Error('bzip2: bad code length');
        if (!br.read(1)) break;
        len += br.read(1) ? -1 : 1;
      }
      lengths[s] = len;
    }
    tables.push(buildTable(lengths, alphaSize));
  }

  // Huffman → MTF/RLE2 → bytes (pre-BWT)
  const mtf = seqToUnseq.slice();
  const tt = new Uint32Array(blockSizeMax);
  const counts = new Int32Array(256);
  const EOB = alphaSize - 1;
  let count = 0;
  let groupIdx = 0;
  let groupPos = 0;
  let table = null;
  let runLen = 0;
  let runBit = 1;

  for (;;) {
    if (groupPos === 0) {
      if (groupIdx >= nSelectors) throw new Error('bzip2: ran out of selectors');
      table = tables[selectors[groupIdx++]];
      groupPos = 50;
    }
    groupPos -= 1;
    const sym = decodeSymbol(br, table);

    if (sym <= 1) { // RUNA / RUNB
      runLen += (sym + 1) * runBit;
      runBit <<= 1;
      continue;
    }
    if (runLen) {
      const b = mtf[0];
      if (count + runLen > blockSizeMax) throw new Error('bzip2: block overflow');
      counts[b] += runLen;
      while (runLen--) tt[count++] = b;
      runLen = 0;
      runBit = 1;
    }
    if (sym === EOB) break;

    const k = sym - 1;
    const b = mtf[k];
    mtf.splice(k, 1);
    mtf.unshift(b);
    if (count >= blockSizeMax) throw new Error('bzip2: block overflow');
    counts[b] += 1;
    tt[count++] = b;
  }
  if (origPtr >= count) throw new Error('bzip2: bad BWT origin');

  // Inverse BWT: tt[] low byte = symbol, high bits = next index
  const cum = new Int32Array(256);
  for (let i = 0, sum = 0; i < 256; i++) { cum[i] = sum; sum += counts[i]; }
  for (let i = 0; i < count; i++) {
    const b = tt[i] & 0xff;
    tt[cum[b]++] |= i << 8;
  }

  // Walk the chain and undo the initial RLE1 (4 equal bytes + repeat count)
  let pos = tt[origPtr] >>> 8;
  let last = -1;
  let run = 0;
  for (let i = 0; i < count; i++) {
    const entry = tt[pos];
    const b = entry & 0xff;
    pos = entry >>> 8;
    if (run === 4) {
      for (let r = 0; r < b; r++) out.push(last);
      run = 0;
      last = -1;
      continue;
    }
    if (b === last) run += 1;
    else { run = 1; last = b; }
    out.push(b);
  }
}

/** Growable byte buffer */
class ByteSink {
  constructor(size = 1 << 16) { this.buf = new Uint8Array(size); this.length = 0; }
  push(b) {
    if (this.length === this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.length++] = b;
  }
  bytes() { return this.buf.subarray(0, this.length); }
}

/**
 * Decompress a bzip2 stream (one or more concatenated streams).
 * @param {Uint8Array} input
 * @returns {Uint8Array}
 */
export function bunzip2(input) {
  const br = new BitReader(input);
  const out = new ByteSink(input.length * 4);
  for (;;) {
    if (br.read(8) !== 0x42 || br.read(8) !== 0x5a || br.read(8) !== 0x68) throw new Error('bzip2: bad stream header');
    const level = br.read(8) - 0x30;
    if (level < 1 || level > 9) throw new Error('bzip2: bad block size');
    const blockSizeMax = level * 100000;
    for (;;) {
      const hi = br.read(24);
      const lo = br.read(24);
      if (hi === 0x314159 && lo === 0x265359) { decodeBlock(br, blockSizeMax, out); continue; }
      if (hi === 0x177245 && lo === 0x385090) { br.read(32); break; } // end of stream + combined CRC
      throw new Error('bzip2: bad block signature');
    }
    // Byte-align, then look for another concatenated stream
    if (br.bit) { br.bit = 0; br.pos += 1; }
    if (br.pos + 4 > input.length || input[br.pos] !== 0x42 || input[br.pos + 1] !== 0x5a) break;
  }
  return out.bytes();
}
