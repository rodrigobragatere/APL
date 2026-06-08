/**
 * Modelo de cálculo — normalização de indicadores e scores por dimensão
 */

export function getIndicadorMap(modelo) {
  return Object.fromEntries(modelo.indicadores.map((i) => [i.id, i]));
}

export function getCondicionanteMap(modelo) {
  return Object.fromEntries(modelo.condicionantes.map((c) => [c.id, c]));
}

export function getDimensaoMap(modelo) {
  return Object.fromEntries(modelo.dimensoes.map((d) => [d.id, d]));
}

/**
 * Normaliza valor do indicador para escala 0–100
 */
export function normalizarIndicador(valor, indicador) {
  if (valor == null || isNaN(valor)) return 0;
  const { min, max, ideal, inverso } = indicador.faixaReferencia;
  const range = max - min || 1;

  if (inverso) {
    const distFromIdeal = Math.abs(valor - ideal);
    const maxDist = Math.max(ideal - min, max - ideal) || 1;
    return Math.max(0, Math.min(100, 100 - (distFromIdeal / maxDist) * 100));
  }

  if (valor >= ideal) {
    const excess = Math.min(valor - ideal, max - ideal) || 0;
    const headroom = (max - ideal) || 1;
    return Math.min(100, 80 + (excess / headroom) * 20);
  }

  const progress = (valor - min) / range;
  return Math.max(0, Math.min(80, progress * 80));
}

export function calcularScoreIndicadores(avaliacao, modelo) {
  const map = getIndicadorMap(modelo);
  const scores = {};

  for (const [indId, valor] of Object.entries(avaliacao.indicadores || {})) {
    const ind = map[indId];
    if (ind) scores[indId] = normalizarIndicador(Number(valor), ind);
  }

  return scores;
}

export function calcularDimensaoScores(avaliacao, modelo) {
  const indScores = calcularScoreIndicadores(avaliacao, modelo);
  const condMap = getCondicionanteMap(modelo);
  const dimScores = {};
  const dimCounts = {};

  for (const cond of modelo.condicionantes) {
    const score = indScores[cond.indicadorId];
    if (score == null) continue;

    if (!dimScores[cond.dimensaoId]) {
      dimScores[cond.dimensaoId] = 0;
      dimCounts[cond.dimensaoId] = 0;
    }
    dimScores[cond.dimensaoId] += score;
    dimCounts[cond.dimensaoId]++;
  }

  for (const dim of modelo.dimensoes) {
    const qual = avaliacao.qualitativos?.[dim.id];
    if (qual?.nota) {
      const qualScore = (qual.nota / 5) * 100;
      if (!dimScores[dim.id]) {
        dimScores[dim.id] = qualScore;
        dimCounts[dim.id] = 1;
      } else {
        dimScores[dim.id] += qualScore;
        dimCounts[dim.id]++;
      }
    }
  }

  const result = {};
  for (const dim of modelo.dimensoes) {
    const count = dimCounts[dim.id] || 0;
    result[dim.id] = count > 0 ? Math.round(dimScores[dim.id] / count) : 0;
  }

  return result;
}

export function calcularScoreGeral(avaliacao, modelo) {
  const dimScores = calcularDimensaoScores(avaliacao, modelo);
  const values = Object.values(dimScores);
  if (!values.length) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function identificarGargalos(avaliacao, modelo, limiar = 60) {
  const indScores = calcularScoreIndicadores(avaliacao, modelo);
  const indMap = getIndicadorMap(modelo);
  const gargalos = [];

  for (const [indId, score] of Object.entries(indScores)) {
    if (score < limiar) {
      gargalos.push({
        indicadorId: indId,
        indicador: indMap[indId]?.nome || indId,
        score: Math.round(score),
        valor: avaliacao.indicadores[indId],
        unidade: indMap[indId]?.unidade || '',
      });
    }
  }

  return gargalos.sort((a, b) => a.score - b.score);
}

export function getCondicionantesPorDimensao(modelo, dimensaoId) {
  return modelo.condicionantes.filter((c) => c.dimensaoId === dimensaoId);
}

export function getIndicadorParaCondicionante(modelo, condicionanteId) {
  const cond = modelo.condicionantes.find((c) => c.id === condicionanteId);
  if (!cond) return null;
  return modelo.indicadores.find((i) => i.id === cond.indicadorId);
}
