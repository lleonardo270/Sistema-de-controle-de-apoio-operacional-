import {
  MESES, VALORES_PADRAO, LIMIAR_ELEGIBILIDADE, fmtBRL, valorUnitario, hojeISO, fmtData, diaSemana,
  mesDe, somarMeses, mesAnterior, nomeMes, diasDoMes, parseISO, toISO, quintoDiaUtil, calcularExtrato,
  compararPlantoes, round2, semAcento, cpfValido, fmtCPF, soDigitos, pesoTurno, plantoesConflitam, periodosOcupados, HORARIO_TURNO, parseCSV, interpretarImportacao,
} from './calc.js';
import * as store from './store.js';
import {
  termoFamilia, termoProfissional, textoOpcaoTransporte, textoRecibo, declaracaoExtrato, rodapeWhatsapp,
  TEXTOS_PADRAO, CAMPOS, obterTexto, textoPersonalizado, montarCampos, renderTexto, camposDesconhecidos,
} from './textos.js';
import { CONFIG_PADRAO } from './config.js';

// ======================================================================
// Estado
// ======================================================================
let D = null; // dados descriptografados
const ui = { mes: mesDe(hojeISO()), filtroProf: '', extratoProf: null, selecao: null };
const $app = document.getElementById('app');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const prof = (id) => D.profissionais.find((p) => p.id === id);
const chaveRepasse = (profId, ym) => `${profId}|${ym}`;
const ordenarNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
const NOME_MODALIDADE = { integral: 'Integral', transporte: 'Apenas Transporte' };
const NOME_CATEGORIA = { fixo: 'Fixo', cobertura: 'Cobertura/Standby' };
// Trocas de plantão às 07h e às 19h (veja js/calc.js)
const NOME_TURNO = {
  diurno: 'Diurno (07h–19h)', noturno: 'Noturno (19h–07h)',
  '24h': '24h (07h–07h)', '24h19': '24h (19h–19h)',
};
const CURTO_TURNO = { diurno: 'Diurno', noturno: 'Noturno', '24h': '24h · 07h', '24h19': '24h · 19h' };
const CLASSE_TURNO = { diurno: 'diurno', noturno: 'noturno', '24h': 't24', '24h19': 't24' };

// Iniciais do profissional para o calendário
function iniciais(nome) {
  const partes = String(nome || '').split(/\s+/).filter((w) => w && !/^(d[aeo]s?|e)$/i.test(w));
  if (!partes.length) return '?';
  const ini = partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : (partes[0][1] || ''));
  return ini.toUpperCase();
}

function dadosNovos(cfg = {}) {
  return {
    versao: 1,
    config: {
      familia: cfg.familia ?? CONFIG_PADRAO.familia,
      paciente: cfg.paciente ?? CONFIG_PADRAO.paciente,
      cidade: cfg.cidade ?? CONFIG_PADRAO.cidade,
      valores: { ...VALORES_PADRAO, ...CONFIG_PADRAO.valores },
      textos: {},
      termoFamiliaAceitoEm: new Date().toISOString(),
    },
    profissionais: [],
    plantoes: [],
    repasses: {},
  };
}

function normalizar(d) {
  const base = dadosNovos();
  const out = { ...base, ...d };
  out.config = { ...base.config, ...(d.config || {}) };
  out.config.valores = { ...VALORES_PADRAO, ...(out.config.valores || {}) };
  out.config.textos = out.config.textos && typeof out.config.textos === 'object' ? out.config.textos : {};
  delete out.config.empresa; // campo removido
  out.profissionais = Array.isArray(d.profissionais) ? d.profissionais : [];
  out.plantoes = Array.isArray(d.plantoes) ? d.plantoes : [];
  out.repasses = d.repasses && typeof d.repasses === 'object' ? d.repasses : {};
  return out;
}

function persistir() {
  return store.salvar(D).catch((e) => toast('Erro ao salvar: ' + e.message, 'erro'));
}

// ======================================================================
// Utilidades de interface
// ======================================================================
function toast(msg, tipo = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.classList.add('saindo'), 3200);
  setTimeout(() => t.remove(), 3700);
}

function modal(titulo, corpo, onMount, classe = '') {
  const el = document.createElement('div');
  el.className = 'modal-fundo';
  el.innerHTML = `
    <div class="modal ${classe}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="modal-topo"><h2>${titulo}</h2>
        <button type="button" class="btn-icone" data-fechar aria-label="Fechar">✕</button></div>
      <div class="modal-corpo">${corpo}</div>
    </div>`;
  document.body.appendChild(el);
  document.body.classList.add('sem-rolagem');
  const fechar = () => {
    el.remove();
    if (!document.querySelector('.modal-fundo')) document.body.classList.remove('sem-rolagem');
  };
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-fechar]')) fechar();
  });
  onMount?.(el, fechar);
  // Em telas de toque não abre o teclado automaticamente
  if (matchMedia('(hover: hover)').matches) {
    el.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select')?.focus({ preventScroll: true });
  }
  return fechar;
}

const chip = (txt, cls = '') => `<span class="chip ${cls}">${esc(txt)}</span>`;
const opt = (v, label, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(label)}</option>`;
const radio = (name, v, label, sel, extra = '') =>
  `<label class="seg"><input type="radio" name="${name}" value="${v}" ${v === sel ? 'checked' : ''} ${extra}><span>${label}</span></label>`;

function seletorMes() {
  return `
    <div class="mes-sel">
      <button type="button" class="btn-icone" data-act="mes" data-delta="-1" aria-label="Mês anterior">‹</button>
      <label class="mes-atual">
        <span>${nomeMes(ui.mes)}</span>
        <input type="month" value="${ui.mes}" data-act-change="mes-input" aria-label="Escolher mês">
      </label>
      <button type="button" class="btn-icone" data-act="mes" data-delta="1" aria-label="Próximo mês">›</button>
    </div>`;
}

function extratosDoMes(ym) {
  return D.profissionais
    .map((p) => calcularExtrato(p, D.plantoes, ym))
    .filter((e) => e.totalPlantoes > 0)
    .sort((a, b) => ordenarNome(a.profissional, b.profissional));
}

function statusRepasse(ext) {
  const r = D.repasses[chaveRepasse(ext.profissional.id, ext.mes)];
  if (r) {
    return { cls: 'ok', txt: `Pago em ${fmtData(r.pagoEm)}`, pago: true, diverge: round2(r.valor) !== ext.total, r };
  }
  if (ext.total <= 0) {
    return { cls: 'neutro', txt: ext.plantoesFixos ? `Sem repasse (abaixo de ${LIMIAR_ELEGIBILIDADE})` : 'Sem repasse (cobertura)' };
  }
  const hoje = hojeISO();
  if (ext.mes >= mesDe(hoje)) return { cls: 'info', txt: 'Em apuração' };
  if (hoje > ext.dataLimite) return { cls: 'erro', txt: 'Atrasado' };
  return { cls: 'alerta', txt: 'A pagar' };
}

/** Atualiza o valor unitário (e opcionalmente modalidade/tipo) de plantões em meses ainda não pagos. */
function reaplicarEmAbertos(filtro, alterar) {
  let n = 0;
  for (const p of D.plantoes) {
    if (!filtro(p)) continue;
    if (D.repasses[chaveRepasse(p.profissionalId, mesDe(p.data))]) continue;
    alterar?.(p);
    p.valorUnitario = p.tipo === 'fixo' ? valorUnitario(p.modalidade, D.config.valores) : 0;
    n++;
  }
  return n;
}

const ICONES = {
  inicio: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  plantoes: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  profissionais: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 5.4"/>',
  extratos: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
};
const icone = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[n]}</svg>`;

// ======================================================================
// Primeiro acesso, login
// ======================================================================
function telaConfiguracao() {
  $app.innerHTML = `
  <main class="tela-acesso">
    <div class="cartao acesso">
      <div class="marca"><img src="icon.svg" alt="" width="56" height="56"><div>
        <h1>Apoio Voluntário</h1><p>Ajuda de Custo Indenizatória · Registro de Plantões</p></div></div>
      <h2>Primeiro acesso</h2>
      <form id="f-config" class="form">
        <p class="dica">Configuração única desta instalação. Tudo pode ser ajustado depois em <strong>Ajustes</strong>.</p>
        <label>Nome da Família Colaboradora <input name="familia" required maxlength="80" placeholder="Ex.: Família Silva" value="${esc(CONFIG_PADRAO.familia)}"></label>
        <label>Nome do paciente <input name="paciente" maxlength="80" placeholder="Ex.: Sr. José da Silva" value="${esc(CONFIG_PADRAO.paciente)}"></label>
        <label>Cidade (para os recibos) <input name="cidade" maxlength="60" placeholder="Ex.: São Paulo/SP" value="${esc(CONFIG_PADRAO.cidade)}"></label>
        <label>Crie uma senha <input name="senha" type="password" required minlength="6" autocomplete="new-password"></label>
        <label>Repita a senha <input name="senha2" type="password" required minlength="6" autocomplete="new-password"></label>
        <p class="aviso">Guarde bem a senha: os dados ficam <strong>criptografados neste aparelho</strong> e
        <strong>não há como recuperá-la</strong>. Use “Ajustes → Backup” regularmente.</p>
        <details class="termo-box" open>
          <summary>Termo de Ciência Inicial</summary>
          <div id="termo-inicial"></div>
        </details>
        <label class="check"><input type="checkbox" name="aceite" required>
          <span>Li e concordo com o Termo de Ciência: este sistema registra apenas o apoio voluntário e indenizatório da família.</span></label>
        <label>Restaurar a partir de um backup (opcional) <input type="file" name="backup" accept=".json,application/json"></label>
        <button class="btn grande">Começar</button>
      </form>
    </div>
  </main>`;
  const f = document.getElementById('f-config');
  const cfgDoForm = () => ({
    familia: f.familia.value.trim(), paciente: f.paciente.value.trim(),
    cidade: f.cidade.value.trim(),
  });
  const atualizarTermo = () => {
    document.getElementById('termo-inicial').innerHTML = termoFamilia({ ...cfgDoForm(), valores: CONFIG_PADRAO.valores });
  };
  f.addEventListener('input', atualizarTermo);
  atualizarTermo();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (f.senha.value !== f.senha2.value) return toast('As senhas não conferem.', 'erro');
    const btn = f.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Protegendo dados…';
    try {
      let dados = dadosNovos(cfgDoForm());
      const arq = f.backup.files[0];
      if (arq) {
        dados = normalizar(JSON.parse(await arq.text()));
        for (const [k, v] of Object.entries(cfgDoForm())) if (v) dados.config[k] = v;
        dados.config.termoFamiliaAceitoEm = new Date().toISOString();
      }
      await store.criarCofre(f.senha.value, dados);
      D = dados;
      abrirApp();
      toast(arq ? 'Backup restaurado.' : 'Tudo pronto! Cadastre o primeiro profissional.');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Começar';
      toast('Não foi possível concluir: ' + err.message, 'erro');
    }
  });
}

