const controls = {
  sphereCount: document.getElementById("sphereCount"),
  sphereSize: document.getElementById("sphereSize"),
  variableMass: document.getElementById("variableMass"),
  wallRestitution: document.getElementById("wallRestitution"),
  sphereRestitution: document.getElementById("sphereRestitution"),
  gravity: document.getElementById("gravity"),
  friction: document.getElementById("friction"),
  airResistance: document.getElementById("airResistance"),
  rotationSpeed: document.getElementById("rotationSpeed"),
  velocityMultiplier: document.getElementById("velocityMultiplier"),
  enableTrails: document.getElementById("enableTrails"),
  borderThickness: document.getElementById("borderThickness"),
  backgroundColor: document.getElementById("backgroundColor"),
  toggleSimulation: document.getElementById("toggleSimulation"),
  resetSimulation: document.getElementById("resetSimulation"),
  fpsDisplay: document.getElementById("fpsDisplay"),
};

const config = {
  sphereCount: Number(controls.sphereCount.value),
  sphereRadius: Number(controls.sphereSize.value),
  variableMass: controls.variableMass.checked,
  wallRestitution: Number(controls.wallRestitution.value),
  sphereRestitution: Number(controls.sphereRestitution.value),
  gravity: Number(controls.gravity.value),
  friction: Number(controls.friction.value),
  airResistance: Number(controls.airResistance.value),
  rotationSpeed: Number(controls.rotationSpeed.value),
  velocityMultiplier: Number(controls.velocityMultiplier.value),
  enableTrails: controls.enableTrails.checked,
  borderThickness: Number(controls.borderThickness.value),
  backgroundColor: controls.backgroundColor.value,
};

let canvas;
let hexagon;
let spheres = [];
let running = true;
let fpsSmoother = 60;

function createInitialHexagon() {
  const { width, height } = getCanvasContainerSize();
  const radius = Math.min(width, height) * 0.4;
  return {
    center: createVector(width / 2, height / 2),
    radius,
    angle: 0,
  };
}

function setup() {
  const { width, height } = getCanvasContainerSize();
  canvas = createCanvas(width, height);
  canvas.parent("canvasContainer");
  hexagon = createInitialHexagon();
  initializeSpheres();
  frameRate(60);
}

function windowResized() {
  const { width, height } = getCanvasContainerSize();
  resizeCanvas(width, height);
  hexagon = createInitialHexagon();
  repositionSpheresInsideHexagon();
}

function draw() {
  const dt = Math.min(deltaTime / 1000, 0.05);
  updateFpsDisplay(dt);

  if (!config.enableTrails) {
    const { r, g, b } = hexToRgb(config.backgroundColor);
    background(r, g, b);
  } else {
    drawTrailLayer();
  }

  if (running) {
    updateHexagon(dt);
    updateSpheres(dt);
    resolveSphereCollisions();
  }

  drawHexagon();
  drawSpheres();
}

function updateFpsDisplay(dt) {
  const currentFps = dt > 0 ? 1 / dt : 0;
  fpsSmoother = lerp(fpsSmoother, currentFps, 0.1);
  controls.fpsDisplay.textContent = `FPS: ${fpsSmoother.toFixed(1)}`;
}

function drawTrailLayer() {
  const { r, g, b } = hexToRgb(config.backgroundColor);
  noStroke();
  fill(r, g, b, 25);
  rect(0, 0, width, height);
}

function updateHexagon(dt) {
  hexagon.angle += config.rotationSpeed * dt;
}

function updateSpheres(dt) {
  const gravityVector = createVector(0, config.gravity);
  const airFactor = Math.max(0, 1 - config.airResistance * dt);
  const frictionFactor = Math.max(0, 1 - config.friction * dt);

  for (const sphere of spheres) {
    sphere.velocity.add(p5.Vector.mult(gravityVector, dt));
    sphere.velocity.mult(airFactor);
    sphere.velocity.mult(frictionFactor);
    sphere.position.add(p5.Vector.mult(sphere.velocity, dt));
    keepSphereInsideHexagon(sphere);
  }
}

