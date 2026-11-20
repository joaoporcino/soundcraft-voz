import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { assertSoundcheckRevision, soundcheckRevision } from './soundcheck-review.js';
import { assertTeamSessionRevision } from './team-session-review.js';
import { physicalRevision } from './physical-review.js';

const SCHEMA_VERSION = 7;
const MAX_SAFE_SQLITE_INTEGER = 9007199254740991;
const REVISED_RETURN_FIELDS = Object.freeze({
  sessao: ['id', 'name'],
  pessoa: ['id', 'name'],
  'aux-config': ['auxCount', 'source'],
  'retorno-cadastro': ['id', 'sessionId', 'aux', 'confirmedPeople'],
});

export function registryContentRevision(type, item) {
  const fields = REVISED_RETURN_FIELDS[type];
  if (!fields || !item || fields.some(field => !Object.hasOwn(item, field))) throw new TypeError('Registro de revisão inválido');
  return createHash('sha256').update(JSON.stringify([type, ...fields.map(field => item[field])])).digest('hex');
}

function assertRegistryContentRevision(type, item, expected) {
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) || registryContentRevision(type, item) !== expected) {
    throw new Error('Cadastro alterado desde a revisão; consulte novamente');
  }
}

function requiredText(value, field, maxLength = 200) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(`${field} deve ser texto não vazio com até ${maxLength} caracteres`);
  }
  return value.trim();
}

function optionalText(value, field, maxLength = 200) {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, field, maxLength);
}

