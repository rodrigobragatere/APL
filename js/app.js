/**
 * APL — Sistema de Avaliação de Desempenho
 * Baseado no Capítulo 3: Cardoso & Mendonça
 */
import {
  initStorage, getAvaliacoes, saveAvaliacoes, exportJSON, importJSON,
  upsertAvaliacao, deleteAvaliacao, generateId, loadEstados, loadSetores, loadOds,
} from './storage.js';
import {
  calcularDimensaoScores, calcularScoreGeral, identificarGargalos,
  getIndicadorMap, getCondicionantesPorDimensao, getIndicadorParaCondicionante,
  calcularScoreIndicadores,
} from './model.js';
import { loadModelo } from './storage.js';
import {
  fetchDadosEstado, sincronizarTodosEstados, formatNumber, formatCurrency, buscarMunicipio,
} from './ibge-api.js';

let state = {
  data: null,
  modelo: null,
  estados: null,
  setores: null,
  ods: null,
  ibgeCache: {},
  charts: {},
  editingId: null,
};

/* ── Utilities ── */
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function destroyChart(id) {
  if (state.charts[id]) {
    state.charts[id].destroy();
    delete state.charts[id];
  }
}

function baseChartOptions(overrides = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: 8 },
    plugins: {
      legend: {
        labels: {
          font: { size: 11 },
          padding: 12,
          boxWidth: 12,
        },
      },
    },
    ...overrides,
  };
}

/* ── Navigation ── */
function initNav() {
  $$('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      $$('.nav-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.view').forEach((v) => {
        v.classList.remove('active');
        v.hidden = true;
      });
      const target = document.getElementById(`view-${view}`);
      target.classList.add('active');
      target.hidden = false;
      renderView(view);
    });
  });
}

function renderView(view) {
  switch (view) {
    case 'dashboard': renderDashboard(); break;
    case 'avaliacoes': renderAvaliacoes(); break;
    case 'nova-avaliacao': renderForm(); break;
    case 'comparar': renderComparar(); break;
    case 'modelo': renderModelo(); break;
    case 'ibge': renderIbge(); break;
  }
}

/* ── UF selects ── */
function populateUFSelects() {
  const ufs = state.estados.ufs;
  const selects = ['#dash-filter-uf', '#form-uf', '#ibge-uf', '#compare-a', '#compare-b'];
  selects.forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    const current = el.value;
    const isCompare = sel.includes('compare');
    const isFilter = sel === '#dash-filter-uf';

    el.innerHTML = isFilter || isCompare
      ? `<option value="">${isFilter ? 'Todas as UFs' : 'Selecione...'}</option>`
      : '<option value="">Selecione...</option>';

    ufs.forEach((uf) => {
      el.innerHTML += `<option value="${uf.sigla}">${uf.sigla} — ${uf.nome}</option>`;
    });
    if (current) el.value = current;
  });
}

function getTopicoNome(id) {
  return state.setores?.topicos.find((t) => t.id === id)?.nome || id || '—';
}

function getTopicoCor(id) {
  return state.setores?.topicos.find((t) => t.id === id)?.cor || '#007247';
}

function getOdsInfo(numero) {
  return state.ods?.objetivos.find((o) => o.numero === numero);
}

function renderOdsBadges(odsNumeros, { size = 'sm' } = {}) {
  if (!odsNumeros?.length || !state.ods) return '';
  const sorted = [...odsNumeros].sort((a, b) => a - b);
  return `
    <div class="ods-badges ods-badges--${size}" aria-label="Objetivos de Desenvolvimento Sustentável">
      <span class="ods-badges__label">ODS</span>
      ${sorted.map((num) => {
        const ods = getOdsInfo(num);
        if (!ods) return '';
        return `<span class="ods-badge" style="background:${ods.cor}" title="ODS ${ods.numero} — ${ods.nome}">${ods.numero}</span>`;
      }).join('')}
    </div>
  `;
}

function populateTopicoSelect() {
  const el = $('#dash-filter-topico');
  if (!el || !state.setores) return;
  const current = el.value;
  el.innerHTML = '<option value="">Todos os tópicos</option>';
  state.setores.topicos.forEach((t) => {
    el.innerHTML += `<option value="${t.id}">${t.nome}</option>`;
  });
  if (current) el.value = current;
}

/* ── Dashboard ── */
function getFilteredAvaliacoes() {
  const uf = $('#dash-filter-uf')?.value;
  const topico = $('#dash-filter-topico')?.value;
  return state.data.avaliacoes.filter((a) => {
    if (uf && a.uf !== uf) return false;
    if (topico && a.topico !== topico) return false;
    return true;
  });
}