function keepSphereInsideHexagon(sphere) {
  const vertices = getHexagonVertices();

  for (let i = 0; i < vertices.length; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % vertices.length];
    const edge = p5.Vector.sub(p2, p1);
    const outwardNormal = createVector(edge.y, -edge.x);
    if (outwardNormal.magSq() === 0) {
      continue;
    }
    outwardNormal.normalize();

    const toCenter = p5.Vector.sub(sphere.position, p1);
    const distance = toCenter.dot(outwardNormal);
    const penetration = distance + sphere.radius;

    if (penetration > 0) {
      const contactPoint = closestPointOnSegment(p1, p2, sphere.position);
      const relative = p5.Vector.sub(contactPoint, hexagon.center);
      const omega = config.rotationSpeed;
      const wallVelocity = createVector(-omega * relative.y, omega * relative.x);

      sphere.position.add(p5.Vector.mult(outwardNormal, -penetration));

      const relativeVelocity = p5.Vector.sub(sphere.velocity, wallVelocity);
      const normalVelocity = relativeVelocity.dot(outwardNormal);

      if (normalVelocity > 0) {
        const tangent = p5.Vector.sub(relativeVelocity, p5.Vector.mult(outwardNormal, normalVelocity));
        const tangentialScale = Math.max(0, 1 - config.friction);
        const newNormalVelocity = -config.wallRestitution * normalVelocity;
        const adjustedRelativeVelocity = p5.Vector.add(
          p5.Vector.mult(outwardNormal, newNormalVelocity),
          p5.Vector.mult(tangent, tangentialScale)
        );
        sphere.velocity = p5.Vector.add(wallVelocity, adjustedRelativeVelocity);
      }
    }
  }
}

function resolveSphereCollisions() {
  for (let i = 0; i < spheres.length; i++) {
    for (let j = i + 1; j < spheres.length; j++) {
      const a = spheres[i];
      const b = spheres[j];
      const delta = p5.Vector.sub(b.position, a.position);
      let distance = delta.mag();
      const minDistance = a.radius + b.radius;

      if (distance === 0) {
        delta.x = 0.0001;
        delta.y = 0;
        distance = delta.mag();
      }

      if (distance < minDistance && distance > 0) {
        const overlap = minDistance - distance;
        const normal = delta.copy().div(distance);

        const totalMass = a.mass + b.mass;
        const correctionA = normal.copy().mult(-overlap * (b.mass / totalMass));
        const correctionB = normal.copy().mult(overlap * (a.mass / totalMass));
        a.position.add(correctionA);
        b.position.add(correctionB);

        const relativeVelocity = p5.Vector.sub(b.velocity, a.velocity);
        const speedAlongNormal = relativeVelocity.dot(normal);

        if (speedAlongNormal < 0) {
          const restitution = config.sphereRestitution;
          const impulseMagnitude = -(1 + restitution) * speedAlongNormal / (1 / a.mass + 1 / b.mass);
          const impulse = normal.copy().mult(impulseMagnitude);

          a.velocity.sub(p5.Vector.div(impulse, a.mass));
          b.velocity.add(p5.Vector.div(impulse, b.mass));
        }
      }
    }
  }
}

function drawHexagon() {
  const vertices = getHexagonVertices();
  stroke(255, 255, 255, 120);
  strokeWeight(config.borderThickness);
  noFill();
  beginShape();
  for (const pt of vertices) {
    vertex(pt.x, pt.y);
  }
  endShape(CLOSE);
}

function drawSpheres() {
  noStroke();
  for (const sphere of spheres) {
    fill(sphere.color.r, sphere.color.g, sphere.color.b, 220);
    circle(sphere.position.x, sphere.position.y, sphere.radius * 2);
  }
}

function getHexagonVertices() {
  const vertices = [];
  for (let i = 0; i < 6; i++) {
    const angle = hexagon.angle + (Math.PI / 3) * i;
    const x = hexagon.center.x + hexagon.radius * Math.cos(angle);
    const y = hexagon.center.y + hexagon.radius * Math.sin(angle);
    vertices.push(createVector(x, y));
  }
  return vertices;
}

function initializeSpheres() {
  spheres = [];
  const baseRadius = config.sphereRadius;
  const attemptsLimit = 5000;

  for (let i = 0; i < config.sphereCount; i++) {
    let attempts = 0;
    let position;
    let radius = baseRadius;

    do {
      position = randomPointInsideHexagon();
      attempts++;
    } while (attempts < attemptsLimit && (position === null || !isPositionValid(position, radius)));

    if (!position) continue;

    const randomSpeed = random(0.2, 1) * config.velocityMultiplier * 120;
    const direction = p5.Vector.random2D().mult(randomSpeed);
    const mass = computeSphereMass(radius);

    spheres.push({
      position,
      velocity: direction,
      radius,
      mass,
      color: randomSphereColor(),
    });
  }
}

function repositionSpheresInsideHexagon() {
  for (const sphere of spheres) {
    if (!isInsideHexagon(sphere.position, sphere.radius)) {
      const newPosition = randomPointInsideHexagon();
      if (newPosition) {
        sphere.position = newPosition;
      }
    }
  }
}

function computeSphereMass(radius) {
  const baseMass = radius * radius;
  if (!config.variableMass) {
    return baseMass;
  }
  return baseMass * random(0.6, 1.6);
}