function validId(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${field} deve ser um ID inteiro positivo`);
  return value;
}

function validInputId(value) {
  if (typeof value !== 'string' || value !== value.trim() || !value || value.length > 200 ||
      Array.from(value).some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
    throw new TypeError('inputId inválido');
  }
  return value;
}

function migrateToV7(db) {
  db.exec(`
    CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) > 0)) STRICT;
    CREATE TABLE roles (id INTEGER PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) > 0)) STRICT;
    CREATE TABLE team_members (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
      person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
      PRIMARY KEY(team_id, person_id)
    ) STRICT;
    CREATE TABLE team_member_roles (
      team_id INTEGER NOT NULL, person_id INTEGER NOT NULL, role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      PRIMARY KEY(team_id, person_id, role_id),
      FOREIGN KEY(team_id, person_id) REFERENCES team_members(team_id, person_id) ON DELETE RESTRICT
    ) STRICT;
    CREATE TABLE session_teams (
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
      PRIMARY KEY(session_id, team_id)
    ) STRICT;
    CREATE TABLE session_members (
      session_id INTEGER NOT NULL, team_id INTEGER NOT NULL, person_id INTEGER NOT NULL,
      PRIMARY KEY(session_id, team_id, person_id),
      FOREIGN KEY(session_id, team_id) REFERENCES session_teams(session_id, team_id) ON DELETE RESTRICT,
      FOREIGN KEY(team_id, person_id) REFERENCES team_members(team_id, person_id) ON DELETE RESTRICT
    ) STRICT;
    CREATE TABLE session_roles (
      session_id INTEGER NOT NULL, team_id INTEGER NOT NULL, person_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      PRIMARY KEY(session_id, team_id, person_id, role_id),
      FOREIGN KEY(session_id, team_id, person_id) REFERENCES session_members(session_id, team_id, person_id) ON DELETE RESTRICT
    ) STRICT;
    PRAGMA user_version = 7;
  `);
}

function migrateToV6(db) {
  db.exec(`
    CREATE TABLE registry_corrections (
      id INTEGER PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('pessoa', 'equipamento')),
      entity_id INTEGER NOT NULL CHECK(entity_id > 0),
      before_json TEXT NOT NULL CHECK(json_valid(before_json)),
      after_json TEXT NOT NULL CHECK(json_valid(after_json)),
      changed_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE retired_assignments (
      assignment_id INTEGER PRIMARY KEY REFERENCES assignments(id) ON DELETE RESTRICT,
      replacement_id INTEGER NOT NULL UNIQUE REFERENCES assignments(id) ON DELETE RESTRICT,
      inputs_json TEXT NOT NULL CHECK(json_valid(inputs_json)),
      changed_at TEXT NOT NULL,
      CHECK(assignment_id <> replacement_id)
    ) STRICT;
    PRAGMA user_version = 6;
  `);
}

function migrateToV5(db) {
  db.exec(`
    CREATE TABLE input_sources (
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
      input_id TEXT NOT NULL CHECK(length(trim(input_id)) BETWEEN 1 AND 200),
      assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
      binding_id TEXT NOT NULL UNIQUE CHECK(length(binding_id) = 36),
      PRIMARY KEY(session_id, input_id)
    ) STRICT;
    PRAGMA user_version = 5;
  `);
}

function migrateToV4(db) {
  db.exec(`
    CREATE TABLE physical_devices (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      type TEXT NOT NULL CHECK(type IN ('mesa', 'medusa', 'outro'))
    ) STRICT;
    CREATE TABLE signal_points (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('equipment', 'person', 'monitor_return', 'channel', 'port', 'snake_way', 'mix', 'other')),
      label TEXT NOT NULL CHECK(length(trim(label)) > 0),
      direction TEXT NOT NULL CHECK(direction IN ('input', 'output', 'bidirectional', 'unknown')),
      device_id INTEGER REFERENCES physical_devices(id) ON DELETE RESTRICT,
      equipment_id INTEGER REFERENCES equipment(id) ON DELETE RESTRICT,
      person_id INTEGER REFERENCES people(id) ON DELETE RESTRICT,
      monitor_return_id INTEGER REFERENCES monitor_returns(id) ON DELETE RESTRICT,
      channel INTEGER CHECK(channel BETWEEN 1 AND 24),
      CHECK((type = 'equipment') = (equipment_id IS NOT NULL)),
      CHECK((type = 'person') = (person_id IS NOT NULL)),
      CHECK((type = 'monitor_return') = (monitor_return_id IS NOT NULL)),
      CHECK((type = 'channel') = (channel IS NOT NULL)),
      CHECK(type NOT IN ('port', 'snake_way') OR device_id IS NOT NULL)
    ) STRICT;
    CREATE TABLE signal_links (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
      from_point_id INTEGER NOT NULL REFERENCES signal_points(id) ON DELETE RESTRICT,
      to_point_id INTEGER REFERENCES signal_points(id) ON DELETE RESTRICT,
      kind TEXT NOT NULL CHECK(kind IN ('physical', 'internal', 'patch')),
      status TEXT NOT NULL CHECK(status IN ('proposto', 'confirmado', 'rejeitado', 'revogado')),
      confirmation_origin TEXT,
      confirmed_at TEXT,
      CHECK(to_point_id IS NULL OR from_point_id <> to_point_id),
      CHECK(status <> 'confirmado' OR (to_point_id IS NOT NULL AND confirmation_origin IS NOT NULL AND confirmed_at IS NOT NULL))
    ) STRICT;
    CREATE INDEX signal_links_session_idx ON signal_links(session_id, id);
    CREATE TABLE voice_proposals (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
      phrase TEXT NOT NULL CHECK(length(trim(phrase)) > 0),
      origin TEXT NOT NULL CHECK(length(trim(origin)) > 0),
      person_id INTEGER REFERENCES people(id) ON DELETE RESTRICT,
      equipment_id INTEGER REFERENCES equipment(id) ON DELETE RESTRICT,
      channel INTEGER CHECK(channel BETWEEN 1 AND 24),
      status TEXT NOT NULL CHECK(status IN ('proposto', 'confirmado', 'rejeitado')),
      assignment_id INTEGER REFERENCES assignments(id) ON DELETE RESTRICT,
      CHECK(status <> 'confirmado' OR (person_id IS NOT NULL AND equipment_id IS NOT NULL AND channel IS NOT NULL AND assignment_id IS NOT NULL)),
      CHECK(status = 'confirmado' OR assignment_id IS NULL)
    ) STRICT;
    CREATE INDEX voice_proposals_session_idx ON voice_proposals(session_id, id);
    PRAGMA user_version = 4;
  `);
}

function migrateToV2(db) {
  db.exec(`
    CREATE TABLE monitor_returns (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
      aux INTEGER NOT NULL CHECK(aux BETWEEN 1 AND 8),
      UNIQUE(session_id, aux),
      UNIQUE(id, session_id)
    ) STRICT;
    CREATE TABLE monitor_assignments (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
      person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
      return_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('proposto', 'confirmado', 'rejeitado', 'revogado')),
      FOREIGN KEY(return_id, session_id) REFERENCES monitor_returns(id, session_id) ON DELETE RESTRICT
    ) STRICT;
    CREATE INDEX monitor_assignments_session_idx ON monitor_assignments(session_id, id);
    CREATE UNIQUE INDEX monitor_assignments_confirmed_person_idx ON monitor_assignments(session_id, person_id) WHERE status = 'confirmado';
    PRAGMA user_version = 2;
  `);
}

function migrateToV3(db, { legacy = true } = {}) {
  db.exec(`
    CREATE TABLE monitor_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      aux_count INTEGER CHECK(aux_count BETWEEN 1 AND ${MAX_SAFE_SQLITE_INTEGER}),
      source TEXT NOT NULL CHECK(source IN ('nao_configurado', 'legado', 'configurado')),
      CHECK((source = 'nao_configurado' AND aux_count IS NULL) OR
            (source = 'legado' AND aux_count IS NOT NULL AND aux_count = 8) OR
            (source = 'configurado' AND aux_count IS NOT NULL))
    ) STRICT;
    INSERT INTO monitor_config(id, aux_count, source) VALUES (1, ${legacy ? "8, 'legado'" : "NULL, 'nao_configurado'"});
    CREATE TABLE monitor_returns_v3 (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
      aux INTEGER NOT NULL CHECK(aux BETWEEN 1 AND ${MAX_SAFE_SQLITE_INTEGER}),
      UNIQUE(session_id, aux),
      UNIQUE(id, session_id)
    ) STRICT;
    CREATE TABLE monitor_assignments_v3 (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
      person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
      return_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('proposto', 'confirmado', 'rejeitado', 'revogado')),
      FOREIGN KEY(return_id, session_id) REFERENCES monitor_returns_v3(id, session_id) ON DELETE RESTRICT
    ) STRICT;
    INSERT INTO monitor_returns_v3 SELECT id, session_id, aux FROM monitor_returns;
    INSERT INTO monitor_assignments_v3 SELECT id, session_id, person_id, return_id, status FROM monitor_assignments;
    DROP TABLE monitor_assignments;
    DROP TABLE monitor_returns;
    ALTER TABLE monitor_returns_v3 RENAME TO monitor_returns;
    ALTER TABLE monitor_assignments_v3 RENAME TO monitor_assignments;
    CREATE INDEX monitor_assignments_session_idx ON monitor_assignments(session_id, id);
    CREATE UNIQUE INDEX monitor_assignments_confirmed_person_idx ON monitor_assignments(session_id, person_id) WHERE status = 'confirmado';
    PRAGMA user_version = 3;
  `);
}

export function createRegistrySchema(db, { version = SCHEMA_VERSION } = {}) {
  if (![1, 2, 3, 4, 5, 6, 7].includes(version)) throw new RangeError('Versão de esquema inválida');
  db.exec(`
    CREATE TABLE people (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0)
    ) STRICT;
    CREATE TABLE equipment (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      kind TEXT NOT NULL CHECK(length(trim(kind)) > 0),
      color TEXT,
      wireless INTEGER CHECK(wireless IN (0, 1)),
      capsule TEXT,
      model TEXT
    ) STRICT;
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0)
    ) STRICT;
    CREATE TABLE assignments (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
      person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
      equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
      channel INTEGER CHECK(channel BETWEEN 1 AND 24),
      status TEXT NOT NULL CHECK(status IN ('proposto', 'confirmado'))
    ) STRICT;
    CREATE INDEX assignments_session_idx ON assignments(session_id, id);
    PRAGMA user_version = 1;
  `);
  if (version >= 2) migrateToV2(db);
  if (version >= 3) migrateToV3(db, { legacy: false });
  if (version >= 4) migrateToV4(db);
  if (version >= 5) migrateToV5(db);
  if (version >= 6) migrateToV6(db);
  if (version >= 7) migrateToV7(db);
}

export function openRegistry(path) {
  if (typeof path !== 'string' || path.length === 0) throw new TypeError('path deve ser um caminho não vazio');
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > SCHEMA_VERSION) throw new Error(`Versão de banco ${version} é mais recente que a suportada (${SCHEMA_VERSION})`);
    if (version < SCHEMA_VERSION) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const lockedVersion = db.prepare('PRAGMA user_version').get().user_version;
        if (lockedVersion > SCHEMA_VERSION) throw new Error(`Versão de banco ${lockedVersion} é mais recente que a suportada (${SCHEMA_VERSION})`);
        if (lockedVersion === 0) createRegistrySchema(db);
        else {
          if (lockedVersion === 1) migrateToV2(db);
          if (lockedVersion <= 2) migrateToV3(db);
          if (lockedVersion <= 3) migrateToV4(db);
          if (lockedVersion <= 4) migrateToV5(db);
          if (lockedVersion <= 5) migrateToV6(db);
          if (lockedVersion <= 6) migrateToV7(db);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }

    const statements = {
      addPerson: db.prepare('INSERT INTO people(name) VALUES (?) RETURNING id, name'),
      listPeople: db.prepare('SELECT id, name FROM people ORDER BY id'),
      addEquipment: db.prepare(`INSERT INTO equipment(name, kind, color, wireless, capsule, model)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING id, name, kind, color, wireless, capsule, model`),
      listEquipment: db.prepare(`SELECT id, name, kind, color, wireless, capsule, model FROM equipment
        WHERE (? IS NULL OR color = ? COLLATE NOCASE) AND (? IS NULL OR kind = ?) ORDER BY id`),
      createSession: db.prepare('INSERT INTO sessions(name) VALUES (?) RETURNING id, name'),
      listSessions: db.prepare('SELECT id, name FROM sessions ORDER BY id'),
      addAssignment: db.prepare(`INSERT INTO assignments(session_id, person_id, equipment_id, channel, status)
        VALUES (?, ?, ?, ?, 'proposto') RETURNING id, session_id AS sessionId, person_id AS personId,
        equipment_id AS equipmentId, channel, status`),
      listAssignments: db.prepare(`SELECT id, session_id AS sessionId, person_id AS personId,
        equipment_id AS equipmentId, channel, CASE WHEN EXISTS(SELECT 1 FROM retired_assignments r WHERE r.assignment_id=assignments.id) THEN 'revogado' ELSE status END AS status FROM assignments WHERE session_id = ? ORDER BY id`),
      assignment: db.prepare("SELECT id, session_id AS sessionId, person_id AS personId, equipment_id AS equipmentId, channel, CASE WHEN EXISTS(SELECT 1 FROM retired_assignments r WHERE r.assignment_id=assignments.id) THEN 'revogado' ELSE status END AS status FROM assignments WHERE id = ?"),
      conflictEquipment: db.prepare(`SELECT id FROM assignments WHERE session_id = ? AND equipment_id = ? AND status = 'confirmado' AND id <> ? AND NOT EXISTS(SELECT 1 FROM retired_assignments r WHERE r.assignment_id=assignments.id) LIMIT 1`),
      conflictChannel: db.prepare(`SELECT id FROM assignments WHERE session_id = ? AND channel = ? AND status = 'confirmado' AND id <> ? AND NOT EXISTS(SELECT 1 FROM retired_assignments r WHERE r.assignment_id=assignments.id) LIMIT 1`),
      confirm: db.prepare("UPDATE assignments SET status = 'confirmado' WHERE id = ? RETURNING id, session_id AS sessionId, person_id AS personId, equipment_id AS equipmentId, channel, status"),
      addReturn: db.prepare('INSERT INTO monitor_returns(session_id, aux) VALUES (?, ?) RETURNING id, session_id AS sessionId, aux'),
      getAuxConfig: db.prepare('SELECT aux_count AS auxCount, source FROM monitor_config WHERE id = 1'),
      setAuxConfig: db.prepare("UPDATE monitor_config SET aux_count = ?, source = 'configurado' WHERE id = 1 RETURNING aux_count AS auxCount, source"),
      maxAux: db.prepare('SELECT max(aux) AS maxAux FROM monitor_returns'),
      listReturns: db.prepare(`SELECT r.id, r.session_id AS sessionId, r.aux,
        (SELECT count(*) FROM monitor_assignments a WHERE a.return_id = r.id AND a.status = 'confirmado') AS confirmedPeople
        FROM monitor_returns r WHERE r.session_id = ? ORDER BY r.aux`),
      proposeMonitor: db.prepare(`INSERT INTO monitor_assignments(session_id, person_id, return_id, status)
        VALUES (?, ?, ?, 'proposto') RETURNING id, session_id AS sessionId, person_id AS personId, return_id AS returnId, status`),
      monitor: db.prepare('SELECT id, session_id AS sessionId, person_id AS personId, return_id AS returnId, status FROM monitor_assignments WHERE id = ?'),
      listMonitors: db.prepare(`SELECT a.id, a.session_id AS sessionId, a.person_id AS personId, a.return_id AS returnId, r.aux, a.status,
        (SELECT count(*) FROM monitor_assignments c WHERE c.return_id = a.return_id AND c.status = 'confirmado') AS confirmedPeople
        FROM monitor_assignments a JOIN monitor_returns r ON r.id = a.return_id WHERE a.session_id = ? ORDER BY a.id`),
      conflictMonitor: db.prepare("SELECT id FROM monitor_assignments WHERE session_id = ? AND person_id = ? AND status = 'confirmado' AND id <> ? LIMIT 1"),
      confirmMonitor: db.prepare("UPDATE monitor_assignments SET status = 'confirmado' WHERE id = ? RETURNING id, session_id AS sessionId, person_id AS personId, return_id AS returnId, status"),
      rejectMonitor: db.prepare("UPDATE monitor_assignments SET status = 'rejeitado' WHERE id = ? RETURNING id, session_id AS sessionId, person_id AS personId, return_id AS returnId, status"),
      revokeMonitor: db.prepare("UPDATE monitor_assignments SET status = 'revogado' WHERE id = ? RETURNING id, session_id AS sessionId, person_id AS personId, return_id AS returnId, status"),
    };
    const pointSelect = `SELECT id, type, label, direction, device_id AS deviceId, equipment_id AS equipmentId,
      person_id AS personId, monitor_return_id AS monitorReturnId, channel FROM signal_points`;
    const linkSelect = `SELECT id, session_id AS sessionId, from_point_id AS fromPointId, to_point_id AS toPointId,
      kind, status, confirmation_origin AS confirmationOrigin, confirmed_at AS confirmedAt FROM signal_links`;
    const voiceSelect = `SELECT id, session_id AS sessionId, phrase, origin, person_id AS personId,
      equipment_id AS equipmentId, channel, status, assignment_id AS assignmentId FROM voice_proposals`;

    function checkCorrectionReferences(revisions, personId, equipmentId, expectedRevision, sessionId, actualSessionId) {
      if (revisions === undefined) return;
      if (!revisions || typeof revisions !== 'object' || Array.isArray(revisions) ||
          Object.keys(revisions).sort().join(',') !== 'equipamento,pessoa' ||
          typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision) ||
          !Number.isSafeInteger(sessionId) || sessionId < 1 || sessionId !== actualSessionId) throw new Error('Revisões ou sessão inválidas');
      for (const [type, id, sql] of [
        ['pessoa', personId, 'SELECT id,name FROM people WHERE id=?'],
        ['equipamento', equipmentId, 'SELECT id,name,kind,color,wireless,capsule,model FROM equipment WHERE id=?'],
      ]) {
        const token = revisions[type];
        if (id === null) {
          if (token !== null) throw new Error('Revisões das referências inválidas');
          continue;
        }
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Revisões das referências inválidas');
        let record = db.prepare(sql).get(id);
        if (record && type === 'equipamento') record = { ...record, wireless: record.wireless === null ? null : Boolean(record.wireless) };
        if (!record || soundcheckRevision(type, record) !== token) throw new Error('Referência alterada ou removida desde a revisão');
      }
    }

    function atomic(action) {
      db.exec('BEGIN IMMEDIATE');
      try { const result = action(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    function sessionFormation(sessionId) {
      validId(sessionId, 'sessionId');
      if (!db.prepare('SELECT 1 FROM sessions WHERE id=?').get(sessionId)) throw new Error('Sessão não encontrada');
      const rows = db.prepare(`SELECT t.id AS teamId,t.name AS teamName,p.id AS personId,p.name AS personName,
          r.id AS roleId,r.name AS roleName FROM session_teams st JOIN teams t ON t.id=st.team_id
        LEFT JOIN session_members sm ON sm.session_id=st.session_id AND sm.team_id=st.team_id
        LEFT JOIN people p ON p.id=sm.person_id
        LEFT JOIN session_roles sr ON sr.session_id=sm.session_id AND sr.team_id=sm.team_id AND sr.person_id=sm.person_id
        LEFT JOIN roles r ON r.id=sr.role_id WHERE st.session_id=? ORDER BY t.id,p.id,r.id`).all(sessionId);
      const teams = [];
      for (const row of rows) {
        let team = teams.at(-1);
        if (!team || team.id !== row.teamId) { team = { id: row.teamId, name: row.teamName, members: [] }; teams.push(team); }
        if (row.personId === null) continue;
        let member = team.members.at(-1);
        if (!member || member.id !== row.personId) { member = { id: row.personId, name: row.personName, roles: [] }; team.members.push(member); }
        if (row.roleId !== null) member.roles.push({ id: row.roleId, name: row.roleName });
      }
      return teams;
    }
    function teamRecord(id) { return db.prepare('SELECT id,name FROM teams WHERE id=?').get(id); }
    function personRecord(id) { return db.prepare('SELECT id,name FROM people WHERE id=?').get(id); }
    function sessionRecord(id) { return db.prepare('SELECT id,name FROM sessions WHERE id=?').get(id); }
    function teamMemberRecord(teamId, personId) {
      const row = db.prepare(`SELECT m.team_id AS teamId,m.person_id AS personId,p.name AS personName FROM team_members m
        JOIN people p ON p.id=m.person_id WHERE m.team_id=? AND m.person_id=?`).get(teamId, personId);
      if (!row) return undefined;
      return { ...row, roles: db.prepare(`SELECT r.id,r.name FROM team_member_roles mr JOIN roles r ON r.id=mr.role_id
        WHERE mr.team_id=? AND mr.person_id=? ORDER BY r.id`).all(teamId, personId) };
    }
    function formationTeam(formation, teamId) { return formation.find(item => item.id === teamId); }
    function formationMember(team, personId) { return team?.members.find(item => item.id === personId); }
    function auth(authorized) {
      if (authorized !== true) throw new Error('Operação não autorizada');
    }
    function optionalId(id, field) { return id === undefined || id === null ? null : validId(id, field); }
    function point(id) { return db.prepare(`${pointSelect} WHERE id = ?`).get(id); }
    function link(id) { return db.prepare(`${linkSelect} WHERE id = ?`).get(id); }
    function voice(id) { return db.prepare(`${voiceSelect} WHERE id = ?`).get(id); }
    function links(sessionId) { return db.prepare(`${linkSelect} WHERE session_id = ? ORDER BY id`).all(sessionId); }
    function validatePointSession(item, sessionId) {
      if (item?.monitorReturnId != null && !db.prepare('SELECT 1 FROM monitor_returns WHERE id = ? AND session_id = ?').get(item.monitorReturnId, sessionId)) {
        throw new Error('Retorno pertence a outra sessão');
      }
    }
    function confirmedPathChannel(sessionId, equipmentId) {
      const allPoints = db.prepare(pointSelect).all();
      const points = new Map(allPoints.map(item => [item.id, item]));
      const outgoing = new Map();
      for (const item of links(sessionId)) {
        if (!['proposto', 'confirmado'].includes(item.status)) continue;
        if (!outgoing.has(item.fromPointId)) outgoing.set(item.fromPointId, []);
        outgoing.get(item.fromPointId).push(item);
      }
      const found = [];
      let uncertain = false, visits = 0;
      function visit(id, hasPatch, seen) {
        if (++visits > 4096) { uncertain = true; return; }
        if (seen.has(id)) { uncertain = true; return; }
        const current = points.get(id);
        if (!current) { uncertain = true; return; }
        if (current.type === 'channel') { if (hasPatch) found.push(current.channel); else uncertain = true; return; }
        const next = outgoing.get(id) ?? [];
        if (!next.some(item => item.status === 'confirmado') || next.some(item => item.status === 'proposto')) uncertain = true;
        const branch = new Set(seen); branch.add(id);
        for (const item of next) if (item.status === 'confirmado' && item.toPointId !== null) {
          visit(item.toPointId, hasPatch || item.kind === 'patch', branch);
        }
      }
      for (const root of allPoints.filter(item => item.type === 'equipment' && item.equipmentId === equipmentId)) {
        visit(root.id, false, new Set());
      }
      if (uncertain || found.length !== 1) throw new Error('Caminho ou patch incompleto ou ambíguo');
      return found[0];
    }

    let closed = false;
    return {
      addPerson(name) {
        return statements.addPerson.get(requiredText(name, 'name'));
      },
      listPeople() { return statements.listPeople.all(); },
      correctPerson(id, { name, expectedRevision } = {}) {
        validId(id, 'id'); name = requiredText(name, 'name');
        if (expectedRevision === undefined) throw new Error('Revisão obrigatória');
        return atomic(() => {
          const before = db.prepare('SELECT id,name FROM people WHERE id=?').get(id);
          if (!before) throw new Error('Pessoa não encontrada');
          assertSoundcheckRevision('pessoa', before, expectedRevision);
          const after = db.prepare('UPDATE people SET name=? WHERE id=? RETURNING id,name').get(name, id);
          db.prepare("INSERT INTO registry_corrections(entity_type,entity_id,before_json,after_json,changed_at) VALUES('pessoa',?,?,?,?)")
            .run(id, JSON.stringify(before), JSON.stringify(after), new Date().toISOString());
          return after;
        });
      },
      addEquipment(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('equipment deve ser um objeto');
        if (input.wireless !== undefined && input.wireless !== null && typeof input.wireless !== 'boolean') {
          throw new TypeError('wireless deve ser booleano ou null');
        }
        const result = statements.addEquipment.get(
          requiredText(input.name, 'name'), requiredText(input.kind, 'kind'), optionalText(input.color, 'color'),
          input.wireless === null || input.wireless === undefined ? null : Number(input.wireless),
          optionalText(input.capsule, 'capsule'), optionalText(input.model, 'model'),
        );
        return { ...result, wireless: result.wireless === null ? null : Boolean(result.wireless) };
      },
      listEquipment(filters = {}) {
        if (!filters || typeof filters !== 'object' || Array.isArray(filters)) throw new TypeError('filters deve ser um objeto');
        const color = optionalText(filters.color, 'color');
        const kind = optionalText(filters.kind, 'kind');
        return statements.listEquipment.all(color, color, kind, kind).map((row) => ({
          ...row, wireless: row.wireless === null ? null : Boolean(row.wireless),
        }));
      },
      correctEquipment(id, input = {}) {
        validId(id, 'id');
        const { expectedRevision, name, kind, color, wireless, capsule, model } = input;
        if (expectedRevision === undefined) throw new Error('Revisão obrigatória');
        if (wireless !== null && typeof wireless !== 'boolean') throw new TypeError('wireless deve ser booleano ou null');
        const values = [requiredText(name, 'name'), requiredText(kind, 'kind'), optionalText(color, 'color'), wireless === null ? null : Number(wireless), optionalText(capsule, 'capsule'), optionalText(model, 'model')];
        return atomic(() => {
          const normalize = row => row && ({ ...row, wireless: row.wireless === null ? null : Boolean(row.wireless) });
          const before = normalize(db.prepare('SELECT id,name,kind,color,wireless,capsule,model FROM equipment WHERE id=?').get(id));
          if (!before) throw new Error('Equipamento não encontrado');
          assertSoundcheckRevision('equipamento', before, expectedRevision);
          const after = normalize(db.prepare('UPDATE equipment SET name=?,kind=?,color=?,wireless=?,capsule=?,model=? WHERE id=? RETURNING id,name,kind,color,wireless,capsule,model').get(...values, id));
          db.prepare("INSERT INTO registry_corrections(entity_type,entity_id,before_json,after_json,changed_at) VALUES('equipamento',?,?,?,?)")
            .run(id, JSON.stringify(before), JSON.stringify(after), new Date().toISOString());
          return after;
        });
      },
      listRegistryCorrections() {
        return db.prepare('SELECT id,entity_type AS entityType,entity_id AS entityId,before_json AS beforeJson,after_json AS afterJson,changed_at AS changedAt FROM registry_corrections ORDER BY id').all()
          .map(item => ({ ...item, before: JSON.parse(item.beforeJson), after: JSON.parse(item.afterJson), beforeJson: undefined, afterJson: undefined }));
      },
      listRetiredAssignments(sessionId) {
        validId(sessionId, 'sessionId');
        return db.prepare(`SELECT r.assignment_id AS assignmentId,r.replacement_id AS replacementId,r.inputs_json AS inputsJson,r.changed_at AS changedAt
          FROM retired_assignments r JOIN assignments a ON a.id=r.assignment_id WHERE a.session_id=? ORDER BY r.assignment_id`).all(sessionId)
          .map(item => ({ ...item, inputs: JSON.parse(item.inputsJson), inputsJson: undefined }));
      },
      createSession(name) { return statements.createSession.get(requiredText(name, 'name')); },
      listSessions() { return statements.listSessions.all(); },
      addTeam(name) { return db.prepare('INSERT INTO teams(name) VALUES(?) RETURNING id,name').get(requiredText(name, 'name')); },
      listTeams() { return db.prepare('SELECT id,name FROM teams ORDER BY id').all(); },
      addRole(name) { return db.prepare('INSERT INTO roles(name) VALUES(?) RETURNING id,name').get(requiredText(name, 'name')); },
      listRoles() { return db.prepare('SELECT id,name FROM roles ORDER BY id').all(); },
      addTeamMember({ teamId, personId } = {}) {
        validId(teamId, 'teamId'); validId(personId, 'personId');
        db.prepare('INSERT INTO team_members(team_id,person_id) VALUES(?,?)').run(teamId, personId);
        return { teamId, personId };
      },
      addTeamMemberReviewed({ teamId, personId, expectedRevision } = {}) {
        validId(teamId, 'teamId'); validId(personId, 'personId');
        return atomic(() => {
          const team = teamRecord(teamId), person = personRecord(personId);
          if (!team || !person) throw new Error('Grupo ou pessoa não encontrado');
          assertTeamSessionRevision('team-member:add', { team, person }, expectedRevision);
          if (teamMemberRecord(teamId, personId)) throw new Error('Pessoa já integrante deste grupo');
          db.prepare('INSERT INTO team_members(team_id,person_id) VALUES(?,?)').run(teamId, personId);
          return { teamId, personId };
        });
      },
      removeTeamMember({ teamId, personId } = {}) {
        validId(teamId, 'teamId'); validId(personId, 'personId');
        return db.prepare('DELETE FROM team_members WHERE team_id=? AND person_id=?').run(teamId, personId).changes === 1;
      },
      removeTeamMemberReviewed({ teamId, personId, expectedRevision } = {}) {
        validId(teamId, 'teamId'); validId(personId, 'personId');
        return atomic(() => {
          const team = teamRecord(teamId), member = teamMemberRecord(teamId, personId);
          if (!team || !member) throw new Error('Grupo ou integrante não encontrado');
          assertTeamSessionRevision('team-member:remove', { team, member }, expectedRevision);
          return db.prepare('DELETE FROM team_members WHERE team_id=? AND person_id=?').run(teamId, personId).changes === 1;
        });
      },
      listTeamMembers(teamId) {
        validId(teamId, 'teamId');
        if (!db.prepare('SELECT 1 FROM teams WHERE id=?').get(teamId)) throw new Error('Grupo não encontrado');
        return db.prepare(`SELECT m.team_id AS teamId,m.person_id AS personId,p.name AS personName FROM team_members m
          JOIN people p ON p.id=m.person_id WHERE m.team_id=? ORDER BY m.person_id`).all(teamId).map(member => ({ ...member,
          roles: db.prepare(`SELECT r.id,r.name FROM team_member_roles mr JOIN roles r ON r.id=mr.role_id
            WHERE mr.team_id=? AND mr.person_id=? ORDER BY r.id`).all(teamId, member.personId) }));
      },
      addTeamMemberRole({ teamId, personId, roleId } = {}) {
        validId(teamId, 'teamId'); validId(personId, 'personId'); validId(roleId, 'roleId');
        db.prepare('INSERT INTO team_member_roles(team_id,person_id,role_id) VALUES(?,?,?)').run(teamId, personId, roleId);
        return { teamId, personId, roleId };
      },
      addTeamMemberRoleReviewed({ teamId, personId, roleId, expectedRevision } = {}) {
        validId(teamId, 'teamId'); validId(personId, 'personId'); validId(roleId, 'roleId');
        return atomic(() => {
          const team = teamRecord(teamId), member = teamMemberRecord(teamId, personId);
          const role = db.prepare('SELECT id,name FROM roles WHERE id=?').get(roleId);
          if (!team || !member || !role) throw new Error('Grupo, integrante ou função não encontrado');
          assertTeamSessionRevision('team-role:add', { team, member, role }, expectedRevision);
          if (member.roles.some(item => item.id === roleId)) throw new Error('Função já vinculada ao integrante');
          db.prepare('INSERT INTO team_member_roles(team_id,person_id,role_id) VALUES(?,?,?)').run(teamId, personId, roleId);
          return { teamId, personId, roleId };
        });
      },
      removeTeamMemberRole({ teamId, personId, roleId } = {}) {
        validId(teamId, 'teamId'); validId(personId, 'personId'); validId(roleId, 'roleId');
        return db.prepare('DELETE FROM team_member_roles WHERE team_id=? AND person_id=? AND role_id=?').run(teamId, personId, roleId).changes === 1;
      },
      removeTeamMemberRoleReviewed({ teamId, personId, roleId, expectedRevision } = {}) {
        validId(teamId, 'teamId'); validId(personId, 'personId'); validId(roleId, 'roleId');
        return atomic(() => {
          const team = teamRecord(teamId), member = teamMemberRecord(teamId, personId);
          const role = db.prepare('SELECT id,name FROM roles WHERE id=?').get(roleId);
          if (!team || !member || !role) throw new Error('Grupo, integrante ou função não encontrado');
          assertTeamSessionRevision('team-role:remove', { team, member, role }, expectedRevision);
          if (!member.roles.some(item => item.id === roleId)) throw new Error('Função não vinculada ao integrante');
          return db.prepare('DELETE FROM team_member_roles WHERE team_id=? AND person_id=? AND role_id=?').run(teamId, personId, roleId).changes === 1;
        });
      },
      addSessionTeam({ sessionId, teamId } = {}) {
        validId(sessionId, 'sessionId'); validId(teamId, 'teamId');
        db.prepare('INSERT INTO session_teams(session_id,team_id) VALUES(?,?)').run(sessionId, teamId);
        return { sessionId, teamId };
      },
      addSessionTeamReviewed({ sessionId, teamId, expectedRevision } = {}) {
        validId(sessionId, 'sessionId'); validId(teamId, 'teamId');
        return atomic(() => {
          const session = sessionRecord(sessionId), team = teamRecord(teamId);
          if (!session || !team) throw new Error('Sessão ou grupo não encontrado');
          const formation = sessionFormation(sessionId);
          assertTeamSessionRevision('session-team:add', { session, team, formation }, expectedRevision);
          if (formationTeam(formation, teamId)) throw new Error('Grupo já associado à sessão');
          db.prepare('INSERT INTO session_teams(session_id,team_id) VALUES(?,?)').run(sessionId, teamId);
          return { sessionId, teamId };
        });
      },
      removeSessionTeam({ sessionId, teamId } = {}) {
        validId(sessionId, 'sessionId'); validId(teamId, 'teamId');
        return db.prepare('DELETE FROM session_teams WHERE session_id=? AND team_id=?').run(sessionId, teamId).changes === 1;
      },
      removeSessionTeamReviewed({ sessionId, teamId, expectedRevision } = {}) {
        validId(sessionId, 'sessionId'); validId(teamId, 'teamId');
        return atomic(() => {
          const session = sessionRecord(sessionId);
          if (!session) throw new Error('Sessão não encontrada');
          const formation = sessionFormation(sessionId), team = formationTeam(formation, teamId);
          if (!team) throw new Error('Grupo não associado à sessão');
          assertTeamSessionRevision('session-team:remove', { session, team, formation }, expectedRevision);
          return db.prepare('DELETE FROM session_teams WHERE session_id=? AND team_id=?').run(sessionId, teamId).changes === 1;
        });
      },
      addSessionMember({ sessionId, teamId, personId } = {}) {
        validId(sessionId, 'sessionId'); validId(teamId, 'teamId'); validId(personId, 'personId');
        db.prepare('INSERT INTO session_members(session_id,team_id,person_id) VALUES(?,?,?)').run(sessionId, teamId, personId);
        return { sessionId, teamId, personId };
      },
      addSessionMemberReviewed({ sessionId, teamId, personId, expectedRevision } = {}) {
        validId(sessionId, 'sessionId'); validId(teamId, 'teamId'); validId(personId, 'personId');
        return atomic(() => {
          const session = sessionRecord(sessionId);
          if (!session) throw new Error('Sessão não encontrada');
          const formation = sessionFormation(sessionId), team = formationTeam(formation, teamId);
          const member = teamMemberRecord(teamId, personId);
          if (!team || !member) throw new Error('Grupo não associado ou integrante não encontrado');
          assertTeamSessionRevision('session-member:add', { session, team, member, formation }, expectedRevision);
          if (formationMember(team, personId)) throw new Error('Integrante já participa desta sessão');
          db.prepare('INSERT INTO session_members(session_id,team_id,person_id) VALUES(?,?,?)').run(sessionId, teamId, personId);
          return { sessionId, teamId, personId };
        });
      },
      removeSessionMember({ sessionId, teamId, personId } = {}) {
        validId(sessionId, 'sessionId'); validId(teamId, 'teamId'); validId(personId, 'personId');
        return db.prepare('DELETE FROM session_members WHERE session_id=? AND team_id=? AND person_id=?').run(sessionId, teamId, personId).changes === 1;
      },
      removeSessionMemberReviewed({ sessionId, teamId, personId, expectedRevision } = {}) {
        validId(sessionId, 'sessionId'); validId(teamId, 'teamId'); validId(personId, 'personId');
        return atomic(() => {
          const session = sessionRecord(sessionId);
          if (!session) throw new Error('Sessão não encontrada');
          const formation = sessionFormation(sessionId), team = formationTeam(formation, teamId);
          const member = teamMemberRecord(teamId, personId);
          if (!team || !member || !formationMember(team, personId)) throw new Error('Participação ou integrante não encontrado');
          assertTeamSessionRevision('session-member:remove', { session, team, member, formation }, expectedRevision);
          return db.prepare('DELETE FROM session_members WHERE session_id=? AND team_id=? AND person_id=?').run(sessionId, teamId, personId).changes === 1;
        });
      },
      addSessionRole({ sessionId, teamId, personId, roleId } = {}) {
        validId(sessionId, 'sessionId'); validId(teamId, 'teamId'); validId(personId, 'personId'); validId(roleId, 'roleId');
        db.prepare('INSERT INTO session_roles(session_id,team_id,person_id,role_id) VALUES(?,?,?,?)').run(sessionId, teamId, personId, roleId);
        return { sessionId, teamId, personId, roleId };
      },
      addSessionRoleReviewed({ sessionId, teamId, personId, roleId, expectedRevision } = {}) {
        validId(sessionId, 'sessionId'); validId(teamId, 'teamId'); validId(personId, 'personId'); validId(roleId, 'roleId');
        return atomic(() => {
          const session = sessionRecord(sessionId);
          if (!session) throw new Error('Sessão não encontrada');
          const formation = sessionFormation(sessionId), team = formationTeam(formation, teamId);
          const participant = formationMember(team, personId), role = db.prepare('SELECT id,name FROM roles WHERE id=?').get(roleId);
          if (!team || !participant || !role) throw new Error('Grupo, participante ou papel não encontrado');
          assertTeamSessionRevision('session-role:add', { session, team, participant, role, formation }, expectedRevision);
          if (participant.roles.some(item => item.id === roleId)) throw new Error('Papel já atribuído nesta sessão');
          db.prepare('INSERT INTO session_roles(session_id,team_id,person_id,role_id) VALUES(?,?,?,?)').run(sessionId, teamId, personId, roleId);
          return { sessionId, teamId, personId, roleId };
        });
      },
      removeSessionRole({ sessionId, teamId, personId, roleId } = {}) {
        validId(sessionId, 'sessionId'); validId(teamId, 'teamId'); validId(personId, 'personId'); validId(roleId, 'roleId');
        return db.prepare('DELETE FROM session_roles WHERE session_id=? AND team_id=? AND person_id=? AND role_id=?').run(sessionId, teamId, personId, roleId).changes === 1;
      },
      removeSessionRoleReviewed({ sessionId, teamId, personId, roleId, expectedRevision } = {}) {
        validId(sessionId, 'sessionId'); validId(teamId, 'teamId'); validId(personId, 'personId'); validId(roleId, 'roleId');
        return atomic(() => {
          const session = sessionRecord(sessionId);
          if (!session) throw new Error('Sessão não encontrada');
          const formation = sessionFormation(sessionId), team = formationTeam(formation, teamId);
          const participant = formationMember(team, personId), role = db.prepare('SELECT id,name FROM roles WHERE id=?').get(roleId);
          if (!team || !participant || !role) throw new Error('Grupo, participante ou papel não encontrado');
          assertTeamSessionRevision('session-role:remove', { session, team, participant, role, formation }, expectedRevision);
          if (!participant.roles.some(item => item.id === roleId)) throw new Error('Papel não atribuído nesta sessão');
          return db.prepare('DELETE FROM session_roles WHERE session_id=? AND team_id=? AND person_id=? AND role_id=?').run(sessionId, teamId, personId, roleId).changes === 1;
        });
      },
      listSessionFormation(sessionId) {
        return sessionFormation(sessionId);
      },
      bindInputSource({ sessionId, inputId, assignmentId } = {}) {
        validId(sessionId, 'sessionId'); validId(assignmentId, 'assignmentId'); validInputId(inputId);
        return atomic(() => {
          const source = statements.assignment.get(assignmentId);
          if (!source || source.sessionId !== sessionId || source.status !== 'confirmado') throw new Error('Fonte confirmada não encontrada nesta sessão');
          if (db.prepare('SELECT 1 FROM input_sources WHERE session_id=? AND input_id=?').get(sessionId, inputId)) {
            throw new Error('Entrada já vinculada nesta sessão; remova explicitamente antes de substituir');
          }
          const bindingId = randomUUID();
          db.prepare('INSERT INTO input_sources(session_id,input_id,assignment_id,binding_id) VALUES (?,?,?,?)').run(sessionId, inputId, assignmentId, bindingId);
          return { sessionId, inputId, assignmentId, bindingId };
        });
      },
      listInputSources(sessionId) {
        validId(sessionId, 'sessionId');
        return db.prepare(`SELECT i.session_id AS sessionId,i.input_id AS inputId,i.assignment_id AS assignmentId,i.binding_id AS bindingId
          FROM input_sources i JOIN assignments a ON a.id=i.assignment_id AND a.session_id=i.session_id
          WHERE i.session_id=? AND a.status='confirmado' AND NOT EXISTS(SELECT 1 FROM retired_assignments r WHERE r.assignment_id=a.id) ORDER BY i.input_id`).all(sessionId);
      },
      unbindInputSource({ sessionId, inputId, expectedBindingId } = {}) {
        validId(sessionId, 'sessionId'); validInputId(inputId);
        if (expectedBindingId !== undefined) {
          if (typeof expectedBindingId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(expectedBindingId)) throw new TypeError('Identidade da associação inválida');
          const result = db.prepare('DELETE FROM input_sources WHERE session_id=? AND input_id=? AND binding_id=?').run(sessionId, inputId, expectedBindingId);
          if (result.changes !== 1) throw new Error('Associação alterada ou removida desde a revisão');
          return true;
        }
        return db.prepare('DELETE FROM input_sources WHERE session_id=? AND input_id=?').run(sessionId, inputId).changes === 1;
      },
      proposeAssignment(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('assignment deve ser um objeto');
        const { sessionId, personId, equipmentId } = input;
        let { channel = null } = input;
        validId(sessionId, 'sessionId'); validId(personId, 'personId'); validId(equipmentId, 'equipmentId');
        if (channel !== null && (!Number.isInteger(channel) || channel < 1 || channel > 24)) throw new RangeError('channel deve ser null ou inteiro entre 1 e 24');
        if (input.expectedReferences === undefined) return statements.addAssignment.get(sessionId, personId, equipmentId, channel);
        const revisions = input.expectedReferences;
        if (!revisions || typeof revisions !== 'object' || Array.isArray(revisions) ||
            Object.keys(revisions).sort().join(',') !== 'equipamento,pessoa,sessao' ||
            Object.values(revisions).some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) {
          throw new Error('Revisões das referências inválidas');
        }
        return atomic(() => {
          const session = db.prepare('SELECT id, name FROM sessions WHERE id=?').get(sessionId);
          const person = db.prepare('SELECT id, name FROM people WHERE id=?').get(personId);
          const row = db.prepare('SELECT id, name, kind, color, wireless, capsule, model FROM equipment WHERE id=?').get(equipmentId);
          const equipment = row && { ...row, wireless: row.wireless === null ? null : Boolean(row.wireless) };
          for (const [type, record] of [['sessao', session], ['pessoa', person], ['equipamento', equipment]]) {
            if (!record || soundcheckRevision(type, record) !== revisions[type]) throw new Error('Referência alterada ou removida desde a revisão');
          }
          return statements.addAssignment.get(sessionId, personId, equipmentId, channel);
        });
      },
      editAssignment(id, { personId, equipmentId, channel = null, expectedRevision, expectedReferences, sessionId } = {}) {
        validId(id, 'id'); validId(personId, 'personId'); validId(equipmentId, 'equipmentId');
        if (channel !== null && (!Number.isInteger(channel) || channel < 1 || channel > 24)) throw new RangeError('channel deve ser null ou inteiro entre 1 e 24');
        return atomic(() => {
          const assignment = statements.assignment.get(id);
          if (!assignment || assignment.status !== 'proposto') throw new Error('Vínculo proposto não encontrado');
          assertSoundcheckRevision('vinculo', assignment, expectedRevision);
          checkCorrectionReferences(expectedReferences, personId, equipmentId, expectedRevision, sessionId, assignment.sessionId);
          return db.prepare(`UPDATE assignments SET person_id=?, equipment_id=?, channel=? WHERE id=? AND status='proposto'
            RETURNING id, session_id AS sessionId, person_id AS personId, equipment_id AS equipmentId, channel, status`).get(personId, equipmentId, channel, id);
        });
      },
      replaceConfirmedAssignmentReviewed(id, input = {}) {
        if (input.expectedReferences === undefined) throw new Error('Revisões das referências obrigatórias');
        return this.replaceConfirmedAssignment(id, input);
      },
      replaceConfirmedAssignment(id, { sessionId, personId, equipmentId, channel = null, expectedRevision, expectedReferences } = {}) {
        validId(id, 'id'); validId(sessionId, 'sessionId'); validId(personId, 'personId'); validId(equipmentId, 'equipmentId');
        if (expectedRevision === undefined) throw new Error('Revisão obrigatória');
        if (channel !== null && (!Number.isInteger(channel) || channel < 1 || channel > 24)) throw new RangeError('Canal inválido');
        return atomic(() => {
          const old = statements.assignment.get(id);
          if (!old || old.sessionId !== sessionId || old.status !== 'confirmado') throw new Error('Vínculo confirmado não encontrado nesta sessão');
          const inputs = db.prepare('SELECT input_id AS inputId,binding_id AS bindingId FROM input_sources WHERE session_id=? AND assignment_id=? ORDER BY input_id').all(sessionId, id);
          assertSoundcheckRevision('substituicao', { ...old, entradasAssociadas: inputs }, expectedRevision);
          checkCorrectionReferences(expectedReferences, personId, equipmentId, expectedRevision, sessionId, old.sessionId);
          const replacement = statements.addAssignment.get(sessionId, personId, equipmentId, channel);
          db.prepare('INSERT INTO retired_assignments(assignment_id,replacement_id,inputs_json,changed_at) VALUES (?,?,?,?)').run(id, replacement.id, JSON.stringify(inputs), new Date().toISOString());
          db.prepare('DELETE FROM input_sources WHERE session_id=? AND assignment_id=?').run(sessionId, id);
          return { anterior: statements.assignment.get(id), proposta: replacement, entradasDesvinculadas: inputs };
        });
      },
      confirmAssignment(id, { expectedRevision } = {}) {
        validId(id, 'id');
        db.exec('BEGIN IMMEDIATE');
        try {
          const assignment = statements.assignment.get(id);
          if (!assignment) throw new Error(`Vínculo ${id} não encontrado`);
          assertSoundcheckRevision('vinculo', assignment, expectedRevision);
          if (assignment.status === 'revogado') throw new Error('Vínculo retirado não pode ser confirmado');
          if (assignment.status === 'confirmado') {
            db.exec('COMMIT');
            return statements.confirm.get(id);
          }
          if (assignment.channel === null) throw new Error('Vínculo sem canal não pode ser confirmado');
          if (statements.conflictEquipment.get(assignment.sessionId, assignment.equipmentId, id)) throw new Error('Equipamento já confirmado nesta sessão');
          if (statements.conflictChannel.get(assignment.sessionId, assignment.channel, id)) throw new Error('Canal já confirmado nesta sessão');
          const result = statements.confirm.get(id);
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
      listAssignments(sessionId) {
        validId(sessionId, 'sessionId');
        return statements.listAssignments.all(sessionId);
      },
      getAuxConfig() {
        const result = statements.getAuxConfig.get();
        if (!result) throw new Error('Configuração de AUX ausente ou inválida');
        return result;
      },
      setAuxConfig(auxCount) {
        validId(auxCount, 'auxCount');
        db.exec('BEGIN IMMEDIATE');
        try {
          const existingMax = statements.maxAux.get().maxAux;
          if (existingMax !== null && existingMax > auxCount) throw new RangeError(`AUX ${existingMax} já cadastrado excede a quantidade solicitada`);
          const result = statements.setAuxConfig.get(auxCount);
          if (!result) throw new Error('Configuração de AUX ausente ou inválida');
          db.exec('COMMIT');
          return result;
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
      addMonitorReturn({ sessionId, aux } = {}) {
        validId(sessionId, 'sessionId'); validId(aux, 'aux');
        db.exec('BEGIN IMMEDIATE');
        try {
          const config = statements.getAuxConfig.get();
          if (!config || config.auxCount === null) throw new Error('Quantidade de AUX não configurada');
          if (aux > config.auxCount) throw new RangeError(`AUX excede a quantidade configurada (${config.auxCount})`);
          const result = statements.addReturn.get(sessionId, aux);
          db.exec('COMMIT');
          return result;
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
      addMonitorReturnReviewed({ sessionId, aux, expectedSessionRevision, expectedConfigRevision } = {}) {
        validId(sessionId, 'sessionId'); validId(aux, 'aux');
        db.exec('BEGIN IMMEDIATE');
        try {
          const session = db.prepare('SELECT id,name FROM sessions WHERE id=?').get(sessionId);
          if (!session) throw new Error('Sessão não encontrada');
          assertRegistryContentRevision('sessao', session, expectedSessionRevision);
          const config = statements.getAuxConfig.get();
          if (!config || config.auxCount === null) throw new Error('Quantidade de AUX não configurada');
          assertRegistryContentRevision('aux-config', config, expectedConfigRevision);
          if (aux > config.auxCount) throw new RangeError(`AUX excede a quantidade configurada (${config.auxCount})`);
          const result = statements.addReturn.get(sessionId, aux);
          db.exec('COMMIT');
          return result;
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
      listMonitorReturns(sessionId) {
        return statements.listReturns.all(validId(sessionId, 'sessionId'));
      },
      proposeMonitorAssignment({ sessionId, personId, returnId } = {}) {
        return statements.proposeMonitor.get(validId(sessionId, 'sessionId'), validId(personId, 'personId'), validId(returnId, 'returnId'));
      },
      proposeMonitorAssignmentReviewed({ sessionId, personId, returnId, expectedSessionRevision, expectedPersonRevision, expectedReturnRevision } = {}) {
        validId(sessionId, 'sessionId'); validId(personId, 'personId'); validId(returnId, 'returnId');
        db.exec('BEGIN IMMEDIATE');
        try {
          const session = db.prepare('SELECT id,name FROM sessions WHERE id=?').get(sessionId);
          if (!session) throw new Error('Sessão não encontrada');
          assertRegistryContentRevision('sessao', session, expectedSessionRevision);
          const person = db.prepare('SELECT id,name FROM people WHERE id=?').get(personId);
          if (!person) throw new Error('Pessoa não encontrada');
          assertRegistryContentRevision('pessoa', person, expectedPersonRevision);
          const monitorReturn = db.prepare(`SELECT r.id,r.session_id AS sessionId,r.aux,
            (SELECT count(*) FROM monitor_assignments a WHERE a.return_id=r.id AND a.status='confirmado') AS confirmedPeople
            FROM monitor_returns r WHERE r.id=? AND r.session_id=?`).get(returnId, sessionId);
          if (!monitorReturn) throw new Error('Retorno não encontrado nesta sessão');
          assertRegistryContentRevision('retorno-cadastro', monitorReturn, expectedReturnRevision);
          const result = statements.proposeMonitor.get(sessionId, personId, returnId);
          db.exec('COMMIT');
          return result;
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
      confirmMonitorAssignment(id, { expectedRevision } = {}) {
        validId(id, 'id');
        db.exec('BEGIN IMMEDIATE');
        try {
          const item = statements.monitor.get(id);
          if (!item) throw new Error(`Vínculo de retorno ${id} não encontrado`);
          assertSoundcheckRevision('retorno', item, expectedRevision);
          if (item.status === 'rejeitado' || item.status === 'revogado') throw new Error('Vínculo rejeitado ou revogado não pode ser confirmado');
          if (statements.conflictMonitor.get(item.sessionId, item.personId, id)) throw new Error('Pessoa já possui retorno confirmado nesta sessão');
          const result = statements.confirmMonitor.get(id);
          db.exec('COMMIT');
          return result;
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
      rejectMonitorAssignment(id, { expectedRevision } = {}) {
        validId(id, 'id');
        db.exec('BEGIN IMMEDIATE');
        try {
          const item = statements.monitor.get(id);
          if (!item) throw new Error(`Vínculo de retorno ${id} não encontrado`);
          if (item.status === 'confirmado' || item.status === 'revogado') throw new Error('Vínculo confirmado ou revogado não pode ser rejeitado');
          assertSoundcheckRevision('retorno', item, expectedRevision);
          const result = statements.rejectMonitor.get(id);
          db.exec('COMMIT');
          return result;
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
      revokeMonitorAssignment(id, { expectedRevision } = {}) {
        validId(id, 'id');
        db.exec('BEGIN IMMEDIATE');
        try {
          const item = statements.monitor.get(id);
          if (!item) throw new Error(`Vínculo de retorno ${id} não encontrado`);
          if (item.status !== 'confirmado') throw new Error('Apenas vínculo confirmado pode ser revogado');
          assertSoundcheckRevision('retorno', item, expectedRevision);
          const result = statements.revokeMonitor.get(id);
          db.exec('COMMIT');
          return result;
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
      listMonitorAssignments(sessionId) {
        return statements.listMonitors.all(validId(sessionId, 'sessionId'));
      },
      addPhysicalDevice({ name, type } = {}) {
        if (!['mesa', 'medusa', 'outro'].includes(type)) throw new TypeError('Tipo de dispositivo inválido');
        return db.prepare('INSERT INTO physical_devices(name,type) VALUES (?,?) RETURNING id,name,type').get(requiredText(name, 'name'), type);
      },
      listPhysicalDevices() { return db.prepare('SELECT id,name,type FROM physical_devices ORDER BY id').all(); },
      addSignalPoint(input = {}) {
        const { type, label, direction = 'unknown' } = input;
        if (!['equipment', 'person', 'monitor_return', 'channel', 'port', 'snake_way', 'mix', 'other'].includes(type)) throw new TypeError('Tipo de ponto inválido');
        if (!['input', 'output', 'bidirectional', 'unknown'].includes(direction)) throw new TypeError('Direção de ponto inválida');
        const deviceId = optionalId(input.deviceId, 'deviceId');
        const equipmentId = optionalId(input.equipmentId, 'equipmentId');
        const personId = optionalId(input.personId, 'personId');
        const monitorReturnId = optionalId(input.monitorReturnId, 'monitorReturnId');
        const channel = optionalId(input.channel, 'channel');
        if ((type === 'equipment') !== (equipmentId !== null) || (type === 'person') !== (personId !== null) ||
            (type === 'monitor_return') !== (monitorReturnId !== null) || (type === 'channel') !== (channel !== null)) {
          throw new Error('Referência incompatível com o tipo de ponto');
        }
        if (channel !== null && channel > 24) throw new RangeError('Canal deve estar entre 1 e 24');
        if (['port', 'snake_way'].includes(type) && deviceId === null) throw new Error('Ponto requer dispositivo');
        if (type === 'snake_way' && !db.prepare("SELECT 1 FROM physical_devices WHERE id = ? AND type = 'medusa'").get(deviceId)) throw new Error('Via requer medusa cadastrada');
        return db.prepare(`INSERT INTO signal_points(type,label,direction,device_id,equipment_id,person_id,monitor_return_id,channel)
          VALUES(?,?,?,?,?,?,?,?) RETURNING id,type,label,direction,device_id AS deviceId,equipment_id AS equipmentId,
          person_id AS personId,monitor_return_id AS monitorReturnId,channel`).get(type, requiredText(label, 'label'), direction, deviceId, equipmentId, personId, monitorReturnId, channel);
      },
      addSignalPointRevised(input = {}, { expectedRevisions } = {}) {
        const { type } = input;
        const required = { port: ['device'], snake_way: ['device'], equipment: ['equipment'], person: ['person'],
          monitor_return: ['monitorReturn', 'session', 'sessionId'] }[type];
        if (!required) throw new Error('Este tipo de ponto não possui referências revisáveis; use o comando legado');
        const referenceFields = { device: 'deviceId', equipment: 'equipmentId', person: 'personId', monitorReturn: 'monitorReturnId' };
        const expectedReferenceField = required.map(key => referenceFields[key]).find(Boolean);
        if (Object.entries(referenceFields).some(([key, field]) => key !== required.find(value => referenceFields[value] === field) && input[field] != null)) {
          throw new Error('Referência extra sem revisão para este tipo de ponto');
        }
        if (!input[expectedReferenceField] && !['channel', 'mix', 'other'].includes(type)) throw new Error('Referência de ponto ausente');
        if (!expectedRevisions || typeof expectedRevisions !== 'object' || Array.isArray(expectedRevisions) ||
            Object.keys(expectedRevisions).sort().join(',') !== [...required].sort().join(',') ||
            Object.entries(expectedRevisions).some(([key, value]) => key !== 'sessionId' && (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)))) {
          throw new Error('Revisões de ponto ausentes, inesperadas ou inválidas');
        }
        if (type === 'monitor_return') validId(expectedRevisions.sessionId, 'sessionId');
        return atomic(() => {
          const current = (table, id) => {
            if (table === 'equipment') {
              const row = db.prepare('SELECT id,name,kind,color,wireless,capsule,model FROM equipment WHERE id=?').get(id);
              return row && { ...row, wireless: row.wireless === null ? null : Boolean(row.wireless) };
            }
            if (table === 'device') return db.prepare('SELECT id,name,type FROM physical_devices WHERE id=?').get(id);
            if (table === 'person') return db.prepare('SELECT id,name FROM people WHERE id=?').get(id);
            if (table === 'session') return db.prepare('SELECT id,name FROM sessions WHERE id=?').get(id);
            if (table === 'monitorReturn') return db.prepare(`SELECT id,session_id AS sessionId,aux,
              (SELECT count(*) FROM monitor_assignments a WHERE a.return_id=r.id AND a.status='confirmado') AS confirmedPeople
              FROM monitor_returns r WHERE id=? AND session_id=?`).get(id, expectedRevisions.sessionId);
            return undefined;
          };
          const idByType = { device: input.deviceId, equipment: input.equipmentId, person: input.personId, monitorReturn: input.monitorReturnId };
          for (const key of required) {
            if (key === 'sessionId') continue;
            const item = key === 'session' ? current('session', expectedRevisions.sessionId) : current(key, idByType[key]);
            const revisionType = { monitorReturn: 'retorno', session: 'sessao', device: 'dispositivo', equipment: 'equipamento', person: 'pessoa' }[key];
            if (!item || physicalRevision(revisionType,
              item) !== expectedRevisions[key]) throw new Error('Referência de ponto alterada ou removida desde a revisão');
          }
          return this.addSignalPoint(input);
        });
      },
      listSignalPoints() { return db.prepare(`${pointSelect} ORDER BY id`).all(); },
      proposeSignalLink({ sessionId, fromPointId, toPointId = null, kind } = {}) {
        validId(sessionId, 'sessionId'); validId(fromPointId, 'fromPointId');
        toPointId = optionalId(toPointId, 'toPointId');
        if (!['physical', 'internal', 'patch'].includes(kind)) throw new TypeError('Tipo de ligação inválido');
        const from = point(fromPointId), to = toPointId === null ? null : point(toPointId);
        if (!from || (toPointId !== null && !to)) throw new Error('Ponto não encontrado');
        validatePointSession(from, sessionId); validatePointSession(to, sessionId);
        return db.prepare(`INSERT INTO signal_links(session_id,from_point_id,to_point_id,kind,status)
          VALUES(?,?,?,?,'proposto') RETURNING id,session_id AS sessionId,from_point_id AS fromPointId,
          to_point_id AS toPointId,kind,status,confirmation_origin AS confirmationOrigin,confirmed_at AS confirmedAt`).get(sessionId, fromPointId, toPointId, kind);
      },
      proposeSignalLinkRevised(input = {}, { expectedRevisions } = {}) {
        const { sessionId, fromPointId } = input;
        let { toPointId = null } = input;
        validId(sessionId, 'sessionId'); validId(fromPointId, 'fromPointId');
        toPointId = optionalId(toPointId, 'toPointId');
        const expectedKeys = ['session', 'fromPoint', 'toPoint', 'fromReturn', 'toReturn'];
        if (!expectedRevisions || typeof expectedRevisions !== 'object' || Array.isArray(expectedRevisions) ||
            Object.keys(expectedRevisions).sort().join(',') !== [...expectedKeys].sort().join(',')) {
          throw new Error('Revisões da ligação ausentes ou inesperadas');
        }
        const isToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
        if (!isToken(expectedRevisions.session) || !isToken(expectedRevisions.fromPoint) ||
            (toPointId === null ? expectedRevisions.toPoint !== 'desconhecido' : !isToken(expectedRevisions.toPoint))) {
          throw new Error('Revisões da ligação inválidas');
        }
        return atomic(() => {
          const session = db.prepare('SELECT id,name FROM sessions WHERE id=?').get(sessionId);
          if (!session || physicalRevision('sessao', session) !== expectedRevisions.session) throw new Error('Sessão alterada ou removida desde a revisão');
          const checkedPoints = new Map();
          for (const [key, id] of [['fromPoint', fromPointId], ['toPoint', toPointId]]) {
            if (id === null) continue;
            const item = point(id);
            if (!item || physicalRevision('ponto', item) !== expectedRevisions[key]) throw new Error('Ponto alterado ou removido desde a revisão');
            validatePointSession(item, sessionId);
            checkedPoints.set(key, item);
          }
          for (const [key, returnKey] of [['fromPoint', 'fromReturn'], ['toPoint', 'toReturn']]) {
            const item = checkedPoints.get(key);
            if (!item || item.type !== 'monitor_return') {
              if (expectedRevisions[returnKey] !== 'desconhecido') throw new Error('Revisão inesperada de retorno');
              continue;
            }
            const monitorReturn = db.prepare(`SELECT id,session_id AS sessionId,aux,
              (SELECT count(*) FROM monitor_assignments a WHERE a.return_id=r.id AND a.status='confirmado') AS confirmedPeople
              FROM monitor_returns r WHERE id=? AND session_id=?`).get(item.monitorReturnId, sessionId);
            if (!monitorReturn || !isToken(expectedRevisions[returnKey]) || physicalRevision('retorno', monitorReturn) !== expectedRevisions[returnKey]) {
              throw new Error('Retorno alterado, removido ou pertencente a outra sessão desde a revisão');
            }
          }
          return this.proposeSignalLink(input);
        });
      },
      confirmSignalLink(id, { origin, expectedRevision } = {}) {
        validId(id, 'id'); origin = requiredText(origin, 'origem');
        return atomic(() => {
          const item = link(id);
          if (!item || item.status !== 'proposto') throw new Error('Ligação proposta não encontrada');
          assertSoundcheckRevision('ligacao', item, expectedRevision);
          const from = point(item.fromPointId), to = item.toPointId === null ? null : point(item.toPointId);
          if (!from || !to) throw new Error('Ligação possui extremidade desconhecida');
          validatePointSession(from, item.sessionId); validatePointSession(to, item.sessionId);
          if (from.direction === 'unknown' || to.direction === 'unknown') throw new Error('Direção desconhecida');
          if (item.kind === 'physical' && (!['output', 'bidirectional'].includes(from.direction) || !['input', 'bidirectional'].includes(to.direction))) throw new Error('Direções físicas incompatíveis');
          if (item.kind === 'patch' && (from.type !== 'port' || !['input', 'bidirectional'].includes(from.direction) || to.type !== 'channel' ||
              !db.prepare("SELECT 1 FROM physical_devices WHERE id=? AND type='mesa'").get(from.deviceId))) throw new Error('Patch requer entrada física da mesa e canal');
          if (to.type !== 'mix' && db.prepare("SELECT 1 FROM signal_links WHERE session_id=? AND to_point_id=? AND status='confirmado' LIMIT 1").get(item.sessionId, item.toPointId)) throw new Error('Destino já possui ligação confirmada');
          const cycle = db.prepare(`WITH RECURSIVE reach(id) AS (SELECT ? UNION SELECT l.to_point_id FROM signal_links l JOIN reach r ON l.from_point_id=r.id
            WHERE l.session_id=? AND l.status='confirmado' AND l.to_point_id IS NOT NULL) SELECT 1 FROM reach WHERE id=? LIMIT 1`).get(item.toPointId, item.sessionId, item.fromPointId);
          if (cycle) throw new Error('Ligação criaria ciclo');
          db.prepare("UPDATE signal_links SET status='confirmado',confirmation_origin=?,confirmed_at=? WHERE id=?").run(origin, new Date().toISOString(), id);
          return link(id);
        });
      },
      rejectSignalLink(id, { expectedRevision } = {}) {
        validId(id, 'id'); return atomic(() => {
          const item = link(id); if (!item || item.status !== 'proposto') throw new Error('Ligação proposta não encontrada');
          assertSoundcheckRevision('ligacao', item, expectedRevision);
          db.prepare("UPDATE signal_links SET status='rejeitado' WHERE id=?").run(id); return link(id);
        });
      },
      revokeSignalLink(id, { expectedRevision } = {}) {
        validId(id, 'id'); return atomic(() => {
          const item = link(id); if (!item || item.status !== 'confirmado') throw new Error('Ligação confirmada não encontrada');
          assertSoundcheckRevision('ligacao', item, expectedRevision);
          db.prepare("UPDATE signal_links SET status='revogado' WHERE id=?").run(id); return link(id);
        });
      },
      listSignalLinks(sessionId) { return links(validId(sessionId, 'sessionId')); },
      traceSignalPath({ sessionId, startPointId } = {}) {
        validId(sessionId, 'sessionId'); validId(startPointId, 'startPointId');
        const start = point(startPointId); if (!start) throw new Error('Ponto não encontrado');
        validatePointSession(start, sessionId);
        const all = links(sessionId), visited = new Set(), queue = [startPointId], result = [], pointIds = new Set([startPointId]), issues = [];
        while (queue.length) {
          const current = queue.shift(); if (visited.has(current)) continue; visited.add(current);
          const outgoing = all.filter(value => value.fromPointId === current);
          const currentPoint = point(current);
          if (!outgoing.some(item => ['proposto', 'confirmado'].includes(item.status)) && !['channel', 'person'].includes(currentPoint.type)) {
            issues.push({ code: 'sem_ligacao', pointId: current });
          }
          for (const item of outgoing) {
            result.push(item);
            if (item.status === 'proposto') {
              issues.push({ code: item.toPointId === null ? 'destino_desconhecido' : 'ligacao_pendente', linkId: item.id });
            }
            if (item.toPointId !== null) {
              pointIds.add(item.toPointId);
              if (['proposto', 'confirmado'].includes(item.status) && !visited.has(item.toPointId)) queue.push(item.toPointId);
            }
          }
        }
        return { startPointId, points: [...pointIds].map(id => point(id)), links: result, issues };
      },
      createVoiceProposal({ sessionId, phrase, origin, personId = null, equipmentId = null, channel = null, authorized, expectedBinding } = {}) {
        auth(authorized); validId(sessionId, 'sessionId');
        personId = optionalId(personId, 'personId'); equipmentId = optionalId(equipmentId, 'equipmentId'); channel = optionalId(channel, 'channel');
        if (channel !== null && channel > 24) throw new RangeError('Canal deve estar entre 1 e 24');
        return atomic(() => {
          if (expectedBinding !== undefined) {
            if (!expectedBinding || expectedBinding.sessionId !== sessionId || expectedBinding.inputId !== origin ||
                !validId(expectedBinding.assignmentId, 'assignmentId') || typeof expectedBinding.bindingId !== 'string') throw new Error('Origem inválida');
            const current = db.prepare(`SELECT i.assignment_id AS assignmentId, i.binding_id AS bindingId FROM input_sources i
              JOIN assignments a ON a.id=i.assignment_id AND a.session_id=i.session_id
              WHERE i.session_id=? AND i.input_id=? AND a.status='confirmado'
              AND NOT EXISTS(SELECT 1 FROM retired_assignments r WHERE r.assignment_id=a.id)`).get(sessionId, origin);
            if (!current || current.assignmentId !== expectedBinding.assignmentId || current.bindingId !== expectedBinding.bindingId) throw new Error('Vínculo da entrada foi alterado');
            if (Object.hasOwn(expectedBinding, 'formation') && JSON.stringify(sessionFormation(sessionId)) !== JSON.stringify(expectedBinding.formation)) {
              throw new Error('Formação da sessão foi alterada');
            }
          }
          const inserted = db.prepare(`INSERT INTO voice_proposals(session_id,phrase,origin,person_id,equipment_id,channel,status)
            VALUES(?,?,?,?,?,?,'proposto') RETURNING id`).get(sessionId, requiredText(phrase, 'phrase', 4000), requiredText(origin, 'origin'), personId, equipmentId, channel);
          return voice(inserted.id);
        });
      },
      discardUnreviewedVoiceProposal(id, { authorized, expectedRevision } = {}) {
        auth(authorized); validId(id, 'id');
        if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new TypeError('Revisão obrigatória');
        return atomic(() => {
          const item = voice(id);
          if (!item || item.status !== 'proposto' || soundcheckRevision('voz', item) !== expectedRevision) return false;
          return db.prepare("DELETE FROM voice_proposals WHERE id=? AND status='proposto'").run(id).changes === 1;
        });
      },
      listVoiceProposals(sessionId) { return db.prepare(`${voiceSelect} WHERE session_id=? ORDER BY id`).all(validId(sessionId, 'sessionId')); },
      editVoiceProposal(id, changes = {}) {
        validId(id, 'id'); auth(changes.authorized);
        if (Object.keys(changes).some(key => !['authorized', 'personId', 'equipmentId', 'channel', 'expectedRevision', 'expectedReferences', 'sessionId'].includes(key))) throw new TypeError('Campo não suportado');
        return atomic(() => {
          const item = voice(id); if (!item || item.status !== 'proposto') throw new Error('Proposta pendente não encontrada');
          assertSoundcheckRevision('voz', item, changes.expectedRevision);
          const personId = Object.hasOwn(changes, 'personId') ? optionalId(changes.personId, 'personId') : item.personId;
          const equipmentId = Object.hasOwn(changes, 'equipmentId') ? optionalId(changes.equipmentId, 'equipmentId') : item.equipmentId;
          const channel = Object.hasOwn(changes, 'channel') ? optionalId(changes.channel, 'channel') : item.channel;
          if (channel !== null && channel > 24) throw new RangeError('Canal deve estar entre 1 e 24');
          checkCorrectionReferences(changes.expectedReferences, personId, equipmentId, changes.expectedRevision, changes.sessionId, item.sessionId);
          db.prepare('UPDATE voice_proposals SET person_id=?, equipment_id=?, channel=? WHERE id=?').run(personId, equipmentId, channel, id);
          return voice(id);
        });
      },
      confirmVoiceProposal(id, { authorized, expectedRevision } = {}) {
        validId(id, 'id'); auth(authorized);
        return atomic(() => {
          const item = voice(id); if (!item || item.status !== 'proposto') throw new Error('Proposta pendente não encontrada');
          assertSoundcheckRevision('voz', item, expectedRevision);
          if (!item.personId || !item.equipmentId || !item.channel) throw new Error('Proposta incompleta');
          if (confirmedPathChannel(item.sessionId, item.equipmentId) !== item.channel) throw new Error('Canal não corresponde ao caminho confirmado');
          if (statements.conflictEquipment.get(item.sessionId, item.equipmentId, 0)) throw new Error('Equipamento já confirmado nesta sessão');
          if (statements.conflictChannel.get(item.sessionId, item.channel, 0)) throw new Error('Canal já confirmado nesta sessão');
          const assignment = statements.addAssignment.get(item.sessionId, item.personId, item.equipmentId, item.channel);
          statements.confirm.get(assignment.id);
          db.prepare("UPDATE voice_proposals SET status='confirmado',assignment_id=? WHERE id=?").run(assignment.id, id);
          return voice(id);
        });
      },
      rejectVoiceProposal(id, { authorized, expectedRevision } = {}) {
        validId(id, 'id'); auth(authorized);
        return atomic(() => {
          const item = voice(id); if (!item || item.status !== 'proposto') throw new Error('Proposta pendente não encontrada');
          assertSoundcheckRevision('voz', item, expectedRevision);
          db.prepare("UPDATE voice_proposals SET status='rejeitado' WHERE id=?").run(id); return voice(id);
        });
      },
      close() { if (!closed) { db.close(); closed = true; } },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
