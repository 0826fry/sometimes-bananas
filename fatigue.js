// Presentation only: the engine owns energy use and random key selection.
const prepared = new WeakSet();
const lastPose = new WeakMap();

export function fatigueProfile(energy) {
  const value = Number.isFinite(energy) ? Math.min(100, Math.max(0, energy)) : 100;
  const tiredness = (100 - value) / 100;
  const slump = tiredness ** 1.35;
  return {
    energy: value,
    tier: value >= 65 ? 'fresh' : value >= 35 ? 'tired' : value >= 15 ? 'weary' : 'exhausted',
    headTilt: 19 * slump, headX: 7 * slump, headY: 5 * slump,
    bodyTilt: 5.5 * slump, tailTilt: -8 * slump, eyeOpen: 1 - .64 * slump,
    handLeftPeriod: .33 + 1.42 * tiredness,
    handRightPeriod: .41 + .68 * tiredness,
    handLift: 4 - 2.2 * tiredness, idlePeriod: 5.1 + 2.8 * tiredness,
  };
}

function prepare(scene) {
  if (prepared.has(scene)) return;
  const tail = scene.querySelector('.monkey-tail');
  const head = scene.querySelector('.monkey-head');
  // Keep feet as pivot and the typewriter still. Existing SVG torso paths sit
  // between the tail and head; skip gracefully if the illustration changes.
  if (tail && head && tail.parentNode === head.parentNode && !scene.querySelector('.monkey-torso')) {
    const paths = [];
    let node = tail.nextElementSibling;
    while (node && node !== head && node.tagName.toLowerCase() === 'path') {
      paths.push(node); node = node.nextElementSibling;
    }
    if (node === head && paths.length) {
      const torso = scene.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
      torso.setAttribute('class', 'monkey-torso');
      head.parentNode.insertBefore(torso, paths[0]);
      paths.forEach(path => torso.append(path));
    }
  }
  prepared.add(scene);
}

export function applyFatigue(scene, energy, mode = 'idle') {
  if (!scene) return null;
  const pose = fatigueProfile(energy);
  // Half a point is visually imperceptible; avoid SVG writes every keystroke.
  const signature = `${Math.round(pose.energy * 2)}:${mode}:${pose.tier}`;
  if (lastPose.get(scene) === signature) return pose;
  prepare(scene); lastPose.set(scene, signature);
  scene.dataset.fatigue = pose.tier;
  scene.dataset.energy = String(Math.round(pose.energy));
  scene.dataset.workMode = mode;
  const fixed = (n, unit = '') => `${n.toFixed(3)}${unit}`;
  const properties = {
    '--fatigue-head-tilt': fixed(pose.headTilt, 'deg'),
    '--fatigue-head-x': fixed(pose.headX, 'px'),
    '--fatigue-head-y': fixed(pose.headY, 'px'),
    '--fatigue-body-tilt': fixed(pose.bodyTilt, 'deg'),
    '--fatigue-tail-tilt': fixed(pose.tailTilt, 'deg'),
    '--fatigue-eye-open': fixed(pose.eyeOpen),
    '--fatigue-left-period': fixed(pose.handLeftPeriod, 's'),
    '--fatigue-right-period': fixed(pose.handRightPeriod, 's'),
    '--fatigue-hand-lift': fixed(pose.handLift, 'px'),
    '--fatigue-idle-period': fixed(pose.idlePeriod, 's'),
  };
  for (const [key, value] of Object.entries(properties)) scene.style.setProperty(key, value);
  const posture = {
    fresh: '고개를 들고 있는', tired: '고개와 어깨가 조금 처진',
    weary: '눈꺼풀이 무겁고 한 손을 자주 쉬는',
    exhausted: '고개를 깊이 숙이고 아주 느리게 움직이는',
  }[pose.tier];
  const activity = {idle:'타자기 앞에서 기다리는',running:'타자기를 두드리는',paused:'타자기 앞에서 쉬는',complete:'원고를 마친'}[mode] || '타자기 앞에 앉은';
  const description = `${posture} 원숭이. ${activity} 모습. 남은 기운 ${Math.round(pose.energy)}.`;
  scene.setAttribute('aria-label', description);
  const desc = scene.querySelector('desc');
  if (desc) desc.textContent = description;
  return pose;
}