function renderDashboard() {
  const apls = getFilteredAvaliacoes();
  const dims = state.modelo.dimensoes;

  const scores = apls.map((a) => ({
    ...a,
    scoreGeral: calcularScoreGeral(a, state.modelo),
    dimScores: calcularDimensaoScores(a, state.modelo),
  }));

  const avgScore = scores.length
    ? Math.round(scores.reduce((s, a) => s + a.scoreGeral, 0) / scores.length)
    : 0;

  const allGargalos = scores.flatMap((a) =>
    identificarGargalos(a, state.modelo).map((g) => ({ ...g, apl: a.nome, aplId: a.id }))
  );

  const regioes = [...new Set(apls.map((a) => a.regiao))];
  const casosConhecidos = apls.filter((a) => a.casoConhecido);
  const popTotal = apls.reduce((s, a) => s + (a.ibge?.populacao || 0), 0);
  const aplsComPib = apls.filter((a) => a.ibge?.pibPerCapita && a.ibge?.populacao);
  const pibMedio = aplsComPib.length
    ? Math.round(aplsComPib.reduce((s, a) => s + a.ibge.pibPerCapita, 0) / aplsComPib.length)
    : 0;
  const pibTotal = aplsComPib.reduce((s, a) => s + a.ibge.pibPerCapita * a.ibge.populacao, 0);
  const pibTotalFmt = pibTotal >= 1e9
    ? `R$ ${(pibTotal / 1e9).toFixed(1).replace('.', ',')} bi`
    : pibTotal >= 1e6
      ? `R$ ${(pibTotal / 1e6).toFixed(1).replace('.', ',')} mi`
      : pibTotal ? formatCurrency(pibTotal).replace(',00', '') : '—';
  const topicosAtivos = [...new Set(apls.map((a) => a.topico).filter(Boolean))];

  $('#kpi-grid').innerHTML = `
    <div class="kpi-card kpi-card--wide kpi-card--warning">
      <div class="kpi-card__info">
        <div class="kpi-card__label">Gargalos</div>
        <div class="kpi-card__sub">Indicadores &lt; 60% — prioridade de intervenção</div>
      </div>
      <div class="kpi-card__value">${allGargalos.length}</div>
    </div>
    <div class="kpi-card kpi-card--primary">
      <div class="kpi-card__label">APLs Cadastrados</div>
      <div class="kpi-card__value">${apls.length}</div>
      <div class="kpi-card__sub">${casosConhecidos.length} casos conhecidos</div>
    </div>
    <div class="kpi-card kpi-card--topicos">
      <div class="kpi-card__label">Tópicos Setoriais</div>
      <div class="kpi-card__value">${topicosAtivos.length}</div>
      <div class="kpi-card__sub">${regioes.length} regiões</div>
    </div>
    <div class="kpi-card kpi-card--success">
      <div class="kpi-card__label">Score Médio</div>
      <div class="kpi-card__value">${avgScore}</div>
      <div class="kpi-card__sub">Escala 0–100</div>
    </div>
    <div class="kpi-card kpi-card--ibge">
      <div class="kpi-card__label">População (IBGE)</div>
      <div class="kpi-card__value">${popTotal >= 1e6 ? `${(popTotal / 1e6).toFixed(1)}M` : formatNumber(popTotal)}</div>
      <div class="kpi-card__sub">Soma municípios-sede</div>
    </div>
    <div class="kpi-card kpi-card--wide-half kpi-card--ibge">
      <div class="kpi-card__info">
        <div class="kpi-card__label">PIB per capita total</div>
        <div class="kpi-card__sub">IBGE — PIB Municipal · total dos municípios-sede</div>
      </div>
      <div class="kpi-card__value">${pibTotalFmt}</div>
    </div>
    <div class="kpi-card kpi-card--wide-half kpi-card--ibge">
      <div class="kpi-card__info">
        <div class="kpi-card__label">PIB per capita médio</div>
        <div class="kpi-card__sub">IBGE — PIB Municipal · média dos municípios-sede</div>
      </div>
      <div class="kpi-card__value">${pibMedio ? formatCurrency(pibMedio).replace(',00', '') : '—'}</div>
    </div>
  `;

  renderRadarChart(scores, dims);
  renderTopicosChart(scores);
  renderDistribuicaoChart(apls);
  renderRanking(scores);
  renderCasosIbgeGrid(apls);
  renderIbgeRegiaoChart(apls);
  renderGargalos(allGargalos);
}

