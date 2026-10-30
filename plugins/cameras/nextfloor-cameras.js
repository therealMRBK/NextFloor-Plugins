// NextFloor Cameras (plugin API 1): security cameras and alarm panels in the 3D plan.
//
// - Cameras (camera.*) get a marker and a field-of-view wedge on the floor that stops at walls. The wedge turns red while
//   a motion, occupancy or presence sensor of the same device detects something (which detections count is a setting).
// - A tap on the camera or its wedge opens Home Assistant's own live player (picture-entity card in live view, so
//   WebRTC/HLS through go2rtc where available) in a small window in the corner, or Home Assistant's camera dialog.
// - Alarm panels (alarm_control_panel.*) get a shield marker with their state; a tap opens Home Assistant's keypad.
//
// Place a camera like any device in NextFloor's editor (room → Devices → Place). Its settings (mount, field of view,
// reach, tilt, detections, what a tap does) are in the device's form; the handle in front of it turns it.
// Nothing leaves the browser, no services are called and nothing is stored outside the plan.

const TEXT = {
  en: {
    mount: "Camera mount",
    wall: "Wall",
    dome: "Ceiling (dome)",
    fov: "Field of view (°)",
    reach: "Reach (m)",
    tilt: "Looks down (°)",
    tiltHint: "How far the camera looks below the horizon. With its height it decides where the view meets the floor.",
    detect: "Turns red on: {kind}",
    person: "Persons",
    vehicle: "Vehicles",
    animal: "Animals",
    motion: "Motion",
    motionHint: "Motion sensors, and detection sensors of no known kind.",
    wedgeTap: "A tap on the wedge opens the camera",
    wedgeTapHint: "Off: a tap on the wedge goes through to the room.",
    open: "A tap opens",
    corner: "A small window in the corner",
    dialog: "Home Assistant's dialog",
    wedge: "Show the field of view on the floor",
    wedgeLevel: "Brightness of the field of view (%)",
    wedgeLevelHint: "While it detects something it stays at least half as bright.",
    big: "Open large",
    armed: "Armed",
    disarmed: "Off",
    arming: "Arming",
    pending: "Entry delay",
    triggered: "ALARM",
  },
  de: {
    mount: "Montage",
    wall: "Wand",
    dome: "Decke (Dome)",
    fov: "Blickwinkel (°)",
    reach: "Reichweite (m)",
    tilt: "Neigung nach unten (°)",
    tiltHint: "Wie weit die Kamera unter den Horizont schaut. Mit ihrer Höhe bestimmt das, wo der Blick den Boden trifft.",
    detect: "Wird rot bei: {kind}",
    person: "Personen",
    vehicle: "Fahrzeugen",
    animal: "Tieren",
    motion: "Bewegung",
    motionHint: "Bewegungsmelder und Erkennungssensoren ohne bekannte Art.",
    wedgeTap: "Antippen des Kegels öffnet die Kamera",
    wedgeTapHint: "Aus: Antippen des Kegels geht durch zum Raum.",
    open: "Antippen öffnet",
    corner: "Ein kleines Fenster in der Ecke",
    dialog: "Den Dialog von Home Assistant",
    wedge: "Sichtfeld auf dem Boden zeigen",
    wedgeLevel: "Helligkeit des Sichtfelds (%)",
    wedgeLevelHint: "Solange sie etwas erkennt, bleibt es mindestens halb so hell.",
    big: "Groß öffnen",
    armed: "Scharf",
    disarmed: "Aus",
    arming: "Wird scharf",
    pending: "Eingangsverzögerung",
    triggered: "ALARM",
  },
  fr: {
    mount: "Fixation de la caméra",
    wall: "Murale",
    dome: "Plafond (dôme)",
    fov: "Angle de vue (°)",
    reach: "Portée (m)",
    tilt: "Inclinaison vers le bas (°)",
    tiltHint: "De combien la caméra regarde sous l'horizon. Avec sa hauteur, cela décide où le champ de vision touche le sol.",
    detect: "Devient rouge pour : {kind}",
    person: "Personnes",
    vehicle: "Véhicules",
    animal: "Animaux",
    motion: "Mouvement",
    motionHint: "Les détecteurs de mouvement, et les capteurs de détection d'un type inconnu.",
    wedgeTap: "Un appui sur le cône ouvre la caméra",
    wedgeTapHint: "Désactivé : un appui sur le cône passe à la pièce.",
    open: "Un appui ouvre",
    corner: "Une petite fenêtre dans le coin",
    dialog: "La fenêtre de Home Assistant",
    wedge: "Afficher le cône au sol",
    wedgeLevel: "Luminosité du cône (%)",
    wedgeLevelHint: "Pendant une détection, il garde au moins la moitié de sa luminosité.",
    big: "Ouvrir en grand",
    armed: "Armée",
    disarmed: "Désarmée",
    arming: "Armement",
    pending: "Délai d'entrée",
    triggered: "ALARME",
  },
};