function telaLogin() {
  $app.innerHTML = `
  <main class="tela-acesso">
    <div class="cartao acesso">
      <div class="marca"><img src="icon.svg" alt="" width="56" height="56"><div>
        <h1>Apoio Voluntário</h1><p>Acesso restrito à Família Colaboradora</p></div></div>
      <form id="f-login" class="form">
        <label>Senha <input name="senha" type="password" required autocomplete="current-password" autofocus></label>
        <button class="btn grande">Entrar</button>
      </form>
      <button type="button" class="link" id="esqueci">Esqueci a senha</button>
    </div>
  </main>`;
  const f = document.getElementById('f-login');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Verificando…';
    try {
      D = normalizar(await store.abrirCofre(f.senha.value));
      abrirApp();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Entrar';
      f.senha.value = '';
      toast(err.message, 'erro');
    }
  });
  document.getElementById('esqueci').onclick = () => {
    modal('Esqueci a senha', `
      <p>Por segurança, os dados são criptografados com a sua senha e <strong>não podem ser recuperados sem ela</strong>.</p>
      <p>Se você tem um arquivo de backup, pode apagar os dados deste aparelho e restaurá-lo no primeiro acesso, criando uma nova senha.</p>
      <label class="form">Digite APAGAR para confirmar <input id="conf-apagar" autocomplete="off"></label>
      <div class="acoes-form"><button type="button" class="btn sec" data-fechar>Cancelar</button>
      <button type="button" class="btn perigo" id="btn-apagar">Apagar e recomeçar</button></div>`,
    (el) => {
      el.querySelector('#btn-apagar').onclick = () => {
        if (el.querySelector('#conf-apagar').value.trim().toUpperCase() !== 'APAGAR') return toast('Digite APAGAR para confirmar.', 'erro');
        store.apagarTudo();
        location.reload();
      };
    });
  };
}

// ======================================================================
// Estrutura do app
// ======================================================================
const ROTAS = {
  inicio: { titulo: 'Início', render: pgInicio },
  plantoes: { titulo: 'Plantões', render: pgPlantoes },
  profissionais: { titulo: 'Profissionais', render: pgProfissionais },
  extratos: { titulo: 'Extratos', render: pgExtratos },
  ajustes: { titulo: 'Ajustes', render: pgAjustes },
};

function rotaAtual() {
  const r = location.hash.replace(/^#\/?/, '').split('/')[0];
  return ROTAS[r] ? r : 'inicio';
}

function abrirApp() {
  $app.innerHTML = `
    <header class="topo">
      <div><strong>Apoio Voluntário</strong><span id="topo-familia"></span></div>
      <button type="button" class="btn-icone" data-act="sair" aria-label="Sair" title="Sair">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      </button>
    </header>
    <main id="conteudo" class="conteudo"></main>
    <nav class="nav">
      ${Object.entries(ROTAS).map(([k, r]) => `<a href="#/${k}" data-rota="${k}">${icone(k)}<span>${r.titulo}</span></a>`).join('')}
    </nav>`;
  render();
}

function render() {
  if (!D) return;
  const r = rotaAtual();
  document.getElementById('topo-familia').textContent = D.config.familia ? ' · ' + D.config.familia : '';
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === r));
  const c = document.getElementById('conteudo');
  c.innerHTML = ROTAS[r].render();
  document.title = `${ROTAS[r].titulo} · Apoio Voluntário`;
}

window.addEventListener('hashchange', () => {
  if (rotaAtual() !== 'extratos') ui.extratoProf = null;
  ui.selecao = null;
  render();
  window.scrollTo(0, 0);
});

// Ações por delegação
const ACOES = {
  sair() {
    store.encerrarSessao();
    D = null;
    telaLogin();
  },
  mes(el) {
    ui.mes = somarMeses(ui.mes, Number(el.dataset.delta));
    ui.selecao = null;
    render();
  },
  'novo-plantao'() { formPlantao(); },
  'editar-plantao'(el) { formPlantao(D.plantoes.find((p) => p.id === el.dataset.id)); },
  'excluir-plantao'(el) {
    const p = D.plantoes.find((x) => x.id === el.dataset.id);
    if (!p || !confirm(`Excluir o plantão de ${prof(p.profissionalId)?.nome || ''} em ${fmtData(p.data)} (${NOME_TURNO[p.turno]})?`)) return;
    D.plantoes = D.plantoes.filter((x) => x.id !== p.id);
    persistir();
    render();
    toast('Plantão excluído.');
  },
  importar() { formImportacao(); },
  'selecionar'() { ui.selecao = new Set(); render(); },
  'cancelar-selecao'() { ui.selecao = null; render(); },
  'sel-plantao'(el) {
    if (!ui.selecao) return;
    const id = el.dataset.id;
    ui.selecao.has(id) ? ui.selecao.delete(id) : ui.selecao.add(id);
    render();
  },
  'sel-todos'() {
    const ids = plantoesListados().map((p) => p.id);
    const todos = ids.every((id) => ui.selecao.has(id));
    ui.selecao = todos ? new Set() : new Set(ids);
    render();
  },
  'apagar-selecionados'() {
    const ids = ui.selecao ? [...ui.selecao] : [];
    if (!ids.length) return toast('Nenhum plantão selecionado.', 'alerta');
    const alvo = D.plantoes.filter((p) => ui.selecao.has(p.id));
    const emPagos = alvo.filter((p) => D.repasses[chaveRepasse(p.profissionalId, mesDe(p.data))]).length;
    const msg = `Apagar ${alvo.length} plantão(ões) selecionado(s)?`
      + (emPagos ? `\n\nAtenção: ${emPagos} pertence(m) a mês já marcado como pago.` : '')
      + '\n\nEsta ação não pode ser desfeita.';
    if (!confirm(msg)) return;
    D.plantoes = D.plantoes.filter((p) => !ui.selecao.has(p.id));
    ui.selecao = null;
    persistir();
    render();
    toast(`${alvo.length} plantão(ões) apagado(s).`);
  },
  'novo-prof'() {
    if (rotaAtual() !== 'profissionais') location.hash = '#/profissionais';
    formProfissional();
  },
  'editar-prof'(el) { formProfissional(prof(el.dataset.id)); },
  'termo-prof'(el) { const p = prof(el.dataset.id); imprimir(docTermo(p), `Termo de Ciencia - ${p.nome}`); },
  'ver-extrato'(el) {
    ui.extratoProf = el.dataset.id;
    if (el.dataset.mes) ui.mes = el.dataset.mes;
    if (rotaAtual() !== 'extratos') location.hash = '#/extratos';
    else { render(); window.scrollTo(0, 0); }
  },
  'voltar-extratos'() { ui.extratoProf = null; render(); },
  'pdf-extrato'() {
    const ext = calcularExtrato(prof(ui.extratoProf), D.plantoes, ui.mes);
    imprimir(docExtrato(ext), `Extrato de Repasse - ${ext.profissional.nome} - ${ui.mes}`);
  },
  'pdf-recibo'() {
    const ext = calcularExtrato(prof(ui.extratoProf), D.plantoes, ui.mes);
    if (ext.total <= 0) return toast('Não há valor de repasse neste mês para gerar recibo.', 'erro');
    imprimir(docRecibo(ext) + '<div class="quebra"></div>' + docExtrato(ext, true), `Recibo de Apoio Voluntario - ${ext.profissional.nome} - ${ui.mes}`);
  },
  'pdf-mes'() { imprimir(docRelatorioMes(ui.mes), `Resumo de Repasses - ${ui.mes}`); },
  whatsapp() {
    const ext = calcularExtrato(prof(ui.extratoProf), D.plantoes, ui.mes);
    window.open(`https://wa.me/?text=${encodeURIComponent(textoWhatsApp(ext))}`, '_blank', 'noopener');
  },
  async 'copiar-pix'() {
    const pix = prof(ui.extratoProf)?.pix || '';
    try { await navigator.clipboard.writeText(pix); toast('Chave Pix copiada.'); }
    catch { prompt('Copie a chave Pix:', pix); }
  },
  'registrar-repasse'() { formRepasse(calcularExtrato(prof(ui.extratoProf), D.plantoes, ui.mes)); },
  'desfazer-repasse'() {
    if (!confirm('Desfazer o registro de repasse pago deste mês?')) return;
    delete D.repasses[chaveRepasse(ui.extratoProf, ui.mes)];
    persistir();
    render();
  },
  'filtro-prof'(el) { ui.filtroProf = el.value; ui.selecao = null; render(); },
  'exportar'() { exportarBackup(); },
  'editar-texto'(el) { formTexto(el.dataset.chave); },
  'ver-termo-familia'() { modal('Termo de Ciência Inicial', `<div class="termo-box">${termoFamilia(D.config)}</div>
    <p class="dica">Aceito em ${new Date(D.config.termoFamiliaAceitoEm).toLocaleString('pt-BR')}.</p>`); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && ACOES[el.dataset.act]) { e.preventDefault(); ACOES[el.dataset.act](el, e); }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-act-change]');
  if (!el) return;
  if (el.dataset.actChange === 'mes-input' && el.value) { ui.mes = el.value; ui.selecao = null; render(); }
  if (el.dataset.actChange === 'filtro-prof') ACOES['filtro-prof'](el);
  if (el.dataset.actChange === 'importar-backup') importarBackup(el);
});