function renderRadarChart(scores, dims) {
  destroyChart('dimensoes');
  const ctx = document.getElementById('chart-dimensoes');
  if (!ctx) return;

  const avgDims = dims.map((d) => {
    if (!scores.length) return 0;
    const sum = scores.reduce((s, a) => s + (a.dimScores[d.id] || 0), 0);
    return Math.round(sum / scores.length);
  });

  state.charts.dimensoes = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: dims.map((d) => d.nome),
      datasets: [{
        label: 'Score Médio',
        data: avgDims,
        backgroundColor: 'rgba(0, 114, 71, 0.2)',
        borderColor: '#007247',
        borderWidth: 2,
        pointBackgroundColor: '#007247',
      }],
    },
    options: baseChartOptions({
      layout: { padding: 18 },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 20, font: { size: 10 } },
          pointLabels: { font: { size: 10 } },
        },
      },
      plugins: { legend: { display: false } },
    }),
  });
}

function renderTopicosChart(scores) {
  destroyChart('topicos');
  const ctx = document.getElementById('chart-topicos');
  if (!ctx || !state.setores) return;

  const topicos = state.setores.topicos;
  const data = topicos.map((t) => {
    const grupo = scores.filter((a) => a.topico === t.id);
    if (!grupo.length) return 0;
    return Math.round(grupo.reduce((s, a) => s + a.scoreGeral, 0) / grupo.length);
  });

  state.charts.topicos = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topicos.map((t) => t.nome.replace('Tecnologia da Informação', 'TI').replace('Turismo Regional', 'Turismo')),
      datasets: [{
        label: 'Score médio',
        data,
        backgroundColor: topicos.map((t) => t.cor),
        borderRadius: 6,
      }],
    },
    options: baseChartOptions({
      scales: {
        x: { ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 } },
        y: { min: 0, max: 100, ticks: { stepSize: 20, font: { size: 10 } } },
      },
      plugins: { legend: { display: false } },
    }),
  });
}

function renderDistribuicaoChart(apls) {
  destroyChart('distribuicao');
  const ctx = document.getElementById('chart-distribuicao');
  if (!ctx || !state.setores) return;

  const counts = state.setores.topicos.map((t) => ({
    nome: t.nome,
    count: apls.filter((a) => a.topico === t.id).length,
    cor: t.cor,
  })).filter((c) => c.count > 0);

  state.charts.distribuicao = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: counts.map((c) => c.nome),
      datasets: [{
        data: counts.map((c) => c.count),
        backgroundColor: counts.map((c) => c.cor),
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: baseChartOptions({
      plugins: {
        legend: {
          position: 'bottom',
          display: counts.length > 1,
          labels: { font: { size: 10 }, padding: 8, boxWidth: 10 },
        },
      },
    }),
  });
}

function renderCasosIbgeGrid(apls) {
  const el = $('#casos-ibge-grid');
  const casos = apls.filter((a) => a.casoConhecido).sort((a, b) => (a.topico || '').localeCompare(b.topico || ''));

  if (!casos.length) {
    el.innerHTML = '<p class="empty-state">Nenhum caso conhecido no filtro atual.</p>';
    return;
  }

  el.innerHTML = casos.map((a) => {
    const ib = a.ibge || {};
    const cor = getTopicoCor(a.topico);
    const score = calcularScoreGeral(a, state.modelo);
    return `
      <article class="caso-ibge-card" style="border-top-color:${cor}">
        <div class="caso-ibge-card__top">
          <span class="caso-ibge-card__topico" style="background:${cor}22;color:${cor}">${getTopicoNome(a.topico)}</span>
          <span class="caso-ibge-card__score">${score}</span>
        </div>
        <h3 class="caso-ibge-card__nome">${a.nome}</h3>
        <p class="caso-ibge-card__local">${a.municipio}/${a.uf} · ${a.setor}</p>
        ${renderOdsBadges(a.ods)}
        <div class="caso-ibge-card__stats">
          <div class="caso-ibge-stat">
            <span>População</span>
            <strong>${formatNumber(ib.populacao)}</strong>
          </div>
          <div class="caso-ibge-stat">
            <span>PIB per capita</span>
            <strong>${formatCurrency(ib.pibPerCapita)}</strong>
          </div>
          <div class="caso-ibge-stat">
            <span>IDHM</span>
            <strong>${ib.idhm ?? '—'}</strong>
          </div>
          <div class="caso-ibge-stat">
            <span>${ib.indicadorSetorial?.label || 'Indicador setorial'}</span>
            <strong>${ib.indicadorSetorial ? `${formatNumber(ib.indicadorSetorial.valor)} ${ib.indicadorSetorial.unidade}` : '—'}</strong>
          </div>
        </div>
        <p class="caso-ibge-card__fonte">${ib.fonte || 'IBGE'}</p>
      </article>
    `;
  }).join('');
}

