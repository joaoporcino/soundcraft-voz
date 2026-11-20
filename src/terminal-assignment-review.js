export async function passage(registry, sessionId) {
  const output = [];
  await registry(['passagem', 'mostrar', String(sessionId)], { output: value => output.push(value) });
  if (output.length !== 1) throw Error('Resposta de passagem inesperada.');
  return JSON.parse(output[0]);
}

export async function reviewAssignment({ session, record, type, action, registry, screen, ask, write }) {
  try {
    const key = { vinculo: 'vinculos', retorno: 'vinculosRetorno', ligacao: 'ligacoes', voz: 'propostasVoz' }[type];
    const data = await passage(registry, session.id);
    const item = data[key].find(value => value.id === record.id);
    const expected = action === 'revogar' ? 'confirmado' : 'proposto';
    if (!item || item.status !== expected) { write('Vínculo alterado ou indisponível. Atualize a lista.'); return true; }
    let origin;
    if (type === 'ligacao' && action === 'confirmar') {
      origin = await ask('Origem da declaração (vazio cancela): ');
      if (origin === null) return false;
      if (!origin) return true;
    }
    const pointLabel = id => {
      const point = data.pontos.find(value => value.id === id);
      return point ? `${point.label} (ID ${id}; ${point.direction})` : id === null ? 'desconhecido' : `ID ${id} (não encontrado)`;
    };
    const person = data.pessoas.find(value => value.id === item.personId);
    const equipment = data.equipamentos.find(value => value.id === item.equipmentId);
    const returnRecord = data.retornos.find(value => value.id === item.returnId);
    screen('Cadastros', 'Revisar vínculo', [
      `Sessão: ${data.sessao.name} (ID ${data.sessao.id})`, `Vínculo: ${item.id} | Estado: ${item.status}`,
      ...(type === 'ligacao' ? [`Origem: ${pointLabel(item.fromPointId)}`, `Destino: ${pointLabel(item.toPointId)}`, `Tipo: ${item.kind}`, ...(origin ? [`Origem da declaração: ${origin}`] : [])] :
        [...(type === 'voz' ? [`Frase: ${item.phrase}`, `Origem: ${item.origin}`] : []),
          `Pessoa: ${person?.name ?? 'não encontrada'} (ID ${item.personId ?? 'desconhecido'})`, ...(type === 'vinculo' || type === 'voz' ? [`Equipamento: ${equipment?.name ?? 'não encontrado'} (ID ${item.equipmentId ?? 'desconhecido'})`, `Canal: ${item.channel ?? 'desconhecido'}`] : [`Retorno: ${returnRecord ? `AUX ${returnRecord.aux}` : 'não encontrado'} (ID ${item.returnId})`])]),
      `Ação: ${action}. A revisão não cobre mudanças nos cadastros relacionados.`,
      'O cadastro não comprova ligação física. Digite SIM para continuar.',
    ]);
    const confirm = await ask('Confirmar ação? ');
    if (confirm === null) return false;
    if (confirm.toUpperCase() !== 'SIM') { write('Ação cancelada.'); return true; }
    let args;
    if (action === 'confirmar') args = ['passagem', 'confirmar', String(session.id), type, String(item.id), item.revisao, ...(origin ? [origin] : [])];
    else args = ['passagem', `${action}-revisado`, String(session.id), type, String(item.id), item.revisao];
    await registry(args, { output: () => {} });
    write(`Vínculo ${action === 'confirmar' ? 'confirmado' : action === 'rejeitar' ? 'rejeitado' : 'revogado'} no cadastro; a ligação física não foi comprovada.`);
  } catch (error) { write(`Não foi possível executar a ação: ${error.message}`); }
  return (await ask('Enter para voltar à lista: ')) !== null;
}