// ======================================================================
// Página: Início
// ======================================================================
function pgInicio() {
  const hoje = hojeISO();
  const mesAtual = mesDe(hoje);
  const mesFech = mesAnterior(mesAtual);
  const limite = quintoDiaUtil(mesFech);

  if (!D.profissionais.length) {
    return `
      <section class="vazio">
        <h1>Bem-vindo(a)!</h1>
        <p>Comece cadastrando os técnicos de enfermagem que fazem parte da escala.</p>
        <a class="btn grande" href="#/profissionais" data-act="novo-prof">+ Cadastrar profissional</a>
      </section>`;
  }

  const fech = extratosDoMes(mesFech);
  const aPagar = fech.filter((e) => e.total > 0);
  const totalFech = aPagar.reduce((s, e) => s + e.total, 0);
  const pagos = aPagar.filter((e) => statusRepasse(e).pago).length;

  // Pendências de meses mais antigos
  const mesesAntigos = [...new Set(D.plantoes.map((p) => mesDe(p.data)))].filter((m) => m < mesFech).sort();
  const pendAntigas = mesesAntigos.flatMap((m) => extratosDoMes(m).filter((e) => e.total > 0 && !statusRepasse(e).pago));

  const atuais = D.profissionais.filter((p) => p.ativo !== false).sort(ordenarNome)
    .map((p) => calcularExtrato(p, D.plantoes, mesAtual));

  return `
    <button type="button" class="btn grande largura" data-act="novo-plantao">+ Registrar plantão</button>

    <div class="painel-2">
    <section class="cartao">
      <div class="cartao-topo">
        <div><h2>Fechamento · ${nomeMes(mesFech)}</h2>
        <p class="dica">Data limite do repasse: <strong>${fmtData(limite)}</strong> (5º dia útil)</p></div>
        <div class="valor-destaque">${fmtBRL(totalFech)}</div>
      </div>
      ${aPagar.length ? `
        <p class="dica">${pagos} de ${aPagar.length} repasse(s) registrados como pagos.</p>
        <ul class="lista">${aPagar.map((e) => linhaResumo(e)).join('')}</ul>`
        : `<p class="dica">Nenhum valor a repassar referente a ${nomeMes(mesFech)}.</p>`}
      ${pendAntigas.length ? `
        <h3 class="sub-alerta">Pendências de meses anteriores</h3>
        <ul class="lista">${pendAntigas.map((e) => linhaResumo(e, true)).join('')}</ul>` : ''}
    </section>

    <section class="cartao">
      <h2>Mês em andamento · ${nomeMes(mesAtual)}</h2>
      ${atuais.length ? `<ul class="lista">${atuais.map((e) => progresso(e)).join('')}</ul>`
        : '<p class="dica">Nenhum profissional ativo.</p>'}
    </section>
    </div>`;
}

function linhaResumo(e, comMes = false) {
  const st = statusRepasse(e);
  return `
    <li class="item clicavel" data-act="ver-extrato" data-id="${e.profissional.id}" data-mes="${e.mes}">
      <div class="item-info"><strong>${esc(e.profissional.nome)}</strong>
        <span class="dica">${comMes ? nomeMes(e.mes) + ' · ' : ''}${e.plantoesFixos} plantões fixos</span></div>
      <div class="item-dir"><strong>${fmtBRL(e.total)}</strong>${chip(st.txt, st.cls)}</div>
    </li>`;
}

function progresso(e) {
  const p = e.profissional;
  if (p.categoria !== 'fixo') {
    return `<li class="item"><div class="item-info"><strong>${esc(p.nome)}</strong>
      <span class="dica">${NOME_CATEGORIA.cobertura} · ${e.totalPlantoes} plantão(ões) · ${e.refeicoesNoLocal} refeição(ões) no local</span></div>
      <div class="item-dir">${chip('Sem repasse', 'neutro')}</div></li>`;
  }
  const pct = Math.min(100, (e.plantoesFixos / LIMIAR_ELEGIBILIDADE) * 100);
  const txt = e.elegivel
    ? `Elegível · ${e.plantoesFixos} plantões · acumulado ${fmtBRL(e.total)}`
    : `${e.plantoesFixos} de ${LIMIAR_ELEGIBILIDADE} · falta(m) ${e.faltam} para ativar${e.valorPotencial ? ` (${fmtBRL(e.valorPotencial)} a liberar)` : ''}`;
  return `
    <li class="item clicavel" data-act="ver-extrato" data-id="${p.id}" data-mes="${e.mes}">
      <div class="item-info"><strong>${esc(p.nome)}</strong><span class="dica">${txt}</span>
        <div class="barra ${e.elegivel ? 'cheia' : ''}"><span style="width:${pct}%"></span></div></div>
    </li>`;
}

// ======================================================================
// Página: Plantões
// ======================================================================
function plantoesListados() {
  return D.plantoes
    .filter((p) => mesDe(p.data) === ui.mes && (!ui.filtroProf || p.profissionalId === ui.filtroProf))
    .sort((a, b) => -compararPlantoes(a, b));
}

function pgPlantoes() {
  const lista = plantoesListados();
  if (ui.selecao) for (const id of [...ui.selecao]) if (!lista.some((p) => p.id === id)) ui.selecao.delete(id);
  const sel = ui.selecao;
  const todos = sel && lista.length && lista.every((p) => sel.has(p.id));
  const profs = [...D.profissionais].sort(ordenarNome);
  return `
    <h1>Registro de Plantões</h1>
    ${seletorMes()}
    <div class="barra-acoes">
      <select data-act-change="filtro-prof" aria-label="Filtrar por profissional">
        <option value="">Todos os profissionais</option>
        ${profs.map((p) => opt(p.id, p.nome, ui.filtroProf)).join('')}
      </select>
    </div>
    ${sel ? '' : `<div class="barra-acoes">
      <button type="button" class="btn" data-act="novo-plantao">+ Registrar</button>
      <button type="button" class="btn sec" data-act="importar">Importar planilha</button>
      ${lista.length ? '<button type="button" class="btn sec" data-act="selecionar">Selecionar para apagar</button>' : ''}
    </div>`}
    ${sel ? `<div class="barra-selecao">
      <span><strong>${sel.size}</strong> selecionado(s)</span>
      <button type="button" class="btn sec pequeno" data-act="sel-todos">${todos ? 'Limpar' : 'Selecionar todos'}</button>
      <button type="button" class="btn sec pequeno" data-act="cancelar-selecao">Cancelar</button>
      <button type="button" class="btn perigo pequeno" data-act="apagar-selecionados" ${sel.size ? '' : 'disabled'}>Apagar${sel.size ? ` (${sel.size})` : ''}</button>
    </div>` : ''}
    ${lista.length ? `<ul class="lista cartao ${sel ? 'modo-selecao' : ''}">${lista.map(itemPlantao).join('')}</ul>`
      : `<div class="vazio pequeno"><p>Nenhum plantão registrado em ${nomeMes(ui.mes)}.</p></div>`}
    <p class="dica centro">${lista.length} plantão(ões) listados. Registro manual para apuração do apoio voluntário.</p>`;
}

function itemPlantao(p) {
  const pr = prof(p.profissionalId);
  const pago = D.repasses[chaveRepasse(p.profissionalId, mesDe(p.data))];
  const sel = ui.selecao;
  const marcado = sel?.has(p.id);
  const valor = round2((p.valorUnitario || 0) * pesoTurno(p.turno));
  return `
    <li class="item ${sel ? 'clicavel' : ''} ${marcado ? 'marcado' : ''}" ${sel ? `data-act="sel-plantao" data-id="${p.id}" role="checkbox" aria-checked="${!!marcado}"` : ''}>
      ${sel ? `<span class="caixa" aria-hidden="true">${marcado ? '✓' : ''}</span>` : ''}
      <div class="data-bloco"><strong>${p.data.slice(8)}</strong><span>${diaSemana(p.data)}</span></div>
      <div class="item-info">
        <strong>${esc(pr?.nome || 'Profissional removido')}</strong>
        <span>${chip(CURTO_TURNO[p.turno], CLASSE_TURNO[p.turno])} ${p.tipo === 'fixo'
          ? chip(`${NOME_MODALIDADE[p.modalidade]} · ${fmtBRL(valor)}`)
          : chip('Cobertura', 'neutro')} ${pago ? chip('Pago', 'ok') : ''}</span>
        ${p.obs ? `<span class="dica">${esc(p.obs)}</span>` : ''}
      </div>
      ${sel ? '' : `<div class="item-acoes">
        <button type="button" class="btn-icone" data-act="editar-plantao" data-id="${p.id}" aria-label="Editar">✎</button>
        <button type="button" class="btn-icone" data-act="excluir-plantao" data-id="${p.id}" aria-label="Excluir">🗑</button>
      </div>`}
    </li>`;
}