function renderIbgeRegiaoChart(apls) {
  destroyChart('ibgeRegiao');
  const ctx = document.getElementById('chart-ibge-regiao');
  if (!ctx) return;

  const regioes = state.estados.regioes;
  const popPorRegiao = regioes.map((r) => {
    const nome = r.nome;
    const pop = apls
      .filter((a) => a.regiao === nome)
      .reduce((s, a) => s + (a.ibge?.populacao || 0), 0);
    return { nome, pop };
  }).filter((r) => r.pop > 0);

  state.charts.ibgeRegiao = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: popPorRegiao.map((r) => r.nome),
      datasets: [{
        label: 'População total (municípios-sede)',
        data: popPorRegiao.map((r) => r.pop),
        backgroundColor: 'rgba(0, 114, 71, 0.75)',
        borderRadius: 6,
      }],
    },
    options: baseChartOptions({
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => formatNumber(ctx.raw) },
        },
      },
      scales: {
        x: {
          ticks: {
            font: { size: 10 },
            callback: (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : formatNumber(v)),
          },
        },
        y: { ticks: { font: { size: 11 } } },
      },
    }),
  });
}

function renderRanking(scores) {
  const sorted = [...scores].sort((a, b) => b.scoreGeral - a.scoreGeral);
  const el = $('#ranking-list');

  if (!sorted.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state__icon">◈</div><p>Nenhum APL cadastrado</p></div>';
    return;
  }

  el.innerHTML = sorted.map((a, i) => `
    <div class="ranking-item">
      <span class="ranking-item__pos">${i + 1}º</span>
      <div>
        <div class="ranking-item__name">${a.nome}</div>
        <div class="ranking-item__meta">${a.municipio}/${a.uf} · ${getTopicoNome(a.topico)}</div>
      </div>
      <span class="ranking-item__score">${a.scoreGeral}</span>
    </div>
  `).join('');
}

function renderGargalos(gargalos) {
  const el = $('#gargalos-grid');
  if (!gargalos.length) {
    el.innerHTML = '<p class="empty-state">Nenhum gargalo crítico identificado — todos os indicadores acima de 60%.</p>';
    return;
  }

  el.innerHTML = gargalos.slice(0, 12).map((g) => `
    <div class="gargalo-card">
      <div class="gargalo-card__apl">${g.apl}</div>
      <div class="gargalo-card__ind">${g.indicador}</div>
      <div class="gargalo-card__val">Score: ${g.score}% · Valor: ${g.valor} ${g.unidade}</div>
    </div>
  `).join('');
}

/* ── Avaliações list ── */
function renderAvaliacoes() {
  const el = $('#avaliacoes-grid');
  const apls = state.data.avaliacoes;

  if (!apls.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state__icon">☰</div><p>Nenhuma avaliação cadastrada. <button class="btn btn--primary nav-trigger" data-view="nova-avaliacao">Criar primeira avaliação</button></p></div>';
    el.querySelector('.nav-trigger')?.addEventListener('click', () => {
      $(`.nav-btn[data-view="nova-avaliacao"]`)?.click();
    });
    return;
  }

  el.innerHTML = apls.map((a) => {
    const dimScores = calcularDimensaoScores(a, state.modelo);
    const scoreGeral = calcularScoreGeral(a, state.modelo);

    const bars = state.modelo.dimensoes.map((d) => `
      <div class="dim-bar">
        <div class="dim-bar__label">
          <span>${d.nome}</span>
          <span>${dimScores[d.id]}%</span>
        </div>
        <div class="dim-bar__track">
          <div class="dim-bar__fill" style="width:${dimScores[d.id]}%;background:${d.cor}"></div>
        </div>
      </div>
    `).join('');

    return `
      <article class="apl-card" data-id="${a.id}">
        <div class="apl-card__header">
          <h3 class="apl-card__title">${a.nome}</h3>
          <span class="apl-card__badge">${a.uf}</span>
        </div>
        <div class="apl-card__meta">${a.setor} · ${a.municipio} · ${a.regiao} · Score: <strong>${scoreGeral}</strong></div>
        ${a.topico ? `<span class="apl-card__topico" style="background:${getTopicoCor(a.topico)}22;color:${getTopicoCor(a.topico)}">${getTopicoNome(a.topico)}</span>` : ''}
        ${renderOdsBadges(a.ods)}
        ${a.ibge?.populacao ? `<div class="apl-card__ibge">IBGE: ${formatNumber(a.ibge.populacao)} hab. · PIB/cap. ${formatCurrency(a.ibge.pibPerCapita)}</div>` : ''}
        <div class="dim-bars">${bars}</div>
        <div class="apl-card__actions">
          <button class="btn btn--ghost btn--sm btn-edit" data-id="${a.id}">Editar</button>
          <button class="btn btn--ghost btn--sm btn-delete" data-id="${a.id}">Excluir</button>
        </div>
      </article>
    `;
  }).join('');

  el.querySelectorAll('.btn-edit').forEach((btn) => {
    btn.addEventListener('click', () => editAvaliacao(btn.dataset.id));
  });
  el.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
  });
}

