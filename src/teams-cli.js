function id(value) {
  if (!/^[1-9]\d*$/u.test(value ?? '') || !Number.isSafeInteger(Number(value))) throw new Error('ID inválido');
  return Number(value);
}

export function parseTeamsCommand([category, action, ...values]) {
  if ((category === 'grupo' || category === 'papel') && action === 'listar' && values.length === 0) {
    return registry => category === 'grupo' ? registry.listTeams() : registry.listRoles();
  }
  if ((category === 'grupo' || category === 'papel') && action === 'adicionar' && values.length === 1 && values[0].trim()) {
    return registry => category === 'grupo' ? registry.addTeam(values[0]) : registry.addRole(values[0]);
  }
  if (category === 'formacao' && action === 'mostrar' && values.length === 1) {
    const sessionId = id(values[0]);
    return registry => registry.listSessionFormation(sessionId);
  }
  if (category === 'grupo-integrante' && action === 'listar' && values.length === 1) {
    const teamId = id(values[0]);
    return registry => registry.listTeamMembers(teamId);
  }
  const fields = {
    'grupo-integrante': ['teamId', 'personId'], 'grupo-funcao': ['teamId', 'personId', 'roleId'],
    'sessao-grupo': ['sessionId', 'teamId'], 'sessao-integrante': ['sessionId', 'teamId', 'personId'],
    'sessao-papel': ['sessionId', 'teamId', 'personId', 'roleId'],
  }[category];
  const methods = {
    'grupo-integrante': ['addTeamMember', 'removeTeamMember'], 'grupo-funcao': ['addTeamMemberRole', 'removeTeamMemberRole'],
    'sessao-grupo': ['addSessionTeam', 'removeSessionTeam'], 'sessao-integrante': ['addSessionMember', 'removeSessionMember'],
    'sessao-papel': ['addSessionRole', 'removeSessionRole'],
  };
  const reviewedAction = action?.endsWith('-revisado');
  const baseAction = reviewedAction ? action.slice(0, -'-revisado'.length) : action;
  if (!fields || !['adicionar', 'remover'].includes(baseAction) || values.length !== fields.length + (reviewedAction ? 1 : 0)) {
    throw new Error('Comando de equipe inválido; consulte ajuda.');
  }
  const record = Object.fromEntries(fields.map((field, index) => [field, id(values[index])]));
  const method = methods[category][baseAction === 'adicionar' ? 0 : 1];
  if (!reviewedAction) return registry => registry[method](record);
  const expectedRevision = values.at(-1);
  if (!/^[a-f0-9]{64}$/u.test(expectedRevision ?? '')) throw new Error('Revisão de equipe inválida.');
  return registry => registry[`${method}Reviewed`]({ ...record, expectedRevision });
}