function formPlantao(plantao) {
  const novo = !plantao;
  const disponiveis = D.profissionais
    .filter((p) => p.ativo !== false || (plantao && p.id === plantao.profissionalId))
    .sort(ordenarNome);
  if (!disponiveis.length) {
    toast('Cadastre um profissional primeiro.', 'erro');
    location.hash = '#/profissionais';
    return;
  }
  const profInicial = plantao?.profissionalId
    || (disponiveis.some((p) => p.id === ui.filtroProf) ? ui.filtroProf : disponiveis[0].id);
  const p0 = plantao || { profissionalId: profInicial, turno: 'diurno' };
  const pr0 = prof(p0.profissionalId);
  const tipo0 = p0.tipo || (pr0.categoria === 'fixo' ? 'fixo' : 'cobertura');
  const mod0 = p0.modalidade || pr0.modalidade || 'integral';

  const corpo = `
    <form class="form ${novo ? 'com-cal' : ''}" id="f-plantao">
      <label>Profissional
        <select name="profissionalId" required>
          ${disponiveis.map((p) => opt(p.id, `${p.nome} (${NOME_CATEGORIA[p.categoria]})`, p0.profissionalId)).join('')}
        </select></label>
      ${novo
        ? `<div class="campo campo-cal"><span class="rotulo">Datas <small>(toque em um ou mais dias)</small></span><div id="cal" class="cal"></div></div>`
        : `<label>Data <input type="date" name="data" required value="${p0.data}"></label>`}
      <fieldset class="segmentado turnos"><legend>Turno</legend>
        ${radio('turno', 'diurno', `☀ Diurno <small>${HORARIO_TURNO.diurno} · 12h</small>`, p0.turno)}
        ${radio('turno', 'noturno', `☾ Noturno <small>${HORARIO_TURNO.noturno} · 12h</small>`, p0.turno)}
        ${radio('turno', '24h', `◷ 24h início 07h <small>${HORARIO_TURNO['24h']} do dia seguinte</small>`, p0.turno)}
        ${radio('turno', '24h19', `◷ 24h início 19h <small>${HORARIO_TURNO['24h19']} do dia seguinte</small>`, p0.turno)}
        <p class="dica turno-nota">Trocas às 07h e 19h. O plantão conta no mês da data em que começa.</p></fieldset>
      <fieldset class="segmentado" id="grp-tipo"><legend>Tipo de plantão</legend>
        ${radio('tipo', 'fixo', 'Fixo (escala)', tipo0)}${radio('tipo', 'cobertura', 'Cobertura', tipo0)}</fieldset>
      <fieldset class="segmentado" id="grp-mod"><legend>Modalidade aplicada</legend>
        ${radio('modalidade', 'integral', `Integral · ${fmtBRL(valorUnitario('integral', D.config.valores))}`, mod0)}
        ${radio('modalidade', 'transporte', `Transporte · ${fmtBRL(valorUnitario('transporte', D.config.valores))}`, mod0)}</fieldset>
      <label>Observação <small>(opcional)</small> <input name="obs" maxlength="200" value="${esc(p0.obs || '')}"></label>
      <p class="dica" id="dica-plantao"></p>
      <div class="acoes-form">
        <button type="button" class="btn sec" data-fechar>Cancelar</button>
        <button class="btn">Salvar</button>
      </div>
    </form>`;

  modal(novo ? 'Registrar plantão' : 'Editar plantão', corpo, (el, fechar) => {
    const f = el.querySelector('form');
    const selecionadas = new Set();
    let ultimoDia = null;
    let calMes = ui.mes;
    let ultimoProf = f.profissionalId.value;

    const valorRadio = (n) => f.querySelector(`input[name=${n}]:checked`)?.value;

    function renderCal() {
      const cal = el.querySelector('#cal');
      if (!cal) return;
      const profId = f.profissionalId.value;
      // Quem ocupa cada período de 12h (todos os profissionais; inclui o dia
      // seguinte de um 24h iniciado às 19h)
      // per -> [{ id, turno }]
      const ocupantes = new Map();
      for (const p of D.plantoes) {
        for (const per of periodosOcupados(p)) {
          const lista = ocupantes.get(per) || [];
          if (!lista.some((o) => o.id === p.profissionalId)) lista.push({ id: p.profissionalId, turno: p.turno });
          ocupantes.set(per, lista);
        }
      }
      const idsEm = (per) => (ocupantes.get(per) || []).map((o) => o.id);
      const noMes = new Set();
      // Cores iguais às da lista de plantões: Diurno (amarelo), Noturno (roxo), 24h (rosa)
      const faixa = (iso, per) => {
        const lista = ocupantes.get(`${iso}|${per}`) || [];
        if (!lista.length) return `<span class="faixa vazia" title="${per === 'D' ? 'Dia' : 'Noite'}: livre"></span>`;
        lista.forEach((o) => noMes.add(o.id));
        // o profissional selecionado aparece primeiro
        const ordenados = [...lista].sort((a, b) => (b.id === profId) - (a.id === profId));
        const o = ordenados[0];
        const nomes = lista.map((x) => prof(x.id)?.nome || '?').join(', ');
        return `<span class="faixa ${CLASSE_TURNO[o.turno]} ${o.id === profId ? 'atual' : ''}" title="${per === 'D' ? 'Dia' : 'Noite'}: ${esc(nomes)}">${esc(iniciais(prof(o.id)?.nome))}${lista.length > 1 ? `+${lista.length - 1}` : ''}</span>`;
      };
      const primeiro = parseISO(`${calMes}-01`).getDay();
      const n = diasDoMes(calMes);
      const hoje = hojeISO();
      let html = `<div class="cal-topo">
        <button type="button" class="btn-icone" data-cal="-1" aria-label="Mês anterior">‹</button>
        <strong>${nomeMes(calMes)}</strong>
        <button type="button" class="btn-icone" data-cal="1" aria-label="Próximo mês">›</button></div>
        <div class="cal-grade">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => `<span class="cal-sem">${d}</span>`).join('')}`;
      for (let i = 0; i < primeiro; i++) html += '<span></span>';
      for (let d = 1; d <= n; d++) {
        const iso = `${calMes}-${String(d).padStart(2, '0')}`;
        const meu = ['D', 'N'].some((x) => idsEm(`${iso}|${x}`).includes(profId));
        const cls = [selecionadas.has(iso) && 'sel', iso === hoje && 'hoje', meu && 'tem'].filter(Boolean).join(' ');
        html += `<button type="button" class="cal-dia ${cls}" data-dia="${iso}" aria-pressed="${selecionadas.has(iso)}">
          <span class="cal-num">${d}</span>${faixa(iso, 'D')}${faixa(iso, 'N')}</button>`;
      }
      const legenda = D.profissionais.filter((p) => noMes.has(p.id))
        .sort((a, b) => (b.id === profId) - (a.id === profId) || ordenarNome(a, b))
        .map((p) => `<span class="leg ${p.id === profId ? 'atual' : ''}"><b>${esc(iniciais(p.nome))}</b> ${esc(p.nome)}</span>`).join('');
      const legTurnos = ['diurno', 'noturno', '24h'].map((t) => chip(t === '24h' ? '24h' : CURTO_TURNO[t], CLASSE_TURNO[t])).join(' ');
      let detalhe = '';
      if (ultimoDia && mesDe(ultimoDia) === calMes) {
        const quem = (per) => (ocupantes.get(`${ultimoDia}|${per}`) || []).map((o) => `${esc(prof(o.id)?.nome || '?')} (${CURTO_TURNO[o.turno]})`).join(', ') || '<em>livre</em>';
        detalhe = `<p class="cal-detalhe"><strong>${diaSemana(ultimoDia)} ${fmtData(ultimoDia).slice(0, 5)}</strong> · Dia: ${quem('D')} · Noite: ${quem('N')}</p>`;
      }
      html += `</div>
        <div class="cal-legenda turnos-leg">${legTurnos}</div>
        ${legenda ? `<div class="cal-legenda">${legenda}</div>` : ''}
        ${detalhe}
        <p class="dica">${selecionadas.size} dia(s) selecionado(s). Em cada dia, a faixa de cima é o <strong>dia (07h–19h)</strong> e a de baixo a <strong>noite (19h–07h)</strong>; faixa vazia = período sem profissional. Destaque forte = profissional selecionado. Toque num dia para ver os nomes.</p>`;
      cal.innerHTML = html;
    }

    function sync() {
      const pr = prof(f.profissionalId.value);
      if (f.profissionalId.value !== ultimoProf) {
        ultimoProf = f.profissionalId.value;
        f.querySelector(`input[name=tipo][value=${pr.categoria === 'fixo' ? 'fixo' : 'cobertura'}]`).checked = true;
        f.querySelector(`input[name=modalidade][value=${pr.modalidade || 'integral'}]`).checked = true;
      }
      const fixoRadio = f.querySelector('input[name=tipo][value=fixo]');
      fixoRadio.disabled = pr.categoria !== 'fixo';
      if (fixoRadio.disabled) f.querySelector('input[name=tipo][value=cobertura]').checked = true;
      const tipo = valorRadio('tipo');
      el.querySelector('#grp-mod').hidden = tipo !== 'fixo';
      el.querySelector('#dica-plantao').innerHTML = tipo === 'fixo'
        ? (() => {
          const vu = valorUnitario(valorRadio('modalidade'), D.config.valores);
          return pesoTurno(valorRadio('turno')) === 2
            ? `Conta como <strong>2 plantões</strong> para a regra do ${LIMIAR_ELEGIBILIDADE}º plantão. Valor: <strong>${fmtBRL(vu * 2)}</strong> (2 × ${fmtBRL(vu)}).`
            : `Conta para a regra do ${LIMIAR_ELEGIBILIDADE}º plantão. Valor: <strong>${fmtBRL(vu)}</strong> por plantão.`;
        })()
        : 'Cobertura: não entra na contagem e não gera repasse em dinheiro (alimentação fornecida no local).';
      renderCal();
    }

    f.addEventListener('change', sync);
    el.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-cal]');
      if (nav) { calMes = somarMeses(calMes, Number(nav.dataset.cal)); renderCal(); return; }
      const dia = e.target.closest('[data-dia]');
      if (dia) {
        const iso = dia.dataset.dia;
        selecionadas.has(iso) ? selecionadas.delete(iso) : selecionadas.add(iso);
        ultimoDia = iso;
        renderCal();
      }
    });
    sync();

    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const profissionalId = f.profissionalId.value;
      const turno = valorRadio('turno');
      const tipo = valorRadio('tipo');
      const modalidade = tipo === 'fixo' ? valorRadio('modalidade') : null;
      const obs = f.obs.value.trim();
      const datas = novo ? [...selecionadas].sort() : [f.data.value];
      if (!datas.length || !datas[0]) return toast('Selecione ao menos uma data.', 'erro');
      if (!turno) return toast('Escolha o turno.', 'erro');

      const duplicado = (data) => D.plantoes.some((p) => p.id !== plantao?.id && p.profissionalId === profissionalId && plantoesConflitam(p, { data, turno }));
      const ignoradas = datas.filter(duplicado);
      const validas = datas.filter((d) => !duplicado(d));
      if (!validas.length) return toast('Este horário se sobrepõe a um plantão já registrado para este profissional.', 'erro');

      const vu = tipo === 'fixo' ? valorUnitario(modalidade, D.config.valores) : 0;
      if (novo) {
        for (const data of validas) {
          D.plantoes.push({ id: novoId(), profissionalId, data, turno, tipo, modalidade, valorUnitario: vu, obs, criadoEm: new Date().toISOString() });
        }
      } else {
        const mudouValor = plantao.tipo !== tipo || plantao.modalidade !== modalidade;
        Object.assign(plantao, { profissionalId, data: validas[0], turno, tipo, modalidade, obs });
        if (mudouValor) plantao.valorUnitario = vu;
      }
      const pagos = validas.filter((d) => D.repasses[chaveRepasse(profissionalId, mesDe(d))]);
      persistir();
      ui.mes = mesDe(validas[0]);
      fechar();
      render();
      toast(novo ? `${validas.length} plantão(ões) registrado(s).` : 'Plantão atualizado.');
      if (ignoradas.length) toast(`${ignoradas.length} data(s) ignorada(s): se sobrepunham a plantões já registrados.`, 'alerta');
      if (pagos.length) toast('Atenção: o mês já tinha repasse registrado como pago. Confira o extrato.', 'alerta');
    });
  }, novo ? 'largo' : '');
}

