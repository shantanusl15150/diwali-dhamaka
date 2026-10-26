/**
 * Diwali Dhamaka backend (Google Apps Script web app).
 *
 * Setup:
 * 1. Create a Google Sheet -> Extensions -> Apps Script, paste this file.
 * 2. Project Settings -> Script properties -> add HOST_PIN (used by party.html host mode).
 * 3. Optionally set NOTIFY_EMAIL below (defaults to the account that deploys the script).
 * 4. Deploy -> New deployment -> Web app. Execute as: Me. Who has access: Anyone.
 * 5. Copy the /exec URL into rsvpEndpoint in config.js.
 * 6. Fill the "Missions" tab (created on first RSVP or run setup()) with one mission per row.
 *    Duplicate rows set the ratio, e.g. 3 "Traitor" rows + 12 "Faithful" rows.
 *    Guests who RSVP'd before missions existed: run assignMissions() once from the editor.
 * After editing this file, use Deploy -> Manage deployments -> Edit -> New version (URL stays the same).
 */

const RSVP_SHEET = "RSVPs";
const SCORES_SHEET = "Scores";
const MISSIONS_SHEET = "Missions";
const NOTIFY_EMAIL = "";
const MAX_OPTIONS = 50;
const MAX_SCORE_CHANGE = 500;

const FIELDS = [
  ["updatedAt", "Updated At"],
  ["name", "Name"],
  ["phone", "WhatsApp"],
  ["response", "Response"],
  ["arrivalTime", "Arrival Time"],
  ["drink", "Party Fuel"],
  ["plusOneName", "+1 Name"],
  ["plusOneRelation", "+1 Relation"],
  ["plusOnePhone", "+1 WhatsApp"],
  ["plusOneDrink", "+1 Party Fuel"],
  ["item", "Assigned Item"],
  ["team", "Team"],
  ["mission", "Secret Mission"],
  ["quizScore", "Audition Points"],
  ["seat", "Seat"],
  ["plusOneTeam", "+1 Team"],
  ["plusOneMission", "+1 Secret Mission"],
  ["plusOneQuizScore", "+1 Audition Points"],
  ["plusOneSeat", "+1 Seat"],
  ["songRequest", "Song Request"],
  ["charadesMovie", "Charades Movie"],
  ["guestId", "Guest ID"],
];
const HEADERS = FIELDS.map((field) => field[1]);
const SCORE_HEADERS = ["Time", "Team", "Points", "Reason"];
const MISSION_HEADERS = ["Mission"];

const RESPONSE_LABELS = { yes: "Coming solo", plusOne: "Coming with +1", no: "Not coming" };