function editAvaliacao(id) {
  state.editingId = id;
  $(`.nav-btn[data-view="nova-avaliacao"]`)?.click();
}

function confirmDelete(id) {
  const a = state.data.avaliacoes.find((x) => x.id === id);
  if (confirm(`Excluir avaliação "${a?.nome}"?`)) {
    deleteAvaliacao(state.data, id);
    toast('Avaliação excluída', 'success');
    renderAvaliacoes();
  }
}

/* ── Form ── */
function renderForm() {
  const indMap = getIndicadorMap(state.modelo);
  const indContainer = $('#indicadores-form');
  const qualContainer = $('#qualitativos-form');
  const form = $('#form-avaliacao');

  indContainer.innerHTML = state.modelo.indicadores.map((ind) => {
    const inputType = ind.tipo === 'qualitativo' ? 'select' : 'number';
    let inputHTML;

    if (ind.tipo === 'qualitativo' && ind.escalaQualitativa) {
      inputHTML = `<select name="ind_${ind.id}" data-ind="${ind.id}">
        ${ind.escalaQualitativa.map((e) => `<option value="${e.valor}">${e.rotulo} (${e.valor})</option>`).join('')}
      </select>`;
    } else {
      inputHTML = `<input type="number" name="ind_${ind.id}" data-ind="${ind.id}" step="any" min="0"
        placeholder="Ex.: ${ind.faixaReferencia.ideal}">`;
    }

    return `
      <div class="indicador-field">
        <div class="indicador-field__name">${ind.nome}</div>
        <div class="indicador-field__hint">${ind.interpretacao}</div>
        <span class="indicador-field__unit">${ind.unidade}</span>
        ${inputHTML}
      </div>
    `;
  }).join('');

  qualContainer.innerHTML = state.modelo.dimensoes.map((dim) => `
    <div class="qual-field" style="border-left-color:${dim.cor}">
      <div class="qual-field__name">${dim.nome}</div>
      <label class="field">
        <span>Nota (1–5)</span>
        <input type="range" name="qual_${dim.id}" min="1" max="5" value="3" data-qual="${dim.id}">
      </label>
      <label class="field">
        <span>Comentário</span>
        <input type="text" name="qual_comment_${dim.id}" placeholder="Observação qualitativa...">
      </label>
    </div>
  `).join('');

  const odsContainer = $('#ods-form');
  if (odsContainer && state.ods) {
    odsContainer.innerHTML = state.ods.objetivos.map((ods) => `
      <label class="ods-check" style="--ods-color:${ods.cor}">
        <input type="checkbox" name="ods" value="${ods.numero}">
        <span class="ods-check__badge">${ods.numero}</span>
        <span class="ods-check__nome">${ods.nome}</span>
      </label>
    `).join('');
  }

  if (state.editingId) {
    const a = state.data.avaliacoes.find((x) => x.id === state.editingId);
    if (a) {
      form.nome.value = a.nome;
      form.setor.value = a.setor;
      form.uf.value = a.uf;
      form.municipio.value = a.municipio;
      form.anoReferencia.value = a.anoReferencia || 2025;
      form.observacoes.value = a.observacoes || '';
      form.editId.value = a.id;

      for (const [indId, val] of Object.entries(a.indicadores || {})) {
        const input = form.querySelector(`[data-ind="${indId}"]`);
        if (input) input.value = val;
      }

      for (const [dimId, qual] of Object.entries(a.qualitativos || {})) {
        const range = form.querySelector(`[data-qual="${dimId}"]`);
        const comment = form.querySelector(`[name="qual_comment_${dimId}"]`);
        if (range) range.value = qual.nota || 3;
        if (comment) comment.value = qual.comentario || '';
      }

      form.querySelectorAll('[name="ods"]').forEach((cb) => {
        cb.checked = (a.ods || []).includes(parseInt(cb.value, 10));
      });
    }
  } else {
    form.reset();
    form.editId.value = '';
    form.anoReferencia.value = 2025;
    form.querySelectorAll('[name="ods"]').forEach((cb) => { cb.checked = false; });
  }
}

function handleFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);

  const uf = fd.get('uf');
  const ufInfo = state.estados.ufs.find((u) => u.sigla === uf);

  const indicadores = {};
  state.modelo.indicadores.forEach((ind) => {
    const val = fd.get(`ind_${ind.id}`);
    if (val !== null && val !== '') indicadores[ind.id] = parseFloat(val);
  });

  const qualitativos = {};
  state.modelo.dimensoes.forEach((dim) => {
    qualitativos[dim.id] = {
      nota: parseInt(fd.get(`qual_${dim.id}`), 10) || 3,
      comentario: fd.get(`qual_comment_${dim.id}`) || '',
    };
  });

  const editId = fd.get('editId');
  const existing = editId ? state.data.avaliacoes.find((a) => a.id === editId) : null;
  const ods = [...fd.getAll('ods')].map((v) => parseInt(v, 10)).filter(Boolean).sort((a, b) => a - b);

  const avaliacao = {
    ...(existing || {}),
    id: editId || generateId(),
    nome: fd.get('nome'),
    setor: fd.get('setor'),
    uf,
    municipio: fd.get('municipio'),
    regiao: ufInfo?.regiao || '',
    anoReferencia: parseInt(fd.get('anoReferencia'), 10) || 2025,
    observacoes: fd.get('observacoes') || '',
    ods,
    indicadores,
    qualitativos,
    ibge: existing?.ibge || { populacao: null, pibPerCapita: null, sincronizadoEm: null },
  };

  upsertAvaliacao(state.data, avaliacao);
  state.editingId = null;
  toast('Avaliação salva com sucesso!', 'success');
  $(`.nav-btn[data-view="avaliacoes"]`)?.click();
}

/* ── Comparar ── */
function renderComparar() {
  const selects = ['#compare-a', '#compare-b'];
  selects.forEach((sel) => {
    const el = $(sel);
    el.innerHTML = '<option value="">Selecione...</option>';
    state.data.avaliacoes.forEach((a) => {
      el.innerHTML += `<option value="${a.id}">${a.nome} (${a.uf})</option>`;
    });
  });
}

function doCompare() {
  const idA = $('#compare-a').value;
  const idB = $('#compare-b').value;
  if (!idA || !idB) { toast('Selecione dois APLs', 'error'); return; }
  if (idA === idB) { toast('Selecione APLs diferentes', 'error'); return; }

  const aA = state.data.avaliacoes.find((a) => a.id === idA);
  const aB = state.data.avaliacoes.find((a) => a.id === idB);
  const dims = state.modelo.dimensoes;
  const scoresA = calcularDimensaoScores(aA, state.modelo);
  const scoresB = calcularDimensaoScores(aB, state.modelo);

  destroyChart('comparar');
  const ctx = document.getElementById('chart-comparar');
  state.charts.comparar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dims.map((d) => d.nome),
      datasets: [
        { label: aA.nome, data: dims.map((d) => scoresA[d.id]), backgroundColor: '#007247' },
        { label: aB.nome, data: dims.map((d) => scoresB[d.id]), backgroundColor: '#008b53' },
      ],
    },
    options: baseChartOptions({
      scales: {
        x: { ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 } },
        y: { min: 0, max: 100, ticks: { stepSize: 20, font: { size: 10 } } },
      },
      plugins: { legend: { position: 'bottom' } },
    }),
  });

  const indMap = getIndicadorMap(state.modelo);
  const indScoresA = calcularScoreIndicadores(aA, state.modelo);
  const indScoresB = calcularScoreIndicadores(aB, state.modelo);

  let tableHTML = `<table class="data-table compare-table"><thead><tr>
    <th>Indicador</th><th>${aA.nome}</th><th>${aB.nome}</th><th>Diferença</th>
  </tr></thead><tbody>`;

  state.modelo.indicadores.forEach((ind) => {
    const sA = Math.round(indScoresA[ind.id] || 0);
    const sB = Math.round(indScoresB[ind.id] || 0);
    const diff = sA - sB;
    const winner = diff > 0 ? 'score-a' : diff < 0 ? 'score-b' : '';
    tableHTML += `<tr class="${winner ? 'winner' : ''}">
      <td>${ind.nome}</td>
      <td class="score-a">${sA}% (${aA.indicadores[ind.id] ?? '—'} ${ind.unidade})</td>
      <td class="score-b">${sB}% (${aB.indicadores[ind.id] ?? '—'} ${ind.unidade})</td>
      <td>${diff > 0 ? '+' : ''}${diff}%</td>
    </tr>`;
  });

  tableHTML += '</tbody></table>';
  $('#compare-table').innerHTML = tableHTML;
}