/** The plugin's texts in every language it has, for NextFloor's form fields. */
const both = (key) => Object.fromEntries(Object.entries(TEXT).map(([lang, texts]) => [lang, texts[key]]));
/** The label of the setting that turns the wedge red for one kind of detection, in every language. */
const redFor = (kind) => Object.fromEntries(Object.entries(TEXT).map(([lang, texts]) => [lang, texts.detect.replace("{kind}", texts[kind])]));
const textOf = (hass, key) => (TEXT[(hass?.language ?? "en").slice(0, 2)] ?? TEXT.en)[key];

const DETECTING = new Set(["on", "detected", "home"]);
const KINDS = {
  person: /person|people|human/,
  vehicle: /vehicle|car|truck/,
  animal: /animal|pet|dog|cat|bird/,
};

/** The binary sensors on the camera's device that say it sees something, with the kind each one reports. */
function detectors(hass, cameraId) {
  const device = hass.entities?.[cameraId]?.device_id;
  if (!device || !hass.entities) return [];
  return Object.values(hass.entities)
    .filter((e) => e.device_id === device && e.entity_id.startsWith("binary_sensor."))
    .map((e) => {
      const st = hass.states[e.entity_id];
      const cls = String(st?.attributes.device_class ?? "");
      if (!["motion", "occupancy", "presence"].includes(cls)) return null;
      const name = `${e.entity_id} ${st?.attributes.friendly_name ?? ""}`.toLowerCase();
      const kind = Object.keys(KINDS).find((k) => KINDS[k].test(name)) ?? "motion";
      return { id: e.entity_id, kind };
    })
    .filter(Boolean);
}

/** Whether the camera sees one of the kinds of detection asked for (null: any kind) right now. */
function sees(hass, cameraId, kinds) {
  return detectors(hass, cameraId).some((d) => (!kinds || kinds.includes(d.kind)) && DETECTING.has(hass.states[d.id]?.state));
}

/** The kinds of detection that turn the camera's wedge red. */
const redKinds = (settings) => Object.keys(KINDS).concat("motion").filter((kind) => settings[`red_${kind}`] !== false);

const DEG = Math.PI / 180;

/** Where the view meets the floor: from `near` to `far`, for a camera `height` m up looking `tilt` degrees down. */
function onFloor(height, tilt, fov, reach) {
  // a camera's picture is about 0.56 times as high as it is wide (16:9)
  const half = Math.min(45, (fov * 0.56) / 2);
  const steepest = Math.min(89, tilt + half);
  const flattest = tilt - half;
  const near = height > 0 ? Math.min(reach, height / Math.tan(steepest * DEG)) : 0;
  const far = flattest > 0 ? Math.min(reach, height / Math.tan(flattest * DEG)) : reach;
  return { near: Math.max(0, near), far: Math.max(near + 0.1, far) };
}

/** Home Assistant's own player for the camera: a picture-entity card in live view; a still stream as the fallback. */
async function livePlayer(hass, entityId) {
  try {
    const helpers = await window.loadCardHelpers?.();
    if (helpers) {
      const card = helpers.createCardElement({ type: "picture-entity", entity: entityId, camera_view: "live", show_name: false, show_state: false, tap_action: { action: "none" } });
      card.hass = hass;
      return card;
    }
  } catch {
    // fall back to the MJPEG stream below
  }
  const picture = hass.states[entityId]?.attributes.entity_picture;
  const img = document.createElement("img");
  img.style.cssText = "display:block;width:100%";
  if (typeof picture === "string") img.src = picture.replace("/api/camera_proxy/", "/api/camera_proxy_stream/");
  return img;
}

/** The window's content: the player and a button that opens Home Assistant's large dialog. It passes every new hass on. */
function windowContent(player, onBig, label) {
  const box = document.createElement("div");
  box.style.cssText = "position:relative";
  const big = document.createElement("button");
  big.textContent = "⤢";
  big.title = label;
  big.setAttribute("aria-label", label);
  big.style.cssText = "position:absolute;top:6px;right:6px;z-index:1;border:0;border-radius:6px;padding:2px 8px;background:rgba(0,0,0,.55);color:#fff;font-size:16px;cursor:pointer";
  big.addEventListener("click", onBig);
  box.append(player, big);
  Object.defineProperty(box, "hass", { set: (hass) => void ("hass" in player && (player.hass = hass)) });
  return box;
}