function randomSphereColor() {
  const hue = random(180, 250);
  return hslToRgb(hue, 65, 60);
}

function randomPointInsideHexagon() {
  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const angle = random(TWO_PI);
    const radius = random(0, hexagon.radius * 0.9);
    const x = hexagon.center.x + radius * Math.cos(angle);
    const y = hexagon.center.y + radius * Math.sin(angle);
    const candidate = createVector(x, y);
    if (isInsideHexagon(candidate, config.sphereRadius)) {
      return candidate;
    }
  }
  return null;
}

function isPositionValid(position, radius) {
  if (!isInsideHexagon(position, radius)) {
    return false;
  }
  for (const sphere of spheres) {
    const distance = p5.Vector.dist(position, sphere.position);
    if (distance < sphere.radius + radius + 2) {
      return false;
    }
  }
  return true;
}

function isInsideHexagon(point, padding = 0) {
  const vertices = getHexagonVertices();
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    const edge = p5.Vector.sub(next, current);
    const outwardNormal = createVector(edge.y, -edge.x);
    const normalMagnitude = outwardNormal.mag();
    if (normalMagnitude === 0) continue;
    outwardNormal.div(normalMagnitude);
    const offset = p5.Vector.sub(point, current);
    if (offset.dot(outwardNormal) > -padding) {
      return false;
    }
  }
  return true;
}

function closestPointOnSegment(a, b, point) {
  const ab = p5.Vector.sub(b, a);
  const abMagSq = ab.magSq();
  if (abMagSq === 0) {
    return a.copy();
  }
  const t = constrain(p5.Vector.sub(point, a).dot(ab) / abMagSq, 0, 1);
  return p5.Vector.add(a, p5.Vector.mult(ab, t));
}

function hexToRgb(hex) {
  const sanitized = hex.replace("#", "");
  const bigint = parseInt(sanitized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;

  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  };
}

function getCanvasContainerSize() {
  const container = document.getElementById("canvasContainer");
  const rect = container.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function updateConfigValue(control, formatter = (value) => value.toString()) {
  const value = control.type === "checkbox" ? control.checked : Number(control.value);
  const display = document.querySelector(`[data-value-for="${control.id}"]`);
  if (display) {
    display.textContent =
      typeof value === "number" ? formatter(value) : formatter(value ? "On" : "Off");
  }
}

function initializeControlListeners() {
  const sliderFormatters = {
    wallRestitution: (value) => value.toFixed(2),
    sphereRestitution: (value) => value.toFixed(2),
    gravity: (value) => value.toFixed(1),
    friction: (value) => value.toFixed(2),
    airResistance: (value) => value.toFixed(2),
    rotationSpeed: (value) => value.toFixed(1),
    velocityMultiplier: (value) => value.toFixed(1),
    sphereCount: (value) => value.toString(),
    sphereSize: (value) => value.toString(),
    borderThickness: (value) => value.toString(),
  };

  Object.values(controls).forEach((control) => {
    if (!control || control === controls.toggleSimulation || control === controls.resetSimulation) {
      return;
    }

    if (control.type === "range") {
      control.addEventListener("input", () => {
        config[control.id === "sphereSize" ? "sphereRadius" : control.id] = Number(control.value);
        updateConfigValue(control, sliderFormatters[control.id]);
        if (control.id === "sphereCount" || control.id === "sphereSize" || control.id === "velocityMultiplier") {
          initializeSpheres();
        } else if (control.id === "borderThickness") {
          config.borderThickness = Number(control.value);
        }
      });
      updateConfigValue(control, sliderFormatters[control.id]);
    } else if (control.type === "checkbox") {
      control.setAttribute("aria-checked", control.checked.toString());
      control.addEventListener("change", () => {
        config[control.id === "variableMass" ? "variableMass" : control.id] = control.checked;
        control.setAttribute("aria-checked", control.checked.toString());
        if (control.id === "variableMass") {
          for (const sphere of spheres) {
            sphere.mass = computeSphereMass(sphere.radius);
          }
        }
        if (control.id === "enableTrails") {
          if (!control.checked) {
            const { r, g, b } = hexToRgb(config.backgroundColor);
            background(r, g, b);
          }
        }
      });
    } else if (control.type === "color") {
      control.addEventListener("input", () => {
        config.backgroundColor = control.value;
      });
    }
  });

  controls.toggleSimulation.addEventListener("click", () => {
    running = !running;
    controls.toggleSimulation.textContent = running ? "Pause" : "Start";
  });

  controls.resetSimulation.addEventListener("click", () => {
    initializeSpheres();
    if (!running) {
      running = true;
      controls.toggleSimulation.textContent = "Pause";
    }
  });
}

function preload() {
  initializeControlListeners();
}