/* ── Modelo teórico ── */
function renderModelo() {
  const tabsEl = $('#dimensoes-tabs');
  const contentEl = $('#modelo-content');

  tabsEl.innerHTML = state.modelo.dimensoes.map((d, i) => `
    <button class="dim-tab ${i === 0 ? 'active' : ''}" data-dim="${d.id}"
      style="${i === 0 ? `background:${d.cor};border-color:${d.cor}` : ''};color:${i === 0 ? '#fff' : d.cor};border-color:${d.cor}">
      ${d.nome}
    </button>
  `).join('');

  function showDim(dimId) {
    const dim = state.modelo.dimensoes.find((d) => d.id === dimId);
    const conds = getCondicionantesPorDimensao(state.modelo, dimId);

    contentEl.innerHTML = `
      <div class="modelo-dim-content">
        <p style="color:var(--text-muted);margin-bottom:1rem">${dim.descricao}</p>
        ${conds.map((c) => {
          const ind = getIndicadorParaCondicionante(state.modelo, c.id);
          return `
            <div class="cond-card">
              <div class="cond-card__header">
                <h3 class="cond-card__title">${c.nome}</h3>
                <span class="cond-card__badge" style="background:${dim.cor}22;color:${dim.cor}">${ind?.unidade || ''}</span>
              </div>
              <p class="cond-card__def">${c.definicao}</p>
              <div class="cond-card__ind">
                <strong>Indicador:</strong> ${ind?.nome || '—'}<br>
                <strong>Interpretação:</strong> ${ind?.interpretacao || '—'}
                ${ind?.formula ? `<div class="cond-card__formula">${ind.formula}</div>` : ''}
                <small>Fontes: ${[...(ind?.fontesPrimarias || []), ...(ind?.fontesSecundarias || [])].join(', ') || '—'}</small>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  showDim(state.modelo.dimensoes[0].id);

  tabsEl.querySelectorAll('.dim-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      tabsEl.querySelectorAll('.dim-tab').forEach((t) => {
        t.classList.remove('active');
        t.style.background = '';
        t.style.color = t.style.borderColor;
      });
      tab.classList.add('active');
      tab.style.background = tab.style.borderColor;
      tab.style.color = '#fff';
      showDim(tab.dataset.dim);
    });
  });

  const tbody = $('#tabela-associacoes tbody');
  tbody.innerHTML = state.modelo.condicionantes.map((c) => {
    const ind = getIndicadorParaCondicionante(state.modelo, c.id);
    const dim = state.modelo.dimensoes.find((d) => d.id === c.dimensaoId);
    const fontes = [...(ind?.fontesPrimarias || []), ...(ind?.fontesSecundarias || [])].join(', ');
    return `<tr>
      <td><span style="color:${dim?.cor}">${dim?.nome}</span></td>
      <td>${c.nome}</td>
      <td>${ind?.nome || '—'}</td>
      <td>${ind?.unidade || '—'}</td>
      <td>${fontes || '—'}</td>
    </tr>`;
  }).join('');
}

/* ── IBGE ── */
function renderIbge() {
  renderRegioesChart();
}

function renderRegioesChart() {
  destroyChart('regioes');
  const ctx = document.getElementById('chart-regioes');
  if (!ctx) return;

  const counts = {};
  state.estados.regioes.forEach((r) => { counts[r.nome] = 0; });
  state.data.avaliacoes.forEach((a) => {
    if (counts[a.regiao] != null) counts[a.regiao]++;
  });

  state.charts.regioes = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(counts),
      datasets: [{
        label: 'APLs por Região',
        data: Object.values(counts),
        backgroundColor: ['#007247', '#008b53', '#0ea5e9', '#84cc16', '#f59e0b'],
        borderRadius: 6,
      }],
    },
    options: baseChartOptions({
      scales: {
        x: { ticks: { font: { size: 11 } } },
        y: { ticks: { stepSize: 1, font: { size: 10 } } },
      },
      plugins: { legend: { display: false } },
    }),
  });
}

