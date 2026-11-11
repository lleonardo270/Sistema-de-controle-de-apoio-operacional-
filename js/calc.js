// Regras de negócio puras (sem acesso a DOM ou armazenamento).
// Testáveis com: node --test tests/

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const LIMIAR_ELEGIBILIDADE = 4;

export const VALORES_PADRAO = { alimentacao: 20, transporte: 10 };

// ---------- Dinheiro ----------
export function fmtBRL(v) {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function valorUnitario(modalidade, valores = VALORES_PADRAO) {
  const a = Number(valores.alimentacao) || 0;
  const t = Number(valores.transporte) || 0;
  return modalidade === 'transporte' ? t : a + t;
}

// ---------- Datas (sempre strings 'AAAA-MM-DD', sem fuso) ----------
const pad = (n) => String(n).padStart(2, '0');

export function toISO(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function hojeISO() {
  return toISO(new Date());
}
export function fmtData(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
export function diaSemana(s) {
  return DIAS_SEMANA[parseISO(s).getDay()];
}
export function mesDe(s) {
  return s.slice(0, 7);
}
export function somarMeses(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
}
export const mesAnterior = (ym) => somarMeses(ym, -1);
export const proximoMes = (ym) => somarMeses(ym, 1);
export function nomeMes(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MESES[m - 1]} / ${y}`;
}
export function diasDoMes(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
export function pascoa(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mes - 1, dia);
}

export function feriadosNacionais(y) {
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
  if (y >= 2024) fixos.push('11-20');
  const set = new Set(fixos.map((md) => `${y}-${md}`));
  const p = pascoa(y);
  set.add(toISO(new Date(p.getFullYear(), p.getMonth(), p.getDate() - 2))); // Sexta-feira Santa
  return set;
}

// Data limite de repasse: 5º dia útil (seg–sex, exceto feriados nacionais)
// do mês subsequente ao mês de referência.
export function quintoDiaUtil(ymReferencia) {
  const ym = proximoMes(ymReferencia);
  const [y, m] = ym.split('-').map(Number);
  const feriados = feriadosNacionais(y);
  let uteis = 0;
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6 || feriados.has(toISO(dt))) continue;
    if (++uteis === 5) return toISO(dt);
  }
  return null;
}

// ---------- Motor de cálculo ----------
// Trocas de plantão às 07h e às 19h.
//   diurno : 07h–19h da data
//   noturno: 19h da data – 07h do dia seguinte
//   24h    : 07h da data – 07h do dia seguinte (dia + noite da data)
//   24h19  : 19h da data – 19h do dia seguinte (noite da data + dia seguinte)
// O plantão pertence ao mês da data em que COMEÇA.
export const TURNOS = ['diurno', 'noturno', '24h', '24h19'];
export const HORARIO_TURNO = { diurno: '07h–19h', noturno: '19h–07h', '24h': '07h–07h', '24h19': '19h–19h' };
const ORDEM_TURNO = { diurno: 0, '24h': 0, noturno: 1, '24h19': 1 };

/** Quantos plantões de 12h o turno representa (24h = 2). */
export const pesoTurno = (turno) => (turno === '24h' || turno === '24h19' ? 2 : 1);

const diaSeguinte = (iso) => {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
};

/** Períodos de 12h ocupados pelo plantão: 'AAAA-MM-DD|D' (07h–19h) ou '|N' (19h–07h). */
export function periodosOcupados({ data, turno }) {
  switch (turno) {
    case 'diurno': return [`${data}|D`];
    case 'noturno': return [`${data}|N`];
    case '24h': return [`${data}|D`, `${data}|N`];
    case '24h19': return [`${data}|N`, `${diaSeguinte(data)}|D`];
    default: return [];
  }
}

/** Dois plantões (do mesmo profissional) se sobrepõem no tempo? */
export function plantoesConflitam(a, b) {
  const pa = periodosOcupados(a);
  return periodosOcupados(b).some((x) => pa.includes(x));
}

export function compararPlantoes(a, b) {
  if (a.data !== b.data) return a.data < b.data ? -1 : 1;
  return (ORDEM_TURNO[a.turno] ?? 9) - (ORDEM_TURNO[b.turno] ?? 9);
}

const ordinal = (ini, fim) => (ini === fim ? `${ini}º` : `${ini}º e ${fim}º`);

/**
 * Calcula o extrato de um profissional em um mês.
 * - Só plantões do tipo "fixo" contam (cobertura nunca gera repasse).
 * - Contagem e valores em plantões de 12h: um turno de 24h vale por dois.
 * - Abaixo de 4 plantões fixos: nada a repassar (aguardando elegibilidade).
 * - Ao atingir o 4º: todos os plantões do mês são validados, inclusive o
 *   retroativo do 1º ao 3º.
 */
export function calcularExtrato(prof, plantoes, ym) {
  const doMes = plantoes
    .filter((p) => p.profissionalId === prof.id && mesDe(p.data) === ym)
    .sort(compararPlantoes);

  // O tipo é gravado no próprio plantão no momento do registro, para que
  // mudanças posteriores de categoria não alterem meses já apurados.
  const contaParaRepasse = (p) => p.tipo === 'fixo';
  const fixos = doMes.filter(contaParaRepasse);
  const soma = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const equivalentes = soma(fixos, (p) => pesoTurno(p.turno));
  const elegivel = equivalentes >= LIMIAR_ELEGIBILIDADE;

  let acumulado = 0;
  const linhas = doMes.map((p) => {
    const peso = pesoTurno(p.turno);
    const refeicaoNoLocal = p.tipo !== 'fixo' || p.modalidade === 'transporte';
    if (!contaParaRepasse(p)) {
      return {
        plantao: p, ordem: null, peso, status: 'Cobertura (sem repasse)', valorUnitario: 0,
        subtotal: 0, retroativo: false, ativou: false, refeicaoNoLocal,
      };
    }
    const ini = acumulado + 1;
    const fim = acumulado + peso;
    acumulado = fim;
    const vu = Number(p.valorUnitario) || 0;
    const ativou = elegivel && ini <= LIMIAR_ELEGIBILIDADE && fim >= LIMIAR_ELEGIBILIDADE;
    let status;
    if (!elegivel) status = `Registrado (${ordinal(ini, fim)}) – aguardando 4º`;
    else status = `Validado (${ordinal(ini, fim)})${ativou ? '*' : ''}`;
    return {
      plantao: p, ordem: ini, ordemFim: fim, peso, status, valorUnitario: vu,
      subtotal: elegivel ? round2(vu * peso) : 0,
      retroativo: elegivel && fim < LIMIAR_ELEGIBILIDADE,
      ativou,
      refeicaoNoLocal,
    };
  });

  const potencial = soma(linhas.filter((l) => l.ordem), (l) => l.valorUnitario * l.peso);
  const modalidades = [...new Set(fixos.map((p) => p.modalidade))];

  return {
    profissional: prof,
    mes: ym,
    linhas,
    totalPlantoes: doMes.length,
    // contagens em plantões de 12h (24h = 2)
    plantoesFixos: equivalentes,
    plantoesCobertura: soma(doMes.filter((p) => !contaParaRepasse(p)), (p) => pesoTurno(p.turno)),
    turnos24h: doMes.filter((p) => p.turno === '24h').length,
    refeicoesNoLocal: soma(linhas.filter((l) => l.refeicaoNoLocal), (l) => l.peso),
    elegivel,
    faltam: Math.max(0, LIMIAR_ELEGIBILIDADE - equivalentes),
    valorRetroativo: round2(soma(linhas.filter((l) => l.retroativo), (l) => l.subtotal)),
    valorPotencial: round2(potencial),
    total: round2(soma(linhas, (l) => l.subtotal)),
    modalidades,
    dataLimite: quintoDiaUtil(ym),
  };
}

export const round2 = (v) => Math.round(v * 100) / 100;

// ---------- Valor por extenso ----------
const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
  'setecentos', 'oitocentos', 'novecentos'];

function ate999(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) {
    if (r < 20) partes.push(UNIDADES[r]);
    else {
      const d = Math.floor(r / 10), u = r % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
}

function inteiroPorExtenso(n) {
  if (n === 0) return 'zero';
  const milhoes = Math.floor(n / 1e6), milhares = Math.floor((n % 1e6) / 1000), resto = n % 1000;
  const grupos = [];
  if (milhoes) grupos.push(milhoes === 1 ? 'um milhão' : `${ate999(milhoes)} milhões`);
  if (milhares) grupos.push(milhares === 1 ? 'mil' : `${ate999(milhares)} mil`);
  let txt = grupos.join(' ');
  if (resto) {
    const sep = !txt ? '' : (resto < 100 || resto % 100 === 0) ? ' e ' : ' ';
    txt += sep + ate999(resto);
  }
  return txt;
}

export function valorPorExtenso(v) {
  const cents = Math.round((Number(v) || 0) * 100);
  const reais = Math.floor(cents / 100), c = cents % 100;
  let s = '';
  if (reais) s = inteiroPorExtenso(reais) + (reais === 1 ? ' real' : ' reais');
  if (c) s += (s ? ' e ' : '') + inteiroPorExtenso(c) + (c === 1 ? ' centavo' : ' centavos');
  return s || 'zero real';
}

// ---------- CPF ----------
export const soDigitos = (s) => String(s || '').replace(/\D/g, '');

export function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(d[t])) return false;
  }
  return true;
}

export function fmtCPF(cpf) {
  const d = soDigitos(cpf).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

// ---------- Importação de planilha (CSV) ----------
export function parseCSV(texto) {
  const linhas = String(texto || '').split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return [];
  const delim = linhas[0].includes(';') ? ';' : linhas[0].includes('\t') ? '\t' : ',';
  return linhas.map((linha) => {
    const cols = [];
    let atual = '', aspas = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (ch === '"') {
        if (aspas && linha[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas;
      } else if (ch === delim && !aspas) { cols.push(atual.trim()); atual = ''; }
      else atual += ch;
    }
    cols.push(atual.trim());
    return cols;
  });
}

export const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function interpretarData(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y, mo, d;
  if (m) [, y, mo, d] = m.map(Number);
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
    [, d, mo, y] = m.map(Number);
    if (y < 100) y += 2000;
  } else return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return toISO(dt);
}

export function interpretarTurno(s) {
  const t = semAcento(s);
  if (['diurno', 'd', 'dia', 'diurna', 'manha'].includes(t)) return 'diurno';
  if (['noturno', 'n', 'noite', 'noturna'].includes(t)) return 'noturno';
  const c = t.replace(/[^a-z0-9]/g, '');
  if (['24', '24h', '24hs', '24horas', '2407', '24h07', '24h07h', '24h7', '24h7h', '24hdia', '24hdiurno', 'plantao24h'].includes(c)) return '24h';
  if (['2419', '24h19', '24h19h', '24hnoite', '24hnoturno', '24noite', '24horas19h', 'plantao24h19h'].includes(c)) return '24h19';
  return null;
}

/** Converte linhas CSV [data, turno, profissional (nome completo ou CPF), tipo?] em plantões. */
export function interpretarImportacao(linhas, profissionais) {
  const resultado = [];
  linhas.forEach((cols, idx) => {
    if (idx === 0 && /data/i.test(cols[0] || '')) return; // cabeçalho
    const [cData, cTurno, cProf, cTipo] = cols;
    const n = idx + 1;
    const data = interpretarData(cData);
    const turno = interpretarTurno(cTurno);
    const chave = semAcento(cProf);
    const dig = soDigitos(cProf);
    const prof = profissionais.find((p) => semAcento(p.nome) === chave || (dig.length === 11 && soDigitos(p.cpf) === dig));
    const erros = [];
    if (!data) erros.push('data inválida');
    if (!turno) erros.push('turno inválido (use Diurno, Noturno, 24h ou 24h 19h)');
    if (!prof) erros.push(`profissional "${cProf || ''}" não encontrado`);
    let tipo = prof && prof.categoria === 'fixo' ? 'fixo' : 'cobertura';
    if (cTipo && semAcento(cTipo).startsWith('cob')) tipo = 'cobertura';
    resultado.push({ linha: n, data, turno, profissional: prof || null, tipo, erros });
  });
  return resultado;
}
