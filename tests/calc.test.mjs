import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularExtrato, quintoDiaUtil, valorPorExtenso, fmtBRL, valorUnitario,
  parseCSV, interpretarImportacao, interpretarData, pascoa, toISO,
  plantoesConflitam, periodosOcupados, interpretarTurno, compararPlantoes, cpfValido, fmtCPF,
} from '../js/calc.js';

const fixo = { id: 'a', nome: 'Maria Souza', cpf: '52998224725', pix: 'maria@ex.com', categoria: 'fixo', modalidade: 'integral' };
const cob = { id: 'b', nome: 'João Lima', pix: '11999990000', categoria: 'cobertura', modalidade: null };
const pl = (profissionalId, data, turno = 'diurno', tipo = 'fixo', modalidade = 'integral') => ({
  profissionalId, data, turno, tipo, modalidade, valorUnitario: tipo === 'fixo' ? valorUnitario(modalidade) : 0,
});

test('exemplo do RDM: 4 plantões em setembro = R$ 120 com retroativo', () => {
  const ps = [pl('a', '2026-09-10', 'noturno'), pl('a', '2026-09-03'), pl('a', '2026-09-05', 'noturno'), pl('a', '2026-09-08')];
  const e = calcularExtrato(fixo, ps, '2026-09');
  assert.equal(e.elegivel, true);
  assert.equal(e.total, 120);
  assert.equal(e.valorRetroativo, 90);
  assert.deepEqual(e.linhas.map((l) => l.plantao.data), ['2026-09-03', '2026-09-05', '2026-09-08', '2026-09-10']);
  assert.equal(e.linhas[3].ativou, true);
  assert.equal(e.linhas[3].status, 'Validado (4º)*');
});

test('abaixo de 4 plantões não há repasse', () => {
  const ps = [pl('a', '2026-09-03'), pl('a', '2026-09-05'), pl('a', '2026-09-08')];
  const e = calcularExtrato(fixo, ps, '2026-09');
  assert.equal(e.elegivel, false);
  assert.equal(e.total, 0);
  assert.equal(e.faltam, 1);
  assert.equal(e.valorPotencial, 90);
});

test('plantões de cobertura não contam para o 4º plantão', () => {
  const ps = [pl('a', '2026-09-01'), pl('a', '2026-09-02'), pl('a', '2026-09-03'), pl('a', '2026-09-04', 'diurno', 'cobertura', null)];
  const e = calcularExtrato(fixo, ps, '2026-09');
  assert.equal(e.elegivel, false);
  assert.equal(e.total, 0);
  assert.equal(e.plantoesCobertura, 1);
});

test('modalidade apenas transporte = R$ 10 por plantão e refeição no local', () => {
  const ps = ['01', '02', '03', '04', '05'].map((d) => pl('a', `2026-09-${d}`, 'diurno', 'fixo', 'transporte'));
  const e = calcularExtrato({ ...fixo, modalidade: 'transporte' }, ps, '2026-09');
  assert.equal(e.total, 50);
  assert.equal(e.refeicoesNoLocal, 5);
});

test('profissional de cobertura nunca gera valor', () => {
  const ps = ['01', '02', '03', '04', '05'].map((d) => pl('b', `2026-09-${d}`, 'diurno', 'cobertura', null));
  const e = calcularExtrato(cob, ps, '2026-09');
  assert.equal(e.total, 0);
  assert.equal(e.refeicoesNoLocal, 5);
});

test('outros meses e outros profissionais são ignorados', () => {
  const ps = [pl('a', '2026-08-31'), pl('a', '2026-09-01'), pl('b', '2026-09-02', 'diurno', 'cobertura', null)];
  assert.equal(calcularExtrato(fixo, ps, '2026-09').totalPlantoes, 1);
});

test('5º dia útil do mês subsequente (com feriados nacionais)', () => {
  assert.equal(quintoDiaUtil('2026-09'), '2026-10-07'); // 01/10 qui
  assert.equal(quintoDiaUtil('2026-10'), '2026-11-09'); // 02/11 feriado
  assert.equal(quintoDiaUtil('2026-12'), '2027-01-08'); // 01/01 feriado
  assert.equal(quintoDiaUtil('2027-03'), '2027-04-07'); // sem feriado no início de abril/2027
  assert.equal(toISO(pascoa(2026)), '2026-04-05');
});

test('valor por extenso', () => {
  assert.equal(valorPorExtenso(120), 'cento e vinte reais');
  assert.equal(valorPorExtenso(1), 'um real');
  assert.equal(valorPorExtenso(30.5), 'trinta reais e cinquenta centavos');
  assert.equal(valorPorExtenso(1100), 'mil e cem reais');
  assert.equal(valorPorExtenso(1230), 'mil duzentos e trinta reais');
  assert.equal(valorPorExtenso(100), 'cem reais');
});

test('moeda', () => {
  assert.equal(fmtBRL(1234.5), 'R$ 1.234,50');
});

test('importação de CSV', () => {
  const csv = 'Data;Turno;Profissional;Tipo\n03/09/2026;Diurno;MARIA  souza;\n05/09/2026;noite;João Lima;\n31/02/2026;D;Maria;\n06/09/2026;N;Fulano;';
  const r = interpretarImportacao(parseCSV(csv), [fixo, cob]);
  assert.equal(r.length, 4);
  assert.deepEqual([r[0].data, r[0].turno, r[0].profissional.id, r[0].tipo], ['2026-09-03', 'diurno', 'a', 'fixo']);
  assert.deepEqual([r[1].turno, r[1].profissional.id, r[1].tipo], ['noturno', 'b', 'cobertura']);
  assert.ok(r[2].erros.length);
  assert.ok(r[3].erros.length);
  assert.equal(interpretarData('2026-9-3'), '2026-09-03');
});

