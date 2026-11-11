// Textos padrão (terminologia de apoio voluntário / indenizatório).
//
// Todos os textos podem ser personalizados pela família em Ajustes → Textos e termos.
// Formato simples:
//   **texto**        → negrito
//   linha em branco  → novo parágrafo
//   linhas "1. ..."  → lista numerada;  linhas "- ..." → lista com marcadores
//   {campo}          → substituído pelo dado correspondente (veja CAMPOS)
import { fmtBRL, valorPorExtenso, fmtCPF, nomeMes, valorUnitario } from './calc.js';

export const CAMPOS = {
  familia: 'Nome da família',
  paciente: 'Nome do paciente',
  cidade: 'Cidade',
  empresa: 'Empresa prestadora de serviços',
  valor_integral: 'Valor integral por plantão',
  valor_alimentacao: 'Parcela de alimentação',
  valor_transporte: 'Parcela de transporte',
  profissional: 'Nome do profissional',
  cpf: 'CPF do profissional',
  valor: 'Valor do repasse',
  valor_extenso: 'Valor do repasse por extenso',
  mes: 'Mês de referência',
  plantoes: 'Quantidade de plantões fixos',
  data_limite: 'Data limite do repasse',
};

const GERAIS = ['familia', 'paciente', 'cidade', 'empresa', 'valor_integral', 'valor_alimentacao', 'valor_transporte'];

export const TEXTOS_PADRAO = {
  termoFamilia: {
    titulo: 'Termo de Ciência Inicial (família)',
    onde: 'Exibido no primeiro acesso e em Ajustes.',
    campos: GERAIS,
    texto: `Este sistema é um **livro-caixa particular** da Família Colaboradora {familia}, destinado exclusivamente ao registro e à conferência da **ajuda de custo voluntária, de caráter indenizatório**, para custeio de alimentação e transporte dos profissionais de enfermagem que atendem {paciente}.

Os valores registrados decorrem de **mera liberalidade da família**, não possuem natureza remuneratória, não constituem contraprestação por serviços e não guardam relação com a empresa prestadora de serviços ({empresa}). O registro de plantões aqui feito serve apenas para apuração do apoio e **não é controle de jornada**.

A família pode alterar ou encerrar o apoio a qualquer momento, sem que isso gere qualquer direito adquirido.`,
  },
  termoProfissional: {
    titulo: 'Termo de Ciência do Profissional',
    onde: 'Exibido no cadastro do profissional e impresso pelo botão 📄.',
    campos: [...GERAIS, 'profissional', 'cpf'],
    texto: `Eu, **{profissional}**, CPF **{cpf}**, declaro estar ciente de que:

1. A ajuda de custo concedida pela Família Colaboradora {familia} decorre de **mera liberalidade** da família, tem caráter **voluntário e indenizatório** e se destina exclusivamente ao suporte de custos de **deslocamento (transporte) e alimentação**.
2. O valor **não possui natureza salarial**, não integra qualquer remuneração e **não gera vínculo empregatício** com a família, com o paciente ou com a empresa prestadora de serviços ({empresa}).
3. O apoio é ativado ao completar o **4º plantão fixo** no mês, com repasse retroativo dos plantões 1 a 3 do mesmo mês. Plantões de cobertura não entram nessa contagem.
4. Referência por plantão de 12h: {valor_integral} (alimentação {valor_alimentacao} + transporte {valor_transporte}) ou, caso eu opte por me alimentar no local, apenas transporte ({valor_transporte}).
5. O repasse do mês é feito até o **5º dia útil do mês subsequente**, podendo a família alterar ou encerrar o apoio a qualquer momento, sem que isso gere direito adquirido.`,
  },
  opcaoTransporte: {
    titulo: 'Opção “Apenas Transporte”',
    onde: 'Aceite no cadastro e no termo impresso do profissional.',
    campos: [...GERAIS, 'profissional'],
    texto: `{profissional} optou por se alimentar no local (refeições fornecidas pela família) e, por isso, receber a ajuda de custo apenas na modalidade **Transporte** ({valor_transporte} por plantão).`,
  },
  recibo: {
    titulo: 'Recibo de Apoio Voluntário',
    onde: 'Corpo do recibo em PDF.',
    campos: [...GERAIS, 'profissional', 'cpf', 'valor', 'valor_extenso', 'mes', 'plantoes'],
    texto: `Eu, **{profissional}**, inscrito(a) no CPF sob o nº **{cpf}**, declaro que recebi da **Família Colaboradora {familia}** a importância de **{valor}** ({valor_extenso}), a título de **ajuda de custo voluntária de caráter indenizatório**, destinada ao custeio de despesas de alimentação e/ou transporte relativas aos {plantoes} plantões registrados no mês de referência **{mes}**, conforme Extrato de Repasse.

Declaro estar ciente de que o valor decorre de mera liberalidade da família, **não possui natureza salarial** ou remuneratória, não constitui contraprestação por serviços e **não gera vínculo empregatício** com a família, com o paciente ou com a empresa prestadora de serviços ({empresa}), dando plena e geral quitação quanto ao valor e ao período acima.`,
  },
  declaracaoExtrato: {
    titulo: 'Declaração do Extrato',
    onde: 'Rodapé do extrato em PDF, acima da assinatura.',
    campos: [...GERAIS, 'profissional', 'valor', 'mes'],
    texto: 'Declaro para os devidos fins que o valor acima refere-se a ajuda de custo voluntária para custeio de alimentação e transporte, sem natureza salarial.',
  },
  rodapeWhatsapp: {
    titulo: 'Rodapé da mensagem de WhatsApp',
    onde: 'Final do extrato enviado pelo WhatsApp.',
    campos: [...GERAIS, 'profissional', 'valor', 'mes', 'data_limite'],
    texto: '_Ajuda de custo voluntária e indenizatória (alimentação/transporte), sem natureza salarial._',
  },
};

