/**
 * Integração com APIs de dados abertos — IBGE
 */
const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1';

const cache = new Map();

async function fetchJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IBGE API: ${res.status} — ${url}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

export async function fetchEstados() {
  return fetchJSON(`${IBGE_BASE}/localidades/estados?orderBy=nome`);
}

export async function fetchMunicipiosPorUF(ufSigla) {
  return fetchJSON(
    `${IBGE_BASE}/localidades/estados/${ufSigla}/municipios?orderBy=nome`
  );
}

export async function fetchPopulacaoMunicipio(codigoMunicipio) {
  try {
    const data = await fetchJSON(
      `https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/2024/variaveis/9324?localidades=N6[${codigoMunicipio}]`
    );
    if (data?.[0]?.resultados?.[0]?.series?.[0]?.serie) {
      const serie = data[0].resultados[0].series[0].serie;
      const ultimoAno = Object.keys(serie).sort().pop();
      return parseInt(serie[ultimoAno], 10);
    }
  } catch { /* fallback */ }
  return null;
}

export async function fetchDadosMunicipio(codigoMunicipio, nome, uf) {
  const populacao = await fetchPopulacaoMunicipio(codigoMunicipio);
  return {
    codigoMunicipio: codigoMunicipio,
    municipio: nome,
    uf,
    populacao,
    sincronizadoEm: new Date().toISOString(),
    fonte: 'IBGE — API de Dados Abertos (SIDRA)',
  };
}

export async function fetchPopulacaoEstado(codigoUF) {
  try {
    const data = await fetchJSON(
      `https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/2024/variaveis/9324?localidades=N3[${codigoUF}]`
    );
    if (data?.[0]?.resultados?.[0]?.series?.[0]?.serie) {
      const serie = data[0].resultados[0].series[0].serie;
      const ultimoAno = Object.keys(serie).sort().pop();
      return parseInt(serie[ultimoAno], 10);
    }
  } catch {
    /* fallback abaixo */
  }
  return null;
}

export async function fetchPIBPerCapitaEstado(codigoUF) {
  try {
    const data = await fetchJSON(
      `https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos/2021/variaveis/37?localidades=N3[${codigoUF}]`
    );
    if (data?.[0]?.resultados?.[0]?.series?.[0]?.serie) {
      const serie = data[0].resultados[0].series[0].serie;
      const ultimoAno = Object.keys(serie).sort().pop();
      return parseFloat(serie[ultimoAno]);
    }
  } catch {
    /* fallback */
  }
  return null;
}

export async function fetchDadosEstado(ufInfo) {
  const [populacao, pibPerCapita] = await Promise.all([
    fetchPopulacaoEstado(ufInfo.codigoIbge),
    fetchPIBPerCapitaEstado(ufInfo.codigoIbge),
  ]);

  return {
    sigla: ufInfo.sigla,
    nome: ufInfo.nome,
    regiao: ufInfo.regiao,
    codigoIbge: ufInfo.codigoIbge,
    populacao,
    pibPerCapita,
    sincronizadoEm: new Date().toISOString(),
    fonte: 'IBGE — API de Dados Abertos',
  };
}

export async function buscarMunicipio(nome, ufSigla) {
  const municipios = await fetchMunicipiosPorUF(ufSigla);
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return municipios.find((m) => norm(m.nome) === norm(nome)) || null;
}

export async function sincronizarTodosEstados(estadosJson) {
  const results = [];
  for (const uf of estadosJson.ufs) {
    try {
      const dados = await fetchDadosEstado(uf);
      results.push(dados);
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      results.push({
        sigla: uf.sigla,
        nome: uf.nome,
        erro: err.message,
      });
    }
  }
  return results;
}

export function formatNumber(n) {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR');
}

export function formatCurrency(n) {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
