import * as THREE from 'three';

export interface SynapticPulse {
  mesh: THREE.Mesh;
  halo: THREE.Sprite;
  curve: THREE.CatmullRomCurve3;
  speed: number;
  offset: number;
}

export interface SynapticNode {
  mesh: THREE.Mesh;
  halo: THREE.Sprite;
  phase: number;
  regionWeight: number;
}

export interface BrainstineSceneObjects {
  root: THREE.Group;
  brainGroup: THREE.Group;
  orbitalGroup: THREE.Group;
  primaryOrbitRing: THREE.Mesh;
  secondaryOrbitRing: THREE.Mesh;
  orbitSparkA: THREE.Mesh;
  particlesNear: THREE.Points;
  particlesFar: THREE.Points;
  synapticPulses: SynapticPulse[];
  synapticNodes: SynapticNode[];
  circuitTubeMaterials: THREE.MeshStandardMaterial[];
  cortexShaderUniforms: Array<{ value: number }>;
  dispose: () => void;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createSoftGlowTexture(innerAlpha = 1, midAlpha = 0.55): THREE.CanvasTexture {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${innerAlpha})`);
    gradient.addColorStop(0.24, `rgba(186, 230, 253, ${midAlpha})`);
    gradient.addColorStop(0.58, 'rgba(56, 189, 248, 0.16)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Evaluates anatomical ridged cortical folding (broad smooth gyral crowns + narrow sharp sulcal crevices)
 * using 3D domain-warped trigonometric octaves. Returns [0..1] where 0 = deep sulcus, 1 = gyrus crest.
 */
function sampleCorticalFold(px: number, py: number, pz: number): number {
  // Smooth organic domain warping so gyri twist naturally like biological brain convolutions
  const wx =
    px +
    0.22 * Math.sin(py * 2.8 + pz * 2.1) +
    0.11 * Math.cos(pz * 3.9 - px * 2.2);
  const wy =
    py +
    0.22 * Math.sin(pz * 2.6 - px * 2.4) +
    0.11 * Math.cos(px * 3.7 + py * 2.5);
  const wz =
    pz +
    0.22 * Math.cos(px * 2.7 + py * 2.2) +
    0.11 * Math.sin(py * 3.8 - pz * 2.3);

  const ridge = (val: number) => Math.pow(Math.abs(Math.sin(val)), 0.68);

  const f1 = ridge(wx * 5.2 + wy * 3.8 + wz * 2.4);
  const f2 = ridge(wy * 6.4 - wz * 4.5 + wx * 2.1);
  const f3 = ridge(wz * 7.6 + wx * 3.9 - wy * 3.2);

  // Combine octaves smoothly while sharpening sulcal valleys where any groove dips low
  const blended = f1 * 0.46 + f2 * 0.34 + f3 * 0.2;
  const groovePinch = Math.min(f1, f2 * 0.92 + 0.08);
  return Math.max(0, Math.min(1, blended * 0.72 + groovePinch * 0.28));
}

/**
 * Maps a unit sphere normal (nx, ny, nz) onto the sculpted anatomical cerebral cortex
 * for Left (side = -1) or Right (side = +1) hemisphere, returning position + sulcus depth [0..1].
 */
function projectToCortex(
  nx: number,
  ny: number,
  nz: number,
  side: -1 | 1,
  includeFolding: boolean
): { x: number; y: number; z: number; foldValue: number; lateralFactor: number } {
  const s = nx * side; // -1 = medial midline wall, +1 = lateral outer cortex

  // Continuous C1 mapping from flattened interhemispheric medial face to rounded outer cortex
  let radialWidth: number;
  if (s <= 0) {
    radialWidth = 0.044 + 0.036 * Math.pow(1 + s, 2);
  } else {
    radialWidth = 0.08 + 0.77 * s * (1.14 - 0.24 * s);
  }
  const lateralFactor = smoothstep(-0.08, 0.55, s);

  // Longitudinal anatomical proportions (+z = frontal pole, -z = occipital pole)
  const frontalTaper = 1.0 - 0.22 * smoothstep(0.18, 1.0, nz);
  const occipitalTaper = 1.0 - 0.16 * smoothstep(-0.28, -1.0, nz);
  const crownRoundness = 1.0 - 0.12 * smoothstep(0.55, 1.0, ny);

  let x = side * radialWidth * frontalTaper * occipitalTaper * crownRoundness;
  let y = ny * 0.94;
  let z = nz * 1.28;

  // Lift posterior-inferior occipital base to create anatomical pocket for the cerebellum
  const occUnderLift = smoothstep(-0.15, -0.92, nz) * smoothstep(0.05, -0.78, ny);
  y += 0.24 * occUnderLift;

  // Gentle orbital-frontal arch under the frontal lobe
  const orbitalArch = smoothstep(0.25, 0.95, nz) * smoothstep(-0.05, -0.72, ny);
  y += 0.12 * orbitalArch;

  // Inferior base gentle flattening near midbrain
  if (y < -0.48) {
    y = -0.48 + (y + 0.48) * 0.42;
  }

  // Distinct Temporal Lobe projection & deep Lateral (Sylvian) Fissure
  // Sylvian line slopes diagonally from anterior-inferior (z=+0.45, y=-0.16) to posterior-superior (z=-0.35, y=+0.15)
  const sylvianLineY = -0.02 - 0.26 * nz;
  const distToSylvian = ny - sylvianLineY;

  const sylvianWindowZ =
    smoothstep(-0.46, -0.18, nz) * (1.0 - smoothstep(0.32, 0.58, nz));
  const sylvianDepth =
    Math.exp(-Math.pow(distToSylvian / 0.105, 2)) *
    sylvianWindowZ *
    smoothstep(0.28, 0.76, lateralFactor);

  // Projecting curved temporal lobe sitting below the Sylvian fissure
  const temporalMask =
    smoothstep(0.04, -0.22, distToSylvian) *
    smoothstep(-0.56, -0.16, nz) *
    (1.0 - smoothstep(0.36, 0.62, nz)) *
    smoothstep(0.22, 0.72, lateralFactor);

  x += side * (0.14 * temporalMask - 0.08 * sylvianDepth);
  y += -0.15 * temporalMask - 0.03 * sylvianDepth;
  z += 0.06 * temporalMask;

  // Subtle Central Sulcus (separating frontal & parietal crowns)
  const centralLineZ = 0.06 - 0.24 * ny;
  const centralDepth =
    Math.exp(-Math.pow((nz - centralLineZ) / 0.07, 2)) *
    smoothstep(0.15, 0.75, ny) *
    smoothstep(0.1, 0.55, lateralFactor);

  // Apply multi-octave cortical gyri/sulci relief
  let foldValue = 0.65;
  if (includeFolding) {
    const rawFold = sampleCorticalFold(x * 1.15, y * 1.15, z * 1.08);
    // Deepen fold score inside anatomical fissures
    foldValue = Math.max(0, rawFold - sylvianDepth * 0.65 - centralDepth * 0.35);

    const foldAmplitude = (0.02 + 0.072 * lateralFactor) * (1.0 - 0.15 * occUnderLift);
    const displacement = (foldValue - 0.48) * foldAmplitude - sylvianDepth * 0.065 - centralDepth * 0.028;

    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    x += (x / len) * displacement;
    y += (y / len) * displacement;
    z += (z / len) * displacement;
  }

  return { x, y, z, foldValue, lateralFactor };
}

function buildCorticalHemisphereGeometry(
  side: -1 | 1,
  segW: number,
  segH: number
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, segW, segH);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const deepSulcusColor = new THREE.Color(side < 0 ? 0x0b1c47 : 0x15154a);
  const midCortexColor = new THREE.Color(side < 0 ? 0x3b82f6 : 0x6366f1);
  const gyrusCrestColor = new THREE.Color(side < 0 ? 0xdbeafe : 0xe0f2fe);
  const tmpColor = new THREE.Color();
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const mapped = projectToCortex(v.x, v.y, v.z, side, true);
    pos.setXYZ(i, mapped.x, mapped.y, mapped.z);

    // Rich sulcal ambient occlusion in vertex colors so every fold pops cleanly
    const t = mapped.foldValue;
    if (t < 0.45) {
      tmpColor.lerpColors(deepSulcusColor, midCortexColor, t / 0.45);
    } else {
      tmpColor.lerpColors(midCortexColor, gyrusCrestColor, (t - 0.45) / 0.55);
    }
    // Slightly cool inner medial wall shading
    if (mapped.lateralFactor < 0.2) {
      tmpColor.lerp(deepSulcusColor, 0.35);
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildCerebellumLobeGeometry(side: -1 | 1, segs: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.36, segs, segs);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const deepFolia = new THREE.Color(0x111842);
  const crestFolia = new THREE.Color(0x93c5fd);
  const tmpColor = new THREE.Color();
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nx = v.x / 0.36;
    const ny = v.y / 0.36;
    const nz = v.z / 0.36;

    // Flatten medial seam gently and stretch laterally + anteriorly
    let x = v.x * 0.96 + side * 0.27;
    let y = v.y * 0.72 - 0.56;
    let z = v.z * 0.84 - 0.68;

    // Characteristic fine horizontal cerebellar folia ridges
    const folia = Math.pow(
      Math.abs(Math.sin(ny * 16.5 + Math.sin(nz * 4.0 + nx * 2.5) * 0.45)),
      0.68
    );
    const amp = 0.022 * smoothstep(-0.2, 0.5, nx * side + 0.4);
    const disp = (folia - 0.45) * amp;

    x += nx * disp;
    y += ny * disp * 0.6;
    z += nz * disp;

    pos.setXYZ(i, x, y, z);

    tmpColor.lerpColors(deepFolia, crestFolia, folia * 0.85);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function attachCorticalGlowShader(
  material: THREE.MeshPhysicalMaterial,
  rimColor: THREE.Color,
  pulseColorA: THREE.Color,
  pulseColorB: THREE.Color,
  timeUniforms: Array<{ value: number }>
) {
  material.onBeforeCompile = (shader) => {
    const uTime = { value: 0 };
    timeUniforms.push(uTime);
    shader.uniforms.uBrainTime = uTime;
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uPulseColorA = { value: pulseColorA };
    shader.uniforms.uPulseColorB = { value: pulseColorB };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vBrainLocalPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBrainLocalPos = position;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uBrainTime;
        uniform vec3 uRimColor;
        uniform vec3 uPulseColorA;
        uniform vec3 uPulseColorB;
        varying vec3 vBrainLocalPos;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 bViewDir = normalize(vViewPosition);
        float bFresnel = pow(1.0 - clamp(abs(dot(normal, bViewDir)), 0.0, 1.0), 2.35);

        // Gradual selective cortical illumination waves traveling across lobes
        float regionWaveA = smoothstep(0.42, 0.98, sin(vBrainLocalPos.z * 2.5 - uBrainTime * 1.05 + vBrainLocalPos.y * 1.4));
        float regionWaveB = smoothstep(0.48, 0.99, sin(vBrainLocalPos.x * 2.9 + uBrainTime * 0.78 - vBrainLocalPos.z * 1.5));
        float sulcusAtten = smoothstep(0.25, 0.85, diffuseColor.r);

        totalEmissiveRadiance += uRimColor * bFresnel * 0.85;
        totalEmissiveRadiance += uPulseColorA * regionWaveA * sulcusAtten * 0.24;
        totalEmissiveRadiance += uPulseColorB * regionWaveB * (0.35 + 0.65 * bFresnel) * 0.20;`
      );
  };
}