function formImportacao() {
  modal('Importar planilha', `
    <div class="form">
      <p>Use um arquivo <strong>CSV</strong> (no Excel/Google Planilhas: “Salvar como → CSV”) com as colunas:</p>
      <pre class="exemplo">Data;Turno;Profissional;Tipo
01/09/2026;24h;Maria Souza;Fixo
02/09/2026;24h 19h;João Lima;
03/09/2026;Diurno;Maria Souza;Fixo
05/09/2026;Noturno;Maria Souza;
08/09/2026;Diurno;João Lima;Cobertura</pre>
      <p class="dica">Profissional pode ser o nome completo (igual ao cadastro) ou o CPF. Turno: <code>Diurno</code>, <code>Noturno</code>,
      <code>24h</code> (início 07h) ou <code>24h 19h</code> (início 19h). A coluna Tipo é opcional.</p>
      <label>Arquivo <input type="file" id="imp-arq" accept=".csv,.txt,text/csv"></label>
      <label>…ou cole o conteúdo aqui <textarea id="imp-txt" rows="5"></textarea></label>
      <button type="button" class="btn sec" id="imp-analisar">Analisar</button>
      <div id="imp-res"></div>
    </div>`, (el, fechar) => {
    let validos = [];
    el.querySelector('#imp-arq').onchange = async (e) => {
      const arq = e.target.files[0];
      if (arq) { el.querySelector('#imp-txt').value = await arq.text(); el.querySelector('#imp-analisar').click(); }
    };
    el.querySelector('#imp-analisar').onclick = () => {
      const res = interpretarImportacao(parseCSV(el.querySelector('#imp-txt').value), D.profissionais);
      for (const r of res) {
        if (!r.erros.length && D.plantoes.some((p) => p.profissionalId === r.profissional.id && plantoesConflitam(p, r))) {
          r.erros.push('já registrado ou sobreposto a outro plantão');
        }
      }
      // duplicados dentro do próprio arquivo
      const aceitos = [];
      for (const r of res) {
        if (r.erros.length) continue;
        if (aceitos.some((a) => a.profissional.id === r.profissional.id && plantoesConflitam(a, r))) r.erros.push('repetido/sobreposto no arquivo');
        else aceitos.push(r);
      }
      validos = res.filter((r) => !r.erros.length);
      const erros = res.filter((r) => r.erros.length);
      el.querySelector('#imp-res').innerHTML = `
        <p><strong>${validos.length}</strong> plantão(ões) prontos para importar${erros.length ? `, <strong>${erros.length}</strong> com problema` : ''}.</p>
        ${erros.length ? `<ul class="erros">${erros.slice(0, 30).map((r) => `<li>Linha ${r.linha}: ${esc(r.erros.join(', '))}</li>`).join('')}</ul>` : ''}
        ${validos.length ? `<button type="button" class="btn largura" id="imp-ok">Importar ${validos.length} plantão(ões)</button>` : ''}`;
      const ok = el.querySelector('#imp-ok');
      if (ok) ok.onclick = () => {
        for (const r of validos) {
          const modalidade = r.tipo === 'fixo' ? (r.profissional.modalidade || 'integral') : null;
          D.plantoes.push({
            id: novoId(), profissionalId: r.profissional.id, data: r.data, turno: r.turno, tipo: r.tipo, modalidade,
            valorUnitario: r.tipo === 'fixo' ? valorUnitario(modalidade, D.config.valores) : 0, obs: 'Importado', criadoEm: new Date().toISOString(),
          });
        }
        persistir();
        ui.mes = mesDe(validos[0].data);
        fechar();
        render();
        toast(`${validos.length} plantão(ões) importado(s).`);
      };
    };
  });
}

// ======================================================================
// Página: Profissionais
// ======================================================================
function pgProfissionais() {
  const ativos = D.profissionais.filter((p) => p.ativo !== false).sort(ordenarNome);
  const inativos = D.profissionais.filter((p) => p.ativo === false).sort(ordenarNome);
  const card = (p) => `
    <li class="item">
      <div class="item-info">
        <strong>${esc(p.nome)}</strong>
        <span>${chip(NOME_CATEGORIA[p.categoria], p.categoria === 'fixo' ? 'info' : 'neutro')}
          ${p.categoria === 'fixo' ? chip(`${NOME_MODALIDADE[p.modalidade]} · ${fmtBRL(valorUnitario(p.modalidade, D.config.valores))}`) : chip('Somente refeições', 'neutro')}
          ${p.termoAceitoEm ? '' : chip('Termo pendente', 'alerta')}</span>
        <span class="dica">${p.cpf ? `CPF ${fmtCPF(p.cpf)}` : 'CPF não informado'} · ${p.pix ? `Pix: ${esc(p.pix)}` : 'Chave Pix não informada'}${p.coren ? ` · COREN ${esc(p.coren)}` : ''}</span>
      </div>
      <div class="item-acoes">
        <button type="button" class="btn-icone" data-act="termo-prof" data-id="${p.id}" aria-label="Termo de ciência (PDF)" title="Termo (PDF)">📄</button>
        <button type="button" class="btn-icone" data-act="editar-prof" data-id="${p.id}" aria-label="Editar">✎</button>
      </div>
    </li>`;
  return `
    <h1>Profissionais</h1>
    <button type="button" class="btn grande largura" data-act="novo-prof">+ Cadastrar profissional</button>
    ${ativos.length ? `<ul class="lista cartao">${ativos.map(card).join('')}</ul>`
      : '<div class="vazio pequeno"><p>Nenhum profissional cadastrado.</p></div>'}
    ${inativos.length ? `<h2 class="sub">Inativos</h2><ul class="lista cartao inativos">${inativos.map(card).join('')}</ul>` : ''}`;
}

