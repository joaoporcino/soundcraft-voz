// Presentation contract, not a source of domain permissions or database writes.
export const TERMINAL_CATALOG_VERSION = 2;

const named = (category, title, action = 'adicionar') => ({
  title, list: [category, 'listar'], storage: { readonly: ['id'], public: ['name'], internal: [], computed: [] },
  labels: { id: 'ID', name: 'Nome' },
  create: { fields: [{ key: 'name', label: 'Nome' }], arguments: values => [category, action, values.name] },
});

export const terminalCatalog = {
  pessoa: {
    title: 'Pessoas', list: ['pessoa', 'listar'],
    storage: { readonly: ['id'], public: ['name'], internal: [], computed: [] },
    labels: { id: 'ID', name: 'Nome' },
    create: {
      fields: [{ key: 'name', label: 'Nome' }],
      arguments: values => ['pessoa', 'adicionar', values.name],
    },
  },
  equipamento: {
    title: 'Equipamentos', list: ['equipamento', 'listar'],
    storage: { readonly: ['id'], public: ['name', 'kind', 'color', 'wireless', 'capsule', 'model'], internal: [], computed: [] },
    labels: { id: 'ID', name: 'Nome', kind: 'Tipo', color: 'Cor', wireless: 'Sem fio', capsule: 'Cápsula', model: 'Modelo' },
    create: {
      fields: [
        { key: 'name', label: 'Nome' }, { key: 'kind', label: 'Tipo (ex.: microfone, instrumento)' },
        { key: 'color', label: 'Cor', optional: true },
        { key: 'wireless', label: 'Ligação (1 sem fio, 2 com fio, Enter não informado)', optional: true, options: ['1', '2'] },
        { key: 'capsule', label: 'Cápsula', optional: true }, { key: 'model', label: 'Modelo', optional: true },
      ],
      arguments: values => [
        'equipamento', 'adicionar', values.name, values.kind,
        ...(values.color ? [values.color] : []),
        ...(values.wireless ? [values.wireless === '1' ? '--sem-fio' : '--com-fio'] : []),
        ...(values.capsule ? ['--capsula', values.capsule] : []),
        ...(values.model ? ['--modelo', values.model] : []),
      ],
    },
  },
  sessao: named('sessao', 'Sessões', 'criar'),
  grupo: named('grupo', 'Grupos'),
  papel: named('papel', 'Papéis'),
  'fisico-dispositivo': {
    title: 'Dispositivos físicos', list: ['fisico-dispositivo', 'listar'],
    storage: { readonly: ['id'], public: ['name', 'type'], internal: [], computed: [] },
    labels: { id: 'ID', name: 'Nome', type: 'Tipo' },
    create: { fields: [{ key: 'name', label: 'Nome' }, { key: 'type', label: 'Tipo (mesa, medusa ou outro)', options: ['mesa', 'medusa', 'outro'] }],
      arguments: values => ['fisico-dispositivo', 'adicionar', values.name, values.type.toLowerCase()] },
  },
};