async function buscarIbge() {
  const sigla = $('#ibge-uf').value;
  if (!sigla) { toast('Selecione um estado', 'error'); return; }

  const ufInfo = state.estados.ufs.find((u) => u.sigla === sigla);
  $('#ibge-status').innerHTML = '<p>Buscando dados no IBGE...</p>';

  try {
    const dados = await fetchDadosEstado(ufInfo);
    state.ibgeCache[sigla] = dados;

    const munNome = $('#ibge-municipio').value.trim();
    let munInfo = '';
    if (munNome) {
      const mun = await buscarMunicipio(munNome, sigla);
      if (mun) munInfo = `<div class="ibge-card__stat"><span>Município</span><strong>${mun.nome} (IBGE: ${mun.id})</strong></div>`;
    }

    $('#ibge-results').innerHTML = `
      <div class="ibge-card">
        <div class="ibge-card__uf">${dados.sigla}</div>
        <div class="ibge-card__nome">${dados.nome} · ${dados.regiao}</div>
        <div class="ibge-card__stat"><span>População estimada</span><strong>${formatNumber(dados.populacao)}</strong></div>
        <div class="ibge-card__stat"><span>PIB per capita</span><strong>${formatCurrency(dados.pibPerCapita)}</strong></div>
        ${munInfo}
        <div class="ibge-card__stat"><span>Fonte</span><strong>${dados.fonte}</strong></div>
        <div class="ibge-card__stat"><span>Atualizado</span><strong>${new Date(dados.sincronizadoEm).toLocaleString('pt-BR')}</strong></div>
      </div>
    `;

    const aplsUF = state.data.avaliacoes.filter((a) => a.uf === sigla);
    if (aplsUF.length) {
      aplsUF.forEach((a) => {
        a.ibge = { populacao: dados.populacao, pibPerCapita: dados.pibPerCapita, sincronizadoEm: dados.sincronizadoEm };
      });
      saveAvaliacoes(state.data);
    }

    $('#ibge-status').innerHTML = `<p>Dados de <strong>${dados.nome}</strong> carregados com sucesso.${aplsUF.length ? ` ${aplsUF.length} APL(s) atualizado(s).` : ''}</p>`;
    toast('Dados IBGE carregados', 'success');
  } catch (err) {
    $('#ibge-status').innerHTML = `<p style="color:var(--danger)">Erro: ${err.message}</p>`;
    toast('Falha ao buscar IBGE', 'error');
  }
}

async function syncAllIbge() {
  $('#ibge-status').innerHTML = '<p>Sincronizando todos os estados com IBGE... Aguarde.</p>';
  $('#btn-sync-ibge').disabled = true;

  try {
    const results = await sincronizarTodosEstados(state.estados);
    results.forEach((r) => { if (!r.erro) state.ibgeCache[r.sigla] = r; });

    $('#ibge-results').innerHTML = results.map((r) => {
      if (r.erro) return `<div class="ibge-card"><div class="ibge-card__uf">${r.sigla}</div><p style="color:var(--danger)">${r.erro}</p></div>`;
      return `
        <div class="ibge-card">
          <div class="ibge-card__uf">${r.sigla}</div>
          <div class="ibge-card__nome">${r.nome}</div>
          <div class="ibge-card__stat"><span>População</span><strong>${formatNumber(r.populacao)}</strong></div>
          <div class="ibge-card__stat"><span>PIB per capita</span><strong>${formatCurrency(r.pibPerCapita)}</strong></div>
        </div>
      `;
    }).join('');

    $('#ibge-status').innerHTML = `<p>${results.filter((r) => !r.erro).length} estados sincronizados.</p>`;
    toast('Sincronização IBGE concluída', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    $('#btn-sync-ibge').disabled = false;
  }
}

/* ── Import / Export ── */
function initImportExport() {
  $('#btn-export')?.addEventListener('click', () => {
    exportJSON(state.data);
    toast('JSON exportado', 'success');
  });

  $('#input-import')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      state.data = await importJSON(file);
      toast('Dados importados', 'success');
      populateUFSelects();
      renderView($('.nav-btn.active')?.dataset.view || 'dashboard');
    } catch (err) {
      toast(err.message, 'error');
    }
    e.target.value = '';
  });
}

/* ── Init ── */
async function init() {
  try {
    [state.data, state.modelo, state.estados, state.setores, state.ods] = await Promise.all([
      initStorage(),
      loadModelo(),
      loadEstados(),
      loadSetores(),
      loadOds(),
    ]);

    initNav();
    populateUFSelects();
    populateTopicoSelect();
    initImportExport();

    $('#form-avaliacao')?.addEventListener('submit', handleFormSubmit);
    $('#btn-cancel-edit')?.addEventListener('click', () => {
      state.editingId = null;
      $(`.nav-btn[data-view="avaliacoes"]`)?.click();
    });
    $('#btn-compare')?.addEventListener('click', doCompare);
    $('#btn-buscar-ibge')?.addEventListener('click', buscarIbge);
    $('#btn-sync-ibge')?.addEventListener('click', syncAllIbge);
    $('#dash-filter-uf')?.addEventListener('change', renderDashboard);
    $('#dash-filter-topico')?.addEventListener('change', renderDashboard);

    if (typeof Chart !== 'undefined') {
      Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif";
      Chart.defaults.font.size = 11;
      Chart.defaults.color = '#4a6356';
    }

    renderDashboard();
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `<div style="padding:2rem;text-align:center"><h1>Erro ao inicializar</h1><p>${err.message}</p><p>Execute via servidor local (ex.: <code>npx serve .</code>)</p></div>`;
  }
}

init();