/* ---------- HTTP entry points ---------- */

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "";
    if (action === "leaderboard") return json_({ ok: true, leaderboard: buildLeaderboard_() });
    if (action === "host") {
      requirePin_(e.parameter.pin);
      return json_({ ok: true, host: buildHostStats_() });
    }
    return json_({ ok: true, message: "Diwali Dhamaka endpoint is live 🪔" });
  } catch (err) {
    return json_({ ok: false, error: errorMessage_(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    if (!e || !e.postData || !e.postData.contents) throw new Error("Empty request");
    const data = JSON.parse(e.postData.contents);
    if (data.action === "score") return json_({ ok: true, leaderboard: addScore_(data) });
    return json_(Object.assign({ ok: true }, saveRsvp_(data)));
  } catch (err) {
    return json_({ ok: false, error: errorMessage_(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Run once from the editor to create all tabs up front. */
function setup() {
  getSheet_(RSVP_SHEET, HEADERS);
  getSheet_(SCORES_SHEET, SCORE_HEADERS);
  getSheet_(MISSIONS_SHEET, MISSION_HEADERS);
}

/** Run from the editor after filling the Missions tab to give missions to guests who RSVP'd earlier. */
function assignMissions() {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const missions = readMissions_();
    if (!missions.length) throw new Error("Missions tab is empty");
    const sheet = getSheet_(RSVP_SHEET, HEADERS);
    const rows = readRsvps_(sheet);
    const counts = countBy_(rows, (row) => [row.mission, row.plusOneMission]);
    const assign = (row, key) => {
      if (row[key]) return;
      row[key] = pickProportional_(missions, counts);
      counts[row[key]] = (counts[row[key]] || 0) + 1;
    };
    rows.forEach((row) => {
      if (row.team) assign(row, "mission");
      if (row.plusOneTeam) assign(row, "plusOneMission");
    });
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows.map((row) => FIELDS.map((field) => safeCell_(row[field[0]]))));
    }
  } finally {
    lock.releaseLock();
  }
}

/* ---------- RSVP ---------- */

function saveRsvp_(data) {
  const rsvp = parseRsvp_(data);
  const sheet = getSheet_(RSVP_SHEET, HEADERS);
  const rows = readRsvps_(sheet);
  const existingIndex = rows.findIndex((row) => row.guestId === rsvp.guestId);
  const existing = existingIndex >= 0 ? rows[existingIndex] : null;
  const others = rows.filter((_, i) => i !== existingIndex);
  const attending = rsvp.response !== "no";
  const withPlusOne = rsvp.response === "plusOne";

  const keepIfValid = (options, key) => (existing && options.indexOf(String(existing[key])) >= 0 ? String(existing[key]) : "");
  const keepExisting = (key) => (existing && existing[key] ? String(existing[key]) : "");

  // Every person (guest or +1) is one head, so teams stay balanced by people.
  const teamCounts = countBy_(others, (row) => [row.team, row.plusOneTeam]);
  const missionCounts = countBy_(others, (row) => [row.mission, row.plusOneMission]);
  const missions = readMissions_();

  const item = keepIfValid(rsvp.options, "item") || pickLeastUsed_(rsvp.options, countBy_(others, (row) => [row.item]));

  const team = attending ? keepIfValid(rsvp.teamOptions, "team") || pickLeastUsed_(rsvp.teamOptions, teamCounts) : "";
  if (team) teamCounts[team] = (teamCounts[team] || 0) + 1;
  const plusOneTeam = withPlusOne ? keepIfValid(rsvp.teamOptions, "plusOneTeam") || pickLeastUsed_(rsvp.teamOptions, teamCounts) : "";

  // Missions are never returned to the guest's browser; the host sends them on WhatsApp.
  const mission = attending ? keepExisting("mission") || pickProportional_(missions, missionCounts) : "";
  if (mission) missionCounts[mission] = (missionCounts[mission] || 0) + 1;
  const plusOneMission = withPlusOne ? keepExisting("plusOneMission") || pickProportional_(missions, missionCounts) : "";

  const seat = keepExisting("seat") || "DD-" + ("00" + (rows.length + 1)).slice(-3);
  const plusOneSeat = withPlusOne ? seat + "B" : "";

  const record = {
    updatedAt: new Date(),
    name: rsvp.name,
    phone: rsvp.phone,
    response: RESPONSE_LABELS[rsvp.response],
    arrivalTime: rsvp.arrivalTime,
    drink: rsvp.drink,
    plusOneName: rsvp.plusOneName,
    plusOneRelation: rsvp.plusOneRelation,
    plusOnePhone: rsvp.plusOnePhone,
    plusOneDrink: rsvp.plusOneDrink,
    item: item,
    team: team,
    mission: mission,
    quizScore: attending ? rsvp.quizScore : "",
    seat: attending ? seat : "",
    plusOneTeam: plusOneTeam,
    plusOneMission: plusOneMission,
    plusOneQuizScore: withPlusOne ? rsvp.plusOneQuizScore : "",
    plusOneSeat: plusOneSeat,
    songRequest: rsvp.songRequest,
    charadesMovie: rsvp.charadesMovie,
    guestId: rsvp.guestId,
  };
  const values = FIELDS.map((field) => safeCell_(record[field[0]]));

  if (existing) {
    sheet.getRange(existingIndex + 2, 1, 1, HEADERS.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }

  notify_(record, Boolean(existing));
  return { item: item, team: team, seat: seat, plusOneTeam: plusOneTeam, plusOneSeat: plusOneSeat };
}

function parseRsvp_(data) {
  const list = (value) =>
    (Array.isArray(value) ? value : [])
      .slice(0, MAX_OPTIONS)
      .map((option) => text_(option, 120))
      .filter(Boolean);

  const rsvp = {
    guestId: text_(data.guestId, 80),
    name: text_(data.name, 60),
    phone: phone_(data.phone),
    response: text_(data.response, 10),
    arrivalTime: text_(data.arrivalTime, 30),
    drink: text_(data.drink, 30),
    plusOneName: text_(data.plusOneName, 60),
    plusOneRelation: text_(data.plusOneRelation, 20),
    plusOnePhone: phone_(data.plusOnePhone),
    plusOneDrink: text_(data.plusOneDrink, 30),
    songRequest: text_(data.songRequest, 80),
    charadesMovie: text_(data.charadesMovie, 80),
    quizScore: score_(data.quizScore),
    plusOneQuizScore: score_(data.plusOneQuizScore),
    options: list(data.options),
    teamOptions: list(data.teamOptions),
  };

  if (!rsvp.guestId) throw new Error("Missing guest id");
  if (rsvp.name.length < 2) throw new Error("Missing name");
  if (!RESPONSE_LABELS[rsvp.response]) throw new Error("Invalid response");
  if (!rsvp.options.length) throw new Error("No wheel options");
  if (rsvp.response !== "no" && !rsvp.phone) throw new Error("Missing WhatsApp number");
  if (rsvp.response !== "no" && !rsvp.teamOptions.length) throw new Error("No teams configured");
  return rsvp;
}

function countBy_(rows, keysOf) {
  const counts = {};
  rows.forEach((row) =>
    keysOf(row).forEach((key) => {
      const k = String(key || "");
      if (k) counts[k] = (counts[k] || 0) + 1;
    })
  );
  return counts;
}

function pickLeastUsed_(options, counts) {
  if (!options.length) return "";
  const min = Math.min.apply(null, options.map((option) => counts[option] || 0));
  const candidates = options.filter((option) => (counts[option] || 0) === min);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Each row in the Missions tab is one slot, so duplicates control the mix (e.g. 3 Traitors : 12 Faithfuls).
// Picks among the least-filled missions, weighted by how many slots they have.
function pickProportional_(missions, counts) {
  if (!missions.length) return "";
  const slots = {};
  missions.forEach((mission) => (slots[mission] = (slots[mission] || 0) + 1));
  const texts = Object.keys(slots);
  const fill = (text) => (counts[text] || 0) / slots[text];
  const min = Math.min.apply(null, texts.map(fill));
  const candidates = texts.filter((text) => fill(text) === min);
  let roll = Math.random() * candidates.reduce((sum, text) => sum + slots[text], 0);
  for (let i = 0; i < candidates.length; i += 1) {
    roll -= slots[candidates[i]];
    if (roll < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/* ---------- Party leaderboard ---------- */

function buildLeaderboard_() {
  const rows = readRsvps_(getSheet_(RSVP_SHEET, HEADERS));
  const scores = readValues_(getSheet_(SCORES_SHEET, SCORE_HEADERS), SCORE_HEADERS.length);
  const teams = {};
  const ensure = (name) => (teams[name] = teams[name] || { name: name, members: [], audition: 0, party: 0 });
  const addMember = (teamName, name, score) => {
    if (!teamName) return;
    const team = ensure(String(teamName));
    team.members.push(String(name));
    team.audition += Number(score) || 0;
  };

  rows
    .filter((row) => row.response !== RESPONSE_LABELS.no)
    .forEach((row) => {
      addMember(row.team, row.name, row.quizScore);
      addMember(row.plusOneTeam, row.plusOneName, row.plusOneQuizScore);
    });

  scores.forEach((row) => {
    if (row[1]) ensure(String(row[1])).party += Number(row[2]) || 0;
  });

  const recent = scores
    .slice(-6)
    .reverse()
    .map((row) => ({ time: row[0], team: String(row[1]), points: Number(row[2]) || 0, reason: String(row[3]) }));

  return {
    teams: Object.keys(teams).map((name) => {
      const team = teams[name];
      team.total = team.audition + team.party;
      return team;
    }),
    recent: recent,
  };
}

function addScore_(data) {
  requirePin_(data.pin);
  const team = text_(data.team, 60);
  const points = Math.round(Number(data.points));
  if (!team) throw new Error("Missing team");
  if (!isFinite(points) || points === 0 || Math.abs(points) > MAX_SCORE_CHANGE) throw new Error("Invalid points");
  getSheet_(SCORES_SHEET, SCORE_HEADERS).appendRow([new Date(), team, points, text_(data.reason, 60)].map(safeCell_));
  return buildLeaderboard_();
}

function buildHostStats_() {
  const rows = readRsvps_(getSheet_(RSVP_SHEET, HEADERS));
  const coming = rows.filter((row) => row.response !== RESPONSE_LABELS.no);
  const drinks = {};
  const arrivals = {};
  const tally = (bucket, key, n) => key && (bucket[key] = (bucket[key] || 0) + n);

  coming.forEach((row) => {
    tally(drinks, String(row.drink), 1);
    tally(drinks, String(row.plusOneDrink), 1);
    tally(arrivals, String(row.arrivalTime), row.plusOneName ? 2 : 1);
  });

  const fields = [
    "name", "phone", "response", "arrivalTime", "item", "team", "mission", "seat",
    "plusOneName", "plusOneRelation", "plusOnePhone", "plusOneTeam", "plusOneMission", "plusOneSeat",
  ];

  return {
    totals: {
      responses: rows.length,
      coming: coming.length,
      notComing: rows.length - coming.length,
      plusOnes: coming.filter((row) => row.plusOneName).length,
      headcount: coming.reduce((sum, row) => sum + (row.plusOneName ? 2 : 1), 0),
    },
    drinks: drinks,
    arrivals: arrivals,
    missionsConfigured: readMissions_().length,
    guests: rows.map((row) => fields.reduce((guest, key) => ((guest[key] = String(row[key] || "")), guest), {})),
    songs: coming.map((row) => String(row.songRequest)).filter(Boolean),
    movies: coming.map((row) => String(row.charadesMovie)).filter(Boolean),
  };
}

/* ---------- Helpers ---------- */

function requirePin_(pin) {
  const expected = PropertiesService.getScriptProperties().getProperty("HOST_PIN");
  if (!expected) throw new Error("HOST_PIN script property is not set");
  if (String(pin || "") !== expected) throw new Error("Wrong PIN");
}

function getSheet_(name, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  return sheet;
}

function readValues_(sheet, width) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
}

function readRsvps_(sheet) {
  return readValues_(sheet, HEADERS.length).map((values) =>
    FIELDS.reduce((row, field, i) => ((row[field[0]] = values[i]), row), {})
  );
}

function readMissions_() {
  return readValues_(getSheet_(MISSIONS_SHEET, MISSION_HEADERS), 1)
    .map((row) => text_(row[0], 500))
    .filter(Boolean);
}

function text_(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

// Accepts 10-digit Indian numbers or full international numbers; returns "+<digits>" or "".
function phone_(value) {
  let digits = String(value == null ? "" : value).replace(/\D/g, "");
  if (digits.length === 11 && digits.charAt(0) === "0") digits = digits.slice(1);
  if (digits.length === 10) return "+91" + digits;
  return digits.length >= 11 && digits.length <= 15 ? "+" + digits : "";
}

function score_(value) {
  return Math.max(0, Math.min(1000, Math.round(Number(value) || 0)));
}

// Prevents formula injection ("=IMPORTXML(...)") and keeps "+91..." numbers as text.
function safeCell_(value) {
  return typeof value === "string" && /^[=+\-@]/.test(value) ? "'" + value : value;
}

function errorMessage_(err) {
  return String(err && err.message ? err.message : err);
}

function notify_(record, isUpdate) {
  const to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  if (!to) return;
  const coming = record.response !== RESPONSE_LABELS.no;
  const lines = [
    "Name: " + record.name,
    record.phone && "WhatsApp: " + record.phone,
    "Status: " + record.response,
    record.arrivalTime && "Arrival: " + record.arrivalTime,
    record.drink && "Party fuel: " + record.drink,
    (coming ? "Bringing: " : "Punishment: ") + record.item,
    record.team && "Team: " + record.team + " (audition " + record.quizScore + " pts)",
    coming && "Secret mission: " + (record.mission || "(Missions tab is empty)"),
    coming && "Seat: " + record.seat,
    record.plusOneName && "+1: " + record.plusOneName + " (" + record.plusOneRelation + ")",
    record.plusOnePhone && "+1 WhatsApp: " + record.plusOnePhone,
    record.plusOneDrink && "+1 Party fuel: " + record.plusOneDrink,
    record.plusOneTeam && "+1 Team: " + record.plusOneTeam + " (audition " + record.plusOneQuizScore + " pts)",
    record.plusOneName && "+1 Secret mission: " + (record.plusOneMission || "(Missions tab is empty)"),
    record.plusOneSeat && "+1 Seat: " + record.plusOneSeat,
    record.songRequest && "Song request: " + record.songRequest,
    record.charadesMovie && "Charades movie: " + record.charadesMovie,
  ].filter(Boolean);

  MailApp.sendEmail({
    to: to,
    subject: "🪔 " + (isUpdate ? "Updated RSVP" : "RSVP") + ": " + record.name + " (" + record.response + ")",
    body: lines.join("\n"),
  });
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
