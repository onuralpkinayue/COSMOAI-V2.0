import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { PointerLockControls } from "./vendor/PointerLockControls.js";

console.log("APP VERSION = v8 (DOMSAFE + FILE_ICONS + BG_IMAGE + L_OK + ZOOM_OK + NO_MISSING_FOCUS)");

// -------------------------
// Boot: wait for DOM
// -------------------------
window.addEventListener("DOMContentLoaded", () => {
  main();
});

function main() {
  const DATA_URL = "./data.json";

  // -------------------------
  // UI (null-safe)
  // -------------------------
  const modeSel = document.getElementById("mode");
  const bandSel = document.getElementById("band");
  const bandBright = document.getElementById("bandBright");
  const showLayerSel = document.getElementById("showLayer");
  const snListEl = document.getElementById("snlist");
  const resetBtn = document.getElementById("reset");
  const lookBtn = document.getElementById("look");
  const tooltipEl = document.getElementById("tooltip");
  const cutoutImg = document.getElementById("cutout");
  const metaEl = document.getElementById("meta");

  if (!modeSel || !bandSel || !bandBright || !showLayerSel || !resetBtn || !lookBtn || !tooltipEl || !cutoutImg || !metaEl) {
    console.error("index.html içindeki bazı id'ler bulunamadı. Lütfen id'leri kontrol et.");
    alert("HTML id eksik: mode/band/bandBright/showLayer/reset/look/tooltip/cutout/meta");
    return;
  }

  // -------------------------
  // THREE
  // -------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 8000);
  camera.position.set(0, 0, 0.001);

  // Controls
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.enabled = false;
  orbit.enablePan = false;
  orbit.enableZoom = true;          // ✅ focus zoom
  orbit.zoomSpeed = 0.8;
  orbit.minDistance = 400;
  orbit.maxDistance = 7000;
  orbit.rotateSpeed = 0.6;

  const head = new PointerLockControls(camera, renderer.domElement);
  scene.add(head.getObject()); // pointer-lock rotation

  // Raycaster
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 35;
  const mouse = new THREE.Vector2();

  function setMouseFromEvent(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  // Groups
  const skyGal = new THREE.Group();
  const skySN = new THREE.Group();
  const focusGroup = new THREE.Group();
  const focusLinks = new THREE.Group();
  scene.add(skyGal, skySN, focusGroup, focusLinks);

  // -------------------------
  // Background (your image)
  // -------------------------
  const bgLoader = new THREE.TextureLoader();
  const skyTex = bgLoader.load(
    "./background/sky.jpg",
    undefined,
    undefined,
    () => console.warn("Background yüklenemedi: background/sky.jpg yok mu?")
  );

  // ColorSpace (three sürümüne göre)
  try { skyTex.colorSpace = THREE.SRGBColorSpace; } catch {}

  const skySphere = new THREE.Mesh(
    new THREE.SphereGeometry(5000, 48, 32),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })
  );
  scene.add(skySphere);

  // -------------------------
  // Data
  // -------------------------
  let records = [];
  let snByCID = new Map(); // CID -> [recordIdx...]
  let selectedCID = null;

  // Focus picking
  let focusPoints = null;
  let focusIndexMap = [];

  // Sky picking
  let skyGalaxyPoints = null;
  let skyGalaxyIndexMap = [];

  // Hover arrows
  let hoverTimer = null;
  let hoverLine = null;

  // -------------------------
  // Helpers
  // -------------------------
  function unitFromRaDec(ra, dec) {
    const a = THREE.MathUtils.degToRad(ra);
    const d = THREE.MathUtils.degToRad(dec);
    return new THREE.Vector3(
      Math.cos(d) * Math.cos(a),
      Math.cos(d) * Math.sin(a),
      Math.sin(d)
    );
  }

  function raDecToVec(ra, dec, r) {
    return unitFromRaDec(ra, dec).multiplyScalar(r);
  }

  function transverseMpc(arcmin, z) {
    if (arcmin == null || z == null) return null;
    const rad = arcmin * Math.PI / (180 * 60);
    return rad * (3000 * z); // demo approx
  }

  function pickAnchorIdx(arr) {
    // SN RA/Dec yok -> CID içindeki en yakın host galaksisini (min separation) anchor alıyoruz.
    let best = null;
    let bestSep = Infinity;
    for (const idx of arr) {
      const r = records[idx];
      if (!r) continue;
      const sep = (r.separation_arcmin != null) ? Number(r.separation_arcmin) : null;
      if (sep == null || !isFinite(sep)) continue;
      if (sep < bestSep) { bestSep = sep; best = idx; }
    }
    return (best != null) ? best : arr[0];
  }

  function hash01(n) {
    const x = Math.sin(n * 999.123 + 0.12345) * 43758.5453;
    return x - Math.floor(x);
  }

  function clearGroup(g) {
    while (g.children.length) {
      const o = g.children.pop();
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose?.();
    }
  }

  // -------------------------
  // Icons (your files)
  // -------------------------
  const texLoader = new THREE.TextureLoader();

  const galTex = texLoader.load(
    "./icons/galaxy.png",
    undefined,
    undefined,
    () => console.warn("icons/galaxy.png bulunamadı")
  );
  const snTex = texLoader.load(
    "./icons/supernova.png",
    undefined,
    undefined,
    () => console.warn("icons/supernova.png bulunamadı")
  );

  try {
    galTex.colorSpace = THREE.SRGBColorSpace;
    snTex.colorSpace = THREE.SRGBColorSpace;
  } catch {}

  // -------------------------
  // Cutout
  // -------------------------
  function setCutout(ra, dec) {
    const fov = 0.03;
    const hips = "CDS/P/PanSTARRS/DR1/color-z-zg-g";
    cutoutImg.src =
      `https://alasky.cds.unistra.fr/hips-image-services/hips2fits` +
      `?hips=${encodeURIComponent(hips)}&ra=${encodeURIComponent(ra)}&dec=${encodeURIComponent(dec)}` +
      `&fov=${fov}&width=750&height=750&format=jpg`;
  }

  // -------------------------
  // Meta (right panel)
  // -------------------------
  function galaxyMeta(r) {
    const id = r.objid_GAL ?? `GAL-${r.cid}-${r._idx}`;
    const ugriz = [r.u, r.g, r.r, r.i, r.z]
      .map(v => (v == null ? "-" : Number(v).toFixed(3)))
      .join("  ");

    let s = `Galaxy ID: ${id}`;
    if (r.cid != null) s += `\nCID: ${r.cid}`;

    if (r.ra != null && r.dec != null) {
      s += `\nRA: ${Number(r.ra).toFixed(6)}\nDec: ${Number(r.dec).toFixed(6)}`;
    }

    if (r.redshift_GAL != null) s += `\nredshift_GAL: ${r.redshift_GAL}`;
    s += `\nu/g/r/i/z: ${ugriz}`;

    if (r.separation_arcmin != null) {
      const mpc = transverseMpc(r.separation_arcmin, r.zCMB);
      if (mpc != null) s += `\nDistance: ${mpc.toFixed(3)} Mpc`;
    }
    return s;
  }

  function snMeta(cid, anchorRec) {
    let s = `SNIa (CID): ${cid}`;
    if (anchorRec && anchorRec.ra != null && anchorRec.dec != null) {
      s += `\nRA: ${Number(anchorRec.ra).toFixed(6)}\nDec: ${Number(anchorRec.dec).toFixed(6)}`;
    }
    return s;
  }

  // -------------------------
  // UI helpers
  // -------------------------
  function buildSNList() {
    if (!snListEl) return;
    snListEl.innerHTML = "";

    const entries = Array.from(snByCID.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

    for (const [cid, arr] of entries) {
      const d = document.createElement("div");
      d.className = "snitem";
      d.textContent = `${cid} (hosts: ${arr.length})`;
      d.addEventListener("click", () => {
        modeSel.value = "focus";
        buildFocus(cid);
      });
      snListEl.appendChild(d);
    }
  }

  function applyLayerVisibility() {
    const v = showLayerSel.value || "both";
    const showSN = (v === "both" || v === "sn");
    const showGal = (v === "both" || v === "gal");

    skySN.visible = showSN;
    skyGal.visible = showGal;

    if (modeSel.value === "focus") {
      if (focusPoints) focusPoints.visible = showGal;
      if (focusGroup.children.length) focusGroup.children[0].visible = showSN; // SN sprite
      focusLinks.visible = showGal && showSN;
    }
  }

  // -------------------------
  // Look lock (L)
  // -------------------------
  function updateLookLabel() {
    lookBtn.textContent = head.isLocked ? "Sky: Bakışı çöz (L)" : "Sky: Bakışı kilitle (L)";
  }

  function toggleLook() {
    if (modeSel.value !== "sky") return;

    if (!head.isLocked) head.lock();
    else head.unlock();

    // PointerLock açıkken orbit kapalı olsun
    orbit.enabled = !head.isLocked;
    updateLookLabel();
  }

  // -------------------------
  // Tooltip
  // -------------------------
  function setTooltip(text, x, y) {
    tooltipEl.textContent = text;
    tooltipEl.style.left = `${x + 12}px`;
    tooltipEl.style.top = `${y + 12}px`;
    tooltipEl.style.display = "block";
  }
  function hideTooltip() { tooltipEl.style.display = "none"; }

  // -------------------------
  // Build SKY
  // -------------------------
  function buildSky() {
    clearGroup(skyGal);
    clearGroup(skySN);
    clearGroup(focusGroup);
    clearGroup(focusLinks);
    focusPoints = null;
    focusIndexMap = [];

    // Orbit açık kalsın (PointerLock kapalıysa)
    orbit.enabled = !head.isLocked;
    orbit.target.set(0, 0, 0);
    orbit.update();

    const band = bandSel.value;
    const keep = Number(bandBright.value) / 100;

    const pos = [];
    const col = [];
    skyGalaxyIndexMap = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.ra == null || r.dec == null) continue;
      if (r[band] == null) continue;
      if (Math.random() > keep) continue;

      const v = raDecToVec(r.ra, r.dec, 2600);
      pos.push(v.x, v.y, v.z);
      col.push(1, 0.72, 0.35);
      skyGalaxyIndexMap.push(i);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));

    const m = new THREE.PointsMaterial({
      size: 34,
      sizeAttenuation: false,
      map: galTex,
      transparent: true,
      alphaTest: 0.2,
      vertexColors: true,
      depthWrite: false
    });

    skyGalaxyPoints = new THREE.Points(g, m);
    skyGal.add(skyGalaxyPoints);

    // SN sprites
    for (const [cid, arr] of snByCID) {
      const aIdx = pickAnchorIdx(arr);
      const r = records[aIdx];
      if (!r || r.ra == null || r.dec == null) continue;

      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: snTex, transparent: true, depthWrite: false })
      );
      sp.position.copy(raDecToVec(r.ra, r.dec, 2400));
      sp.scale.set(90, 90, 1);
      sp.userData = { type: "sn", cid };
      skySN.add(sp);
    }

    metaEl.textContent = `Sky view:\n- Mouse drag (orbit) veya L ile bakışı kilitle\n- Mouse wheel: zoom\n- SN'ye tıkla: CID seç / info`;
    updateLookLabel();
    applyLayerVisibility();
  }

  // -------------------------
  // Build FOCUS
  // -------------------------
  function buildFocus(cid) {
    selectedCID = cid;

    clearGroup(skyGal);
    clearGroup(skySN);
    clearGroup(focusGroup);
    clearGroup(focusLinks);
    focusPoints = null;
    focusIndexMap = [];

    hideTooltip();
    clearTimeout(hoverTimer);

    const arr = snByCID.get(cid) || [];
    if (!arr.length) return;

    // Focus'ta pointer lock kapalı
    if (head.isLocked) head.unlock();

    orbit.enabled = true;
    orbit.target.set(0, 0, 0);

    const anchorIdx = pickAnchorIdx(arr);
    const snRec = records[anchorIdx];
    metaEl.textContent = snMeta(cid, snRec);
    if (snRec?.ra != null && snRec?.dec != null) setCutout(snRec.ra, snRec.dec);

    // SN at origin
    const snSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: snTex, transparent: true, depthWrite: false })
    );
    snSprite.position.set(0, 0, 0);
    snSprite.scale.set(140, 140, 1);
    focusGroup.add(snSprite);

    const snU = unitFromRaDec(snRec.ra, snRec.dec);

    const positions = [];
    const colors = [];
    focusIndexMap = [];

    for (const idx of arr) {
      const gRec = records[idx];
      if (!gRec || gRec.ra == null || gRec.dec == null) continue;

      const gU = unitFromRaDec(gRec.ra, gRec.dec);
      const dir = gU.clone().sub(snU);

      // ✅ anchor galaksi de gösterilsin: dir ~ 0 ise random yön ver
      if (dir.lengthSq() < 1e-10) {
        const t0 = hash01((gRec._idx ?? idx) + 123.4);
        const t1 = hash01((gRec._idx ?? idx) + 987.6);
        const ang0 = t0 * Math.PI * 2.0;
        const z = t1 * 2.0 - 1.0;
        const rxy = Math.sqrt(Math.max(0, 1 - z * z));
        dir.set(Math.cos(ang0) * rxy, Math.sin(ang0) * rxy, z);
      }

      // bouquet layout
      const forward = dir.length() * 2200 + 400;
      const t = hash01((gRec._idx ?? idx) + 17.0);
      const ang = t * Math.PI * 2.0;

      const sep = (gRec.separation_arcmin != null)
        ? Math.max(0.2, Math.min(6.0, gRec.separation_arcmin))
        : (0.8 + 5.0 * hash01((gRec._idx ?? idx) + 91.0));

      const radial = 180 + sep * 140;

      const fwd = dir.clone().normalize();
      const tmp = Math.abs(fwd.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const right = new THREE.Vector3().crossVectors(fwd, tmp).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();

      const p = new THREE.Vector3()
        .addScaledVector(fwd, forward)
        .addScaledVector(right, Math.cos(ang) * radial)
        .addScaledVector(up, Math.sin(ang) * radial);

      positions.push(p.x, p.y, p.z);
      colors.push(1, 0.72, 0.35);
      focusIndexMap.push(idx);

      // dashed line SN -> galaxy
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(p.x, p.y, p.z)
      ]);
      const mat = new THREE.LineDashedMaterial({
        color: 0xffffff, dashSize: 32, gapSize: 18, transparent: true, opacity: 0.9
      });
      const line = new THREE.Line(geom, mat);
      line.computeLineDistances();

      const mpc = transverseMpc(gRec.separation_arcmin, gRec.zCMB);
      line.userData = { mpc, recIdx: idx };
      focusLinks.add(line);
    }

    // Galaxy points
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    gg.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const gm = new THREE.PointsMaterial({
      size: 56,
      sizeAttenuation: false,
      map: galTex,
      transparent: true,
      alphaTest: 0.2,
      vertexColors: true,
      depthWrite: false
    });

    focusPoints = new THREE.Points(gg, gm);
    focusGroup.add(focusPoints);

    camera.position.set(0, 0, 3200);
    orbit.update();
    applyLayerVisibility();
  }

  // -------------------------
  // Hover: show Mpc on dashed line (2s)
  // -------------------------
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (modeSel.value !== "focus") { hideTooltip(); clearTimeout(hoverTimer); return; }

    setMouseFromEvent(e);
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(focusLinks.children, true);

    if (hits.length) {
      const obj = hits[0].object;
      if (obj !== hoverLine) {
        hoverLine = obj;
        hideTooltip();
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          const mpc = hoverLine.userData?.mpc;
          if (mpc != null) setTooltip(`Distance: ${mpc.toFixed(3)} Mpc`, e.clientX, e.clientY);
        }, 2000);
      } else {
        if (tooltipEl.style.display === "block") {
          tooltipEl.style.left = `${e.clientX + 12}px`;
          tooltipEl.style.top = `${e.clientY + 12}px`;
        }
      }
    } else {
      hoverLine = null;
      hideTooltip();
      clearTimeout(hoverTimer);
    }
  });

  // -------------------------
  // Click handling
  // -------------------------
  renderer.domElement.addEventListener("click", (e) => {
    setMouseFromEvent(e);
    raycaster.setFromCamera(mouse, camera);

    // Focus: galaxy click
    if (modeSel.value === "focus" && focusPoints) {
      const hits = raycaster.intersectObject(focusPoints);
      if (hits.length) {
        const vIdx = hits[0].index;
        const recIdx = focusIndexMap[vIdx];
        const r = records[recIdx];
        metaEl.textContent = galaxyMeta(r);
        if (r?.ra != null && r?.dec != null) setCutout(r.ra, r.dec);
        return;
      }
    }

    // Sky: galaxy or SN click
    if (modeSel.value === "sky") {
      if (skyGalaxyPoints) {
        const gh = raycaster.intersectObject(skyGalaxyPoints);
        if (gh.length) {
          const vIdx = gh[0].index;
          const recIdx = skyGalaxyIndexMap[vIdx];
          const r = records[recIdx];
          metaEl.textContent = galaxyMeta(r);
          if (r?.ra != null && r?.dec != null) setCutout(r.ra, r.dec);
          return;
        }
      }

      const sh = raycaster.intersectObjects(skySN.children, true);
      if (sh.length) {
        const cid = sh[0].object.userData?.cid;
        if (cid) {
          selectedCID = cid;
          const arr = snByCID.get(cid) || [];
          const anchor = arr.length ? records[pickAnchorIdx(arr)] : null;
          metaEl.textContent = snMeta(cid, anchor);
          if (anchor?.ra != null && anchor?.dec != null) setCutout(anchor.ra, anchor.dec);
          return;
        }
      }
    }
  });

  // -------------------------
  // Mode switching
  // -------------------------
  function setMode(mode) {
    modeSel.value = mode;
    hideTooltip();
    clearTimeout(hoverTimer);

    if (mode === "sky") {
      // Sky: pointerlock kapalı başlat
      if (head.isLocked) head.unlock();
      orbit.enabled = true;
      buildSky();
    } else {
      if (!selectedCID) selectedCID = Array.from(snByCID.keys())[0] || null;
      if (selectedCID) buildFocus(selectedCID);
    }
  }

  modeSel.addEventListener("change", () => setMode(modeSel.value));
  bandSel.addEventListener("change", () => { if (modeSel.value === "sky") buildSky(); });
  bandBright.addEventListener("input", () => { if (modeSel.value === "sky") buildSky(); });
  showLayerSel.addEventListener("change", () => applyLayerVisibility());

  // -------------------------
  // Zoom
  //   - Sky: wheel changes FOV
  //   - Focus: OrbitControls zoom
  // -------------------------
  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      if (modeSel.value !== "sky") return; // focus'ta orbit zoom
      e.preventDefault();
      const step = 2.0;
      const dir = Math.sign(e.deltaY);
      camera.fov = THREE.MathUtils.clamp(camera.fov + dir * step, 25, 90);
      camera.updateProjectionMatrix();
    },
    { passive: false }
  );

  // -------------------------
  // Buttons & keys
  // -------------------------
  lookBtn.addEventListener("click", toggleLook);

  resetBtn.addEventListener("click", () => {
    if (modeSel.value === "sky") {
      camera.rotation.set(0, 0, 0);
      camera.lookAt(0, 0, -1);
      camera.fov = 65;
      camera.updateProjectionMatrix();
    } else {
      camera.position.set(0, 0, 3200);
      orbit.target.set(0, 0, 0);
      orbit.update();
    }
    applyLayerVisibility();
  });

  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "l") toggleLook();

    if (k === "r") {
      if (modeSel.value === "sky") {
        camera.rotation.set(0, 0, 0);
        camera.lookAt(0, 0, -1);
        camera.fov = 65;
        camera.updateProjectionMatrix();
      } else {
        camera.position.set(0, 0, 3200);
        orbit.target.set(0, 0, 0);
        orbit.update();
      }
      applyLayerVisibility();
    }
  });

  // -------------------------
  // Resize
  // -------------------------
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // -------------------------
  // Load data
  // -------------------------
  fetch(DATA_URL)
    .then(r => r.json())
    .then(d => {
      records = d.records;
      records.forEach((r, i) => (r._idx = i));

      snByCID = new Map();
      records.forEach(r => {
        if (!snByCID.has(r.cid)) snByCID.set(r.cid, []);
        snByCID.get(r.cid).push(r._idx);
      });

      buildSNList();
      setMode("sky");
    });

  // -------------------------
  // Render loop
  // -------------------------
  function animate() {
    requestAnimationFrame(animate);
    orbit.update();
    applyLayerVisibility();
    renderer.render(scene, camera);
  }
  animate();
}