/** The camera whose window is open, so a second tap closes it. */
let openCamera = null;

const camera = {
  match: (entityId) => entityId.startsWith("camera."),
  kind: "sensor",
  settings: [
    { key: "mount", label: both("mount"), type: "select", default: "wall", options: [["wall", both("wall")], ["dome", both("dome")]] },
    { key: "fov", label: both("fov"), type: "number", default: 90, min: 20, max: 180, step: 5 },
    { key: "reach", label: both("reach"), type: "number", default: 6, min: 1, max: 30, step: 0.5 },
    { key: "tilt", label: both("tilt"), type: "number", default: 25, min: 0, max: 90, step: 5, hint: both("tiltHint") },
    { key: "wedge", label: both("wedge"), type: "boolean", default: true },
    { key: "wedge_level", label: both("wedgeLevel"), type: "number", default: 100, min: 15, max: 100, step: 5, hint: both("wedgeLevelHint") },
    { key: "red_person", label: redFor("person"), type: "boolean", default: true },
    { key: "red_vehicle", label: redFor("vehicle"), type: "boolean", default: true },
    { key: "red_animal", label: redFor("animal"), type: "boolean", default: true },
    { key: "red_motion", label: redFor("motion"), type: "boolean", default: true, hint: both("motionHint") },
    { key: "wedge_tap", label: both("wedgeTap"), type: "boolean", default: true, hint: both("wedgeTapHint") },
    { key: "open", label: both("open"), type: "select", default: "corner", options: [["corner", both("corner")], ["dialog", both("dialog")]] },
  ],
  marker: ({ hass, entityId }) => ({ icon: "mdi:cctv", text: "", active: sees(hass, entityId, null) }),
  watch: ({ hass, entityId }) => detectors(hass, entityId).map((d) => d.id),
  floorWedge: ({ hass, entityId, placement, settings }) => {
    if (settings.wedge === false) return null;
    const dome = settings.mount === "dome";
    const reach = Number(settings.reach);
    // a dome looks all around and straight down; a wall camera looks ahead
    const { near, far } = dome ? { near: 0, far: Math.min(reach, Math.max(1.5, placement.y * 1.6)) } : onFloor(placement.y, Number(settings.tilt), Number(settings.fov), reach);
    const red = sees(hass, entityId, redKinds(settings));
    // the wedge's brightness; red on a detection stays at least half as bright so it is still seen
    const level = Number(settings.wedge_level) / 100;
    return { angle: dome ? 360 : Number(settings.fov), reach: far, near, color: red ? "#e5222e" : "#0b4a5c", opacity: red ? 0.85 * Math.max(0.5, level) : 0.7 * level, tapThrough: settings.wedge_tap === false };
  },
  tap: ({ hass, entityId, settings, showWindow, moreInfo }) => {
    if (settings.open === "dialog") {
      moreInfo();
      return true;
    }
    if (openCamera === entityId) {
      openCamera = null;
      showWindow(null);
      return true;
    }
    openCamera = entityId;
    const title = hass.states[entityId]?.attributes.friendly_name ?? entityId;
    void livePlayer(hass, entityId).then((player) => {
      // another camera may have been tapped while the player loaded
      if (openCamera !== entityId) return;
      const onBig = () => {
        openCamera = null;
        showWindow(null);
        moreInfo();
      };
      showWindow(windowContent(player, onBig, textOf(hass, "big")), { title });
    });
    return true;
  },
};

const ARMED = /^armed_/;

const alarm = {
  match: (entityId) => entityId.startsWith("alarm_control_panel."),
  kind: "sensor",
  marker: ({ hass, state }) => {
    const s = state.state;
    const key = s === "triggered" ? "triggered" : ARMED.test(s) ? "armed" : s === "arming" ? "arming" : s === "pending" ? "pending" : s === "disarmed" ? "disarmed" : null;
    return {
      icon: ARMED.test(s) || s === "triggered" ? "mdi:shield-lock" : s === "disarmed" ? "mdi:shield-off-outline" : "mdi:shield-half-full",
      text: key ? textOf(hass, key) : s,
      active: ARMED.test(s) || ["triggered", "arming", "pending"].includes(s),
    };
  },
  // the keypad lives in Home Assistant's own dialog
  tap: ({ moreInfo }) => {
    moreInfo();
    return true;
  },
};

const plugin = {
  id: "cameras",
  name: "Cameras",
  version: "1.0.0",
  apiVersion: 1,
  devices: [camera, alarm],
};

// works whether NextFloor is already running or loads after this script
if (window.NextFloor) window.NextFloor.register(plugin);
else (window.__nextfloorPlugins ??= []).push(plugin);