function formProfissional(p) {
  const novo = !p;
  const p0 = p || { categoria: 'fixo', modalidade: 'integral', ativo: true };
  const corpo = `
    <form class="form" id="f-prof">
      <label>Nome completo <input name="nome" required maxlength="100" value="${esc(p0.nome || '')}"></label>
      <label>CPF <input name="cpf" required inputmode="numeric" maxlength="14" placeholder="000.000.000-00" value="${p0.cpf ? fmtCPF(p0.cpf) : ''}"></label>
      <label>Chave Pix <input name="pix" required maxlength="120" autocomplete="off" autocapitalize="off" placeholder="CPF, celular, e-mail ou chave aleatória" value="${esc(p0.pix || '')}"></label>
      <label>COREN <small>(opcional)</small> <input name="coren" maxlength="30" autocapitalize="characters" placeholder="Ex.: COREN-SP 123456-TE" value="${esc(p0.coren || '')}"></label>
      <fieldset class="segmentado"><legend>Categoria</legend>
        ${radio('categoria', 'fixo', 'Fixo', p0.categoria)}${radio('categoria', 'cobertura', 'Cobertura / Standby', p0.categoria)}</fieldset>
      <fieldset class="segmentado" id="grp-mod"><legend>Modalidade da ajuda de custo</legend>
        ${radio('modalidade', 'integral', `Integral · ${fmtBRL(valorUnitario('integral', D.config.valores))}`, p0.modalidade || 'integral')}
        ${radio('modalidade', 'transporte', `Apenas Transporte · ${fmtBRL(valorUnitario('transporte', D.config.valores))}`, p0.modalidade || 'integral')}</fieldset>
      <p class="dica" id="dica-cat"></p>
      <label class="check" id="box-opcao" hidden><input type="checkbox" name="opcao">
        <span id="txt-opcao"></span></label>
      <details class="termo-box" ${p0.termoAceitoEm ? '' : 'open'}>
        <summary>Termo de Ciência do Profissional</summary>
        <div id="termo-prof"></div>
      </details>
      <label class="check"><input type="checkbox" name="termo" ${p0.termoAceitoEm ? 'checked disabled' : ''}>
        <span>${p0.termoAceitoEm ? `Ciência registrada em ${new Date(p0.termoAceitoEm).toLocaleDateString('pt-BR')}.` : 'O(a) profissional leu e declarou ciência deste termo.'}</span></label>
      ${novo ? '' : `<label class="check"><input type="checkbox" name="ativo" ${p0.ativo !== false ? 'checked' : ''}><span>Ativo na escala</span></label>`}
      <div class="acoes-form">
        ${novo ? '' : '<button type="button" class="btn perigo sec" id="btn-excluir">Excluir</button>'}
        <button type="button" class="btn sec" data-fechar>Cancelar</button>
        <button class="btn">Salvar</button>
      </div>
    </form>`;

  modal(novo ? 'Cadastrar profissional' : 'Editar profissional', corpo, (el, fechar) => {
    const f = el.querySelector('form');
    const valorRadio = (n) => f.querySelector(`input[name=${n}]:checked`)?.value;

    function sync() {
      const cat = valorRadio('categoria');
      const mod = valorRadio('modalidade');
      el.querySelector('#grp-mod').hidden = cat !== 'fixo';
      el.querySelector('#dica-cat').textContent = cat === 'fixo'
        ? `Elegível à ajuda de custo a partir do ${LIMIAR_ELEGIBILIDADE}º plantão fixo no mês, com retroativo do 1º ao 3º.`
        : 'Cobertura/Standby: não gera valores a repassar; o cadastro serve para controle das refeições fornecidas.';
      const precisaOpcao = cat === 'fixo' && mod === 'transporte' && !(p0.modalidade === 'transporte' && p0.opcaoTransporteEm);
      el.querySelector('#box-opcao').hidden = !precisaOpcao;
      f.opcao.required = precisaOpcao;
      el.querySelector('#txt-opcao').innerHTML = 'Aceite prévio: ' + textoOpcaoTransporte(D.config, { nome: f.nome.value.trim() });
      el.querySelector('#termo-prof').innerHTML = termoProfissional(D.config, { nome: f.nome.value.trim(), cpf: f.cpf.value, pix: f.pix.value.trim(), coren: f.coren.value.trim() });
    }
    f.cpf.addEventListener('input', () => { f.cpf.value = fmtCPF(f.cpf.value); });
    f.addEventListener('input', sync);
    f.addEventListener('change', sync);
    sync();

    el.querySelector('#btn-excluir')?.addEventListener('click', () => {
      if (D.plantoes.some((x) => x.profissionalId === p.id)) {
        return toast('Há plantões registrados para este profissional. Desmarque “Ativo na escala” para inativá-lo.', 'alerta');
      }
      if (!confirm(`Excluir o cadastro de ${p.nome}?`)) return;
      D.profissionais = D.profissionais.filter((x) => x.id !== p.id);
      persistir();
      fechar();
      render();
      toast('Cadastro excluído.');
    });

    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = f.nome.value.trim().replace(/\s+/g, ' ');
      const cpf = soDigitos(f.cpf.value);
      const pix = f.pix.value.trim();
      const coren = f.coren.value.trim().toUpperCase();
      const categoria = valorRadio('categoria');
      const modalidade = categoria === 'fixo' ? valorRadio('modalidade') : null;
      if (nome.split(' ').length < 2) return toast('Informe o nome completo.', 'erro');
      if (!cpfValido(cpf)) return toast('CPF inválido. Confira os números.', 'erro');
      if (D.profissionais.some((x) => x.id !== p?.id && x.cpf === cpf)) return toast('Já existe profissional com este CPF.', 'erro');
      if (!pix) return toast('Informe a chave Pix.', 'erro');
      if (D.profissionais.some((x) => x.id !== p?.id && semAcento(x.nome) === semAcento(nome))) return toast('Já existe profissional com este nome.', 'erro');
      if (!p0.termoAceitoEm && !f.termo.checked) return toast('É necessário registrar a ciência do termo.', 'erro');
      if (f.opcao.required && !f.opcao.checked) return toast('Registre o aceite da opção “Apenas Transporte”.', 'erro');

      const agora = new Date().toISOString();
      const dados = {
        nome, cpf, pix, coren, categoria, modalidade,
        termoAceitoEm: p0.termoAceitoEm || agora,
        opcaoTransporteEm: modalidade === 'transporte' ? (f.opcao.required ? agora : p0.opcaoTransporteEm) : null,
        ativo: novo ? true : f.ativo.checked,
      };
      if (novo) {
        D.profissionais.push({ id: novoId(), criadoEm: agora, ...dados });
      } else {
        const mudouCat = p.categoria !== categoria;
        const mudouMod = categoria === 'fixo' && p.modalidade !== modalidade;
        Object.assign(p, dados);
        if ((mudouCat || mudouMod) && D.plantoes.some((x) => x.profissionalId === p.id)
          && confirm('Aplicar a nova categoria/modalidade também aos plantões já registrados em meses ainda não pagos?')) {
          const n = reaplicarEmAbertos((x) => x.profissionalId === p.id, (x) => {
            if (categoria !== 'fixo') { x.tipo = 'cobertura'; x.modalidade = null; }
            else {
              if (mudouCat) x.tipo = 'fixo';
              if (x.tipo === 'fixo') x.modalidade = modalidade;
            }
          });
          toast(`${n} plantão(ões) atualizado(s).`);
        }
      }
      persistir();
      fechar();
      render();
      toast(novo ? 'Profissional cadastrado.' : 'Cadastro atualizado.');
    });
  });
}

// ======================================================================
// Página: Extratos
// ======================================================================
function pgExtratos() {
  if (ui.extratoProf && prof(ui.extratoProf)) return pgExtratoDetalhe();
  const lista = extratosDoMes(ui.mes);
  const total = lista.reduce((s, e) => s + e.total, 0);
  return `
    <h1>Extratos de Repasse</h1>
    ${seletorMes()}
    <section class="cartao">
      <div class="cartao-topo">
        <div><h2>Total do mês</h2><p class="dica">Data limite: ${fmtData(quintoDiaUtil(ui.mes))} (5º dia útil do mês seguinte)</p></div>
        <div class="valor-destaque">${fmtBRL(total)}</div>
      </div>
      ${lista.length ? `<ul class="lista">${lista.map((e) => linhaResumo(e)).join('')}</ul>
        <button type="button" class="btn sec largura" data-act="pdf-mes">Resumo do mês (PDF)</button>`
        : `<p class="dica">Nenhum plantão registrado em ${nomeMes(ui.mes)}.</p>`}
    </section>`;
}

function pgExtratoDetalhe() {
  const p = prof(ui.extratoProf);
  const ext = calcularExtrato(p, D.plantoes, ui.mes);
  const st = statusRepasse(ext);
  const modal_ = ext.modalidades.length ? ext.modalidades.map((m) => NOME_MODALIDADE[m]).join(' + ') : (p.categoria === 'fixo' ? NOME_MODALIDADE[p.modalidade] : '—');
  return `
    <button type="button" class="link voltar" data-act="voltar-extratos">‹ Todos os extratos</button>
    <h1>${esc(p.nome)}</h1>
    <p class="dica">${NOME_CATEGORIA[p.categoria]} · Modalidade: ${modal_}${p.coren ? ` · COREN ${esc(p.coren)}` : ''}</p>
    ${p.pix ? `<div class="pix-linha"><span>Chave Pix: <strong>${esc(p.pix)}</strong></span>
      <button type="button" class="btn sec pequeno" data-act="copiar-pix">Copiar</button></div>` : ''}
    ${seletorMes()}

    <div class="detalhe-extrato"><div>
    <section class="cartao">
      ${ext.linhas.length ? `<ul class="lista extrato">
        ${ext.linhas.map((l) => `
          <li class="item ${l.ativou ? 'destaque' : ''}">
            <div class="data-bloco"><strong>${l.plantao.data.slice(8)}</strong><span>${diaSemana(l.plantao.data)}</span></div>
            <div class="item-info"><strong>${esc(l.status)}</strong>
              <span class="dica">${NOME_TURNO[l.plantao.turno]}${l.plantao.tipo === 'fixo' ? ` · ${NOME_MODALIDADE[l.plantao.modalidade]} · unit. ${fmtBRL(l.valorUnitario)}${l.peso > 1 ? ` × ${l.peso}` : ''}` : ''}${l.retroativo ? ' · retroativo' : ''}${l.refeicaoNoLocal ? ' · refeição no local' : ''}</span>
              ${l.ativou ? '<span class="dica">*Ativou a regra de elegibilidade e o retroativo</span>' : ''}</div>
            <div class="item-dir"><strong>${fmtBRL(l.subtotal)}</strong></div>
          </li>`).join('')}
      </ul>` : `<p class="dica">Nenhum plantão em ${nomeMes(ui.mes)}.</p>`}
    </section>
    </div><div>

    <section class="cartao resumo">
      <h2>Resumo do período</h2>
      <dl>
        <dt>Plantões fixos apurados</dt><dd>${ext.plantoesFixos}</dd>
        ${ext.plantoesCobertura ? `<dt>Plantões de cobertura</dt><dd>${ext.plantoesCobertura}</dd>` : ''}
        <dt>Refeições fornecidas no local</dt><dd>${ext.refeicoesNoLocal}</dd>
        <dt>Ajuste retroativo (1º a 3º)</dt><dd>${ext.elegivel ? `Aplicado · ${fmtBRL(ext.valorRetroativo)}` : ext.plantoesFixos ? `Aguardando ${LIMIAR_ELEGIBILIDADE}º plantão (falta(m) ${ext.faltam})` : '—'}</dd>
        <dt>Data limite do repasse</dt><dd>${fmtData(ext.dataLimite)}</dd>
      </dl>
      <div class="total-linha"><span>Valor total do repasse</span><strong>${fmtBRL(ext.total)}</strong></div>
      <div class="status-linha">${chip(st.txt, st.cls)}
        ${st.pago && st.diverge ? chip(`Valor pago (${fmtBRL(st.r.valor)}) difere do extrato atual`, 'erro') : ''}</div>
      ${st.pago ? `<p class="dica">Forma: ${esc(st.r.forma)}${st.r.obs ? ' · ' + esc(st.r.obs) : ''}</p>` : ''}
    </section>

    <div class="grade-acoes">
      ${ext.total > 0 && !st.pago ? '<button type="button" class="btn" data-act="registrar-repasse">✓ Registrar repasse pago</button>' : ''}
      ${st.pago ? '<button type="button" class="btn sec" data-act="desfazer-repasse">Desfazer pagamento</button>' : ''}
      <button type="button" class="btn sec" data-act="pdf-extrato">Extrato (PDF)</button>
      ${ext.total > 0 ? '<button type="button" class="btn sec" data-act="pdf-recibo">Recibo (PDF)</button>' : ''}
      <button type="button" class="btn sec whats" data-act="whatsapp">Enviar por WhatsApp</button>
    </div>
    </div></div>`;
}