/**
 * Generates surface-hugging cortical neural pathways directly from spherical coordinates
 * projected onto the sculpted cortex so tracts trace realistic brain convolutions cleanly.
 */
function buildCorticalPathPoints(
  side: -1 | 1,
  waypointsSpherical: Array<[number, number, number]> // [nx, ny, nz] unnormalized directions
): THREE.Vector3[] {
  return waypointsSpherical.map(([dx, dy, dz]) => {
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const pt = projectToCortex(dir.x, dir.y, dir.z, side, true);
    // Sit cleanly right along the translucent outer surface / sub-surface layer
    const out = new THREE.Vector3(pt.x, pt.y, pt.z);
    const outward = out.clone().normalize().multiplyScalar(0.012);
    return out.add(outward);
  });
}

export function createBrainstineSceneObjects(isSoftwareGl: boolean): BrainstineSceneObjects {
  const disposableGeometries: THREE.BufferGeometry[] = [];
  const disposableMaterials: THREE.Material[] = [];
  const disposableTextures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMaterials.push(m);
    return m;
  };

  const root = new THREE.Group();
  const brainGroup = new THREE.Group();
  const orbitalGroup = new THREE.Group();
  root.add(brainGroup);
  root.add(orbitalGroup);

  const cortexShaderUniforms: Array<{ value: number }> = [];

  // Realistic Neuroscience Translucent Glass-Porcelain Cortex Materials
  const leftCortexMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xc7e2ff),
      vertexColors: true,
      metalness: 0.06,
      roughness: isSoftwareGl ? 0.26 : 0.19,
      transmission: isSoftwareGl ? 0 : 0.22,
      transparent: true,
      opacity: isSoftwareGl ? 0.92 : 0.97,
      ior: 1.46,
      thickness: isSoftwareGl ? 0 : 0.65,
      attenuationColor: new THREE.Color(0x1d4ed8),
      attenuationDistance: 1.8,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      iridescence: isSoftwareGl ? 0 : 0.32,
      iridescenceIOR: 1.32,
      sheen: 0.55,
      sheenRoughness: 0.35,
      sheenColor: new THREE.Color(0x38bdf8),
      emissive: new THREE.Color(0x091a42),
      emissiveIntensity: 0.3,
    })
  );

  const rightCortexMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xd2e9ff),
      vertexColors: true,
      metalness: 0.08,
      roughness: isSoftwareGl ? 0.24 : 0.17,
      transmission: isSoftwareGl ? 0 : 0.26,
      transparent: true,
      opacity: isSoftwareGl ? 0.9 : 0.96,
      ior: 1.48,
      thickness: isSoftwareGl ? 0 : 0.7,
      attenuationColor: new THREE.Color(0x6d28d9),
      attenuationDistance: 1.7,
      clearcoat: 1.0,
      clearcoatRoughness: 0.07,
      iridescence: isSoftwareGl ? 0 : 0.38,
      iridescenceIOR: 1.35,
      sheen: 0.6,
      sheenRoughness: 0.32,
      sheenColor: new THREE.Color(0x8b5cf6),
      emissive: new THREE.Color(0x0f1646),
      emissiveIntensity: 0.32,
    })
  );

  attachCorticalGlowShader(
    leftCortexMat,
    new THREE.Color(0x38bdf8),
    new THREE.Color(0x38bdf8),
    new THREE.Color(0x7c3aed),
    cortexShaderUniforms
  );
  attachCorticalGlowShader(
    rightCortexMat,
    new THREE.Color(0x60a5fa),
    new THREE.Color(0x38bdf8),
    new THREE.Color(0x8b5cf6),
    cortexShaderUniforms
  );

  const segW = isSoftwareGl ? 56 : 96;
  const segH = isSoftwareGl ? 46 : 78;

  // Left & Right Sculpted Cerebral Hemispheres
  const leftGeo = trackGeo(buildCorticalHemisphereGeometry(-1, segW, segH));
  const leftMesh = new THREE.Mesh(leftGeo, leftCortexMat);
  brainGroup.add(leftMesh);

  const rightGeo = trackGeo(buildCorticalHemisphereGeometry(1, segW, segH));
  const rightMesh = new THREE.Mesh(rightGeo, rightCortexMat);
  brainGroup.add(rightMesh);

  // Anatomical Cerebellum (Left & Right Folia Lobes)
  const cerebSegs = isSoftwareGl ? 28 : 44;
  const cerebMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x93c5fd),
      vertexColors: true,
      metalness: 0.06,
      roughness: 0.24,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
      emissive: new THREE.Color(0x16194a),
      emissiveIntensity: 0.35,
    })
  );
  const cerebLeft = new THREE.Mesh(
    trackGeo(buildCerebellumLobeGeometry(-1, cerebSegs)),
    cerebMat
  );
  const cerebRight = new THREE.Mesh(
    trackGeo(buildCerebellumLobeGeometry(1, cerebSegs)),
    cerebMat
  );
  brainGroup.add(cerebLeft, cerebRight);

  // Subtle Sculpted Pons & Brainstem Base
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.34, -0.05),
    new THREE.Vector3(0, -0.58, -0.14),
    new THREE.Vector3(0, -0.84, -0.25),
    new THREE.Vector3(0, -1.04, -0.33),
  ]);
  const stemGeo = trackGeo(new THREE.TubeGeometry(stemCurve, 24, 0.145, 16, false));
  // Taper stem gently downward
  const stemPos = stemGeo.attributes.position;
  for (let i = 0; i < stemPos.count; i++) {
    const py = stemPos.getY(i);
    const taper = py < -0.55 ? Math.max(0.58, 1.0 + (py + 0.55) * 0.72) : 1.05;
    stemPos.setX(i, stemPos.getX(i) * taper);
    stemPos.setZ(i, -0.16 + (stemPos.getZ(i) + 0.16) * taper);
  }
  stemPos.needsUpdate = true;
  stemGeo.computeVertexNormals();

  const stemMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x3b6cb8),
      metalness: 0.08,
      roughness: 0.28,
      clearcoat: 0.7,
      transparent: true,
      opacity: 0.88,
      emissive: new THREE.Color(0x0d1b44),
      emissiveIntensity: 0.28,
    })
  );
  const stemMesh = new THREE.Mesh(stemGeo, stemMat);
  brainGroup.add(stemMesh);

  // Recessed Glowing Corpus Callosum / Interhemispheric Neural Seam
  const callosumCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.08, 0.56),
    new THREE.Vector3(0, 0.22, 0.36),
    new THREE.Vector3(0, 0.28, -0.04),
    new THREE.Vector3(0, 0.16, -0.44),
    new THREE.Vector3(0, -0.12, -0.56),
  ]);
  const callosumGeo = trackGeo(new THREE.TubeGeometry(callosumCurve, 40, 0.045, 12, false));
  const callosumMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.05,
      roughness: 0.2,
      transparent: true,
      opacity: 0.82,
    })
  );
  brainGroup.add(new THREE.Mesh(callosumGeo, callosumMat));

  // Delicate Surface-Conforming Glowing Neural Pathways Across Selected Brain Regions
  const pathwaySpecs: Array<{ side: -1 | 1; dirs: Array<[number, number, number]>; tone: 'cyan' | 'violet' }> = [
    // Right Frontal -> Motor -> Parietal associative arc
    {
      side: 1,
      tone: 'cyan',
      dirs: [
        [0.24, 0.35, 0.92],
        [0.45, 0.55, 0.68],
        [0.62, 0.68, 0.28],
        [0.58, 0.72, -0.22],
        [0.42, 0.58, -0.68],
      ],
    },
    // Right Prefrontal -> Lateral Temporal curve
    {
      side: 1,
      tone: 'violet',
      dirs: [
        [0.32, 0.12, 0.94],
        [0.64, 0.16, 0.72],
        [0.86, 0.02, 0.42],
        [0.92, -0.22, 0.12],
        [0.82, -0.28, -0.34],
      ],
    },
    // Right Sylvian Ridge -> Parietal-Occipital tract
    {
      side: 1,
      tone: 'cyan',
      dirs: [
        [0.72, 0.38, 0.56],
        [0.88, 0.24, 0.24],
        [0.9, 0.12, -0.18],
        [0.76, 0.16, -0.58],
        [0.48, 0.08, -0.86],
      ],
    },
    // Right Temporal Pole -> Occipital sweep
    {
      side: 1,
      tone: 'violet',
      dirs: [
        [0.66, -0.26, 0.62],
        [0.88, -0.32, 0.22],
        [0.86, -0.22, -0.28],
        [0.64, -0.05, -0.74],
      ],
    },
    // Right Crown Cross-Link
    {
      side: 1,
      tone: 'cyan',
      dirs: [
        [0.18, 0.88, 0.36],
        [0.54, 0.78, 0.18],
        [0.8, 0.52, -0.04],
        [0.88, 0.14, -0.26],
      ],
    },
    // Right Parietal -> Frontal Bridge
    {
      side: 1,
      tone: 'violet',
      dirs: [
        [0.26, 0.62, 0.72],
        [0.64, 0.46, 0.54],
        [0.84, 0.32, 0.24],
        [0.78, 0.48, -0.22],
      ],
    },
    // Left Frontal-Parietal associative filament
    {
      side: -1,
      tone: 'cyan',
      dirs: [
        [-0.3, 0.46, 0.84],
        [-0.58, 0.58, 0.52],
        [-0.74, 0.54, 0.1],
        [-0.66, 0.48, -0.44],
      ],
    },
    // Left Lateral Temporal neural curve
    {
      side: -1,
      tone: 'violet',
      dirs: [
        [-0.62, -0.18, 0.68],
        [-0.86, -0.26, 0.28],
        [-0.9, -0.16, -0.18],
        [-0.72, 0.04, -0.62],
      ],
    },
    // Left Sylvian -> Occipital associative path
    {
      side: -1,
      tone: 'cyan',
      dirs: [
        [-0.52, 0.24, 0.82],
        [-0.82, 0.2, 0.42],
        [-0.88, 0.22, -0.08],
        [-0.68, 0.24, -0.64],
      ],
    },
    // Left Crown -> Occipital lobe
    {
      side: -1,
      tone: 'violet',
      dirs: [
        [-0.2, 0.82, 0.48],
        [-0.48, 0.8, -0.04],
        [-0.56, 0.6, -0.54],
        [-0.36, 0.24, -0.88],
      ],
    },
  ];

  const glowSpriteTex = createSoftGlowTexture(1.0, 0.52);
  disposableTextures.push(glowSpriteTex);

  const cyanLineMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      transparent: true,
      opacity: 0.78,
    })
  );
  const violetLineMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xa78bfa,
      emissive: 0x8b5cf6,
      emissiveIntensity: 1.1,
      roughness: 0.22,
      transparent: true,
      opacity: 0.72,
    })
  );
  const circuitTubeMaterials = [cyanLineMat, violetLineMat];

  const nodeGeo = trackGeo(new THREE.SphereGeometry(0.022, 12, 12));
  const pulseGeo = trackGeo(new THREE.SphereGeometry(0.024, 12, 12));
  const pulseCoreMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.96,
    })
  );

  const synapticNodes: SynapticNode[] = [];
  const synapticPulses: SynapticPulse[] = [];
  const seenKeys = new Set<string>();

  pathwaySpecs.forEach((spec, pathIdx) => {
    const pts = buildCorticalPathPoints(spec.side, spec.dirs);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.45);
    const tubeGeo = trackGeo(new THREE.TubeGeometry(curve, 44, 0.0068, 7, false));
    const tubeMesh = new THREE.Mesh(
      tubeGeo,
      spec.tone === 'cyan' ? cyanLineMat : violetLineMat
    );
    brainGroup.add(tubeMesh);

    pts.forEach((pt, ptIdx) => {
      const key = `${pt.x.toFixed(2)}_${pt.y.toFixed(2)}_${pt.z.toFixed(2)}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      const isCyan = (pathIdx + ptIdx) % 3 !== 1;
      const nodeMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: isCyan ? 0xe0f2fe : 0xede9fe,
          emissive: isCyan ? 0x38bdf8 : 0x8b5cf6,
          emissiveIntensity: 1.35,
          roughness: 0.15,
        })
      );
      const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
      nodeMesh.position.copy(pt);
      brainGroup.add(nodeMesh);

      const spriteMat = trackMat(
        new THREE.SpriteMaterial({
          map: glowSpriteTex,
          color: isCyan ? 0x38bdf8 : 0x8b5cf6,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const halo = new THREE.Sprite(spriteMat);
      halo.position.copy(pt);
      halo.scale.setScalar(0.14);
      brainGroup.add(halo);

      synapticNodes.push({
        mesh: nodeMesh,
        halo,
        phase: pathIdx * 0.85 + ptIdx * 0.65,
        regionWeight: pt.z * 1.1 + pt.x * 0.6,
      });
    });

    // Traveling light impulse + soft radial glow halo along every pathway
    const pulseMesh = new THREE.Mesh(pulseGeo, pulseCoreMat);
    const pulseHaloMat = trackMat(
      new THREE.SpriteMaterial({
        map: glowSpriteTex,
        color: spec.tone === 'cyan' ? 0x7dd3fc : 0xc4b5fd,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const pulseHalo = new THREE.Sprite(pulseHaloMat);
    pulseHalo.scale.setScalar(0.19);
    brainGroup.add(pulseMesh, pulseHalo);

    synapticPulses.push({
      mesh: pulseMesh,
      halo: pulseHalo,
      curve,
      speed: 0.19 + (pathIdx % 4) * 0.035,
      offset: (pathIdx * 0.17) % 1,
    });
  });

  // Subtle Tilted (-24 deg) Brainstine Orbital Light Framing (kept delicate so Brain stays star)
  orbitalGroup.rotation.z = THREE.MathUtils.degToRad(-24);
  orbitalGroup.rotation.x = THREE.MathUtils.degToRad(12);

  const primaryOrbitGeo = trackGeo(new THREE.TorusGeometry(1.92, 0.0065, 12, 160));
  const primaryOrbitMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.0,
      roughness: 0.25,
      transparent: true,
      opacity: 0.44,
    })
  );
  const primaryOrbitRing = new THREE.Mesh(primaryOrbitGeo, primaryOrbitMat);
  primaryOrbitRing.rotation.x = Math.PI / 2;
  orbitalGroup.add(primaryOrbitRing);

  const secondaryOrbitGeo = trackGeo(new THREE.TorusGeometry(2.15, 0.0045, 10, 144));
  const secondaryOrbitMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc4b5fd,
      emissive: 0x7c3aed,
      emissiveIntensity: 0.85,
      roughness: 0.3,
      transparent: true,
      opacity: 0.28,
    })
  );
  const secondaryOrbitRing = new THREE.Mesh(secondaryOrbitGeo, secondaryOrbitMat);
  secondaryOrbitRing.rotation.x = Math.PI / 2 + 0.34;
  secondaryOrbitRing.rotation.y = 0.45;
  orbitalGroup.add(secondaryOrbitRing);

  const sparkGeoA = trackGeo(new THREE.OctahedronGeometry(0.042, 0));
  const sparkMatA = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.8,
      roughness: 0.1,
    })
  );
  const orbitSparkA = new THREE.Mesh(sparkGeoA, sparkMatA);
  orbitalGroup.add(orbitSparkA);

  // Depth-of-Field Layered Particles (crisp near-field specks + soft distant bokeh circles)
  const bokehTex = createSoftGlowTexture(0.62, 0.34);
  disposableTextures.push(bokehTex);

  const buildParticleLayer = (
    count: number,
    minR: number,
    maxR: number,
    size: number,
    opacity: number,
    mapTex: THREE.Texture
  ): THREE.Points => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const cCyan = new THREE.Color(0x38bdf8);
    const cIce = new THREE.Color(0xe0f2fe);
    const cViolet = new THREE.Color(0x8b5cf6);

    for (let i = 0; i < count; i++) {
      const r = minR + (((i * 53) % 100) / 100) * (maxR - minR);
      const theta = i * 2.39996;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.72;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const swatch = i % 4 === 0 ? cViolet : i % 3 === 0 ? cIce : cCyan;
      colors[i * 3] = swatch.r;
      colors[i * 3 + 1] = swatch.g;
      colors[i * 3 + 2] = swatch.b;
    }

    const geo = trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = trackMat(
      new THREE.PointsMaterial({
        size,
        map: mapTex,
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    return new THREE.Points(geo, mat);
  };

  const particlesNear = buildParticleLayer(
    isSoftwareGl ? 50 : 95,
    1.85,
    3.1,
    0.055,
    0.65,
    glowSpriteTex
  );
  const particlesFar = buildParticleLayer(
    isSoftwareGl ? 30 : 55,
    3.4,
    6.4,
    0.16,
    0.32,
    bokehTex
  );
  root.add(particlesNear, particlesFar);

  return {
    root,
    brainGroup,
    orbitalGroup,
    primaryOrbitRing,
    secondaryOrbitRing,
    orbitSparkA,
    particlesNear,
    particlesFar,
    synapticPulses,
    synapticNodes,
    circuitTubeMaterials,
    cortexShaderUniforms,
    dispose: () => {
      disposableGeometries.forEach((g) => g.dispose());
      disposableMaterials.forEach((m) => m.dispose());
      disposableTextures.forEach((t) => t.dispose());
    },
  };
}

export function updateBrainstineAnimation(
  objects: BrainstineSceneObjects,
  elapsed: number,
  delta: number,
  phase: 'intro' | 'transitioning' | 'hero',
  pointer: { x: number; y: number; dragOffsetY: number }
) {
  // Update cortical Fresnel + selective regional glow wave shaders
  for (const u of objects.cortexShaderUniforms) {
    u.value = elapsed;
  }

  // Subtle poised floating motion
  objects.brainGroup.position.y = Math.sin(elapsed * 0.95) * 0.055;

  // Slow showcase rotation revealing all angles of the sculpted lobes + cerebellum
  const baseSpeed = phase === 'intro' ? 0.24 : 0.18;
  const targetTiltX =
    phase === 'hero' ? pointer.y * 0.15 : 0.06 + Math.sin(elapsed * 0.45) * 0.04;
  const targetOffsetY = phase === 'hero' ? pointer.x * 0.32 + pointer.dragOffsetY : 0;

  objects.brainGroup.rotation.y += delta * baseSpeed;
  objects.brainGroup.rotation.x = THREE.MathUtils.damp(
    objects.brainGroup.rotation.x,
    targetTiltX,
    4.0,
    delta
  );
  objects.root.rotation.y = THREE.MathUtils.damp(
    objects.root.rotation.y,
    targetOffsetY,
    4.0,
    delta
  );

  // Subtle counter-rotation of framing halo ring + insight spark
  objects.primaryOrbitRing.rotation.z = elapsed * 0.22;
  objects.secondaryOrbitRing.rotation.z = -elapsed * 0.15;

  const angleA = elapsed * 0.62;
  objects.orbitSparkA.position.set(Math.cos(angleA) * 1.92, 0, Math.sin(angleA) * 1.92);
  objects.orbitSparkA.rotation.y = elapsed * 1.4;

  // Travelling light pulses gliding smoothly through cortical pathways
  for (const pulse of objects.synapticPulses) {
    const t = (elapsed * pulse.speed + pulse.offset) % 1;
    pulse.curve.getPointAt(t, pulse.mesh.position);
    pulse.halo.position.copy(pulse.mesh.position);

    const fade = Math.sin(t * Math.PI);
    pulse.mesh.scale.setScalar(0.5 + fade * 0.85);
    pulse.halo.scale.setScalar(0.08 + fade * 0.14);
    (pulse.halo.material as THREE.SpriteMaterial).opacity = 0.25 + fade * 0.65;
  }

  // Gradual selective regional illumination of synaptic junction nodes
  for (const node of objects.synapticNodes) {
    const regionalPulse = 0.5 + 0.5 * Math.sin(elapsed * 1.35 - node.regionWeight + node.phase * 0.3);
    const scale = 0.72 + regionalPulse * 0.58;
    node.mesh.scale.setScalar(scale);
    node.halo.scale.setScalar(0.09 + regionalPulse * 0.11);
    (node.halo.material as THREE.SpriteMaterial).opacity = 0.18 + regionalPulse * 0.48;
  }

  // Subtle breathing luminescence across pathway filaments
  objects.circuitTubeMaterials[0].emissiveIntensity = 1.05 + Math.sin(elapsed * 1.4) * 0.25;
  objects.circuitTubeMaterials[1].emissiveIntensity = 0.95 + Math.cos(elapsed * 1.1) * 0.22;

  // Slow atmospheric depth particle drift
  objects.particlesNear.rotation.y = elapsed * 0.035;
  objects.particlesNear.rotation.x = Math.sin(elapsed * 0.18) * 0.03;
  objects.particlesFar.rotation.y = -elapsed * 0.02;
}