// ---------- Montagem ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VAZIO = '________';

export function obterTexto(cfg, chave) {
  const t = cfg?.textos?.[chave];
  return typeof t === 'string' && t.trim() ? t : TEXTOS_PADRAO[chave].texto;
}

export function textoPersonalizado(cfg, chave) {
  const t = cfg?.textos?.[chave];
  return typeof t === 'string' && t.trim() && t !== TEXTOS_PADRAO[chave].texto;
}

/** Monta o dicionário de campos a partir da configuração, profissional e extrato. */
export function montarCampos(cfg = {}, prof = null, ext = null) {
  const v = cfg.valores || { alimentacao: 0, transporte: 0 };
  return {
    familia: cfg.familia, paciente: cfg.paciente, cidade: cfg.cidade, empresa: cfg.empresa,
    valor_integral: fmtBRL(valorUnitario('integral', v)),
    valor_alimentacao: fmtBRL(v.alimentacao),
    valor_transporte: fmtBRL(valorUnitario('transporte', v)),
    profissional: prof?.nome, cpf: prof?.cpf ? fmtCPF(prof.cpf) : '',
    valor: ext ? fmtBRL(ext.total) : '', valor_extenso: ext ? valorPorExtenso(ext.total) : '',
    mes: ext ? nomeMes(ext.mes) : '', plantoes: ext ? String(ext.plantoesFixos) : '',
    data_limite: ext?.dataLimite ? ext.dataLimite.split('-').reverse().join('/') : '',
  };
}

function trocarCampos(s, campos, escapar) {
  return s.replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in CAMPOS)) return m;
    const val = campos[k] ? String(campos[k]) : VAZIO;
    return escapar ? esc(val) : val;
  });
}

function inline(linha, campos) {
  return trocarCampos(esc(linha), campos, true).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** Converte o texto editável em HTML seguro. */
export function renderTexto(tpl, campos) {
  return String(tpl || '').replace(/\r/g, '').split(/\n\s*\n/).map((bloco) => {
    const linhas = bloco.split('\n').filter((l) => l.trim());
    if (!linhas.length) return '';
    if (linhas.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      return `<ol>${linhas.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''), campos)}</li>`).join('')}</ol>`;
    }
    if (linhas.every((l) => /^\s*[-•]\s+/.test(l))) {
      return `<ul>${linhas.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ''), campos)}</li>`).join('')}</ul>`;
    }
    return `<p>${linhas.map((l) => inline(l, campos)).join('<br>')}</p>`;
  }).join('');
}

/** Versão em uma linha (sem parágrafos), para rótulos. */
export function renderInline(tpl, campos) {
  return inline(String(tpl || '').replace(/\s*\n\s*/g, ' '), campos);
}

/** Versão em texto puro (WhatsApp usa *negrito*). */
export function preencherTexto(tpl, campos) {
  return trocarCampos(String(tpl || ''), campos, false).replace(/\*\*(.+?)\*\*/g, '*$1*');
}

/** Campos {x} usados no texto que não existem. */
export function camposDesconhecidos(tpl) {
  return [...new Set([...String(tpl || '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !(k in CAMPOS)))];
}

// ---------- Atalhos usados pelo app ----------
export const termoFamilia = (cfg) => renderTexto(obterTexto(cfg, 'termoFamilia'), montarCampos(cfg));
export const termoProfissional = (cfg, prof) => renderTexto(obterTexto(cfg, 'termoProfissional'), montarCampos(cfg, prof));
export const textoOpcaoTransporte = (cfg, prof) => renderInline(obterTexto(cfg, 'opcaoTransporte'), montarCampos(cfg, prof));
export const textoRecibo = (cfg, prof, ext) => renderTexto(obterTexto(cfg, 'recibo'), montarCampos(cfg, prof, ext));
export const declaracaoExtrato = (cfg, prof, ext) => renderInline(obterTexto(cfg, 'declaracaoExtrato'), montarCampos(cfg, prof, ext));
export const rodapeWhatsapp = (cfg, prof, ext) => preencherTexto(obterTexto(cfg, 'rodapeWhatsapp'), montarCampos(cfg, prof, ext));
