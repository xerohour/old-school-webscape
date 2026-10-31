import * as THREE from "https://esm.sh/three@0.160.0";

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1);
const unitCone = new THREE.ConeGeometry(0.5, 1, 9, 1);
const unitIco = new THREE.IcosahedronGeometry(0.5, 1);
const unitIco0 = new THREE.IcosahedronGeometry(0.5, 0);

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

const FULL = { u0: 0, v0: 0, u1: 1, v1: 1 };

export function remapUv(geo, cell) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, cell.u0 + uv.getX(i) * (cell.u1 - cell.u0), cell.v0 + uv.getY(i) * (cell.v1 - cell.v0));
  }
  uv.needsUpdate = true;
  return geo;
}

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.cell = FULL;
    this.swap = false;
  }

  setCell(rect) {
    this.cell = rect || FULL;
    return this;
  }

  setSwap(on) {
    this.swap = !!on;
    return this;
  }

  _uvAt(u, v) {
    const c = this.cell;
    if (this.swap) { const t = u; u = v; v = t; }
    return [c.u0 + u * (c.u1 - c.u0), c.v0 + v * (c.v1 - c.v0)];
  }

  addGeometry(geo, color, matrix, flat) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (flat) g.deleteAttribute("normal");
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position.array;
    const nrm = g.attributes.normal.array;
    const uvs = g.attributes.uv ? g.attributes.uv.array : null;
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (let i = 0, k = 0; i < p.length; i += 3, k += 2) {
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.nor.push(nrm[i], nrm[i + 1], nrm[i + 2]);
      this.col.push(c.r, c.g, c.b);
      const uv = this._uvAt(uvs ? uvs[k] : 0.5, uvs ? uvs[k + 1] : 0.5);
      this.uv.push(uv[0], uv[1]);
    }
    g.dispose();
  }

  add(geo, color, cx, cy, cz, sx, sy, sz, ry = 0, rz = 0, rx = 0, flat = false) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(cx, cy, cz);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    this.addGeometry(geo, color, _m, flat);
  }

  box(cx, cy, cz, sx, sy, sz, color, ry = 0, rz = 0, rx = 0) {
    this.add(unitBox, color, cx, cy, cz, sx, sy, sz, ry, rz, rx);
  }

  boxTiled(cx, cy, cz, sx, sy, sz, color, unit = 1) {
    const segs = Math.max(1, Math.round(sy / unit));
    const sh = sy / segs;
    const y0 = cy - sy / 2;
    for (let i = 0; i < segs; i++) {
      const geo = unitBox.index ? unitBox.toNonIndexed() : unitBox.clone();
      const uvArr = geo.attributes.uv.array;
      for (let k = 0; k < uvArr.length; k += 2) uvArr[k + 1] = (uvArr[k + 1] + i) / segs;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(cx, y0 + sh * (i + 0.5), cz),
        new THREE.Quaternion(),
        new THREE.Vector3(sx, sh, sz)
      );
      this.addGeometry(geo, color, m);
    }
  }

  cyl(cx, cy, cz, r, h, color, ry = 0) {
    this.add(unitCyl, color, cx, cy, cz, r * 2, h, r * 2, ry);
  }

  cone(cx, cy, cz, r, h, color, ry = 0) {
    this.add(unitCone, color, cx, cy, cz, r * 2, h, r * 2, ry);
  }

  blob(cx, cy, cz, r, color, ry = 0, detail = 1) {
    this.add(detail ? unitIco : unitIco0, color, cx, cy, cz, r * 2, r * 2, r * 2, ry, 0, 0, true);
  }

  quad(p0, p1, p2, p3, color) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const A = this._uvAt(0, 0);
    const B = this._uvAt(1, 0);
    const C = this._uvAt(1, 1);
    const D = this._uvAt(0, 1);
    if (ny >= 0) {
      this._tri(p0, p1, p2, nx, ny, nz, c, A, B, C);
      this._tri(p0, p2, p3, nx, ny, nz, c, A, C, D);
    } else {
      this._tri(p0, p2, p1, -nx, -ny, -nz, c, A, C, B);
      this._tri(p0, p3, p2, -nx, -ny, -nz, c, A, D, C);
    }
  }

  tiledQuad(p0, p1, p2, p3, color, nu = 1, nv = 1) {
    nu = Math.max(1, Math.round(nu));
    nv = Math.max(1, Math.round(nv));
    const bl = (u, v) => {
      const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w11 = u * v, w01 = (1 - u) * v;
      return [
        p0[0] * w00 + p1[0] * w10 + p2[0] * w11 + p3[0] * w01,
        p0[1] * w00 + p1[1] * w10 + p2[1] * w11 + p3[1] * w01,
        p0[2] * w00 + p1[2] * w10 + p2[2] * w11 + p3[2] * w01,
      ];
    };
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const u0 = i / nu, u1 = (i + 1) / nu;
        const v0 = j / nv, v1 = (j + 1) / nv;
        this.quad(bl(u0, v0), bl(u1, v0), bl(u1, v1), bl(u0, v1), color);
      }
    }
  }

  tri(p0, p1, p2, color) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-8) { nx = 0; ny = 1; nz = 0; } else { nx /= len; ny /= len; nz /= len; }
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const A = this._uvAt(0, 0);
    const B = this._uvAt(1, 0);
    const C = this._uvAt(0.5, 1);
    this._tri(p0, p1, p2, nx, ny, nz, c, A, B, C);
  }

  /* A triangle with an explicit per-face normal and per-corner UVs - the path
     the baked cache scenery uses (its colours are resolved per face and its UVs
     point into the loc texture atlas). */
  triUV(a, b, c, n, color, ua, ub, uc) {
    const col = Array.isArray(color)
      ? _c.setRGB(color[0], color[1], color[2])
      : (color instanceof THREE.Color ? color : _c.set(color));
    this._tri(a, b, c, n[0], n[1], n[2], col, ua, ub, uc);
  }

  triUV3(a, b, c, n, ca, cb, cc, ua, ub, uc) {
    const cvt = (v) => v instanceof THREE.Color ? v : _c.setRGB(v[0], v[1], v[2]);
    const pa = cvt(ca);
    const ra = pa.r, ga = pa.g, ba = pa.b;
    const pb = cvt(cb);
    const rb = pb.r, gb = pb.g, bb = pb.b;
    const pc = cvt(cc);
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.nor.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
    this.col.push(ra, ga, ba, rb, gb, bb, pc.r, pc.g, pc.b);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }

  _tri3n(a, b, c, na, nb, nc, ca, cb, cc, ua, ub, uc) {
    const xa = ca instanceof THREE.Color ? ca : _c.setRGB(ca[0], ca[1], ca[2]);
    const ra = xa.r, ga = xa.g, ba = xa.b;
    const xb = cb instanceof THREE.Color ? cb : _c.setRGB(cb[0], cb[1], cb[2]);
    const rb = xb.r, gb = xb.g, bb = xb.b;
    const xc = cc instanceof THREE.Color ? cc : _c.setRGB(cc[0], cc[1], cc[2]);
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.nor.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    this.col.push(ra, ga, ba, rb, gb, bb, xc.r, xc.g, xc.b);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }

  triUV3N(a, b, c, na, nb, nc, ca, cb, cc, ua, ub, uc) {
    const cvt = (v) => v instanceof THREE.Color ? v : _c.setRGB(v[0], v[1], v[2]);
    const pa = cvt(ca);
    const ra = pa.r, ga = pa.g, ba = pa.b;
    const pb = cvt(cb);
    const rb = pb.r, gb = pb.g, bb = pb.b;
    const pc = cvt(cc);
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.nor.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    this.col.push(ra, ga, ba, rb, gb, bb, pc.r, pc.g, pc.b);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }

  quad3n(p0, p1, p2, p3, n0, n1, n2, n3, c0, c1, c2, c3, u0, u1, u2, u3) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    const ny = az * bx - ax * bz;
    if (ny >= 0) {
      this._tri3n(p0, p1, p2, n0, n1, n2, c0, c1, c2, u0, u1, u2);
      this._tri3n(p0, p2, p3, n0, n2, n3, c0, c2, c3, u0, u2, u3);
    } else {
      this._tri3n(p0, p2, p1, n0, n2, n1, c0, c2, c1, u0, u2, u1);
      this._tri3n(p0, p3, p2, n0, n3, n2, c0, c3, c2, u0, u3, u2);
    }
  }
  _tri3(a, b, c, nx, ny, nz, ca, cb, cc, ua, ub, uc) {
    const xa = ca instanceof THREE.Color ? [ca.r, ca.g, ca.b] : ca;
    const xb = cb instanceof THREE.Color ? [cb.r, cb.g, cb.b] : cb;
    const xc = cc instanceof THREE.Color ? [cc.r, cc.g, cc.b] : cc;
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.col.push(xa[0], xa[1], xa[2], xb[0], xb[1], xb[2], xc[0], xc[1], xc[2]);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }

  quad3(p0, p1, p2, p3, c0, c1, c2, c3, u0, u1, u2, u3) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-8) { nx = 0; ny = 1; nz = 0; } else { nx /= len; ny /= len; nz /= len; }
    if (ny >= 0) {
      this._tri3(p0, p1, p2, nx, ny, nz, c0, c1, c2, u0, u1, u2);
      this._tri3(p0, p2, p3, nx, ny, nz, c0, c2, c3, u0, u2, u3);
    } else {
      this._tri3(p0, p2, p1, -nx, -ny, -nz, c0, c2, c1, u0, u2, u1);
      this._tri3(p0, p3, p2, -nx, -ny, -nz, c0, c3, c2, u0, u3, u2);
    }
  }

  /* `triUV` plus a per-face opacity for the cache's translucent faces (see
     src/locmodels.js#locGlowGeometry): the alpha rides a parallel array so the
     ordinary path pays nothing, and `buildWithAlpha` folds it into a 4-component
     colour attribute, which is what three.js multiplies the material alpha by. */
  triUVA(a, b, c, n, color, alpha, ua, ub, uc) {
    if (!this.alphaArr) this.alphaArr = new Array(this.count()).fill(1);
    this.triUV(a, b, c, n, color, ua, ub, uc);
    this.alphaArr.push(alpha, alpha, alpha);
  }

  _tri(a, b, c, nx, ny, nz, col, ua, ub, uc) {    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.col.push(col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }

  count() {
    return this.pos.length / 3;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }

  /* `build` with the `triUVA` alphas folded into an RGBA colour attribute.
     Vertices that came through the ordinary path read 1 (opaque). */
  buildWithAlpha() {
    const g = this.build();
    const n = g.attributes.position.count;
    const col = g.attributes.color.array;
    const out = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      out[i * 4] = col[i * 3];
      out[i * 4 + 1] = col[i * 3 + 1];
      out[i * 4 + 2] = col[i * 3 + 2];
      out[i * 4 + 3] = (this.alphaArr && i < this.alphaArr.length) ? this.alphaArr[i] : 1;
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(out, 4));
    return g;
  }
}