function formRepasse(ext) {
  modal('Registrar repasse pago', `
    <form class="form">
      <p>${esc(ext.profissional.nome)} · ${nomeMes(ext.mes)}</p>
      <div class="total-linha"><span>Valor</span><strong>${fmtBRL(ext.total)}</strong></div>
      <label>Data do repasse <input type="date" name="pagoEm" required value="${hojeISO()}"></label>
      <label>Forma <select name="forma">${['Pix', 'Dinheiro', 'Transferência', 'Outra'].map((x) => opt(x, x, 'Pix')).join('')}</select></label>
      <label>Observação <small>(opcional)</small> <input name="obs" maxlength="200"></label>
      <div class="acoes-form"><button type="button" class="btn sec" data-fechar>Cancelar</button><button class="btn">Confirmar</button></div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      D.repasses[chaveRepasse(ext.profissional.id, ext.mes)] = {
        pagoEm: f.pagoEm.value, forma: f.forma.value, obs: f.obs.value.trim(), valor: ext.total, registradoEm: new Date().toISOString(),
      };
      persistir();
      fechar();
      render();
      toast('Repasse registrado. Gere o recibo para assinatura.');
    });
  });
}

function textoWhatsApp(ext) {
  const st = statusRepasse(ext);
  return [
    `*Extrato de Apoio Voluntário – ${nomeMes(ext.mes)}*`,
    D.config.familia ? `Família Colaboradora: ${D.config.familia}` : null,
    `Profissional: ${ext.profissional.nome}`,
    '',
    ...ext.linhas.map((l) => `${fmtData(l.plantao.data)} ${NOME_TURNO[l.plantao.turno]} – ${l.status} – ${fmtBRL(l.subtotal)}`),
    '',
    `Plantões apurados: ${ext.plantoesFixos}`,
    `Ajuste retroativo (1º a 3º): ${ext.elegivel ? 'aplicado' : 'não aplicável'}`,
    `*Valor total do repasse: ${fmtBRL(ext.total)}*`,
    st.pago ? `Repassado em ${fmtData(st.r.pagoEm)} (${st.r.forma})` : `Data limite: ${fmtData(ext.dataLimite)}`,
    '',
    rodapeWhatsapp(D.config, ext.profissional, ext),
  ].filter((x) => x !== null).join('\n');
}

// ======================================================================
// Página: Ajustes
// ======================================================================
function pgAjustes() {
  const c = D.config;
  return `
    <h1>Ajustes</h1>
    <div class="grade-cartoes">
    <section class="cartao">
      <h2>Família Colaboradora</h2>
      <form class="form" id="f-familia">
        <label>Nome da família <input name="familia" maxlength="80" value="${esc(c.familia)}"></label>
        <label>Nome do paciente <input name="paciente" maxlength="80" value="${esc(c.paciente)}"></label>
        <label>Cidade (recibos) <input name="cidade" maxlength="60" value="${esc(c.cidade)}"></label>
        <button class="btn">Salvar</button>
      </form>
    </section>

    <section class="cartao">
      <h2>Valores por plantão (12h)</h2>
      <form class="form" id="f-valores">
        <div class="duas-colunas">
          <label>Alimentação (R$) <input name="alimentacao" type="number" min="0" step="0.01" inputmode="decimal" required value="${c.valores.alimentacao}"></label>
          <label>Transporte (R$) <input name="transporte" type="number" min="0" step="0.01" inputmode="decimal" required value="${c.valores.transporte}"></label>
        </div>
        <p class="dica">Integral: <strong>${fmtBRL(valorUnitario('integral', c.valores))}</strong> · Apenas Transporte: <strong>${fmtBRL(valorUnitario('transporte', c.valores))}</strong>.
        Novos valores valem para os próximos registros.</p>
        <button class="btn">Salvar valores</button>
      </form>
    </section>

    <section class="cartao">
      <h2>Textos e termos</h2>
      <p class="dica">Edite aqui os textos dos termos, recibos e mensagens. As alterações valem na hora, sem novo deploy.</p>
      <ul class="lista">${Object.entries(TEXTOS_PADRAO).map(([k, t]) => `
        <li class="item clicavel" data-act="editar-texto" data-chave="${k}">
          <div class="item-info"><strong>${esc(t.titulo)}</strong><span class="dica">${esc(t.onde)}</span></div>
          <div class="item-dir">${textoPersonalizado(c, k) ? chip('Personalizado', 'info') : chip('Padrão', 'neutro')}</div>
        </li>`).join('')}</ul>
    </section>

    <section class="cartao">
      <h2>Segurança</h2>
      <form class="form" id="f-senha">
        <label>Senha atual <input name="atual" type="password" required autocomplete="current-password"></label>
        <label>Nova senha <input name="nova" type="password" required minlength="6" autocomplete="new-password"></label>
        <label>Repita a nova senha <input name="nova2" type="password" required minlength="6" autocomplete="new-password"></label>
        <button class="btn">Alterar senha</button>
      </form>
    </section>

    <section class="cartao">
      <h2>Backup dos dados</h2>
      <p class="dica">Os dados ficam somente neste aparelho/navegador. Exporte um backup com frequência e use-o
      para levar os dados a outro celular ou computador. O arquivo contém nomes e chaves Pix: guarde-o com cuidado.</p>
      <div class="barra-acoes">
        <button type="button" class="btn sec" data-act="exportar">Exportar backup</button>
        <label class="btn sec arquivo">Restaurar backup<input type="file" accept=".json,application/json" data-act-change="importar-backup" hidden></label>
      </div>
    </section>

    <section class="cartao">
      <h2>Sobre</h2>
      <p class="dica">Livro-caixa particular de Apoio Voluntário. ${D.profissionais.length} profissional(is) ·
      ${D.plantoes.length} plantão(ões) registrados.</p>
      <div class="barra-acoes">
        <button type="button" class="btn sec" data-act="ver-termo-familia">Termo de Ciência</button>
        <button type="button" class="btn sec" data-act="sair">Sair</button>
      </div>
      <button type="button" class="link perigo" id="btn-apagar-tudo">Apagar todos os dados deste aparelho</button>
    </section>
    </div>`;
}

// Os formulários de Ajustes usam delegação de submit
document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (!D || !['f-familia', 'f-valores', 'f-senha'].includes(f.id)) return;
  e.preventDefault();
  if (f.id === 'f-familia') {
    Object.assign(D.config, {
      familia: f.familia.value.trim(), paciente: f.paciente.value.trim(),
      cidade: f.cidade.value.trim(),
    });
    persistir();
    render();
    toast('Dados da família salvos.');
  }
  if (f.id === 'f-valores') {
    const alimentacao = round2(Number(f.alimentacao.value));
    const transporte = round2(Number(f.transporte.value));
    if (!(alimentacao >= 0 && transporte >= 0)) return toast('Valores inválidos.', 'erro');
    D.config.valores = { alimentacao, transporte };
    if (D.plantoes.some((p) => p.tipo === 'fixo')
      && confirm('Aplicar os novos valores também aos plantões já registrados em meses ainda não pagos?')) {
      const n = reaplicarEmAbertos((p) => p.tipo === 'fixo');
      toast(`${n} plantão(ões) recalculado(s).`);
    }
    persistir();
    render();
    toast('Valores salvos.');
  }
  if (f.id === 'f-senha') {
    if (f.nova.value !== f.nova2.value) return toast('As novas senhas não conferem.', 'erro');
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      await store.trocarSenha(f.atual.value, f.nova.value, D);
      f.reset();
      toast('Senha alterada.');
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      btn.disabled = false;
    }
  }
});

document.addEventListener('click', (e) => {
  if (e.target.id !== 'btn-apagar-tudo') return;
  const txt = prompt('Isto apaga TODOS os dados deste aparelho. Exporte um backup antes.\nDigite APAGAR para confirmar:');
  if ((txt || '').trim().toUpperCase() !== 'APAGAR') return;
  store.apagarTudo();
  location.hash = '';
  location.reload();
});

function formTexto(chave) {
  const def = TEXTOS_PADRAO[chave];
  // Exemplo para a pré-visualização
  const exProf = D.profissionais.find((p) => p.ativo !== false) || { nome: 'Nome do Profissional', cpf: '52998224725', pix: 'chave@exemplo.com', coren: 'COREN-SP 000000-TE' };
  const exExt = { total: 120, mes: mesAnterior(mesDe(hojeISO())), plantoesFixos: 4, dataLimite: quintoDiaUtil(mesAnterior(mesDe(hojeISO()))) };
  const campos = montarCampos(D.config, exProf, exExt);
  modal(esc(def.titulo), `
    <form class="form">
      <p class="dica">${esc(def.onde)}</p>
      <label>Texto <textarea name="texto" rows="12" class="editor-texto">${esc(obterTexto(D.config, chave))}</textarea></label>
      <div class="campo"><span class="rotulo">Campos automáticos <small>(toque para inserir)</small></span>
        <div class="chips-campos">${def.campos.map((k) => `<button type="button" class="chip campo-btn" data-campo="${k}" title="${esc(CAMPOS[k])}">{${k}}</button>`).join('')}</div>
      </div>
      <details class="termo-box"><summary>Como formatar</summary>
        <p><code>**texto**</code> deixa em <strong>negrito</strong>. Uma linha em branco começa novo parágrafo.
        Linhas começando com <code>1.</code> viram lista numerada; com <code>-</code>, lista com marcadores.
        Os campos entre chaves (ex.: <code>{profissional}</code>) são preenchidos automaticamente.</p>
      </details>
      <div class="campo"><span class="rotulo">Pré-visualização <small>(com dados de exemplo)</small></span>
        <div class="termo-box previa" id="previa"></div></div>
      <p class="dica erro-texto" id="aviso-campos" hidden></p>
      <div class="acoes-form">
        <button type="button" class="btn sec" id="btn-padrao">Restaurar padrão</button>
        <button type="button" class="btn sec" data-fechar>Cancelar</button>
        <button class="btn">Salvar</button>
      </div>
    </form>`, (el, fechar) => {
    const f = el.querySelector('form');
    const ta = f.texto;
    const atualizar = () => {
      el.querySelector('#previa').innerHTML = renderTexto(ta.value, campos) || '<p class="dica">(vazio — será usado o texto padrão)</p>';
      const desc = camposDesconhecidos(ta.value);
      const aviso = el.querySelector('#aviso-campos');
      aviso.hidden = !desc.length;
      aviso.textContent = desc.length ? `Campo(s) não reconhecido(s): ${desc.map((d) => `{${d}}`).join(', ')}. Confira a grafia.` : '';
    };
    ta.addEventListener('input', atualizar);
    atualizar();
    el.querySelectorAll('[data-campo]').forEach((b) => b.addEventListener('click', () => {
      const ins = `{${b.dataset.campo}}`;
      const i = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, i) + ins + ta.value.slice(ta.selectionEnd ?? i);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = i + ins.length;
      atualizar();
    }));
    el.querySelector('#btn-padrao').onclick = () => {
      if (!confirm('Substituir pelo texto padrão?')) return;
      ta.value = def.texto;
      atualizar();
    };
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const txt = ta.value.replace(/\r/g, '').trim();
      if (!txt || txt === def.texto) delete D.config.textos[chave];
      else D.config.textos[chave] = txt;
      persistir();
      fechar();
      render();
      toast('Texto salvo.');
    });
  });
}

function exportarBackup() {
  const blob = new Blob([JSON.stringify({ ...D, exportadoEm: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `apoio-voluntario-backup-${hojeISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup exportado.');
}

async function importarBackup(input) {
  const arq = input.files[0];
  input.value = '';
  if (!arq) return;
  try {
    const obj = JSON.parse(await arq.text());
    if (!Array.isArray(obj.profissionais) || !Array.isArray(obj.plantoes)) throw new Error('arquivo não reconhecido');
    if (!confirm(`Restaurar backup com ${obj.profissionais.length} profissional(is) e ${obj.plantoes.length} plantão(ões)?\nOs dados atuais deste aparelho serão substituídos.`)) return;
    D = normalizar(obj);
    delete D.exportadoEm;
    await persistir();
    render();
    toast('Backup restaurado.');
  } catch (err) {
    toast('Não foi possível restaurar: ' + err.message, 'erro');
  }
}

// ======================================================================
// Documentos para impressão / PDF
// ======================================================================
function imprimir(html, nomeArquivo) {
  let area = document.getElementById('area-impressao');
  if (!area) {
    area = document.createElement('div');
    area.id = 'area-impressao';
    document.body.appendChild(area);
  }
  area.innerHTML = html;
  const tituloAnterior = document.title;
  document.title = nomeArquivo; // vira o nome sugerido do PDF
  const restaurar = () => { document.title = tituloAnterior; };
  window.addEventListener('afterprint', restaurar, { once: true });
  setTimeout(() => window.print(), 50);
}

function docCabecalho(titulo, subtitulo = '', { familia = true } = {}) {
  return `<header class="doc-cab"><div><h1>${titulo}</h1>${subtitulo ? `<p>${subtitulo}</p>` : ''}</div>
    ${familia ? `<div class="doc-familia">Família Colaboradora<br><strong>${esc(D.config.familia || '—')}</strong></div>` : ''}</header>`;
}

/** Linha sob a assinatura do profissional: COREN do cadastro. */
const linhaCoren = (p) => {
  if (!p.coren) return 'COREN ____________';
  return /^coren/i.test(p.coren.trim()) ? esc(p.coren) : `COREN ${esc(p.coren)}`;
};

function dataPorExtenso(iso) {
  const d = parseISO(iso);
  return `${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
}

function docExtrato(ext, anexo = false) {
  const p = ext.profissional;
  const modalidades = ext.modalidades.map((m) => NOME_MODALIDADE[m]).join(' + ') || (p.categoria === 'fixo' ? NOME_MODALIDADE[p.modalidade] : '—');
  return `
  <article class="doc">
    ${docCabecalho(`Extrato de Apoio Voluntário${anexo ? ' (anexo)' : ''}`, `Mês de referência: <strong>${nomeMes(ext.mes)}</strong>`)}
    <p class="doc-linha">Profissional: <strong>${esc(p.nome)}</strong>${p.cpf ? ` · CPF ${fmtCPF(p.cpf)}` : ''} · Categoria: ${NOME_CATEGORIA[p.categoria]} · Modalidade: ${modalidades}</p>
    <table class="doc-tabela">
      <thead><tr><th>Data</th><th>Turno</th><th>Status do plantão</th><th>Valor unitário</th><th>Subtotal</th></tr></thead>
      <tbody>${ext.linhas.map((l) => `
        <tr><td>${fmtData(l.plantao.data)}</td><td>${NOME_TURNO[l.plantao.turno]}</td>
        <td>${esc(l.status)}${l.plantao.tipo === 'fixo' && l.plantao.modalidade === 'transporte' ? ' · Transporte' : ''}</td>
        <td>${fmtBRL(l.valorUnitario)}${l.peso > 1 ? ` × ${l.peso}` : ''}</td><td>${fmtBRL(l.subtotal)}</td></tr>`).join('')
        || '<tr><td colspan="5">Nenhum plantão registrado.</td></tr>'}</tbody>
    </table>
    ${ext.elegivel ? '<p class="doc-nota">*Ativou a regra de elegibilidade e o retroativo.</p>' : ''}
    <h2>Resumo do período</h2>
    <table class="doc-resumo">
      <tr><td>Plantões apurados (fixos)</td><td>${ext.plantoesFixos}</td></tr>
      ${ext.plantoesCobertura ? `<tr><td>Plantões de cobertura (sem repasse)</td><td>${ext.plantoesCobertura}</td></tr>` : ''}
      <tr><td>Refeições fornecidas no local</td><td>${ext.refeicoesNoLocal}</td></tr>
      <tr><td>Ajuste retroativo (plantões 1 a 3)</td><td>${ext.elegivel ? `Aplicado (${fmtBRL(ext.valorRetroativo)})` : `Não aplicado (mínimo de ${LIMIAR_ELEGIBILIDADE} plantões fixos)`}</td></tr>
      <tr class="doc-total"><td>VALOR TOTAL DO REPASSE (até ${fmtData(ext.dataLimite)} – 5º dia útil)</td><td>${fmtBRL(ext.total)}</td></tr>
    </table>
    ${anexo ? '' : `
    <p class="doc-declaracao">${declaracaoExtrato(D.config, p, ext)}</p>
    <div class="doc-assinaturas"><div><span></span>Assinatura do(a) Profissional</div></div>`}
    <footer class="doc-rodape">Extrato de Repasse – Ajuda de Custo Indenizatória · emitido em ${fmtData(hojeISO())}</footer>
  </article>`;
}

function docRecibo(ext) {
  const p = ext.profissional;
  const r = D.repasses[chaveRepasse(p.id, ext.mes)];
  const local = D.config.cidade || '____________________';
  const data = r ? dataPorExtenso(r.pagoEm) : '____ de ____________ de ______';
  return `
  <article class="doc">
    ${docCabecalho('Recibo de Apoio Voluntário', 'Ajuda de Custo Indenizatória – Alimentação e Transporte', { familia: false })}
    <div class="doc-valor">${fmtBRL(ext.total)}</div>
    <div class="doc-texto">${textoRecibo(D.config, p, ext)}</div>
    ${r ? `<p class="doc-linha">Forma do repasse: ${esc(r.forma)}${r.obs ? ' · ' + esc(r.obs) : ''}</p>` : ''}
    <p class="doc-local">${esc(local)}, ${data}.</p>
    <div class="doc-assinaturas">
      <div><span></span>${esc(p.nome)}<br><small>${linhaCoren(p)}</small></div>
      <div><span></span>Família Colaboradora<br><small>${esc(D.config.familia || '')}</small></div>
    </div>
    <p class="doc-nota">Confirmação digital (opcional): ( ) Recebido e conferido via mensagem em ___/___/______.</p>
    <footer class="doc-rodape">Documento de quitação de apoio voluntário, sem natureza salarial · emitido em ${fmtData(hojeISO())}</footer>
  </article>`;
}

function docTermo(p) {
  return `
  <article class="doc">
    ${docCabecalho('Termo de Ciência', 'Ajuda de Custo Voluntária e Indenizatória')}
    <div class="doc-texto">${termoProfissional(D.config, p)}
      ${p.modalidade === 'transporte' && p.categoria === 'fixo' ? `<p><strong>Opção de modalidade:</strong> ${textoOpcaoTransporte(D.config, p)}</p>` : ''}
      ${p.categoria !== 'fixo' ? '<p><strong>Categoria Cobertura/Standby:</strong> não há repasse em dinheiro; a alimentação é fornecida integralmente no local.</p>' : ''}
    </div>
    <p class="doc-local">${esc(D.config.cidade || '____________________')}, ${p.termoAceitoEm ? dataPorExtenso(p.termoAceitoEm.slice(0, 10)) : '____ de ____________ de ______'}.</p>
    <div class="doc-assinaturas">
      <div><span></span>${esc(p.nome)}<br><small>${linhaCoren(p)}</small></div>
      <div><span></span>Família Colaboradora<br><small>${esc(D.config.familia || '')}</small></div>
    </div>
  </article>`;
}

function docRelatorioMes(ym) {
  const lista = extratosDoMes(ym);
  const total = lista.reduce((s, e) => s + e.total, 0);
  return `
  <article class="doc">
    ${docCabecalho('Resumo de Repasses do Mês', `Mês de referência: <strong>${nomeMes(ym)}</strong> · Data limite: ${fmtData(quintoDiaUtil(ym))}`)}
    <table class="doc-tabela">
      <thead><tr><th>Profissional</th><th>Categoria</th><th>Plantões fixos</th><th>Cobertura</th><th>Refeições</th><th>Valor</th><th>Situação</th></tr></thead>
      <tbody>${lista.map((e) => `<tr><td>${esc(e.profissional.nome)}</td><td>${NOME_CATEGORIA[e.profissional.categoria]}</td>
        <td>${e.plantoesFixos}</td><td>${e.plantoesCobertura}</td><td>${e.refeicoesNoLocal}</td><td>${fmtBRL(e.total)}</td>
        <td>${esc(statusRepasse(e).txt)}</td></tr>`).join('') || '<tr><td colspan="7">Nenhum plantão registrado.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="5">Total</td><td colspan="2">${fmtBRL(total)}</td></tr></tfoot>
    </table>
    <footer class="doc-rodape">Livro-caixa particular de Apoio Voluntário · emitido em ${fmtData(hojeISO())}</footer>
  </article>`;
}

// ======================================================================
// Inicialização
// ======================================================================
async function iniciar() {
  if (!store.criptografiaDisponivel()) {
    $app.innerHTML = `<main class="tela-acesso"><div class="cartao acesso"><h1>Navegador não suportado</h1>
      <p>Abra o sistema por um endereço <strong>https://</strong> (ex.: o link da Vercel) em um navegador atualizado.</p></div></main>`;
    return;
  }
  if (!store.existeCofre()) return telaConfiguracao();
  const dados = await store.retomarSessao();
  if (dados) { D = normalizar(dados); abrirApp(); } else telaLogin();
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

iniciar();