test('turno de 24h vale por dois plantões de 12h', () => {
  // 1 de 24h + 2 de 12h = 4 equivalentes → elegível
  const ps = [pl('a', '2026-09-01', '24h'), pl('a', '2026-09-03'), pl('a', '2026-09-05', 'noturno')];
  const e = calcularExtrato(fixo, ps, '2026-09');
  assert.equal(e.plantoesFixos, 4);
  assert.equal(e.elegivel, true);
  assert.equal(e.total, 120);
  assert.deepEqual(e.linhas.map((l) => l.status), ['Validado (1º e 2º)', 'Validado (3º)', 'Validado (4º)*']);
  assert.equal(e.linhas[0].subtotal, 60);
  assert.equal(e.valorRetroativo, 90);
});

test('24h pode ser o plantão que ativa a regra', () => {
  const ps = [pl('a', '2026-09-01'), pl('a', '2026-09-02'), pl('a', '2026-09-03', '24h')];
  const e = calcularExtrato(fixo, ps, '2026-09');
  assert.equal(e.linhas[2].status, 'Validado (3º e 4º)*');
  assert.equal(e.linhas[2].ativou, true);
  assert.equal(e.total, 120);
  assert.equal(e.valorRetroativo, 60);
});

test('24h sozinho não atinge o limiar; transporte 24h = R$ 20', () => {
  const e = calcularExtrato(fixo, [pl('a', '2026-09-01', '24h')], '2026-09');
  assert.equal(e.elegivel, false);
  assert.equal(e.faltam, 2);
  assert.equal(e.valorPotencial, 60);
  const t = ['01', '03'].map((d) => pl('a', `2026-09-${d}`, '24h', 'fixo', 'transporte'));
  const e2 = calcularExtrato(fixo, t, '2026-09');
  assert.equal(e2.total, 40);
  assert.equal(e2.refeicoesNoLocal, 4);
});

test('trocas às 07h e 19h: períodos ocupados', () => {
  assert.deepEqual(periodosOcupados({ data: '2026-10-01', turno: 'diurno' }), ['2026-10-01|D']);
  assert.deepEqual(periodosOcupados({ data: '2026-10-01', turno: 'noturno' }), ['2026-10-01|N']);
  assert.deepEqual(periodosOcupados({ data: '2026-10-01', turno: '24h' }), ['2026-10-01|D', '2026-10-01|N']);
  assert.deepEqual(periodosOcupados({ data: '2026-10-31', turno: '24h19' }), ['2026-10-31|N', '2026-11-01|D']);
});

test('conflitos de horário', () => {
  const c = (a, b) => plantoesConflitam(a, b);
  // 24h às 19h do dia 1 ocupa a noite do dia 1 e o dia 2
  const p19 = { data: '2026-10-01', turno: '24h19' };
  assert.equal(c(p19, { data: '2026-10-02', turno: 'diurno' }), true);
  assert.equal(c(p19, { data: '2026-10-01', turno: 'noturno' }), true);
  assert.equal(c(p19, { data: '2026-10-01', turno: 'diurno' }), false); // 07h–19h do dia 1 termina quando o 24h começa
  assert.equal(c(p19, { data: '2026-10-02', turno: 'noturno' }), false); // começa às 19h do dia 2, quando o 24h termina
  assert.equal(c(p19, { data: '2026-10-02', turno: '24h19' }), false); // 24h seguidos (19h→19h→19h)
  assert.equal(c(p19, { data: '2026-10-02', turno: '24h' }), true);
  // 24h às 07h do dia 1
  const p07 = { data: '2026-10-01', turno: '24h' };
  assert.equal(c(p07, { data: '2026-10-02', turno: 'diurno' }), false);
  assert.equal(c(p07, { data: '2026-09-30', turno: '24h19' }), true); // 24h19 de 30/09 vai até 19h de 01/10
  assert.equal(c({ data: '2026-10-01', turno: 'diurno' }, { data: '2026-10-01', turno: 'noturno' }), false);
});

test('24h às 19h conta no mês em que começa e vale 2', () => {
  const ps = [pl('a', '2026-09-30', '24h19'), pl('a', '2026-09-28'), pl('a', '2026-09-29', 'noturno')];
  const set = calcularExtrato(fixo, ps, '2026-09');
  assert.equal(set.plantoesFixos, 4);
  assert.equal(set.total, 120);
  assert.equal(calcularExtrato(fixo, ps, '2026-10').totalPlantoes, 0);
});

test('turnos na planilha e ordenação', () => {
  assert.equal(interpretarTurno('24h'), '24h');
  assert.equal(interpretarTurno('24h 07h'), '24h');
  assert.equal(interpretarTurno('24h 19h'), '24h19');
  assert.equal(interpretarTurno('24H-19'), '24h19');
  assert.equal(interpretarTurno('24h noite'), '24h19');
  const ord = [{ data: '2026-10-01', turno: '24h19' }, { data: '2026-10-01', turno: 'diurno' }].sort(compararPlantoes);
  assert.deepEqual(ord.map((x) => x.turno), ['diurno', '24h19']);
});

test('CPF: validação, formatação e importação pelo CPF', () => {
  assert.equal(cpfValido('529.982.247-25'), true);
  assert.equal(cpfValido('529.982.247-24'), false);
  assert.equal(cpfValido('111.111.111-11'), false);
  assert.equal(fmtCPF('52998224725'), '529.982.247-25');
  const r = interpretarImportacao(parseCSV('01/09/2026;Diurno;529.982.247-25'), [fixo, cob]);
  assert.equal(r[0].profissional.id, 'a');
});
