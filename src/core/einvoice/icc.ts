/**
 * Profil ICC v2 sRGB (IEC 61966-2.1) généré en code, sans fichier binaire tiers : primaires
 * adaptées D50 (Bradford), courbe de transfert sRGB échantillonnée (1024 points). Sert d'
 * `OutputIntent` PDF/A (`DestOutputProfile`, N = 3).
 */
const D50 = [0.9642, 1.0, 0.8249] as const;
const PRIMARIES = {
  rXYZ: [0.4360747, 0.2225045, 0.0139322],
  gXYZ: [0.3850649, 0.7168786, 0.0971045],
  bXYZ: [0.1430804, 0.0606169, 0.7141733],
} as const;

export const SRGB_ICC_DESCRIPTION = "sRGB IEC61966-2.1";

const ascii = (value: string) => Array.from(value, (char) => char.charCodeAt(0) & 0x7f);

class Writer {
  readonly bytes: number[] = [];
  u8(value: number) { this.bytes.push(value & 0xff); return this; }
  u16(value: number) { return this.u8(value >>> 8).u8(value); }
  u32(value: number) { return this.u16(value >>> 16).u16(value & 0xffff); }
  s15f16(value: number) { return this.u32(Math.round(value * 65536) >>> 0); }
  sig(value: string) { for (const byte of ascii(value.padEnd(4, " ").slice(0, 4))) this.u8(byte); return this; }
  raw(values: readonly number[]) { for (const value of values) this.u8(value); return this; }
  zeros(count: number) { for (let index = 0; index < count; index++) this.u8(0); return this; }
  pad4() { while (this.bytes.length % 4) this.u8(0); return this; }
}

const xyzTag = (xyz: readonly number[]) => {
  const w = new Writer().sig("XYZ ").zeros(4);
  for (const value of xyz) w.s15f16(value);
  return w.bytes;
};

const srgbToLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

const curveTag = () => {
  const points = 1024;
  const w = new Writer().sig("curv").zeros(4).u32(points);
  for (let index = 0; index < points; index++) w.u16(Math.round(srgbToLinear(index / (points - 1)) * 65535));
  return w.bytes;
};

const descTag = (value: string) => {
  const text = [...ascii(value), 0];
  return new Writer().sig("desc").zeros(4).u32(text.length).raw(text).u32(0).u32(0).u16(0).u8(0).zeros(67).bytes;
};

const textTag = (value: string) => new Writer().sig("text").zeros(4).raw([...ascii(value), 0]).bytes;

/** Octets du profil (déterministes). */
export const srgbIccProfile = (): Uint8Array => {
  const curve = curveTag();
  const tags: Array<[string, number[]]> = [
    ["desc", descTag(SRGB_ICC_DESCRIPTION)],
    ["cprt", textTag("No copyright, use freely")],
    ["wtpt", xyzTag(D50)],
    ["rXYZ", xyzTag(PRIMARIES.rXYZ)],
    ["gXYZ", xyzTag(PRIMARIES.gXYZ)],
    ["bXYZ", xyzTag(PRIMARIES.bXYZ)],
    ["rTRC", curve],
  ];
  const shared = ["gTRC", "bTRC"];
  const tableSize = 4 + (tags.length + shared.length) * 12;
  const data = new Writer();
  const entries: Array<[string, number, number]> = [];
  const offset = 128 + tableSize;
  for (const [signature, bytes] of tags) {
    entries.push([signature, offset + data.bytes.length, bytes.length]);
    data.raw(bytes).pad4();
  }
  const trc = entries.find(([signature]) => signature === "rTRC");
  if (trc) for (const signature of shared) entries.push([signature, trc[1], trc[2]]);
  const size = offset + data.bytes.length;

  const header = new Writer()
    .u32(size).zeros(4).u32(0x02100000).sig("mntr").sig("RGB ").sig("XYZ ")
    .u16(2026).u16(1).u16(1).u16(0).u16(0).u16(0)
    .sig("acsp").zeros(4).u32(0).zeros(4).zeros(4).zeros(8).u32(0);
  for (const value of D50) header.s15f16(value);
  header.zeros(4).zeros(16).zeros(28);
  const table = new Writer().u32(entries.length);
  for (const [signature, at, length] of entries) table.sig(signature).u32(at).u32(length);
  return Uint8Array.from([...header.bytes, ...table.bytes, ...data.bytes]);
};
