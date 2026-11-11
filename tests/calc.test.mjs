import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularExtrato, quintoDiaUtil, valorPorExtenso, fmtBRL, valorUnitario,
  parseCSV, interpretarImportacao, interpretarData, pascoa, toISO,
} from '../js/calc.js';

const fixo = { id: 'a', nome: 'Maria Souza', pix: 'maria@ex.com', categoria: 'fixo', modalidade: 'integral' };
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
