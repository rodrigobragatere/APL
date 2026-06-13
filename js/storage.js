/**
 * Persistência JSON — localStorage + sync com arquivo seed
 */
const STORAGE_KEY = 'apl_avaliacoes_v1';
const SEED_VERSION = '1.2.0';

export async function loadSeedData() {
  const res = await fetch('data/avaliacoes.json');
  if (!res.ok) throw new Error('Falha ao carregar dados iniciais');
  return res.json();
}

export async function loadSetores() {
  const res = await fetch('data/setores-apl.json');
  if (!res.ok) throw new Error('Falha ao carregar setores');
  return res.json();
}

export async function loadOds() {
  const res = await fetch('data/ods.json');
  if (!res.ok) throw new Error('Falha ao carregar ODS');
  return res.json();
}

export async function loadModelo() {
  const res = await fetch('data/modelo.json');
  if (!res.ok) throw new Error('Falha ao carregar modelo');
  return res.json();
}

export async function loadEstados() {
  const res = await fetch('data/estados.json');
  if (!res.ok) throw new Error('Falha ao carregar estados');
  return res.json();
}

export function getAvaliacoes() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveAvaliacoes(data) {
  data.ultimaAtualizacao = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

export async function initStorage() {
  const seed = await loadSeedData();
  let stored = getAvaliacoes();

  if (!stored || !stored.avaliacoes?.length) {
    stored = seed;
    saveAvaliacoes(stored);
    return stored;
  }

  if (stored.schemaVersion !== SEED_VERSION) {
    const ids = new Set(stored.avaliacoes.map((a) => a.id));
    seed.avaliacoes.forEach((a) => {
      if (!ids.has(a.id)) stored.avaliacoes.push(a);
      else {
        const idx = stored.avaliacoes.findIndex((x) => x.id === a.id);
        const current = stored.avaliacoes[idx];
        if (!current.ibge?.populacao && a.ibge?.populacao) {
          stored.avaliacoes[idx] = { ...current, ...a, indicadores: current.indicadores };
        }
        if (!current.ods?.length && a.ods?.length) {
          stored.avaliacoes[idx] = { ...stored.avaliacoes[idx], ods: a.ods };
        }
      }
    });
    stored.schemaVersion = SEED_VERSION;
    saveAvaliacoes(stored);
  }

  return stored;
}

export function exportJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `apl-avaliacoes-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.avaliacoes || !Array.isArray(data.avaliacoes)) {
          throw new Error('Formato inválido: esperado { avaliacoes: [] }');
        }
        saveAvaliacoes(data);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsText(file);
  });
}

export function upsertAvaliacao(data, avaliacao) {
  const idx = data.avaliacoes.findIndex((a) => a.id === avaliacao.id);
  if (idx >= 0) {
    data.avaliacoes[idx] = avaliacao;
  } else {
    data.avaliacoes.push(avaliacao);
  }
  return saveAvaliacoes(data);
}

export function deleteAvaliacao(data, id) {
  data.avaliacoes = data.avaliacoes.filter((a) => a.id !== id);
  return saveAvaliacoes(data);
}

export function generateId() {
  return `apl-${Date.now().toString(36)}`;
}
