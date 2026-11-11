import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTexto, preencherTexto, camposDesconhecidos, termoFamilia, textoRecibo, TEXTOS_PADRAO } from '../js/textos.js';

test('formatação: negrito, parágrafos, listas e campos', () => {
  const h = renderTexto('Olá **{profissional}**\n\n1. um\n2. dois\n\n- a\n- b', { profissional: 'Maria' });
  assert.equal(h, '<p>Olá <strong>Maria</strong></p><ol><li>um</li><li>dois</li></ol><ul><li>a</li><li>b</li></ul>');
});

test('escapa HTML e marca campos vazios', () => {
  assert.equal(renderTexto('<b>x</b> {cidade}', { profissional: '<script>' }), '<p>&lt;b&gt;x&lt;/b&gt; ________</p>');
  assert.equal(renderTexto('{profissional}', { profissional: '<i>' }), '<p>&lt;i&gt;</p>');
});

test('campos desconhecidos são mantidos e apontados', () => {
  assert.equal(renderTexto('{xyz}', {}), '<p>{xyz}</p>');
  assert.deepEqual(camposDesconhecidos('{familia} {nome_errado}'), ['nome_errado']);
  assert.deepEqual(Object.values(TEXTOS_PADRAO).flatMap((t) => camposDesconhecidos(t.texto)), []);
});

test('WhatsApp usa *negrito*', () => {
  assert.equal(preencherTexto('**{valor}**', { valor: 'R$ 10,00' }), '*R$ 10,00*');
});

test('texto personalizado substitui o padrão', () => {
  const cfg = { familia: 'Silva', valores: { alimentacao: 20, transporte: 10 }, textos: { termoFamilia: 'Família {familia}' } };
  assert.equal(termoFamilia(cfg), '<p>Família Silva</p>');
  assert.match(termoFamilia({ ...cfg, textos: {} }), /livro-caixa particular/);
  const r = textoRecibo(cfg, { nome: 'Maria', cpf: '52998224725', pix: 'maria@ex.com', coren: 'X1' }, { total: 120, mes: '2026-09', plantoesFixos: 4 });
  assert.match(r, /cento e vinte reais/);
  assert.match(r, /^<p>Eu, <strong>Maria<\/strong>, CPF <strong>529\.982\.247-25<\/strong>, declaro/);
  assert.doesNotMatch(r, /empresa|maria@ex\.com|X1/);
  assert.match(r, /Setembro \/ 2026/);
});
